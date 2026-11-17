// Spoken forms of English work terms, as a recognizer writes them (voice source): each family's forms with tones, spacing and
// case varied, each with its cue sentence, and the negatives where the Vietnamese word must survive without its cue.
// The display form is the answer, worked out here. `pnpm vitest run asr.grid` runs it.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

// Sat 14/11/2026 06:00
const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };
const titles = (said: string) => read(said, { ref: REF, source: "voice" }).items.map(itemAction).map((a) => a.title ?? "");

/** A tone mark on the first vowel of a spoken form, or none: "ma ket tinh" with sắc is "má ket tinh". */
const TONES = ["", "́", "̀", "̉", "̃", "̣"];
function toned(form: string, mark: string): string {
  if (!mark) return form;
  const i = form.search(/[aeiouy]/i);
  return i < 0 ? form : (form.slice(0, i) + form[i] + mark + form.slice(i + 1)).normalize("NFC");
}
/** The forms of one spoken word: each tone, with spaces and with hyphens, lowercase and capitalized. */
function variants(form: string): string[] {
  const out = new Set<string>();
  for (const t of TONES) for (const sep of [" ", "-"]) {
    const v = toned(form, t).replace(/ /g, sep);
    out.add(v);
    out.add(v[0].toUpperCase() + v.slice(1));
  }
  return [...out];
}

const CONTENT = "quay video";
const WORK = "làm";
const DEV = "fix bug";
interface Family { display: string; forms: string[]; cues: string[]; /** Without a cue the form is an ordinary word and must stay. */ negative?: string[] }
const FAMILIES: Family[] = [
  { display: "marketing", forms: ["ma két tinh", "mác két tinh", "mạc kết tinh", "ma ket tinh"], cues: [WORK, "viết"] },
  { display: "review", forms: ["rì viu", "ri viu", "rì vìu"], cues: [WORK, "viết"] },
  { display: "fake", forms: ["phếch", "phéc", "phết"], cues: [CONTENT, "làm acc"], negative: ["viết phếch cho team"] },
  { display: "reel", forms: ["riêu", "riu", "rin"], cues: [CONTENT, "đăng"] },
  { display: "short", forms: ["sót", "sọt", "soóc"], cues: [CONTENT], negative: ["bỏ sót việc", "đi đổ sọt rác"] },
  { display: "sprint", forms: ["sờ pờ rin", "sờ prin", "sì pín"], cues: [WORK, "họp"] },
  { display: "design", forms: ["đì dai", "đi giai", "đi zai"], cues: [WORK, "thiết kế"], negative: ["đi giai ngày mai"] },
  { display: "post", forms: ["pốt", "pót"], cues: ["đăng", CONTENT] },
  { display: "admin", forms: ["át min", "ét min", "ad min"], cues: [WORK, "viết"] },
  { display: "hashtag", forms: ["hát tác", "hách tác", "hát tạc"], cues: [CONTENT, "viết"] },
  { display: "OKR", forms: ["ô kê a", "ô kê rờ"], cues: ["viết", WORK] },
  { display: "PR", forms: ["pi a"], cues: [WORK, "viết"] },
  { display: "GTM", forms: ["gờ tê em"], cues: [WORK, "viết"] },
  { display: "media", forms: ["mê đi a", "mi đi a"], cues: [WORK, CONTENT] },
  { display: "code", forms: ["cốt"], cues: [DEV], negative: ["viết cốt truyện", "cốt"] },
  { display: "feedback", forms: ["phít bách", "phít bác"], cues: ["viết", WORK] },
];

const caps = (d: string) => d !== d.toLowerCase();
const hit = (t: string, d: string) => (caps(d) ? t.includes(d) : t.toLowerCase().includes(d));

it("every spoken form, with its tones, spacing and case, reads as its display form next to its cue", () => {
  const miss: string[] = [];
  let n = 0;
  for (const f of FAMILIES)
    for (const form of f.forms)
      for (const v of variants(form))
        for (const cue of f.cues) {
          n++;
          const said = `${cue} ${v} cho team`;
          const t = titles(said)[0] ?? "";
          if (!hit(t, f.display)) miss.push(`${f.display}: "${said}" -> "${t}"`);
        }
  expect(miss.slice(0, 30)).toEqual([]);
  expect(n).toBeGreaterThan(300);
});

it("without its cue a Vietnamese word stays, and the bin and the plot stay", () => {
  const miss: string[] = [];
  for (const f of FAMILIES)
    for (const neg of f.negative ?? []) {
      const t = titles(neg)[0] ?? "";
      if (hit(t, f.display)) miss.push(`became ${f.display}: ${neg} -> ${t}`);
    }
  expect(miss).toEqual([]);
  expect(titles("đi đổ sọt rác quay video")[0]).toContain("sọt rác");
  expect(titles("viết cốt truyện cho team fix bug")[0]).toContain("cốt truyện");
});

it("a reel is real when set against a fake", () => {
  expect(hit(titles("làm riêu fake cho team")[0] ?? "", "real")).toBe(true);
  expect(hit(titles("quay riu cho team")[0] ?? "", "reel")).toBe(true);
});
