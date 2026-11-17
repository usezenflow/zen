// English words typed with the Telex keyboard left on: "web" comes out "ưeb", "meeting" "mêting", "deadline" "đealine".
// The keys are still in the word (a mark is the key that made it), so the word is read back to its keys and kept only
// when they spell a term below. A real Vietnamese syllable is never touched ("lít" stays a litre, not "list").
import { isSyllable } from "./syllables";
import { isFrequentSyllable } from "./vifreq";
import { EN_CANON } from "./en";

/** The English words students type in a task. Short words that are also Telex spellings of Vietnamese ("car" is "cả") stay out. */
export const TELEX_TERMS = new Set([
  ...(
    "web website deadline meeting meet report slide slides quiz test exam midterm final project assignment homework " +
    "seminar workshop online offline zoom teams google classroom class course lecture submit review demo presentation " +
    "present team teamwork group email mail form file word excel powerpoint docs drive code coding server database " +
    "frontend backend design figma canva video call interview event club yoga football book booking check checkin " +
    "feedback update backup download upload install windows window wifi laptop internet facebook zalo discord github " +
    "shopee tiktok youtube game party coffee cafe shopping tour ticket toeic ielts speaking listening reading writing " +
    "grammar essay paper poster proposal thesis research survey schedule plan task todo note notes sprint standup " +
    "weekly daily draft outline storyboard mockup prototype release deploy debug merge commit java python flutter " +
    "react node linux network security marketing sales startup pitch deck portfolio resume internship intern mentor " +
    "session training tutorial tutor follow view show now how know network keyword password software hardware " +
    "framework workflow worksheet workout walk swimming week weekend wednesday tomorrow today"
  ).split(" "),
  // the canon terms Telex can mangle and untelex can read back: 5+ letters (shorter ones fall under its length gate).
  // shortcut: "microsoft" typed in Telex is "micồt", two marks deep that untelex does not undo; upgrade with the untelex key rules.
  ...Object.keys(EN_CANON).filter((k) => k.length >= 5 && k !== "microsoft"),
]);

const TONE: Record<string, string> = { "́": "s", "̀": "f", "̉": "r", "̃": "x", "̣": "j" };
const TONE_KEYS = ["s", "f", "r", "x", "j"];
const MARKED = /[̀-̛̣̃̆̉̂đ]/;

/** Vowel pairs a Vietnamese syllable can hold, marks off. "ea", "ae", "ou" are English. */
const PAIRS = new Set("ai ao au ay eo eu ia ie iu oa oe oi oo ua ue ui uo uu uy ye".split(" "));
/** A word that can be Vietnamese: a syllable by its letters, its vowels and the tone its final allows ("mêt" has none). */
function vietnamese(w: string): boolean {
  if (!isSyllable(w) || !isFrequentSyllable(w)) return false;
  const nfd = w.normalize("NFD");
  const plain = nfd.replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const vowels = /[aeiouy]+/.exec(plain)?.[0] ?? "";
  if (vowels.length === 2 && !PAIRS.has(vowels)) return false;
  // a horn on "u" never follows e or i
  if (/[eêiy]ư/.test(w)) return false;
  // a stop at the end takes only sắc or nặng
  if (/(?:c|ch|p|t)$/.test(plain) && !/[\u0301\u0323]/.test(nfd)) return false;
  return true;
}

/**
 * The English term a Telex-mangled word was typed as, or undefined. Each mark gives back its key (ê is "ee", ơ is "ow",
 * a sắc is "s"), put anywhere after the letter it changed; "ư" may be a bare "w"; one tone key may have been replaced by a later one.
 */
export function untelex(word: string): string | undefined {
  const w = word.normalize("NFC").toLowerCase();
  if (w.length < 3 || w.length > 14 || TELEX_TERMS.has(w)) return undefined;
  const nfd = w.normalize("NFD");
  const marked = MARKED.test(nfd);
  // text typed with no marks at all cannot be judged by its tones: any syllable shape is Vietnamese there ("doc" is đọc)
  if (marked ? vietnamese(w) : isSyllable(w)) return undefined;
  // "clas", "sever": a tone key typed twice cancels itself, and one of the two letters is gone
  if (!marked) {
    for (const k of TONE_KEYS)
      for (let i = 1; i <= w.length; i++)
        if (TELEX_TERMS.has(w.slice(0, i) + k + w.slice(i))) return w.slice(0, i) + k + w.slice(i);
    return undefined;
  }
  // letters with their marks off, and for each mark the key that typed it and the letter it sits on
  const base: string[] = [];
  const keys: { key: string; at: number }[] = [];
  const horns: number[] = [];
  for (const ch of w) {
    const d = ch.normalize("NFD");
    const at = base.length;
    if (ch === "đ") { base.push("d"); keys.push({ key: "d", at }); continue; }
    base.push(d[0]);
    for (const m of d.slice(1)) {
      if (m === "̂") keys.push({ key: d[0], at });
      else if (m === "̆") keys.push({ key: "w", at });
      else if (m === "̛") { if (d[0] === "u") horns.push(at); else keys.push({ key: "w", at }); }
      else if (TONE[m]) keys.push({ key: TONE[m], at });
    }
  }
  if (keys.length + horns.length > 4) return undefined;
  // every "ư" is "u" then "w", or a "w" typed alone
  for (let mask = 0; mask < 1 << horns.length; mask++) {
    const b = [...base];
    const ks = [...keys];
    horns.forEach((at, i) => { if (mask & (1 << i)) b[at] = "w"; else ks.push({ key: "w", at }); });
    const hit = place(b.join(""), ks, 1);
    if (hit) return hit;
  }
  return undefined;
}

/** Puts each key back after its letter, at any later place, until the word is a term. `lost` tone keys may be added. */
function place(s: string, keys: { key: string; at: number }[], lost: number): string | undefined {
  if (!keys.length) {
    if (TELEX_TERMS.has(s)) return s;
    if (lost > 0)
      for (const k of TONE_KEYS)
        for (let i = 1; i <= s.length; i++) {
          const hit = place(s.slice(0, i) + k + s.slice(i), [], lost - 1);
          if (hit) return hit;
        }
    return undefined;
  }
  // keys are placed right to left by their letter, so an insert never moves a letter still waiting for its key
  const order = [...keys].sort((a, b) => b.at - a.at);
  const [k, ...rest] = order;
  for (let i = k.at + 1; i <= s.length; i++) {
    const hit = place(s.slice(0, i) + k.key + s.slice(i), rest, lost);
    if (hit) return hit;
  }
  return undefined;
}
