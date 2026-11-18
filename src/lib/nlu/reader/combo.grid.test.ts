// Messy input, combined: every base line's reading must survive missing tones, Telex or VNI typed with the IME off, a Telex slip,
// capitals, fillers and courtesy, spoken numbers and ASR slips by voice, and bulk lines of two or three items joined by commas,
// "và", ";" or new lines. The base readings are worked out here from REF; every variant must read the same.
// `pnpm vitest run combo.grid` runs it.
import { describe, expect, it } from "vitest";
import type { ReaderItem } from "../shared";
import { fold } from "./fold";
import { read } from "./reader";

// Wed 18/11/2026 09:00
const REF = { y: 2026, m: 11, d: 18, h: 9, mi: 0 };
const D = (d: number) => `2026-11-${String(d).padStart(2, "0")}`;

type Want = Partial<Pick<ReaderItem, "type" | "startsAt" | "deadline" | "notBefore" | "durationMinutes" | "sittingMinutes" | "rrule">> & {
  title: string;
  window?: string;
};
/** A base line: its items (an exam brings its prep), as said with digits. */
const BASE: [string, Want[]][] = [
  ["họp nhóm 9h sáng mai", [{ type: "BUSY", title: "họp nhóm", startsAt: `${D(19)} 09:00` }]],
  ["nộp báo cáo trước thứ 6", [{ type: "ASSIGNMENT", title: "nộp báo cáo", deadline: `${D(20)} 23:59` }]],
  ["gọi mẹ tối nay", [{ type: "PLAN", title: "gọi mẹ", window: "NIGHT", deadline: `${D(18)} 22:00` }]],
  ["mua sữa ngày kia", [{ type: "PLAN", title: "mua sữa", deadline: `${D(20)} 23:59`, notBefore: `${D(20)} 00:00` }]],
  ["học bài 2 tiếng chiều mai", [{ type: "PLAN", title: "học bài", durationMinutes: 120, window: "AFTERNOON", deadline: `${D(19)} 18:00` }]],
  ["chạy bộ 6h sáng mỗi ngày", [{ type: "BUSY", title: "chạy bộ", startsAt: `${D(19)} 06:00`, rrule: "FREQ=DAILY" }]],
  ["học bù môn mạng 7h sáng thứ 7", [{ type: "LECTURE", title: "học bù môn mạng", startsAt: `${D(21)} 07:00` }]],
  ["fix bug login trước 5h chiều mai", [{ title: "fix bug login", deadline: `${D(19)} 17:00` }]],
  ["đọc sách 30 phút mỗi tối", [{ title: "đọc sách", durationMinutes: 30, rrule: "FREQ=DAILY" }]],
  ["ôn thi 4 buổi trước 25/11", [{ title: "ôn thi", deadline: `${D(25)} 23:59`, durationMinutes: 360, sittingMinutes: 90 }]],
  ["họp team từ 14h đến 16h thứ 6", [{ type: "BUSY", title: "họp team", startsAt: `${D(20)} 14:00`, durationMinutes: 120 }]],
  ["review PR cho Nam 3h chiều thứ 2", [{ type: "BUSY", title: "review PR cho Nam", startsAt: `${D(23)} 15:00` }]],
  ["thi giải tích 9h sáng 25/11", [
    { type: "EXAM", title: "thi giải tích", startsAt: `${D(25)} 09:00` },
    { type: "PLAN", title: "ôn tập: thi giải tích", deadline: `${D(25)} 09:00` },
  ]],
];

const key = (s: string) => fold(s).text.toLowerCase().replace(/\s+/g, " ").trim();
function got(x: ReaderItem, w: Want) {
  const g: Record<string, unknown> = { title: key(x.title) };
  for (const k of Object.keys(w)) if (k !== "title") g[k] = k === "window" ? x.windows?.[0] : (x as unknown as Record<string, unknown>)[k];
  return g;
}
/** Every wanted item is read, and nothing else: each matched by its title, then its fields. */
function check(text: string, wants: Want[], source: "typed" | "voice" = "typed") {
  const items = read(text, { ref: REF, source }).items;
  expect(items.map((x) => key(x.title)).sort(), `${text}: titles`).toEqual(wants.map((w) => key(w.title)).sort());
  for (const w of wants) {
    const x = items.find((i) => key(i.title) === key(w.title))!;
    expect(got(x, w), `${text}: ${w.title}`).toEqual({ ...w, title: key(w.title) });
  }
}

// --- typed variants -------------------------------------------------------------------------------------------------
const TONE_TELEX: Record<string, string> = { "́": "s", "̀": "f", "̉": "r", "̃": "x", "̣": "j" };
const TONE_VNI: Record<string, string> = { "́": "1", "̀": "2", "̉": "3", "̃": "4", "̣": "5" };
/** A word as typed with the IME off: the letters and modifier keys, the tone key last. */
function keys(word: string, vni: boolean): string {
  let out = "", tone = "";
  for (const ch of word.normalize("NFD").replace(/[̣̀́̃̉]/g, (t) => ((tone = (vni ? TONE_VNI : TONE_TELEX)[t]), ""))) {
    if (ch === "̂") out += vni ? "6" : out.slice(-1);
    else if (ch === "̆") out += vni ? "8" : "w";
    else if (ch === "̛") out += vni ? "7" : "w";
    else if (ch === "đ" || ch === "Đ") out += vni ? `${ch === "đ" ? "d" : "D"}9` : ch === "đ" ? "dd" : "DD";
    else out += ch;
  }
  return out + tone;
}
// "môn" in Telex is "moon", an English word: it stays as typed, so a Telex line keeps it toned
const COLLIDE = new Set(["moon"]);
const typedAs = (s: string, vni: boolean) => s.replace(/\p{L}+/gu, (w) => (/[^\x00-\x7f]/.test(w) && !COLLIDE.has(keys(w, vni)) ? keys(w, vni) : w));
const toneless = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");

const TYPED: [string, (s: string) => string][] = [
  ["as is", (s) => s],
  ["no tones", toneless],
  ["telex", (s) => typedAs(s, false)],
  ["vni", (s) => typedAs(s, true)],
  // one slip: the first marked word typed in Telex, the rest right
  ["telex slip", (s) => s.replace(/\p{L}*[^\x00-\x7f]\p{L}*/u, (w) => (COLLIDE.has(keys(w, false)) ? w : keys(w, false)))],
  ["capitals", (s) => s.toUpperCase()],
  ["filler", (s) => `ờ ${s}`],
  ["nhé", (s) => `${s} nhé`],
  ["giúp mình", (s) => `${s}, giúp mình`],
];

// --- voice variants -------------------------------------------------------------------------------------------------
const DIGIT = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
/** A number as said: "mười lăm", "hai mươi mốt", "ba mươi". */
function said(n: number): string {
  if (n < 10) return DIGIT[n];
  const [t, u] = [Math.floor(n / 10), n % 10];
  const ten = t === 1 ? "mười" : `${DIGIT[t]} mươi`;
  return u === 0 ? ten : `${ten} ${u === 5 ? "lăm" : u === 1 && t > 1 ? "mốt" : DIGIT[u]}`;
}
const spoken = (s: string) =>
  s
    .replace(/(\d{1,2})\/(\d{1,2})/g, (_, d, m) => `ngày ${said(+d)} tháng ${said(+m)}`)
    .replace(/(\d{1,2})h(?!\p{L})/gu, (_, h) => `${said(+h)} giờ`)
    .replace(/thứ (\d)/g, (_, d) => `thứ ${["", "", "hai", "ba", "tư", "năm", "sáu", "bảy"][+d]}`)
    .replace(/(\d{1,2}) (tiếng|phút|buổi)/g, (_, n, u) => `${said(+n)} ${u}`);

const VOICE: [string, (s: string) => string][] = [
  ["spoken numbers", spoken],
  ["filler", (s) => `ừm ${spoken(s)}`],
  ["à thì", (s) => `à thì ${s}`],
];

describe("one line, every way it is typed or said", () => {
  for (const [s, wants] of BASE) {
    for (const [name, f] of TYPED) it(`${name}: ${f(s)}`, () => check(f(s), wants));
    for (const [name, f] of VOICE) it(`voice ${name}: ${f(s)}`, () => check(f(s), wants, "voice"));
  }
});

// --- bulk -----------------------------------------------------------------------------------------------------------
const JOIN = [", ", " và ", "\n", "; "];
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe("two items in a line, every pair and joiner", () => {
  for (let i = 0; i < BASE.length; i++)
    for (let j = 0; j < BASE.length; j++) {
      if (i === j) continue;
      for (const sep of JOIN) {
        const text = `${BASE[i][0]}${sep}${BASE[j][0]}`;
        it(JSON.stringify(text), () => check(text, [...BASE[i][1], ...BASE[j][1]]));
      }
    }
});

describe("three items, mixed joiners and noise", () => {
  const r = rng(7);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  for (let n = 0; n < 200; n++) {
    const idx = new Set<number>();
    while (idx.size < 3) idx.add(Math.floor(r() * BASE.length));
    const [a, b, c] = [...idx].map((k) => BASE[k]);
    const [, f] = pick(TYPED.slice(0, 4));
    const text = f(`${a[0]}${pick(JOIN)}${b[0]}${pick(JOIN)}${c[0]}`);
    it(JSON.stringify(text), () => check(text, [...a[1], ...b[1], ...c[1]]));
  }
});

// --- carried values, corrections and gibberish --------------------------------------------------------------------
describe("a leading day or part carries to the items after it", () => {
  const CASES: [string, Want[]][] = [
    ["mai họp nhóm 9h, đi chợ", [{ title: "họp nhóm", startsAt: `${D(19)} 09:00` }, { title: "đi chợ", deadline: `${D(19)} 23:59` }]],
    ["tối nay gọi mẹ, đọc sách", [{ title: "gọi mẹ", window: "NIGHT" }, { title: "đọc sách", window: "NIGHT" }]],
    ["thứ 6: nộp báo cáo, gọi Lan", [{ title: "nộp báo cáo", deadline: `${D(20)} 23:59` }, { title: "gọi Lan", deadline: `${D(20)} 23:59` }]],
    ["mai họp 9h, chiều đi chợ, tối học bài", [
      { title: "họp", startsAt: `${D(19)} 09:00` }, { title: "đi chợ", window: "AFTERNOON", deadline: `${D(19)} 18:00` },
      { title: "học bài", window: "NIGHT", deadline: `${D(19)} 22:00` },
    ]],
  ];
  for (const [s, w] of CASES) {
    it(s, () => check(s, w));
    it(`no tones: ${toneless(s)}`, () => check(toneless(s), w));
  }
});

describe("a correction inside a bulk line fixes only its item", () => {
  const CASES: [string, Want[]][] = [
    ["họp nhóm 9h à nhầm 10h sáng mai, nộp báo cáo trước thứ 6", [{ title: "họp nhóm", startsAt: `${D(19)} 10:00` }, { title: "nộp báo cáo", deadline: `${D(20)} 23:59` }]],
    ["gọi mẹ tối nay, nộp bài thứ 5 à không thứ 6", [{ title: "gọi mẹ", window: "NIGHT" }, { title: "nộp bài", deadline: `${D(20)} 23:59` }]],
  ];
  for (const [s, w] of CASES) { it(s, () => check(s, w)); it(`voice: ${s}`, () => check(s, w, "voice")); }
});

describe("gibberish is one plain task, the text its title", () => {
  const r = rng(11);
  const word = () => Array.from({ length: 3 + Math.floor(r() * 5) }, () => "bcdfghjklmnpqrstvwxz"[Math.floor(r() * 20)]).join("");
  for (let n = 0; n < 60; n++) {
    const text = Array.from({ length: 1 + Math.floor(r() * 3) }, word).join(" ");
    it(text, () => {
      const items = read(text, { ref: REF, source: n % 2 ? "voice" : "typed" }).items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ type: "PLAN" });
      expect(key(items[0].title)).toBe(key(text));
      expect(items[0].startsAt).toBeUndefined();
    });
  }
});
