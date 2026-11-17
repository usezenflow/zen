// Every canon term (EN_CANON) in a task title, as typed, Telex-mangled, typo'd by one letter, upper-cased, and lowercased,
// plus the Vietnamese words that must survive. The display form is the answer, worked out from the table and not the reader.
// The spoken forms are in asr.grid.test.ts. `pnpm vitest run en.grid` runs it.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { EN_CANON, EN_WORDS } from "./en";
import { isSyllable } from "./syllables";
import { read } from "./reader";
import { telexed } from "./telexed";

// Sat 14/11/2026 06:00
const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };
const titles = (said: string, source: "typed" | "voice" = "typed") => read(said, { ref: REF, source }).items.map(itemAction).map((a) => a.title ?? "");
/** The title of the first item of a line, or undefined when the line makes none. */
const titleOf = (said: string) => titles(said)[0];

// cues and places the reader consumes before a title is made ("deadline" is a due cue, "zoom" and "meet" a place)
const CONSUMED = new Set(["deadline", "zoom", "meet", "teams"]);
const KEYS = Object.keys(EN_CANON).filter((k) => !CONSUMED.has(k));
const caps = (d: string) => d !== d.toLowerCase();
/** One letter gone from the middle of a word of 5+ letters: "marketing" is "markting". */
const oneOff = (k: string) => k.slice(0, 2) + k.slice(3);
/** A typo is generated only when exactly one term is within one edit of it, so the answer is the one display form. */
const isOneTerm = (typo: string) => !isSyllable(typo) && KEYS.filter((k) => k.length >= 4 && Math.abs(k.length - typo.length) <= 1 && editOne(typo, k)).length === 1;
function editOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === b.length) return a.split("").filter((c, i) => c !== b[i]).length === 1;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === s) return true;
  return false;
}

const FRAMES = ["viết %X% cho team", "làm %X% cho team nhé", "%X% cho dự án ngày mai"];

it("every canon term reads as its display form: as typed, lowercase, upper-cased, Telex-mangled and one letter off", () => {
  const miss: string[] = [];
  let n = 0;
  for (const k of KEYS) {
    const d = EN_CANON[k];
    const forms: [string, string][] = [[k, "typed"], [d, "display"], [k.toUpperCase(), "upper"]];
    if (k.length >= 5 && k !== "microsoft" && telexed(k) !== k) forms.push([telexed(k), "telex"]);
    // "iets" is read first as a Telex tone key ("iét"), so the typo grid leaves ielts out
    if (k.length >= 5 && k !== "ielts" && isOneTerm(oneOff(k)) && !EN_WORDS.has(oneOff(k))) forms.push([oneOff(k), "typo"]);
    for (const [form, why] of forms) {
      // an upper-cased lowercase term keeps its typed case: only a display with capitals is the casing pass
      if (why === "upper" && !caps(d)) continue;
      for (const f of FRAMES) {
        n++;
        const said = f.replace("%X%", form);
        const t = titleOf(said) ?? "";
        // a title starts with a capital: a lowercase display is compared without case
        const hit = caps(d) ? t.includes(d) : t.toLowerCase().includes(d);
        if (!hit) miss.push(`${why}: "${said}" -> "${t}" want "${d}"`);
      }
    }
  }
  expect(miss.slice(0, 40)).toEqual([]);
  expect(n).toBeGreaterThan(KEYS.length * 3);
});

it("the words that are Vietnamese, or English words of their own, are never canonized", () => {
  const keep: [string, string][] = [
    ["gặp ai đó", "ai"], ["gặp ba mẹ", "ba"], ["ớt cho bữa tối", "ớt"], ["ăn bánh mì", "mì"], ["mua be cho bé", "be"],
    ["Web đẹp", "Web"], ["đi sọt rác", "sọt rác"], ["viết cốt truyện", "cốt truyện"], ["viết phây cho team", "phây"],
    ["đọc memo của sếp", "memo"], ["xem store app", "store"],
  ];
  for (const [said, must] of keep) expect(titleOf(said), said).toContain(must);
});

it("the typo pass fixes one letter in a term, and leaves an English word of its own alone", () => {
  expect(titleOf("viết markting cho team")).toContain("marketing");
  expect(titleOf("viết worksapce cho team")).toContain("workspace");
  expect(titleOf("viết codde cho team")).toContain("code");
  expect(titleOf("làm sequense cho team")).toContain("sequence");
  expect(titleOf("viết memo cho team")).toContain("memo");
  expect(titleOf("viết store cho team")).toContain("store");
});

it("lowercase display terms keep the typed case; capitalized displays take their form", () => {
  expect(titleOf("viết okr cho team")).toContain("OKR");
  expect(titleOf("viết gtm cho team")).toContain("GTM");
  expect(titleOf("viết tiktok cho team")).toContain("TikTok");
  expect(titleOf("viết Web cho team")).toContain("Web");
  // a typed capital on a lowercase term stays as typed ("Web" in a course name)
  expect(titleOf("viết Marketing cho team")).toContain("Marketing");
});
