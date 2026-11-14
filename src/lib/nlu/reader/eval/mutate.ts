// Mutation families (docs/nlu/robustness.md). Each rewrites a golden text with a seeded rng; the reader must still pass the case.
import { type Case, loadReference as loadCases, runCase } from "./run";

export type Family =
  | "swap"
  | "drop_tone"
  | "telex"
  | "vni"
  | "ocr"
  | "spaced"
  | "nfd"
  | "wrap"
  | "asr"
  | "zalo";
export const FAMILIES: Family[] = [
  "swap",
  "drop_tone",
  "telex",
  "vni",
  "ocr",
  "spaced",
  "nfd",
  "wrap",
  "asr",
  "zalo",
];

/** Sources each family can occur on: a typo is typed or pasted, OCR glyphs come from OCR or paste, ASR from voice. */
export const SOURCES: Record<Family, Case["source"][]> = {
  swap: ["typed", "paste"],
  drop_tone: ["typed", "voice", "paste", "ocr"],
  telex: ["typed", "paste"],
  vni: ["typed", "paste"],
  ocr: ["ocr", "paste"],
  spaced: ["typed", "voice", "paste", "ocr"],
  nfd: ["typed", "voice", "paste", "ocr"],
  wrap: ["typed", "voice", "paste", "ocr"],
  asr: ["typed", "voice"],
  zalo: ["paste"],
};

/** Points of pass rate a family may lose against the clean run. */
export const GATE: Record<Family, number> = {
  swap: 5,
  drop_tone: 5,
  telex: 5,
  vni: 5,
  ocr: 10,
  spaced: 5,
  nfd: 5,
  wrap: 5,
  asr: 12,
  zalo: 5,
};

/** mulberry32: a seeded rng in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TONE: Record<"telex" | "vni", Record<string, string>> = {
  telex: { "́": "s", "̀": "f", "̉": "r", "̃": "x", "̣": "j" },
  vni: { "́": "1", "̀": "2", "̉": "3", "̃": "4", "̣": "5" },
};

const MARK: Record<"telex" | "vni", Record<string, string>> = {
  telex: { "̂": "", "̆": "w", "̛": "w" },
  vni: { "̂": "6", "̆": "8", "̛": "7" },
};

/** A word typed with an IME: marks as keys, tone key last. */
export function typeWord(word: string, ime: "telex" | "vni"): string {
  let out = "";
  let tone = "";
  for (const ch of word.normalize("NFD")) {
    if (TONE[ime][ch]) {
      tone = TONE[ime][ch];
    } else if (MARK[ime][ch] !== undefined) {
      // circumflex in telex doubles the vowel, the others add a key after it
      const base = out.slice(-1);
      out += ime === "telex" && ch === "̂" ? base : MARK[ime][ch];
    } else if (ch === "đ" || ch === "Đ") {
      out +=
        (ch === "Đ" ? "D" : "d") +
        (ime === "telex" ? (ch === "Đ" ? "D" : "d") : "9");
    } else {
      out += ch;
    }
  }
  return out + tone;
}

function swapAt(word: string, i: number): string {
  const c = [...word];
  [c[i], c[i + 1]] = [c[i + 1], c[i]];
  return c.join("");
}

const OCR: Record<string, string> = {
  "0": "O",
  "1": "l",
  "2": "Z",
  "5": "S",
  "8": "B",
};
const SLANG: [RegExp, string][] = [
  [/kiểm tra/gi, "ktra"],
  [/bài tập/gi, "bt"],
  [/học phần/gi, "hp"],
  [/đăng ký/gi, "dk"],
  [/giảng viên/gi, "gv"],
  [/sinh viên/gi, "sv"],
  [/trước/gi, "trc"],
];

/** Phase 0.4 families: gated by the no-regression baseline in the scorecard, not by GATE (they fail the reader today). */
export type NoisyFamily =
  | "spaced_letters"
  | "homophone"
  | "english_misheard"
  | "number_words"
  | "drop_letter"
  | "add_letter"
  | "wrong_tone"
  | "glued"
  | "mojibake"
  | "elongation"
  | "runon"
  | "flat_spaces"
  | "flat_cells"
  | "flat_columns";
export const NOISY: NoisyFamily[] = [
  "spaced_letters",
  "homophone",
  "english_misheard",
  "number_words",
  "drop_letter",
  "add_letter",
  "wrong_tone",
  "glued",
  "mojibake",
  "elongation",
  "runon",
  "flat_spaces",
  "flat_cells",
  "flat_columns",
];
const ALL_SRC: Case["source"][] = ["typed", "voice", "paste", "ocr"];
export const NOISY_SOURCES: Record<NoisyFamily, Case["source"][]> = {
  spaced_letters: ["typed", "paste", "ocr"],
  homophone: ["typed", "voice"],
  english_misheard: ["voice"],
  number_words: ["voice"],
  drop_letter: ["typed", "voice"],
  add_letter: ["typed", "voice"],
  wrong_tone: ["typed", "voice"],
  glued: ["typed", "voice", "paste"],
  mojibake: ["paste", "ocr"],
  elongation: ["typed", "voice"],
  runon: ["voice"],
  flat_spaces: ["paste", "ocr"],
  flat_cells: ["paste", "ocr"],
  flat_columns: ["paste", "ocr"],
};
void ALL_SRC;

const ENGLISH: [RegExp, string][] = [
  [/deadline/gi, "đét lai"],
  [/demo/gi, "đe mô"],
  [/meeting/gi, "mít tinh"],
  [/project/gi, "pờ rồ jéc"],
  [/report/gi, "ri pót"],
  [/quiz/gi, "ku ít"],
  [/online/gi, "on lai"],
  [/\blab\b/gi, "láp"],
];
const ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín", "mười"];
const spoken = (n: number) =>
  n <= 10 ? ONES[n] : n < 20 ? `mười ${ONES[n - 10]}` : `${ONES[Math.floor(n / 10)]} mươi${n % 10 ? " " + ONES[n % 10] : ""}`;
const HOMO: [RegExp, string][] = [
  [/\bs(?=\p{L})/giu, "x"],
  [/\bch/gi, "tr"],
  [/\btr/gi, "ch"],
  [/\bgi/gi, "d"],
  [/\bl(?=\p{L})/giu, "n"],
  [/\bn(?=[aăâeêioôơuư])/giu, "l"],
  [/\bd(?=[aăâeêoôơuư])/giu, "gi"],
  [/\bd/gi, "r"],
  [/\br/gi, "d"],
  [/\br/gi, "gi"],
  [/\bgi/gi, "r"],
];
const TONES = ["\u0301", "\u0300", "\u0309", "\u0303", "\u0323"];

/** The 0.4 families; same seeded rng convention as `mutate`. Returns the text unchanged when the family does not apply. */
export function mutateNoisy(f: NoisyFamily, text: string, seed: number): string {
  const r = rng(seed);
  const words = (fn: (w: string) => string, p: number) =>
    text.replace(/\p{L}{3,}/gu, (w) => (r() < p ? fn(w) : w));
  switch (f) {
    case "spaced_letters":
      return words((w) => {
        const i = [...w.normalize("NFC")].findIndex((c, k) => k > 0 && c.normalize("NFD") !== c);
        const cs = [...w.normalize("NFC")];
        return i > 0 ? `${cs.slice(0, i).join("")} ${cs.slice(i).join("")}` : w;
      }, 0.3);
    case "homophone":
      return words((w) => {
        const [re, to] = HOMO[Math.floor(r() * HOMO.length)];
        const d = w.normalize("NFD").replace(/\u0309/g, "\u0303");
        return r() < 0.5 ? w.replace(re, to) : d.normalize("NFC");
      }, 0.2);
    case "english_misheard":
      return ENGLISH.reduce((t, [re, to]) => t.replace(re, to), text);
    case "number_words":
      return text
        .replace(/\b(\d{1,2})h(?!\d)/g, (_, n) => `${spoken(+n)} giờ`)
        .replace(/(?<![\d/:.])(\d{1,2})(?![\d/:.h])/g, (_, n) => spoken(+n));
    case "drop_letter":
      return words((w) => {
        const i = 1 + Math.floor(r() * (w.length - 2));
        return w.slice(0, i) + w.slice(i + 1);
      }, 0.15);
    case "add_letter":
      return words((w) => {
        const i = 1 + Math.floor(r() * (w.length - 2));
        return w.slice(0, i) + w[i] + w.slice(i);
      }, 0.15);
    case "wrong_tone":
      return words((w) => {
        const d = w.normalize("NFD");
        return /[\u0300\u0301\u0309\u0303\u0323]/.test(d)
          ? d.replace(/[\u0300\u0301\u0309\u0303\u0323]/, TONES[Math.floor(r() * 5)]).normalize("NFC")
          : w;
      }, 0.2);
    case "glued":
      return text.replace(/(\p{L}) (?=\d)/gu, (m, c) => (r() < 0.6 ? c : m));
    case "mojibake":
      return [...new TextEncoder().encode(text)].map((b) => String.fromCharCode(b)).join("");
    case "elongation":
      return text.replace(/\b(mai|nay|nhé|nha|rồi)\b/giu, (w) => w + w.slice(-1).repeat(3));
    case "runon":
      return text.toLowerCase().replace(/[.,;:!?\n]+/g, " ").replace(/\s+/g, " ").trim();
    case "flat_spaces":
      return text.replace(/\t/g, "    ");
    case "flat_cells":
      return text.replace(/\t|\s*\|\s*/g, "\n");
    case "flat_columns": {
      const rows = text.split("\n").map((l) => l.split(/\t|\s*\|\s*/));
      const w = Math.max(...rows.map((x) => x.length));
      return Array.from({ length: w }, (_, c) => rows.map((x) => x[c]).filter(Boolean).join("\n")).join("\n");
    }
  }
}

/** Pass rate under a 0.4 family, over the cases it applies to (the mutation changes the text). */
export function scoreNoisy(f: NoisyFamily, cases: Case[] = loadCases(), seed = 1): FamilyScore<NoisyFamily> {
  const failures: FamilyScore["failures"] = [];
  let total = 0;
  cases.forEach((c, i) => {
    if (!NOISY_SOURCES[f].includes(c.source ?? "typed")) return;
    const text = mutateNoisy(f, c.text, seed + i);
    if (text === c.text) return;
    total++;
    const reasons = runCase(c, text, c.alternatives?.map((a, j) => mutateNoisy(f, a, seed + i + 1000 * (j + 1))));
    if (reasons.length) failures.push({ name: c.name, reasons });
  });
  return { family: f, pass: total - failures.length, total, failures };
}

export function mutate(f: Family, text: string, seed: number): string {
  const r = rng(seed);
  switch (f) {
    case "swap":
      return text.replace(/\p{L}{5,}/gu, (w) =>
        r() < 0.3 ? swapAt(w, 1 + Math.floor(r() * (w.length - 3))) : w,
      );
    case "drop_tone":
      return text
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D");
    case "telex":
    case "vni":
      return text.replace(/\p{L}+/gu, (w) => {
        const marked =
          w.normalize("NFD") !== w.normalize("NFC") || /đ/i.test(w);
        return marked && r() < 0.8 ? typeWord(w, f) : w;
      });
    case "ocr":
      return text.replace(/\d[\d/.:h-]*\d/g, (m) =>
        [...m].map((ch) => (OCR[ch] && r() < 0.125 ? OCR[ch] : ch)).join(""),
      );
    case "spaced":
      return text.replace(/\d{1,2}\/\d{1,2}(?:\/\d{4})?/g, (m) =>
        [...m].join(" "),
      );
    case "nfd":
      return text.normalize("NFD").replace(/đ/g, "ð").replace(/Đ/g, "Ð");
    case "wrap": {
      const lines: string[] = [];
      let cur = "";
      for (const w of text.split(/\s+/).filter(Boolean)) {
        if (cur && cur.length + 1 + w.length > 60) {
          lines.push(cur);
          cur = w;
        } else cur = cur ? `${cur} ${w}` : w;
      }
      if (cur) lines.push(cur);
      return lines.join("\n\n");
    }
    case "asr":
      return text.toLowerCase().replace(/[.,;:!?()"']/g, "");
    case "zalo":
      return SLANG.reduce(
        (t, [re, to]) => t.replace(re, to),
        text.toLowerCase(),
      );
  }
}

export interface FamilyScore<F extends string = Family> {
  family: F;
  pass: number;
  total: number;
  failures: { name: string; reasons: string[] }[];
}

/** Pass rate of the cases under one family, with the same seed per case. */
export function score(
  f: Family,
  cases: Case[] = loadCases(),
  seed = 1,
): FamilyScore {
  const failures: FamilyScore["failures"] = [];
  const pool = cases.filter(
    (c) =>
      SOURCES[f].includes(c.source ?? "typed") &&
      !(f === "asr" && c.commaPieces),
  );
  pool.forEach((c, i) => {
    const alternatives = c.alternatives?.map((a, j) =>
      mutate(f, a, seed + i + 1000 * (j + 1)),
    );
    const reasons = runCase(c, mutate(f, c.text, seed + i), alternatives);
    if (reasons.length) failures.push({ name: c.name, reasons });
  });
  return {
    family: f,
    pass: pool.length - failures.length,
    total: pool.length,
    failures,
  };
}

/** The clean pass rate, as a percentage. */
export function cleanRate(cases: Case[] = loadCases()): number {
  const pass = cases.filter((c) => runCase(c).length === 0).length;
  return (100 * pass) / cases.length;
}
