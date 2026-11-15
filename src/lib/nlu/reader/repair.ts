// S0 repair: decodes markup, cleans unicode and punctuation, dewraps PDF lines.
// `map[i]` is the raw index of repaired char i, so every span found later maps back to the input.
import { fold } from "./fold";
import { isSyllable } from "./syllables";
import { spokenEdits } from "./spoken";
import { TELEX_TERMS, untelex } from "./telex";
import { gridEdits, isScheduleText } from "./table";
import type { ReaderSource } from "../shared";

export interface Repaired {
  text: string;
  map: number[];
}

/** Replaces every match of a global regex, keeping the raw origin of each char. */
function sub(
  src: Repaired,
  re: RegExp,
  rep: (m: RegExpExecArray) => string,
): Repaired {
  const ms = [...src.text.matchAll(re)];
  if (!ms.length) return src;
  let text = "";
  const map: number[] = [];
  let last = 0;
  const keep = (to: number) => {
    text += src.text.slice(last, to);
    for (let k = last; k < to; k++) map.push(src.map[k]);
  };
  for (const m of ms) {
    const i = m.index ?? 0;
    keep(i);
    const r = rep(m);
    text += r;
    for (let k = 0; k < r.length; k++) map.push(src.map[i]);
    last = i + m[0].length;
  }
  keep(src.text.length);
  return { text, map };
}

const UPPER = /\p{Lu}/u;
const LETTER = /\p{L}/u;

/** At least 70% of letters are capitals, and at least 3 letters. */
function allCaps(s: string): boolean {
  const letters = [...s].filter((c) => LETTER.test(c));
  if (letters.length < 3) return false;
  return letters.filter((c) => UPPER.test(c)).length / letters.length >= 0.7;
}

const CONNECTOR_END = /(?:ngày|môn|tại|ở|lúc|vào|[–\-,])$/i;
const SENTENCE_END = /[.!?]$/;
const LIST_OR_HEADER =
  /^([-+*•▪●○]|\d{1,2}[.)]\s|\d{1,2}[.)](?=\d{1,2}[/.-]\d{1,2}\b)|\p{Lu}{2,})/u;
const FOLDED_LABEL_START =
  /^(?:thoi gian|thoi han|ngay thi dau|lich thi|lich|han nop|han chot|han|dia diem|noi dung|ghi chu|phong|deadline|sinh vien|hoi dong|gvhd|gvpb)\s*[:–-]/i;
/** Greetings and sign-offs end their own line, even with a comma. */
const GREETING_END = /^(?:kinh gui|than gui|chao|tran trong|than ai|cam on)\b/;
/** A timetable or exam-table row, on folded text: a course code or a weekday, then a clock. */
const TABLE_ROW =
  /^(?:\d{1,3} [a-z]{2,4}\d{2,4}\b|thu [2-7] +\d{1,2}[:h]\d{2}|cn +\d{1,2}[:h]\d{2})/;

/** A hard line break inside a sentence: the line before is unterminated and the next is not a marker or heading. */
function joins(text: string, nl: number): boolean {
  const prevStart = text.lastIndexOf("\n", nl - 1) + 1;
  const prev = text.slice(prevStart, nl).trimEnd();
  const nextEnd = text.indexOf("\n", nl + 1);
  const next = text.slice(nl + 1, nextEnd < 0 ? text.length : nextEnd).trim();
  if (!prev || !next) return false;
  if (LIST_OR_HEADER.test(next) || LIST_OR_HEADER.test(prev)) return false;
  if (TABLE_ROW.test(fold(next).text) || TABLE_ROW.test(fold(prev).text))
    return false;
  if (GREETING_END.test(fold(prev).text)) return false;
  if (/:$/.test(next)) return false;
  if (FOLDED_LABEL_START.test(fold(next).text)) return false;
  if (/:$/.test(prev)) {
    const wCount = prev.trim().split(/\s+/).length;
    return wCount <= 3 && prev.length <= 25;
  }
  if (CONNECTOR_END.test(prev)) return true;
  if (SENTENCE_END.test(prev)) return false;
  if (allCaps(prev)) return false;
  if (
    prev.length < 20 &&
    /^\p{Lu}\p{Ll}+\s+\p{Lu}/u.test(next) &&
    !CONNECTOR_END.test(prev)
  )
    return false;
  // a run of three or more short unterminated lines is a list of items, not a wrapped sentence
  if (
    prev.length < 30 &&
    (isShortOpen(lineBefore(text, prevStart)) ||
      (isShortOpen(next) && isShortOpen(lineAfter(text, nextEnd))))
  )
    return false;
  return true;
}

function isShortOpen(line: string): boolean {
  const t = line.trim();
  return !!t && t.length < 30 && !/[.!?;:]$/.test(t);
}

/** The line that ends just before `start`, or "" at the top of the text. */
function lineBefore(text: string, start: number): string {
  if (start <= 0) return "";
  const from = text.lastIndexOf("\n", start - 2) + 1;
  return text.slice(from, start - 1);
}

/** The line that starts just after the newline at `end`, or "" at the bottom of the text. */
function lineAfter(text: string, end: number): string {
  if (end < 0) return "";
  const to = text.indexOf("\n", end + 1);
  return text.slice(end + 1, to < 0 ? text.length : to);
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Applies sorted, non-overlapping edits, keeping the raw origin of each char. */
function splice(src: Repaired, edits: Edit[]): Repaired {
  let text = "";
  const map: number[] = [];
  let last = 0;
  for (const e of edits) {
    for (let k = last; k < e.start; k++) {
      text += src.text[k];
      map.push(src.map[k]);
    }
    for (const ch of e.text) {
      text += ch;
      map.push(src.map[e.start]);
    }
    last = e.end;
  }
  for (let k = last; k < src.text.length; k++) {
    text += src.text[k];
    map.push(src.map[k]);
  }
  return { text, map };
}

/** Runs `edit` on each line, with `at` the offset of the line in the text. */
function eachLine(
  src: Repaired,
  edit: (line: string, at: number) => Edit[],
): Repaired {
  const edits: Edit[] = [];
  let at = 0;
  for (const line of src.text.split("\n")) {
    edits.push(...edit(line, at));
    at += line.length + 1;
  }
  return splice(src, edits);
}

// 5 digits: "1 5 / 1 1 / 2 0 2 6" from PDF or OCR copy becomes "15/11/2026"
function joinDigits(src: Repaired, source: ReaderSource): Repaired {
  const edits: Edit[] = [];
  for (const m of src.text.matchAll(
    /(?<![\p{L}\d])\d(?: [\d/.:-]){3,}(?![\p{L}\d])/gu,
  )) {
    // typed digits join only with a separator in the run: "1 2 / 1 1", not "1 2 3 4"
    if (source !== "paste" && source !== "ocr" && !/[/.:-]/.test(m[0]))
      continue;
    const i = m.index ?? 0;
    edits.push({
      start: i,
      end: i + m[0].length,
      text: m[0].replace(/ /g, ""),
    });
  }
  return splice(src, edits);
}

// 5 OCR: O Q o -> 0, I l | ! -> 1 (a final ! is a mark), S -> 5, Z -> 2, B -> 8, and , ; or spaced / -> / inside a date or time shape
const COMMA_DATE = /^\d{1,2}[,;]\d{1,2}([,;]\d{2,4})?$/;
const OCR_FIX: Record<string, string> = {
  O: "0",
  Q: "0",
  o: "0",
  I: "1",
  l: "1",
  "|": "1",
  "!": "1",
  S: "5",
  Z: "2",
  B: "8",
};
function fixOcr(src: Repaired): Repaired {
  const shape =
    /(?<![\p{L}\d])[\dOoQIl|!SZB]{1,4}(?: ?[/.:,;-] ?[\dOoQIl|!SZB]{1,4})+(?<!!)(?![\p{L}\d])/gu;
  return sub(src, shape, (m) => {
    if (!/\d/.test(m[0])) return m[0];
    // a part after the first has a real digit or is two or more glyphs: "12-B" stays, "lZ/11" reads "12/11"
    const parts = m[0].split(/ ?[/.:,;-] ?/);
    if (
      !parts
        .slice(1)
        .every(
          (p) => /\d/.test(p) || (p.length >= 2 && /^[OoQIl|!SZB]+$/.test(p)),
        )
    )
      return m[0];
    const digits = m[0].replace(/[OoQIl|!SZB]/g, (c) => OCR_FIX[c] ?? c);
    // "thứ 6, 20/11" keeps its comma: only the bare "d,d" or "d,d,yyyy" shape is a date
    if (/[,;]/.test(digits) && !COMMA_DATE.test(digits)) return m[0];
    // "1,5 tiếng" is a length, not 1 May
    const after = (m.input ?? "").slice(
      (m.index ?? 0) + m[0].length,
      (m.index ?? 0) + m[0].length + 12,
    );
    if (
      /[,;]/.test(digits) &&
      /^\s*(tiếng|tieng|giờ|gio|h|phút|phut|p|ngày|ngay|tuần|tuan|tháng|thang)(?![\p{L}])/iu.test(
        after,
      )
    )
      return m[0];
    const fixed = digits.replace(/ /g, "").replace(/[,;]/g, "/");
    return /^\d{1,4}([/.:-]\d{1,4})+$/.test(fixed) && validShape(fixed)
      ? fixed
      : m[0];
  });
}

/** A fixed shape is a clock (h:mm) or a date (d/m, d.m, d-m): the numbers must fit, so "82.202" is not a date. */
function validShape(f: string): boolean {
  if (f.includes(":")) {
    const p = f.split(/[/.:-]/).map(Number);
    return p[0] <= 23 && (p[1] === undefined || p[1] <= 59);
  }
  // "16/1017/10" is two glued dates: each d/m piece must fit
  const pieces = [...f.matchAll(/(\d{1,2})\/(\d{1,2})/g)];
  if (pieces.length)
    return pieces.every(
      ([, d, mo]) => +d >= 1 && +d <= 31 && +mo >= 1 && +mo <= 12,
    );
  const p = f.split(/[.-]/).map(Number);
  return p[0] >= 1 && p[0] <= 31 && p[1] >= 1 && p[1] <= 12;
}

// 6 kerning: "nộ p", "ti ểu", "g i ờ" become one word when the join is a syllable and one part is 1 or 2 letters; a line needs 3 or more joins
function joinKerned(src: Repaired): Repaired {
  return eachLine(src, (line, at) => {
    const toks = [...line.matchAll(/\p{L}+/gu)];
    const groups: {
      start: number;
      end: number;
      text: string;
      joins: number;
    }[] = [];
    let total = 0;
    toks.forEach((m, k) => {
      const start = m.index ?? 0;
      const text = m[0];
      const last = groups[groups.length - 1];
      const adjacent =
        !!last && last.end + 1 === start && line[last.end] === " ";
      // a lone letter goes onto the vowel-led word after it when that reads as a syllable, else onto the word before
      const next = toks[k + 1];
      const toRight =
        text.length === 1 &&
        !/^[aeiouy]$/i.test(text) &&
        next?.index === start + 2 &&
        /^[aeiouy]/.test(fold(next[0]).text) &&
        isSyllable(text + next[0]);
      if (
        adjacent &&
        !toRight &&
        (last.text.length <= 2 || text.length <= 2) &&
        isSyllable(last.text + text)
      ) {
        last.end = start + text.length;
        last.text += text;
        last.joins += 1;
        total += 1;
      } else groups.push({ start, end: start + text.length, text, joins: 0 });
    });
    if (total < 3) return [];
    return groups
      .filter((g) => g.joins)
      .map((g) => ({ start: at + g.start, end: at + g.end, text: g.text }));
  });
}

const TONE_TELEX: Record<string, string> = {
  s: "́",
  f: "̀",
  r: "̉",
  x: "̃",
  j: "̣",
};
const TONE_VNI: Record<string, string> = {
  "1": "́",
  "2": "̀",
  "3": "̉",
  "4": "̃",
  "5": "̣",
};
const MARKED = /[̛̂̆]/;

const AMBIGUOUS_TYPED = new Set([
  "noon",
  "to",
  "co",
  "do",
  "ho",
  "lo",
  "mo",
  "no",
  "ro",
  "so",
  "vo",
  "bo",
  "am",
  "an",
  "as",
  "at",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "up",
  "us",
  "we",
  "by",
  "my",
]);

const STRUCTURAL_KEYWORDS = [
  "phòng",
  "trường",
  "khoa",
  "môn",
  "lịch",
  "thi",
  "kiểm",
  "hạn",
  "nộp",
  "ngày",
  "giờ",
  "thứ",
  "sáng",
  "chiều",
  "tối",
  "tuần",
  "tháng",
  "chuẩn",
  "phong",
  "truong",
  "chieu",
  "thang",
  "chuan",
  "diem",
  "thoi",
  "gian",
];

const SWAP_REPAIR = new Map<string, string>();
for (const kw of STRUCTURAL_KEYWORDS) {
  const chars = [...kw];
  for (let i = 0; i < chars.length - 1; i++) {
    const sw = [...chars];
    const t = sw[i];
    sw[i] = sw[i + 1];
    sw[i + 1] = t;
    const s = sw.join("");
    if (s !== kw && !SWAP_REPAIR.has(s)) {
      SWAP_REPAIR.set(s, kw);
    }
  }
}

function repairSwaps(src: Repaired): Repaired {
  return eachLine(src, (line, at) => {
    if (!line.length || !/[\p{L}]/u.test(line)) return [];
    const edits: Edit[] = [];
    for (const m of line.matchAll(/[\p{L}]+/gu)) {
      const w = m[0];
      const lower = w.toLowerCase();
      const target = SWAP_REPAIR.get(fold(lower).text);
      if (target && !isSyllable(w)) {
        const isCap = /^\p{Lu}/u.test(w);
        const fixed = isCap
          ? target.charAt(0).toUpperCase() + target.slice(1)
          : target;
        const start = at + (m.index ?? 0);
        edits.push({ start, end: start + w.length, text: fixed });
      }
    }
    return edits;
  });
}

/** Time and cue words the typo repair may restore, by folded key. */
const TYPO_WORDS = [
  "trước",
  "sau",
  "chiều",
  "sáng",
  "trưa",
  "tối",
  "đêm",
  "khuya",
  "tuần",
  "tháng",
  "ngày",
  "thứ",
  "mai",
  "nay",
  "hôm",
  "giờ",
  "phút",
  "tiếng",
  "nộp",
  "hạn",
  // order and timetable cue words: "rồi", "xong", "làm", "học", "tiết", "bữa"
  "rồi",
  "xong",
  "làm",
  "học",
  "tiết",
  "buổi",
  "bữa",
  "tiếp",
];
const TYPO = new Map(TYPO_WORDS.map((w) => [fold(w).text, w]));
/** Cue and keyword words a letter swap can break: time, date, recurrence, holiday and role words. */
const SWAP_VOCAB = [
  "trước",
  "sau",
  "trong",
  "từ",
  "đến",
  "tới",
  "khoảng",
  "hạn",
  "chót",
  "muộn",
  "trễ",
  "không",
  "hết",
  "nữa",
  "lúc",
  "vào",
  "bắt",
  "đầu",
  "kéo",
  "dài",
  "sáng",
  "chiều",
  "trưa",
  "tối",
  "đêm",
  "khuya",
  "giờ",
  "phút",
  "tiếng",
  "tuần",
  "tháng",
  "năm",
  "ngày",
  "hôm",
  "mai",
  "nay",
  "mùng",
  "rằm",
  "thứ",
  "chủ",
  "nhật",
  "hàng",
  "mỗi",
  "cách",
  "cuối",
  "thường",
  "every",
  "other",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "weekday",
  "weekend",
  "noel",
  "giáng",
  "sinh",
  "tết",
  "nguyên",
  "đán",
  "trung",
  "thu",
  "valentine",
  "halloween",
  "quốc",
  "khánh",
  "giỗ",
  "hùng",
  "vương",
  "giao",
  "thừa",
  "nghỉ",
  "lễ",
  "phụ",
  "nữ",
  "nhà",
  "giáo",
  "thiếu",
  "nhi",
  "lao",
  "động",
  "giải",
  "phóng",
  "thống",
  "nhất",
  "gia",
  "đình",
];
/** A typed word one adjacent letter swap away from a cue word, mapped to the word. Built once. */
const SWAP_FIX = new Map<string, string>();
for (const w of SWAP_VOCAB) {
  const f = [...fold(w).text];
  for (let i = 0; i < f.length - 1; i++) {
    const s = [...f];
    [s[i], s[i + 1]] = [s[i + 1], s[i]];
    const key = s.join("");
    if (key !== f.join("") && !SWAP_FIX.has(key)) SWAP_FIX.set(key, w);
  }
}
/** QWERTY neighbours: same row next key, or a key one row over within half a key. */
const NEIGHBOURS = new Map<string, string[]>();
{
  const pos = new Map<string, [number, number]>();
  ["qwertyuiop", "asdfghjkl", "zxcvbnm"].forEach((row, r) =>
    [...row].forEach((c, i) => pos.set(c, [r, i + r * 0.5])),
  );
  for (const [c, [r, x]] of pos) {
    NEIGHBOURS.set(
      c,
      [...pos]
        .filter(
          ([k, [r2, x2]]) =>
            k !== c && Math.abs(r2 - r) <= 1 && Math.abs(x2 - x) <= 1,
        )
        .map(([k]) => k),
    );
  }
}

/** Folded one-key and one-swap variants of each time or cue word, mapped to the word. Built once. */
const VARIANTS = new Map<string, string>();
for (const [f, w] of TYPO) {
  for (let i = 0; i < f.length; i++)
    for (const n of NEIGHBOURS.get(f[i]) ?? [])
      VARIANTS.set(f.slice(0, i) + n + f.slice(i + 1), w);
  for (let i = 0; i < f.length - 1; i++)
    VARIANTS.set(f.slice(0, i) + f[i + 1] + f[i] + f.slice(i + 2), w);
}

const TYPO_KEEP = new Set([
  "app",
  "test",
  "add",
  "all",
  "call",
  "class",
  "pass",
  "off",
  "cool",
  "book",
  "good",
  "feed",
  "need",
  "meet",
  "week",
]);
/** A typed word repaired to a time or cue word, or a word with a doubled letter collapsed. Undefined when it reads as a syllable. */
function typoFix(w: string): string | undefined {
  if (w.length < 2 || isSyllable(w)) return undefined;
  // English words with a doubled letter are not typos: "app" is not "ap"
  if (TYPO_KEEP.has(fold(w).text)) return undefined;
  // a doubled a, e, o or d is a typed mark ("dd" is đ), not a typo
  if (/([^aeod])\1/iu.test(w)) {
    let collapsed = "";
    for (let i = 0; i < w.length; i++)
      if (i === 0 || w[i].toLowerCase() !== w[i - 1].toLowerCase())
        collapsed += w[i];
    if (TYPO.has(fold(collapsed).text) || isSyllable(collapsed))
      return collapsed;
  }
  return VARIANTS.get(fold(w).text) ?? SWAP_FIX.get(fold(w).text);
}

/** One typo per word, and a letter moved across a space ("tậ ptrước" is "tập trước"). */
function repairTypos(src: Repaired): Repaired {
  return eachLine(src, (line, at) => {
    const edits: Edit[] = [];
    // a link is not prose: "maps.app.goo.gl" keeps its letters
    const urls = [...line.matchAll(/https?:\/\/\S+/g)];
    const words = [...line.matchAll(/\p{L}+/gu)].filter(
      (m) =>
        !urls.some(
          (u) =>
            (m.index ?? 0) >= (u.index ?? 0) &&
            (m.index ?? 0) < (u.index ?? 0) + u[0].length,
        ),
    );
    words.forEach((m, k) => {
      const w = m[0];
      const start = at + (m.index ?? 0);
      const fix = typoFix(w);
      if (fix)
        edits.push({
          start,
          end: start + w.length,
          text: /^\p{Lu}/u.test(w)
            ? fix.charAt(0).toUpperCase() + fix.slice(1)
            : fix,
        });
      // a letter moved across the space before it: "tậ ptrước" reads "tập trước"
      const prev = words[k - 1];
      if (!prev || prev.index + prev[0].length + 1 !== m.index || w.length < 3)
        return;
      const [b, rest] = [w[0], w.slice(1)];
      if (
        /^[aeiouy]$/i.test(b) ||
        !TYPO.has(fold(rest).text) ||
        !isSyllable(prev[0] + b) ||
        isSyllable(w)
      )
        return;
      edits.push({
        start: at + prev.index,
        end: start + w.length,
        text: prev[0] + b + " " + rest,
      });
    });
    return edits.sort((x, y) => x.start - y.start);
  });
}

/** Teencode and southern day words, read on the raw text: "chìu", "nhứt", "bữa mai", and "hp" before a clock or day. */
function repairTeencode(src: Repaired): Repaired {
  if (!/chìu|Chìu|nhứt|Nhứt|bữa|hp|Hp/.test(src.text)) return src;
  let r = sub(src, /(?<!\p{L})chìu(?!\p{L})/gu, () => "chiều");
  r = sub(r, /(?<!\p{L})Chìu(?!\p{L})/gu, () => "Chiều");
  r = sub(r, /nhứt(?!\p{L})/gu, () => "nhất");
  r = sub(r, /Nhứt(?!\p{L})/gu, () => "Nhất");
  r = sub(r, /(?<!\p{L})bữa(?=\s+(?:nay|mai|mốt|kia|kìa)(?!\p{L}))/giu, (m) =>
    m[0] === "Bữa" ? "Ngày" : "ngày",
  );
  r = sub(
    r,
    /(?<!\p{L})(hp|Hp)(?=\s+(?:[\p{L}]+\s+){0,3}?(?:\d|mai|nay|sáng|chiều|trưa|tối|đêm|thứ|t[2-7]\b))/gu,
    (m) => (m[1] === "Hp" ? "Họp" : "họp"),
  );
  return r;
}

/** Vietnamese letters grouped by plain form, so "rồi", "roi" and "rôi" share a class. */
const SAME_PLAIN = new Map<string, string>();
for (let cp = 0x41; cp <= 0x1ef9; cp++) {
  const ch = String.fromCodePoint(cp);
  const plain = fold(ch).text;
  if (/^[a-z]$/.test(plain))
    SAME_PLAIN.set(plain, (SAME_PLAIN.get(plain) ?? "") + ch);
}
/** A regex source for a phrase that matches with or without its tones: for spoken connectors and marks, where a tone-blind match is safe. */
function plainPhrase(phrase: string): string {
  return [...phrase]
    .map((ch) => {
      if (ch === " ") return "\\s+";
      const cls = SAME_PLAIN.get(fold(ch).text);
      return cls ? `[${cls}]` : ch;
    })
    .join("");
}
const word = (phrase: string) =>
  new RegExp(`(?<!\\p{L})${plainPhrase(phrase)}(?!\\p{L})`, "giu");

/** Voice: a folded word for anchor checks. */
const folded = (w: string) => fold(w).text.replace(/[^a-z0-9:]/g, "");
const wordsBefore = (text: string, at: number, n: number) =>
  text.slice(0, at).trimEnd().split(/\s+/).slice(-n).map(folded);
const wordsAfter = (text: string, at: number, n: number) =>
  text.slice(at).trimStart().split(/\s+/).slice(0, n).map(folded);

/** A time, day or number word, or a digit: the anchors that make an ASR confusion a fix. */
const ANCHOR_WORD =
  /^\d|^(?:gio|tieng|phut|mai|nay|hom|sang|chieu|trua|toi|dem|khuya|thu|chu|ngay|tuan|thang|mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi|ruoi|kem|mung|mong)$/;
const DAY_NEXT = new Set(["nay", "mai", "hom"]);
const UNIT_NEXT = new Set(["gio", "tieng", "phut", "ngay", "tuan", "thang"]);
const NUMBER_BEFORE =
  /^(?:\d.*|mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi)$/;

/** A zone is read and dropped: "GMT+7", "UTC+7", "(giờ VN)", and "ICT" only right next to a clock ("9:00 ICT"), never after "môn", where it is the course. */
const ZONE: [RegExp, () => string][] = [
  [/\(?\s*(?<!\p{L})(?:GMT|UTC)\s*[+-]\s*\d{1,2}\s*\)?/gu, () => " "],
  [
    /(?<!(?:m|M)(?:ô|o|Ô|O)n\s+)(?<=(?<![\p{L}\d/.:])\d(?::\d{2}|[hg]\d{0,2})\s*\(?\s*)ICT(?!\p{L})\s*\)?|(?<!(?:m|M)(?:ô|o|Ô|O)n\s+)(?<!\p{L})\(?\s*ICT(?=\s*\)?\s*\d(?::\d{2}|[hg]\d{0,2})(?![\p{L}\d]))\s*\)?/gu,
    () => " ",
  ],
  [/\(?\s*(?<!\p{L})gi(?:ờ|o)\s+VN(?!\p{L})\s*\)?/giu, () => " "],
];

/**
 * "12am" is 00:00 of its own day: "12h am" reads as the clock. "24h" is the day's last minute, 23:59: as "0h" it would read
 * "trước 24h thứ 6" as the end of Thursday. "trong 24h" is a span of hours and stays.
 */
const MIDNIGHT: [RegExp, () => string][] = [
  [/(?<![\p{L}\d])12\s*am(?!\p{L})/giu, () => "12h am"],
  [
    /(?<!(?:trong|sau|hơn|vòng)\s*)(?<![\p{L}\d])(?:24\s*(?:h|giờ|gio)|24:00)(?![\p{L}\d])(?!\s*\d{1,2}(?![\d/.-]))(?!\s*nữa)/giu,
    () => "23h59",
  ],
];

/** "tháng giêng" is month 1 and "tháng chạp" month 12, but "mùng 1 tháng giêng" and "rằm tháng giêng" are lunar: they stay for holidays.ts. */
const MONTH_WORDS: [RegExp, (m: RegExpExecArray) => string][] = [
  [
    /(?<!\p{L})tháng\s+(?:giêng|gieng)(?!\p{L})/giu,
    (m) =>
      /(?:mùng|mồng|rằm|mung|mong|ram)(?:\s+(?:\d{1,2}|\p{L}+))?\s*$/iu.test(
        m.input.slice(0, m.index ?? 0),
      )
        ? m[0]
        : "tháng 1",
  ],
  [/(?<!\p{L})tháng\s+(?:chạp|chap)(?!\p{L})/giu, () => "tháng 12"],
];

const EN_HOUR: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const EN_ORD: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
};
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30 };
const EN_HOUR_RE = Object.keys(EN_HOUR).join("|");
const EN_ORD_RE = Object.keys(EN_ORD).join("|");

/** English clocks and day words, as the digits the clock and date rules read: "five thirty pm", "half past nine", "twenty first of November". */
const ENGLISH_NUMBERS: [RegExp, (m: RegExpExecArray) => string][] = [
  [
    new RegExp(`(?<![a-z])half past (${EN_HOUR_RE})(?![a-z])`, "gi"),
    (m) => `${EN_HOUR[m[1].toLowerCase()]}:30`,
  ],
  [
    new RegExp(
      `(?<![a-z])(${EN_HOUR_RE}) (thirty|fifteen|forty[ -]five)(?![a-z])(?:\\s*(am|pm)(?![a-z]))?`,
      "gi",
    ),
    (m) => {
      const mi = { thirty: 30, fifteen: 15 }[m[2].toLowerCase()] ?? 45;
      return `${EN_HOUR[m[1].toLowerCase()]}:${mi}${m[3] ? ` ${m[3]}` : ""}`;
    },
  ],
  [
    new RegExp(
      `(?<![a-z])(?:(twenty|thirty)[ -])?(${EN_ORD_RE})(?![a-z])(?=\\s+of\\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))`,
      "gi",
    ),
    (m) => {
      const unit = EN_ORD[m[2].toLowerCase()];
      const tens = m[1] ? EN_TENS[m[1].toLowerCase()] : 0;
      if (unit > 9 && tens) return m[0];
      return String(tens + unit);
    },
  ],
];

/** Voice fillers, read as words of their own. "à" before a comma or "thì" at a clause start only. */
const VOICE_FILLERS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/(?<!\p{L})(?:ừm|ờm|ừ|ờ|uh|um)(?!\p{L})/giu, () => ""],
  [/(?<!\p{L})(?:là kiểu|nói chung)(?!\p{L})/giu, () => ""],
  [/(?<!\p{L})à\s*,\s*/giu, () => ""],
  [/(^|[.,;!?\n])\s*thì\s+/gimu, (m) => m[1]],
];

/** Spoken punctuation becomes the mark it names. "chấm" is a stop only before a line break or at the end, so "chấm bài" stays. */
const SPOKEN_PUNCT: [RegExp, (m: RegExpExecArray) => string][] = [
  [new RegExp(`\\s*${word("chấm xuống dòng").source}\\s*`, "giu"), () => ".\n"],
  [new RegExp(`\\s*${word("xuống dòng").source}\\s*`, "giu"), () => ".\n"],
  [
    new RegExp(`(?<=\\d)\\s*${word("hai chấm").source}\\s*(?=\\d)`, "giu"),
    () => ":",
  ],
  [new RegExp(`\\s*${word("hai chấm").source}\\s*`, "giu"), () => ": "],
  [new RegExp(`\\s*${word("phẩy").source}\\s*`, "giu"), () => ", "],
  [new RegExp(`\\s*${word("gạch ngang").source}\\s*`, "giu"), () => " - "],
  [new RegExp(`\\s*${word("xẹt").source}\\s*`, "giu"), () => " / "],
  [/(?<!\p{L})chấm(?=[ \t]*$)/gimu, () => "."],
];

/** Anchored: the confusion is fixed only within three words of a time, day or number. */
const anchored = (text: string, s: number, e: number) =>
  [...wordsBefore(text, s, 3), ...wordsAfter(text, e, 3)].some((w) =>
    ANCHOR_WORD.test(w),
  );
/** Words before a name: "anh", "chị", "thầy" (folded). */
const PERSON_CUE = /^(?:anh|chi|ban|em|co|chu|bac|thay|ong|ba|me|bo|con)$/;
const WEEKDAY_NUM = /^(?:[2-7]|hai|ba|tu|nam|sau|bay|cn|chu)$/;
const COUNT_AFTER =
  /^(?:cai|chiec|quyen|cuon|con|to|ly|qua|bai|viec|tui|hop|lan)$/;
/** "thử" is "thứ" only before a weekday number or "tuần", not before a count ("thử hai cái") or "lại", "nghiệm". */
const thuDay = (text: string, s: number, e: number) => {
  const [next, after] = wordsAfter(text, e, 2);
  if (next === "tuan") return true;
  return !!next && WEEKDAY_NUM.test(next) && !COUNT_AFTER.test(after ?? "");
};
const ASR_CONFUSIONS: [
  RegExp,
  (m: RegExpExecArray) => string,
  (text: string, s: number, e: number) => boolean,
][] = [
  [/(?<!\p{L})(?:dờ|rờ)(?!\p{L})/giu, () => "giờ", anchored],
  // "phúc" is a name after a person cue or in capitals ("anh Phúc 9 giờ"): only lowercase and cue-free is "phút"
  [
    /(?<!\p{L})phúc(?!\p{L})/giu,
    () => "phút",
    (text, s, e) =>
      text.slice(s, e) === "phúc" &&
      !wordsBefore(text, s, 2).some((w) => PERSON_CUE.test(w)) &&
      anchored(text, s, e),
  ],
  // "tiến" is "tiếng" after a count, never "tiến độ" (progress)
  [
    /(?<!\p{L})tiến(?!\p{L})/giu,
    () => "tiếng",
    (text, s, e) =>
      NUMBER_BEFORE.test(wordsBefore(text, s, 1)[0] ?? "") &&
      wordsAfter(text, e, 1)[0] !== "do",
  ],
  [/(?<!\p{L})thử(?!\p{L})/giu, () => "thứ", thuDay],
  // "tết lại", "tết thử", "tết app": the test the user said, heard as the holiday
  [/(?<!\p{L})tết(?=\s+(?:lại|thử|app)(?!\p{L}))/giu, () => "test", () => true],
  [/(?<!\p{L})tuầng(?!\p{L})/giu, () => "tuần", anchored],
  // "tuần sao", "tuần xau": next week, heard or typed one letter off. Left as it is, the day is lost and the clock lands today.
  [/(?<!\p{L})(tuần|tháng) (?:sao|xau|xao|sâu|sau6)(?!\p{L})/giu, (m) => `${m[1]} sau`, () => true],
  // "tám giời": the hour word, heard with a southern glide
  [/(?<!\p{L})giời(?!\p{L})/giu, () => "giờ", anchored],
  // "8h sán", "tám rưỡi sán": the morning, next to a clock or a day word
  [/(?<!\p{L})sán(?!\p{L})/giu, () => "sáng", anchored],
  // "ngày may" is tomorrow, "ngày may mắn" a lucky day
  [/(?<!\p{L})ngày may(?!\p{L})(?! mắn)/giu, () => "ngày mai", () => true],
  [/(?<!\p{L})mươi lăm(?!\p{L})/giu, () => "mười lăm", anchored],
  [/(?<!\p{L})(mười|mươi) năm(?!\p{L})/giu, (m) => `${m[1]} lăm`, anchored],
  // "từ giờ" (from now) keeps its word; "tử giờ" with its tone is 4 o'clock
  [
    new RegExp(
      `(?<!\\p{L})${plainPhrase("tử")}(?=\\s+${plainPhrase("giờ")}(?!\\p{L}))`,
      "giu",
    ),
    () => "tư",
    (text, s, e) => text.slice(s, e) !== "từ" && anchored(text, s, e),
  ],
  [/(?<!\p{L})(?:rưởi|dưỡi)(?!\p{L})/giu, () => "rưỡi", anchored],
  [/(?<!\p{L})triều(?!\p{L})/giu, () => "chiều", anchored],
  [/(?<!\p{L})xáng(?!\p{L})/giu, () => "sáng", anchored],
  [/(?<!\p{L})mài(?!\p{L})/giu, () => "mai", anchored],
  [/(?<!\p{L})nốp bài(?!\p{L})/giu, () => "nộp bài", anchored],
  [/(?<!\p{L})on lai(?!\p{L})/giu, () => "online", anchored],
  [/(?<!\p{L})đét lai(?:n)?(?!\p{L})/giu, () => "deadline", anchored],
  // "chủ nhựt" is a day name already: no anchor needed
  [word("chủ nhựt"), () => "chủ nhật", () => true],
  // "mốt" is "một" before a unit, never "ngày mốt" or "hai mốt" (21)
  [
    /(?<!\p{L})mốt(?!\p{L})/giu,
    () => "một",
    (text, s, e) =>
      UNIT_NEXT.has(wordsAfter(text, e, 1)[0]) &&
      !NUMBER_BEFORE.test(wordsBefore(text, s, 1)[0] ?? "") &&
      wordsBefore(text, s, 1)[0] !== "ngay",
  ],
  // "tới" is "tối" before a day word: "tới nay" is "tối nay"
  [
    /(?<!\p{L})tới(?!\p{L})/giu,
    () => "tối",
    (text, s, e) => DAY_NEXT.has(wordsAfter(text, e, 1)[0]),
  ],
];

/** A run-on: "rồi", "xong" and the like join two clauses. Each side needs its own time or day to split. */
const RUN_ON = new RegExp(
  `(?<!\\p{L})(?:${plainPhrase("rồi")}|xong|${plainPhrase("sau đó")}|${plainPhrase("với lại")}|${plainPhrase("còn")})(?!\\p{L})`,
  "giu",
);
const CLAUSE_STOP = /[.!?;,]/;
const HAS_TIME =
  /\d|sang|chieu|trua|toi|dem|khuya|mai|nay|hom|thu|chu nhat|gio/;
function runOn(src: Repaired, clockFirst = false): Repaired {
  const text = src.text;
  const ms = [...text.matchAll(RUN_ON)];
  const edits: Edit[] = [];
  ms.forEach((m, k) => {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    // bare part words on both sides: "sáng rồi tối" is one clause with two parts, read as AND
    if (
      /(?<![a-z])(?:sang|trua|chieu|toi|dem|khuya)\s*$/.test(
        fold(text.slice(0, s)).text,
      ) &&
      /^\s*(?:sang|trua|chieu|toi|dem|khuya)(?![a-z])/.test(
        fold(text.slice(e)).text,
      )
    )
      return;
    const prevEnd = k ? (ms[k - 1].index ?? 0) + ms[k - 1][0].length : 0;
    const nextStart = k + 1 < ms.length ? (ms[k + 1].index ?? 0) : text.length;
    let a = s;
    while (a > prevEnd && !CLAUSE_STOP.test(text[a - 1])) a--;
    let b = e;
    while (b < nextStart && !CLAUSE_STOP.test(text[b])) b++;
    if (!HAS_TIME.test(fold(text.slice(a, s)).text)) return;
    if (!HAS_TIME.test(fold(text.slice(e, b)).text)) return;
    // typed text splits only where the next step opens with its clock: "… rồi 8h tối học tiếng Anh"
    if (clockFirst && !/^\s*(?:luc\s+)?\d{1,2}\s*(?:h|g|gio|:\d)/.test(fold(text.slice(e, b)).text)) return;
    let s0 = s;
    while (s0 > 0 && text[s0 - 1] === " ") s0--;
    let e0 = e;
    while (text[e0] === " ") e0++;
    const stopBefore = CLAUSE_STOP.test(text.slice(0, s0).slice(-1));
    edits.push({ start: s0, end: e0, text: stopBefore ? " " : ". " });
  });
  return splice(src, edits);
}

/** Voice transcripts: fillers, spoken punctuation, ASR confusions, "N tiếng M phút" as minutes, and run-on clauses. */
function voiceWords(src: Repaired): Repaired {
  let r = src;
  for (const [re, rep] of VOICE_FILLERS) r = sub(r, re, rep);
  for (const [re, rep] of SPOKEN_PUNCT) r = sub(r, re, rep);
  for (const [re, rep, need] of ASR_CONFUSIONS)
    r = sub(r, re, (m) =>
      need(m.input, m.index ?? 0, (m.index ?? 0) + m[0].length) ? rep(m) : m[0],
    );
  // "1 tiếng 30 phút" is 90 minutes, one duration
  r = sub(
    r,
    new RegExp(
      `(?<![\\p{L}\\d])(\\d{1,2})\\s+${plainPhrase("tiếng")}\\s+(\\d{1,2})\\s+(?:${plainPhrase("phút")}|p)(?![\\p{L}\\d])`,
      "giu",
    ),
    (m) => {
      const min = +m[2];
      return min < 60 ? `${+m[1] * 60 + min} phút` : m[0];
    },
  );
  r = runOn(r);
  r = sub(r, /^ +| +$/gm, () => "");
  return sub(r, / {2,}/g, () => " ");
}

/** Spoken numbers to digits where they read as a clock, date or duration. */
function repairSpoken(src: Repaired): Repaired {
  return splice(src, spokenEdits(src.text));
}

/** Tokens the mention rules read as a weekday or a clock: never decoded. */
const MENTION_TOKEN = /^(t[2-7]|cn|\d{1,2}(h|g|p|pm|am)\d{0,2})$/;
const WEEKDAY_TOKEN = /^(thu[2-7]|t[2-7]|cn)$/;

/** A telex or VNI typed word as Vietnamese, or undefined when the keys do not read as one. */
export function decodeTyped(word: string): string | undefined {
  const m = word.match(
    /^([^a-zA-Z0-9\u00C0-\u1EF9]*)(.*?)([^a-zA-Z0-9\u00C0-\u1EF9]*)$/u,
  );
  if (m && (m[1] || m[3])) {
    const core = m[2];
    if (!core) return undefined;
    const dec = decodeTypedCore(core);
    return dec ? m[1] + dec + m[3] : undefined;
  }
  return decodeTypedCore(word);
}

function decodeTypedCore(word: string): string | undefined {
  const s = word.toLowerCase();
  if (AMBIGUOUS_TYPED.has(s)) return undefined;

  let body = s;
  let tone: string | undefined;

  const isCap =
    /^\p{Lu}/u.test(word) || (/^d9/i.test(word) && /^[Dd]9/.test(word));
  const isAllUpper =
    word.length >= 2 && word === word.toUpperCase() && !/\d/.test(word);

  if (/\d/.test(s)) {
    const tones = s.match(/[1-5]/g) ?? [];
    if (tones.length > 1) return undefined;
    // a VNI tone needs a word of 2 or more letters that is not a weekday ("thu2", "t2")
    if (
      tones.length &&
      ((s.match(/\p{L}/gu) ?? []).length < 2 || WEEKDAY_TOKEN.test(s))
    )
      return undefined;
    tone = tones.length ? TONE_VNI[tones[0] ?? ""] : undefined;
    body = s
      .replace(/[1-5]/g, "")
      .replace(/u7o7/g, "ươ")
      .replace(/7o7/g, "ươ")
      .replace(/a6/g, "â")
      .replace(/e6/g, "ê")
      .replace(/o6/g, "ô")
      .replace(/a8/g, "ă")
      .replace(/o7/g, "ơ")
      .replace(/u7/g, "ư")
      .replace(/d9/g, "đ");
  } else {
    const key = TONE_TELEX[s.slice(-1)];
    // a tone key typed before a closing glide: "nafy" is "này"
    const glide = s.match(/^([a-z]*[aeo])([sfrxj])([iy])$/);
    if (glide && TONE_TELEX[glide[2]]) {
      tone = TONE_TELEX[glide[2]];
      body = glide[1] + glide[3];
    } else if (
      key &&
      (s.length > 2 || (s.length === 2 && /[aeiouy]/.test(s[0])))
    ) {
      tone = key;
      body = s.slice(0, -1);
    }
    body = body
      .replace(/uwow/g, "ươ")
      .replace(/uow/g, "ươ")
      .replace(/uwo/g, "ươ")
      .replace(/dd/g, "đ")
      .replace(/aa/g, "â")
      .replace(/ee/g, "ê")
      .replace(/oo/g, "ô")
      .replace(/aw/g, "ă")
      .replace(/ow/g, "ơ")
      .replace(/uw/g, "ư")
      .replace(/w/g, "ư");
  }
  if (!tone) return body.normalize("NFC");
  // the tone sits on the marked vowel, else on the last vowel before a final, else on the second vowel of the nucleus
  const chars = [...body];
  const isVowel = (c: string) => /[aeiouy]/.test(fold(c).text);
  // the i of gi and the u of qu are part of the onset when a vowel follows
  const onset =
    /^[gq][iu]$/.test(fold(chars.slice(0, 2).join("")).text) &&
    isVowel(chars[2] ?? "");
  const i0 = onset ? 2 : chars.findIndex(isVowel);
  if (i0 < 0) return undefined;
  let j = i0;
  while (j < chars.length && isVowel(chars[j])) j++;
  let target = -1;
  for (let k = i0; k < j; k++)
    if (MARKED.test(chars[k].normalize("NFD"))) target = k;
  if (target < 0) {
    // open nucleus: the first vowel when the nucleus ends in a glide (sáu, này) or open a (mía, địa, múa), else the second (hoá)
    const nuc = fold(chars.slice(i0, j).join("")).text;
    if (j < chars.length || j - i0 < 2) target = j < chars.length ? j - 1 : i0;
    else target = /[iyuoa]$/.test(nuc) && nuc !== "uy" ? i0 : i0 + 1;
  }
  chars[target] = (chars[target].normalize("NFD") + tone).normalize("NFC");
  let res: string | undefined = chars.join("").normalize("NFC");
  if (res) {
    if (isAllUpper) res = res.toUpperCase();
    else if (isCap || /^[Dd]9|^[Dd]{2}/.test(word))
      res = res.charAt(0).toUpperCase() + res.slice(1);
  }
  return res;
}

// 8 typed forms: a word that is not a syllable is decoded when its line is mostly Vietnamese
function decodeTypedForms(src: Repaired): Repaired {
  return eachLine(src, (line, at) => {
    // Fast path: if line has no letters or no typed cues / accents, skip
    if (!line.length || !/[a-zA-Z\d]/u.test(line)) return [];
    const hasTypedCue =
      /aa|ee|oo|dd|d9|aw|ow|uw|[1-5]|[sfrxj]\b|[aeo][sfrxj][iy]\b/i.test(line);
    const accent = /[À-ÿĀ-ſḀ-ỿ]/u.test(line);
    if (!hasTypedCue && !accent) return [];

    const urlRanges = [
      ...line.matchAll(
        /https?:\/\/\S+|[a-z0-9-]+\.(?:vn|com|gle|edu\.vn)\/\S*/gi,
      ),
    ].map((u) => [u.index ?? 0, (u.index ?? 0) + u[0].length]);

    const toks = [...line.matchAll(/[\p{L}\d]+/gu)];
    // a word has two or more letters; a line with a Vietnamese accent is Vietnamese without the vote
    const words = toks.filter((m) => (m[0].match(/\p{L}/gu) ?? []).length >= 2);
    // a word is Vietnamese when it reads as a syllable, typed or not
    const viet = (w: string) => {
      if (isSyllable(w) || /[À-ÿĀ-ſḀ-ỿ]/u.test(w)) return true;
      const d = decodeTyped(w);
      return d !== undefined && isSyllable(d);
    };
    if (
      !words.length ||
      (!accent && words.filter((m) => viet(m[0])).length / words.length < 0.3)
    )
      return [];
    const out: Edit[] = [];
    for (const m of toks) {
      const idx = m.index ?? 0;
      if (urlRanges.some(([s, e]) => idx >= s && idx < e)) continue;
      const d = decodedWord(m[0]);
      if (d) {
        const start = at + idx;
        out.push({ start, end: start + m[0].length, text: d });
      }
    }
    return out;
  });
}

/** English words that a telex or VNI reading would change: "meet" is not "mêt", "Teams" not "Teám". */
const ENGLISH_KEEP = new Set([
  "meet",
  "teams",
  "zoom",
  "google",
  "room",
  "online",
  "library",
  "hall",
  "lab",
  "gym",
  "office",
  "course",
  "submit",
  "deadline",
  "meeting",
  "lecture",
  "due",
  "report",
  "next",
  "this",
  "tomorrow",
  "today",
  "days",
  "weeks",
  "week",
  "day",
  "fri",
  "sat",
  "sun",
  "tues",
  "thurs",
  "thur",
]);

/** A token read as its Vietnamese form: a typed word that decodes to a syllable. Undefined when it stays as typed. */
function decodedWord(w: string): string | undefined {
  if (MENTION_TOKEN.test(w.toLowerCase())) return undefined;
  if (ENGLISH_KEEP.has(w.toLowerCase()) || TELEX_TERMS.has(w.toLowerCase())) return undefined;
  const hasTyped =
    /aa|ee|oo|dd|d9|aw|ow|uw|[1-5]/i.test(w) ||
    (w.length >= 2 &&
      /[sfrxj]$/i.test(w) &&
      !AMBIGUOUS_TYPED.has(w.toLowerCase()));
  if (w.length < 2 || !/\p{L}/u.test(w) || (isSyllable(w) && !hasTyped))
    return undefined;
  const d = decodeTyped(w);
  return d && d !== w && isSyllable(d) ? d : undefined;
}

/** A table cell as the reader reads it after decoding, typo and OCR repair, so its header and shape match clean text. */
export function decodeCell(cell: string): string {
  const words = cell.replace(
    /[\p{L}\d]+/gu,
    (w) => decodedWord(w) ?? fixTypo(w),
  );
  // dates keep their spaced digits for joinDigits, so only clocks and rooms are fixed here
  const src = {
    text: words,
    map: Array.from({ length: words.length }, (_, i) => i),
  };
  return fixOcrClock(src).text;
}

/** The typo fix of a word, capitalized as the word was. */
function fixTypo(w: string): string {
  const fix = typoFix(w);
  if (!fix) return w;
  return /^\p{Lu}/u.test(w) ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix;
}

/** Typed and voice text keeps its characters: only paste and OCR get the layout repairs. */
/** Mail paste: quoted replies ("> ..."), the "Sent from" line and the signature after "-- " go. */
function mailFillers(src: Repaired): Repaired {
  const r = sub(src, /\n-- ?\n[\s\S]*$/g, () => "");
  return sub(r, /^(?:>[^\n]*|sent from\b[^\n]*)(?:\n|$)/gim, () => "");
}

/** Chat paste: the "[08/11 19:02] Tên:" head of a message goes, and so does a "Tên, 19:02" head or a "Hôm qua lúc 19:02" stamp line, and so do the filler words of a chat ("mn", "nha", "ae ơi"). */
function chatFillers(src: Repaired): Repaired {
  let r = sub(
    src,
    /^\[\d{1,2}\/\d{1,2}[^\]\n]*\][^\n:]{0,40}:[ \t]*/gm,
    () => "",
  );
  r = sub(
    r,
    /^\p{Lu}\p{Ll}*(?: \p{L}+){0,3}, \d{1,2}:\d{2}[ \t]*(?=\n|$)\n?/gmu,
    () => "",
  );
  r = sub(
    r,
    /^h\p{Ll}?m (?:qua|nay|kia) lúc \d{1,2}:\d{2}[ \t]*(?=\n|$)\n?/gimu,
    () => "",
  );
  r = sub(r, /^mn +|(?<![\p{L}])ae (?:ơi|oi)(?![\p{L}])[ ,]*/gimu, () => "");
  // a filler at the end of a clause, twice for "nha mn"
  for (let k = 0; k < 2; k++)
    r = sub(
      r,
      /[ ]*(?<![\p{L}])(?:mn|nha|nhé|nhá|nhe|ạ)(?![\p{L}])(?=[ ]*(?:[.,!?;]|\n|$))/giu,
      () => "",
    );
  return r;
}

/** OCR clocks ("07h3O", "l8h", "1Og-11g", "13:0O") and room codes that keep their letter ("B1.2O1" is B1.201). */
function fixOcrClock(src: Repaired): Repaired {
  const r = sub(
    src,
    /(?<![\p{L}\d])([\dOoQIlSZB]{1,2})([hg:])([\dOoQIlSZB]{2})?(?![\p{L}\d])/gu,
    (m) => {
      if (!/\d/.test(m[0])) return m[0];
      const h = digitsOf(m[1]);
      const min = m[3] ? digitsOf(m[3]) : undefined;
      if (+h > 23 || (min !== undefined && +min > 59)) return m[0];
      return `${h}${m[2]}${min ?? ""}`;
    },
  );
  // "08 giờ OO" is 08 giờ 00: the minutes after giờ are glyphs only
  const hour = sub(
    r,
    /((?<![\p{L}])[Gg]iờ )([\dOoQIlSZB]{2})(?![\p{L}\d])/gu,
    (m) =>
      /\d/.test(m[2]) || /^[OoQIlSZB]{2}$/.test(m[2])
        ? `${m[1]}${digitsOf(m[2])}`
        : m[0],
  );
  return sub(
    hour,
    /(?<![\p{L}\d])(\p{Lu})([\dOoQIlSZ]{1,2})\.([\dOoQIlSZ]{1,3})(?![\p{L}\d])/gu,
    (m) => `${m[1]}${digitsOf(m[2])}.${digitsOf(m[3])}`,
  );
}

function digitsOf(s: string): string {
  return s.replace(/[OoQIl|!SZB]/g, (c) => OCR_FIX[c] ?? c);
}

/** Exam tables: a row "1 CT101 Cấu trúc dữ liệu 20/11/2026 …" under "Lịch thi" reads as an exam, so its "STT mã" prefix becomes "Thi". */
function examRows(src: Repaired): Repaired {
  if (!/lich thi/.test(fold(src.text).text)) return src;
  return eachLine(src, (line, at) => {
    const m = line.match(
      /^\d{1,3} \p{Lu}{2,4}\d{2,4} (?=.*\d{1,2}\/\d{1,2}\/\d{2,4})/u,
    );
    if (!m) return [];
    // the room code at the end of the row gets "phòng", so it reads as the place
    const room = line.match(/\s(\p{Lu}\d{1,2}\.\d{2,3})$/u);
    const edits: Edit[] = [{ start: at, end: at + m[0].length, text: "Thi " }];
    if (room?.index !== undefined)
      edits.push({
        start: at + room.index + 1,
        end: at + room.index + 1,
        text: "phòng ",
      });
    return edits;
  });
}

/**
 * Mail, chat and markup noise: signatures, forward and reply headers, read and reaction lines,
 * media tags, markup, stretched letters, emoji inside words, repeated marks. Each rule matches only
 * the noise it removes, so the raw offsets of the rest stay exact. Phrases match with or without tones.
 */
function noise(src: Repaired): Repaired {
  const v = (phrase: string) => plainPhrase(phrase);
  const rx = (source: string, flags: string) => new RegExp(source, flags);
  let r = sub(
    src,
    /<br\s*\/?>|<\/?(?:p|div|li|tr|h[1-6])(?:\s[^<>\n]*)?>/gi,
    () => "\n",
  );
  r = sub(r, /<\/?[a-z][a-z0-9]*(?:\s[^<>\n]*)?\/?>/gi, () => "");
  r = sub(r, /&quot;/g, () => '"');
  r = sub(r, /&#39;|&#x27;|&apos;/g, () => "'");
  r = sub(r, /&lt;/g, () => "<");
  r = sub(r, /&gt;/g, () => ">");
  r = sub(r, /&ndash;|&mdash;/g, () => "-");
  r = sub(r, /&hellip;/g, () => "...");
  // markdown italics ("_gấp_", "*gấp*"); headings and bullets go after the lines are joined
  r = sub(
    r,
    /(^|[^\p{L}\p{N}_])_([^_\n]+?)_(?![\p{L}\p{N}])/gu,
    (m) => m[1] + m[2],
  );
  r = sub(
    r,
    /(^|[^\p{L}\p{N}*])\*([^*\n]+?)\*(?![\p{L}\p{N}*])/gu,
    (m) => m[1] + m[2],
  );
  // mail: a device signature, a forward marker, a reply header ("Vào ..., X đã viết:"), a header line
  r = sub(
    r,
    rx(
      `^[ \\t]*${v("gửi từ")}\\s+(?:iphone|ipad|android|samsung|outlook|gmail|mail)[^\\n]*(?:\\n|$)`,
      "gimu",
    ),
    () => "",
  );
  r = sub(
    r,
    rx(
      `^[ \\t]*-{3,}[ \\t]*(?:forwarded message|${v("tin nhắn được chuyển tiếp")})[ \\t]*-{3,}[ \\t]*(?:\\n|$)`,
      "gimu",
    ),
    () => "",
  );
  r = sub(
    r,
    rx(
      `^[ \\t]*(?:${v("vào")}|on)\\s[^\\n]*(?:${v("đã viết")}|wrote):[ \\t]*(?:\\n|$)`,
      "gimu",
    ),
    () => "",
  );
  // a mail header: two or more header lines in a row, or one holding an address; "Từ: 20/11 Đến: 22/11" is a field
  const hdr = `(?:${v("từ")}|from|cc|${v("tiêu đề")}|subject)[ \\t]*:`;
  r = sub(r, rx(`(?:^[ \\t]*${hdr}[^\\n]*(?:\\n|$)){2,}`, "gimu"), () => "");
  r = sub(
    r,
    rx(
      `^[ \\t]*${hdr}[^\\n]*[\\w.+-]+@[\\w-]+\\.[\\w.-]+[^\\n]*(?:\\n|$)`,
      "gimu",
    ),
    () => "",
  );
  // chat: media tags, read and sent status, reactions
  r = sub(
    r,
    rx(
      `\\[(?:${v("hình ảnh")}|${v("hình")}|sticker|${v("ảnh")}|video|gif|image|photo|${v("tệp đính kèm")})\\]`,
      "giu",
    ),
    () => "",
  );
  const status = `${v("đã xem")}|seen|${v("đã gửi")}|${v("đã nhận")}|${v("đã đọc")}`;
  r = sub(r, rx(`^[ \\t]*(?:${status})[ \\t]*(?=\\n|$)\\n?`, "gimu"), () => "");
  r = sub(
    r,
    rx(
      `^[ \\t]*(?:${v("đã gửi")}|${v("đã xem")}|${v("đã nhận")}|${v("đã đọc")}|seen)[ \\t]+(?=\\S)`,
      "gimu",
    ),
    () => "",
  );
  r = sub(
    r,
    rx(`(?<=\\S)[ \\t]+(?:${status})[ \\t]*(?=\\n|$)`, "gimu"),
    () => "",
  );
  r = sub(
    r,
    rx(
      `^[^\\n]{0,60}(?:${v("đã thích")}|${v("đã bày tỏ cảm xúc")}|${v("đã phản ứng")}|liked a message|loved a message|reacted to|laughed at)[^\\n]{0,60}(?:\\n|$)`,
      "gimu",
    ),
    () => "",
  );
  // stretched letters: "nhaaa" is "nha", "đii" is "đi"; a link keeps its letters ("www.")
  r = sub(r, /(\p{L})\1{2,}/gu, (m) => {
    const token =
      (/\S*$/.exec(m.input.slice(0, m.index ?? 0))?.[0] ?? "") +
      (/^\S*/.exec(m.input.slice(m.index ?? 0))?.[0] ?? "");
    return token.includes("://") ? m[0] : m[1];
  });
  r = sub(r, /\p{L}*[đĐdD]\p{L}*?(?:ii|uu)\p{L}*/gu, (m) =>
    m[0].replace(/(i)i|(u)u/g, "$1$2"),
  );
  // emoji inside a word joins its halves when they form a syllable ("họ📚c"), else it is a gap
  r = sub(r, /(\p{L}+)\p{Extended_Pictographic}+(\p{L}+)/gu, (m) =>
    isSyllable(m[1] + m[2]) ? m[1] + m[2] : `${m[1]} ${m[2]}`,
  );
  // repeated marks: "!!!" and "???" are one mark
  r = sub(r, /([!?])\1+/g, (m) => m[1]);
  return r;
}

export function repair(raw: string, source: ReaderSource): Repaired {
  // The map is per UTF-16 unit, as the regexes index by unit.
  let r: Repaired = {
    text: raw,
    map: Array.from({ length: raw.length }, (_, i) => i),
  };

  r = noise(r);
  // 1 decode
  r = sub(r, /&nbsp;|&#160;/g, () => " ");
  r = sub(r, /&amp;/g, () => "&");
  r = sub(r, /\*\*|__|\\\*|\\_/g, () => "");
  r = sub(r, /\[([^\]]*)\]\(([^)]*)\)/g, (m) => m[1]);
  r = sub(r, /\p{Extended_Pictographic}/gu, () => " ");
  // 2 unicode
  // eslint-disable-next-line no-irregular-whitespace, no-misleading-character-class
  r = sub(r, /[​-‍﻿­︎️�-]/g, () => "");
  r = sub(r, /\p{L}\p{M}+/gu, (m) => m[0].normalize("NFC"));
  r = sub(r, /Ð/g, () => "Đ");
  r = sub(r, /ð/g, () => "đ");
  // 2.5 an English term typed with Telex left on: "ưeb" is web, "mêting" meeting. Typed text only: speech has no keys.
  if (source !== "voice") {
    // only the words that change are edits: an untouched word keeps its own offsets
    const edits: Edit[] = [];
    for (const m of r.text.matchAll(/(?<![\p{L}\d])\p{L}{3,14}(?![\p{L}\d])/gu)) {
      const en = untelex(m[0]);
      if (en === undefined) continue;
      // a capital stays a capital
      const text = /^\p{Lu}/u.test(m[0]) ? en[0].toUpperCase() + en.slice(1) : en;
      edits.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text });
    }
    if (edits.length) r = splice(r, edits);
  }
  // 3 punctuation
  r = sub(r, /[‐-―−]/g, () => "-");
  r = sub(r, /[‘’]/g, () => "'");
  r = sub(r, /[“”]/g, () => '"');
  r = sub(r, /：/g, () => ":");
  r = sub(r, /·/g, () => " ");
  // "5 p.m." and "5 a.m." read as "5 pm", so the dots do not split the clause
  r = sub(
    r,
    /(\d) ?([aApP])\.([mM])\.?(?!\p{L})/gu,
    (m) => `${m[1]} ${m[2]}${m[3]}`,
  );
  // 3b grids: pasted tables become one sentence per row, before tabs and runs of spaces are collapsed
  if (source === "paste" || source === "ocr")
    r = splice(r, gridEdits(r.text, decodeCell));
  // 4 spacing
  // eslint-disable-next-line no-irregular-whitespace
  r = sub(r, /[ \t]/g, () => " ");
  r = sub(r, /\r\n?/g, () => "\n");
  r = sub(r, / {2,}/g, () => " ");
  r = sub(r, / *\n */g, () => "\n");
  r = sub(r, /\n{2,}/g, () => "\n");
  // "tuần sao", "tuần xau": next week one letter off, typed or heard. Left alone the day is lost and the clock lands today.
  r = sub(r, /(?<!\p{L})(tuần|tháng) (?:sao|xau|xao|sâu)(?!\p{L})/giu, (m) => `${m[1]} sau`);
  // a closing "nha" is a particle, not the task: "họp nhóm 8h30 nha". In text typed with no marks at all it is "nhà", and stays.
  if (/\p{M}/u.test(r.text.normalize("NFD")))
    r = sub(r, / +nha(?=[ .!]*$)/giu, () => "");
  if (source === "paste") r = chatFillers(mailFillers(r));
  if (source === "voice") r = voiceWords(r);
  // typed in one go, "đá bóng mai 3h chiều rồi 8h tối học tiếng Anh" is two items too, where the second opens with its clock
  if (source === "typed") r = runOn(r, true);
  // 5 digits, OCR: typed digits join only with a separator, and a comma after a weekday stays
  r = joinDigits(r, source);
  r = fixOcr(r);
  r = fixOcrClock(r);
  // 6 kerning: split letters are a paste or OCR artifact only
  if (source === "paste" || source === "ocr") r = joinKerned(r);
  // 6.5 swap repair on structural keywords
  r = repairSwaps(r);
  // 6.6 teencode on raw tokens
  r = repairTeencode(r);
  // a spaced minute after the hour: "23 giờ 5 9" is 23 giờ 59
  r = sub(
    r,
    /((?<![\p{L}\d])[Gg]iờ) (\d) (\d)(?!\d)/gu,
    (m) => `${m[1]} ${m[2]}${m[3]}`,
  );
  // a spaced unit and minute: "9 h 30" is 9h30; "t 6" is the weekday T6
  r = sub(
    r,
    /(?<![\p{L}\d:/.])(\d{1,2}) ?([hg]) ?(\d{2})(?![\d/:.])(?!\s*(?:buổi|lần|tuần|tháng|năm|tiết|bài|câu|trang|người)(?!\p{L}))/giu,
    (m) => `${m[1]}${m[2].toLowerCase()}${m[3]}`,
  );
  r = sub(
    r,
    /(?<![\p{L}\d])([Tt]) ([2-7])(?![\d/.:])/gu,
    (m) => `${m[1]}${m[2]}`,
  );
  // 7 dewrap: each single newline becomes a space when the line before is unterminated
  const text = r.text;
  // a schedule keeps its line breaks: one cell per line is what its columns are read from
  const keepLines = isScheduleText(text);
  r = sub(r, /\n/g, (m) => (!keepLines && joins(text, m.index) ? " " : "\n"));
  // markup line starts, after the lines are joined: a heading, a bullet, and a list number before a date ("1. 20/11 nộp bài")
  r = sub(r, /^[ \t]*#{1,6}[ \t]+/gm, () => "");
  r = sub(r, /^[ \t]*[-*•][ \t]+(?=\S)/gm, () => "");
  r = sub(r, /^[ \t]*\d{1,2}[.)][ \t]*(?=\d{1,2}[/.-]\d{1,2}\b)/gm, () => "");
  // a timetable row: "Thứ 2 7:30 - 9:30" gets "lúc", so its "7" is a clock, not a weekday list
  r = sub(
    r,
    /((?<!\p{L})(?:thứ [2-7]|chủ nhật|cn)) (?=\d{1,2}[:h]\d{2}\s*-\s*\d)/giu,
    (m) => `${m[1]} lúc `,
  );
  // a timetable row ends with its room: "phòng" before the code, so it reads as the place
  r = sub(
    r,
    /^((?:[Tt]hứ [2-7]|[Cc]hủ nhật|[Cc]n) lúc \d{1,2}[:h]\d{2}\s*-\s*\d{1,2}[:h]\d{2} .*?) (\p{Lu}\d{1,2}\.\d{2,3})$/gmu,
    (m) => `${m[1]} phòng ${m[2]}`,
  );
  // exam rows, after the dewrap, so each row still starts its own line
  r = examRows(r);
  // 8 typed forms
  r = decodeTypedForms(r);
  for (const [re, rep] of ZONE) r = sub(r, re, rep);
  for (const [re, rep] of MIDNIGHT) r = sub(r, re, rep);
  for (const [re, rep] of MONTH_WORDS) r = sub(r, re, rep);
  for (const [re, rep] of ENGLISH_NUMBERS) r = sub(r, re, rep);
  // 9 typos on time and cue words, then spoken numbers, which read the decoded words
  r = repairTypos(r);
  return repairSpoken(r);
}
