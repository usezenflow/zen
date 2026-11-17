// The frequent-syllable guard on Telex and VNI decoding. (A) an English or tech word on an accented line stays as typed;
// (B) a real Telex or VNI spelling of a common syllable decodes to its marks. Words come from the term lists and the
// frequent-syllable set, typed by a Telex or VNI encoder written here, so the answers do not depend on the reader.
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";
import { EN_WORDS } from "./en";
import { TELEX_TERMS } from "./telex";
import { FREQ_SYLLABLES, syllableKey } from "./vifreq";
import { decodeTyped } from "./repair";
const fold = (w: string) => w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
const FOLD_FREQ = new Set([...FREQ_SYLLABLES].map((w) => w.normalize("NFD").replace(/[\u0300-\u036f\u0306\u0302\u031b]/g, "").replace(/đ/g, "d")));

const REF = { y: 2026, m: 11, d: 16, h: 9, mi: 46 };
const title = (s: string) => read(s, { ref: REF, source: "typed" }).items.map(itemAction).map((a) => a.title).join(" | ").toLowerCase();

// Telex and VNI spellings of an accented syllable, written from its Unicode decomposition
const TONE_KEY: Record<string, string> = { "́": "s", "̀": "f", "̉": "r", "̃": "x", "̣": "j" };
const VNI_TONE: Record<string, string> = { s: "1", f: "2", r: "3", x: "4", j: "5" };
function telex(w: string): string {
  let out = "";
  let tone = "";
  for (const ch of w.normalize("NFD")) {
    if (TONE_KEY[ch]) { tone = TONE_KEY[ch]; continue; }
    if (ch === "̂") { out += out.slice(-1); continue; }
    if (ch === "̆") { out += "w"; continue; }
    if (ch === "̛") { out += "w"; continue; }
    if (ch === "đ") { out += "dd"; continue; }
    out += ch;
  }
  return (out + tone).normalize("NFC");
}
function vni(w: string): string {
  let out = "";
  let tone = "";
  for (const ch of w.normalize("NFD")) {
    if (TONE_KEY[ch]) { tone = VNI_TONE[TONE_KEY[ch]]; continue; }
    if (ch === "̂") { out += "6"; continue; }
    if (ch === "̆") { out += "8"; continue; }
    if (ch === "̛") { out += "7"; continue; }
    if (ch === "đ") { out += "d9"; continue; }
    out += ch;
  }
  return (out + tone).normalize("NFC");
}

// (A) English and tech words with a Telex cue stay as typed on an accented line
const TIME_WORDS = new Set(["today", "tomorrow", "now", "week", "weekend", "daily", "weekly", "wednesday", "monday", "tuesday", "thursday", "friday", "saturday", "sunday", "mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
// a plain word that is also a common Vietnamese syllable ("ba", "roi") is Vietnamese on its own: not an English case
const EN = [...new Set([...EN_WORDS, ...TELEX_TERMS])].filter((w) => /^[a-z]{2,14}$/.test(w) && !TIME_WORDS.has(w) && !FOLD_FREQ.has(w) && /aa|ee|oo|dd|aw|ow|uw|[sfrxj]$/.test(w));
// only words with a Telex cue can decode: the rest never reach the guard
const FRAMES_A = ["Họp nhóm mai 9h {w}", "{w} mai 9h họp nhóm", "Làm {w} cho team chiều nay", "{w} lên TV2 sáng mai"];
// Known, not from the guard (the same without it): the reader drops these English words as filler, time or event words,
// and "bus" is read as "bữa" by a fix table, not by a Telex decode.
const KNOWN_A = new Set(["add", "after", "bus", "hour", "noon", "of", "or", "meet", "zoom"]);
const missA: string[] = [];
let totalA = 0;
it(`(A) English and tech words stay as typed on accented lines (${EN.length * FRAMES_A.length} cases)`, () => {
  for (const w of EN) for (const f of FRAMES_A) {
    totalA++;
    const s = f.replace("{w}", w);
    if (!KNOWN_A.has(w) && !title(s).includes(w)) missA.push(`${s} -> ${title(s)}`);
  }
  if (process.env.GRID_OUT) writeFileSync(process.env.GRID_OUT + ".a", missA.join("\n"));
  expect(missA.length, `${missA.length}/${totalA} misses`).toBe(0);
});

// (B) every frequent marked syllable, typed in Telex and in VNI, decodes to itself (the tone may sit on another vowel
// of the same syllable: "tuỷ" for "tủy" is the same key). Decode level, so a reader-meaningful word ("bạn", "buổi")
// is not judged by what the title does with it.
const MARKED = [...FREQ_SYLLABLES].filter((w) => w.normalize("NFD") !== fold(w));
// Known decoder limits (the same without the guard): one-letter syllables, digit-tone weekday forms ("thu2"), "noon" (nôn).
const KNOWN_B = /^(?:[a-z]\d|[a-z]{1,2}\b|thu\d|noon|o7\d|u7\d)/;
const missB: string[] = [];
let totalB = 0;
it(`(B) real Telex and VNI spellings decode to their marks (${MARKED.length * 2} cases)`, () => {
  for (const a of MARKED) for (const enc of [telex, vni]) {
    totalB++;
    const typed = enc(a);
    const d = decodeTyped(typed);
    if (!KNOWN_B.test(typed) && (!d || syllableKey(d) !== syllableKey(a))) missB.push(`${typed} -> ${d ?? "-"} (want ${a})`);
  }
  if (process.env.GRID_OUT) writeFileSync(process.env.GRID_OUT + ".b", missB.join("\n"));
  expect(missB.length, `${missB.length}/${totalB} misses`).toBe(0);
});

// the sentence level: real Telex and VNI lines, with a reader-neutral title, decode their words
const LINES: [string, string][] = [["hocj baif", "học bài"], ["soanj thaor", "soạn thảo"], ["noopj bai", "nộp bai"], ["quas trinhf", "quá trình"], ["suwar baos cao", "sửa báo cao"], ["vieets bais", "viết bài"], ["lamf bai", "làm bài"], ["ddi hocj", "đi học"]];
it("real Telex lines decode their words", () => {
  for (const [typed, want] of LINES) {
    const got = title(`Họp nhóm ${typed} mai 9h`);
    expect(got, typed).toContain(want.split(" ")[0]);
  }
});

it("the guard: rare decodes stay as typed, real ones decode", () => {
  expect(title("mai 9h tree")).toContain("tree");
  expect(title("mai 9h os")).toContain("os");
  expect(title("Họp nhóm mai 9h hocj baif")).toContain("học bài");
});
