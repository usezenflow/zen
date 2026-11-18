// S0 repair: decodes markup, cleans unicode and punctuation, dewraps PDF lines.
// `map[i]` is the raw index of repaired char i, so every span found later maps back to the input.
import { fold } from "./fold";
import { findMentions } from "./mentions";
import { timeOnly } from "./segment";
import { isSyllable } from "./syllables";
import { isFrequentSyllable } from "./vifreq";
import { spokenEdits } from "./spoken";
import { EN_WORDS } from "./en";
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

// "ngày" wraps onto its date ("ngày\n20/11"); "mỗi ngày", "hàng ngày" end their own line
const CONNECTOR_END = /(?:(?<!(?:mỗi|hàng|hằng|cả|trong|nửa|moi|hang|ca)\s)ngày|môn|tại|ở|lúc|vào|[–\-,])$/i;
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

/** A line that is only a title: 2-3 words, no day, time or place, and no link word at either end. */
function bareTitle(line: string): boolean {
  const f = fold(line).text.trim();
  const n = f.split(/\s+/).length;
  return (
    n >= 2 && n <= 3 && !findMentions(line).length && !/[,;:.!?]$/.test(f) && !LINK_WORD.test(f) && !LINK_END.test(f)
  );
}
/** A line that holds a date or clock mention. */
function timedMention(line: string): boolean {
  return findMentions(line).some((m) => m.kind === "date" || m.kind === "time");
}

/** A part of day that opens or closes a line: "sáng sớm b-tree code", "b-tree code chiều". */
const PART_END_OR_START = /^(?:sang|trua|chieu|toi|dem)\s|\b(?:sang|trua|chieu|toi|dem|som)$/;

/** A line that opens with a title: 2+ words before its first date or clock (or after one that opens it), and no link word. */
function titleHead(line: string): boolean {
  const m = findMentions(line).find((x) => x.kind === "date" || x.kind === "time");
  // the words before the date or clock are a part of day or a lead word ("sáng mai", "lúc 8h tối"): the title comes after it
  const lead = !!m && /^(?:(?:sang|trua|chieu|toi|dem|khuya|som|luc|vao)\s*)*$/.test(fold(line.slice(0, m.start)).text);
  const head = m ? (lead ? line.slice(m.end) : line.slice(0, m.start)) : line;
  const f = fold(head).text.trim();
  return f.split(/\s+/).length >= 2 && !LINK_WORD.test(f) && !LINK_END.test(f) && !/[,;:.!?]$/.test(f);
}
const LINK_END = /(?:^|\s)(?:va|roi|cua|cho|de|voi)$/;
/** A line that stops on a cue waiting for its value: "nộp báo cáo trước", "họp lúc". */
// "mỗi ngày", "mỗi tối" end a complete repeat: they wait for nothing
const hangs = (t: string) => /(?:^|\s)(?:truoc|trc|han|luc|vao|den|toi|tu|sau|het|trong|ngay|thu|sang|chieu|toi|trua|dem)$/.test(fold(t).text.trim().replace(/(?:moi|hang|ca)\s+\S+$/, ""));
const LINK_WORD = /^(?:va|roi|cua|cho|de|voi)\s/;

/** A hard line break inside a sentence: the line before is unterminated and the next is not a marker or heading. */
function joins(text: string, nl: number, typed: boolean): boolean {
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
  // typed: two bare titles on their own lines are two items, not one sentence ("b-tree code\nlsm code")
  if (typed && bareTitle(prev) && bareTitle(next) && !CONNECTOR_END.test(prev)) return false;
  // typed: a title line after a line that ends with its date or clock, or after a bare title, is the next item: "b-tree code mai" / "lsm code"
  if (
    typed &&
    prev.length < 40 &&
    next.length < 40 &&
    !CONNECTOR_END.test(prev) &&
    !prev.includes(":") &&
    titleHead(next) &&
    (timedMention(prev) || bareTitle(prev) || PART_END_OR_START.test(fold(prev).text))
  )
    return false;
  // typed: a line break between two lines that each carry their own date or clock is the next item, however long
  // Telex or VNI typed with the IME off is read decoded ("ngayf kia" is "ngày kia"): the join runs before the decode
  const decoded = (t: string) => t.replace(/[\p{L}\d]+/gu, (w) => (/\p{L}/u.test(w) ? (decodeTyped(w) ?? w) : w));
  const dated = (t: string) => [t, decoded(t)].some((x) => findMentions(x).some((m) => m.kind === "date" || m.kind === "time" || m.kind === "recur"));
  // the item the break falls between: the last comma piece of the line before, the first of the next ("…, Viết báo cáo\nđồ án trước 20/11" is one wrapped item)
  const tail = prev.split(/[,;]|[.!?](?=\s)/).pop() ?? prev, head = next.split(/[,;]|[.!?](?=\s)/)[0];
  if (typed && !CONNECTOR_END.test(prev) && !LINK_WORD.test(fold(next).text) && dated(tail) && dated(head) && !timeOnly(decoded(tail)) && !timeOnly(decoded(head)) && !hangs(decoded(prev))) return false;
  if (CONNECTOR_END.test(prev)) return true;
  if (SENTENCE_END.test(prev)) return false;
  // two short task lines that each carry their own date or clock are a list: "b-tree code mai" / "lsm code mai", "mai học toán" / "thứ 6 đi khám"
  const timed = (s: string) => findMentions(s).some((m) => m.kind === "date" || m.kind === "time");
  if (
    prev.length < 40 &&
    next.length < 40 &&
    !prev.includes(":") &&
    !next.includes(":") &&
    timed(prev) &&
    timed(next) &&
    !LINK_WORD.test(fold(next).text)
  )
    return false;
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
/** Time words a doubled vowel may hide: "saau", "tuaan", "thaang", "maai", "naay". */
const ELONGATED_CUES = new Set(["sau", "tuan", "thang", "mai", "nay", "ngay", "chieu", "sang", "trua"]);
/** Folded text with a clock, a date or a clean time word in it. */
const TIMELIKE = /\d\s*(?:h|g|gio|:\d\d)(?![a-z])|\d{1,2}\/\d{1,2}|(?<![a-z])(?:tuan|thang|ngay|mai|nay|hom|thu [2-7]|t[2-7]|cn|chu nhat|chieu|sang|trua|sau|truoc|mot|kia)(?![a-z])/;

/** A typed word repaired to a time or cue word, or a word with a doubled letter collapsed. Undefined when it reads as a syllable. */
function typoFix(w: string): string | undefined {
  if (w.length < 2 || isSyllable(w)) return undefined;
  // English words with a doubled letter are not typos: "app" is not "ap"
  if (TYPO_KEEP.has(fold(w).text)) return undefined;
  // a doubled d is a typed mark ("dd" is đ); a doubled a, e or o is one too, unless the decode is no common word and the single letter is ("naay" is "nay", not "nây")
  const dbl = /(.)\1/iu.exec(w)?.[1].toLowerCase();
  if (dbl && dbl !== "d" && !EN_WORDS.has(fold(w).text) && !TELEX_TERMS.has(fold(w).text)) {
    let collapsed = "";
    for (let i = 0; i < w.length; i++)
      if (i === 0 || w[i].toLowerCase() !== w[i - 1].toLowerCase())
        collapsed += w[i];
    if (
      TYPO.has(fold(collapsed).text) ||
      (isSyllable(collapsed) && (!"aeo".includes(dbl) || !isFrequentSyllable(decodeTyped(w) ?? "")))
    )
      return collapsed;
  }
  // a short word with no vowel is an acronym ("lsm", "sql"), not "làm" with a slipped key
  if (w.length <= 3 && !/[aeiouy]/i.test(fold(w).text)) return undefined;
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

/** Time and repeat words a stray space splits: "t ối", "th ứ", "m ỗi", "hàng tu ần". */
const SPLIT_CUES = ["sáng", "trưa", "chiều", "tối", "đêm", "mỗi", "hàng", "hằng", "tuần", "tháng", "thứ", "ngày", "giờ", "mai"];
const SPLIT_RE = new RegExp(
  `(?<!\\p{L})(?:${SPLIT_CUES.flatMap((w) => [...Array(w.length - 1).keys()].map((i) => `${w.slice(0, i + 1)} ${w.slice(i + 1)}`)).join("|")})(?!\\p{L})`,
  "giu",
);
/** Rejoins a split cue word when a fragment is no syllable of its own, or after "hàng"/"mỗi" ("hàng tu ần"). */
function joinSplitCues(src: Repaired): Repaired {
  return sub(src, SPLIT_RE, (m) => {
    const [x, y] = m[0].split(" ");
    const before = fold(src.text.slice(Math.max(0, m.index - 6), m.index)).text;
    return !isSyllable(x) || !isSyllable(y) || /(?:hang|hang|moi)\s+$/.test(before) ? x + y : m[0];
  });
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

/** Tone-blind, case-blind source for a phrase; defined after SAME_PLAIN is filled. */
const NUM_WORDS = ["một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín", "mười"];
const numOf = (w: string) => (/^\d/.test(w) ? +w : NUM_WORDS.findIndex((x) => fold(x).text === fold(w).text.toLowerCase()) + 1);
const unitOf = (w: string) => ({ ngay: "ngày", tuan: "tuần", thang: "tháng", nam: "năm" })[fold(w).text.toLowerCase()] ?? w;
const EN_DAY: Record<string, string> = { monday: "thứ 2", tuesday: "thứ 3", wednesday: "thứ 4", thursday: "thứ 5", friday: "thứ 6", saturday: "thứ 7", sunday: "chủ nhật" };
let REPEATS: [RegExp, (m: RegExpExecArray) => string][] | undefined;
/** Every way of saying a repeat, rewritten to the one form the mentions and rules read: "tối nào cũng" is "mỗi tối", "2 tuần một lần" is "mỗi 2 tuần". */
function repeats(): [RegExp, (m: RegExpExecArray) => string][] {
  if (REPEATS) return REPEATS;
  const P = plainPhrase;
  const L = "(?<![\\p{L}\\d])";
  const R = "(?![\\p{L}\\d])";
  const NUM = `(\\d{1,2}|${NUM_WORDS.map(P).join("|")})`;
  const ONE = `(?:1|${P("một")})`;
  const UNIT = `(${["ngày", "tuần", "tháng", "năm"].map(P).join("|")})`;
  const TIMES = `(?:${P("buổi")}|${P("lần")})`;
  const WD = `(?:${P("thứ")}\\s*(?:[2-7]|${["hai", "ba", "tư", "năm", "sáu", "bảy"].map(P).join("|")})|${P("chủ nhật")}|cn|t[2-7])`;
  const PART = `(?:${["sáng", "trưa", "chiều", "tối", "đêm", "khuya"].map(P).join("|")})`;
  const HEAD = `(${WD}|${["ngày thường", "cuối tuần", "ngày", "hôm", "tuần", "tháng", "năm"].map(P).join("|")}|${PART}(?:\\s*(?:,|${P("và")}|${P("với")}|${P("hoặc")})?\\s*${PART})*)`;
  const EN = `(${Object.keys(EN_DAY).join("|")})s?`;
  const re = (s: string) => new RegExp(s, "giu");
  REPEATS = [
    // "mỗi sáng cuối tuần", "các buổi sáng cuối tuần", "sáng cuối tuần nào cũng", "sáng cuối tuần hàng tuần": weekend mornings, not every morning
    [
      re(`${L}(?:(?:${P("mỗi")}|${P("hàng")}|${P("hằng")}|${P("các")})\\s+(?:${P("buổi")}\\s+)?(${PART})\\s*,?\\s+${P("cuối tuần")}|(?:${P("vào")}\\s+)?(?:${P("buổi")}\\s+)?(${PART})\\s+${P("cuối tuần")}\\s+(?:${P("nào")}\\s+${P("cũng")}|(?:${P("hàng")}|${P("mỗi")}|${P("hằng")})\\s+${P("tuần")}))${R}`),
      (m) => `mỗi T7 CN ${(m[1] ?? m[2]).toLowerCase()}`,
    ],
    [re(`${L}${P("cuối tuần")}\\s+(?:${P("hàng")}|${P("mỗi")}|${P("hằng")})\\s+${P("tuần")}${R}`), () => "mỗi T7 CN"],
    // "thứ bảy chủ nhật", "thứ bảy và chủ nhật": both days, as "thứ 7 và chủ nhật" (the word "bảy" in a list reads only Saturday)
    [re(`${L}${P("thứ")}\\s*(?:7|${P("bảy")})\\s*(?:,|${P("và")})?\\s*(?:${P("chủ nhật")}|cn)${R}`), () => "thứ 7 và chủ nhật"],
    // "tối nào cũng", "ngày nào mình cũng", "thứ 3, thứ 5 nào cũng"; "thứ 2 nào cũng được" is any Monday, not every one
    [
      re(`${L}(?:${P("buổi")}\\s+)?${HEAD}((?:\\s*(?:,|${P("và")})\\s*${WD})*)\\s+${P("nào")}(?:\\s+\\p{L}+){0,2}?\\s+${P("cũng")}${R}(?!\\s+${P("được")}${R})`),
      (m) => {
        const head = fold(m[1]).text.toLowerCase();
        if (head === "ngay thuong") return "ngày thường";
        if (head === "cuoi tuan") return "mỗi T7 CN";
        // "sáng tối nào cũng", "sáng, chiều nào cũng": every part of the list, "mỗi sáng và tối"
        // "sáng hoặc tối nào cũng": one repeat in either part, kept as "hoặc"
        const or = new RegExp(P("hoặc"), "iu").test(m[1]);
        const parts = m[1].toLowerCase().split(new RegExp(`\\s*(?:,|${P("và")}|${P("với")}|${P("hoặc")})\\s*|\\s+`, "u")).filter(Boolean);
        const list = new RegExp(`^${PART}$`, "iu").test(parts[0] ?? "") && parts.length > 1 ? parts.join(or ? " hoặc " : " và ") : m[1].toLowerCase();
        return `mỗi ${head === "hom" ? "ngày" : list}${m[2]}`;
      },
    ],
    // "mỗi cuối tuần": Saturday and Sunday, said as days so a part after it ("cuối tuần … tối") is no "tuần tới", and with no "và" to split a clause on
    [re(`${L}(?:${P("mỗi")}|${P("hàng")}|${P("hằng")})\\s+${P("cuối tuần")}${R}(?:\\s+${P("buổi")}(?=\\s+${PART}${R}))?`), () => "mỗi T7 CN"],
    // "mỗi sáng, chiều", "ngày thường sáng, chiều", "mỗi ngày buổi sáng, buổi tối": the parts of one repeat, not two clauses
    [
      re(`${L}((?:(?:${P("mỗi")}|${P("hàng")}|${P("hằng")})(?:\\s+${P("ngày")})?|${P("ngày thường")}|${WD}(?:\\s*(?:,|${P("và")})\\s*(?:${P("thứ")}\\s*)?[2-7])*)\\s+(?:${P("buổi")}\\s+)?${PART}(?:\\s*,\\s*(?:${P("buổi")}\\s+)?${PART})+)${R}`),
      (m) => m[1].replace(/\s*,\s*/g, " và "),
    ],
    // "mỗi buổi sáng": "mỗi sáng"
    [re(`${L}(?:${P("mỗi")}|${P("hàng")}|${P("hằng")})\\s+${P("buổi")}\\s+(${PART})${R}`), (m) => `mỗi ${m[1]}`],
    // once every n: "tuần 1 lần", "một tháng một lần", "2 tuần 1 lần", "hai ngày một lần", "mỗi tuần một lần"
    [
      re(`${L}(?:(?:${P("mỗi")}|${ONE})\\s+)?(?:${NUM}\\s+)?${UNIT}\\s+${ONE}\\s+${P("lần")}${R}`),
      (m) => {
        const n = m[1] ? numOf(m[1]) : 1;
        // "2 tuần 1 lần" is the form the weekly rule reads with a count after it ("2 tuần 1 lần 10 buổi")
        const u = unitOf(m[2]);
        return n < 2 ? `mỗi ${u}` : u === "tuần" ? `${n} tuần 1 lần` : `mỗi ${n} ${u}`;
      },
    ],
    // n a week: "tuần 3 buổi", "mỗi tuần 2 lần", "ba buổi một tuần", "2 lần/tuần"
    [
      // never after a count of weeks: "2 tuần 1 lần 10 buổi" is every other week
      re(`${L}(?<!${NUM.replace("(", "(?:")}\\s+)(?:(?:${P("mỗi")}|${ONE})\\s+)?${P("tuần")}\\s+${NUM}\\s+${TIMES}${R}`),
      (m) => `${numOf(m[1])} buổi một tuần`,
    ],
    [
      re(`${L}${NUM}\\s+${TIMES}\\s*(?:\\/|${P("một")}|${P("mỗi")}|${P("trên")}|1)\\s*${P("tuần")}${R}`),
      (m) => `${numOf(m[1])} buổi một tuần`,
    ],
    // weekdays: "các ngày trong tuần", "mỗi ngày trừ cuối tuần", "từ thứ hai tới thứ sáu" (a span "đến thứ 6 tuần sau" is dates, not a repeat)
    [re(`${L}(?:${P("các")}|${P("mỗi")}|${P("hàng")}|${P("hằng")})\\s+${P("ngày trong tuần")}${R}`), () => "ngày thường"],
    [re(`${L}(?:${P("mỗi")}|${P("hàng")}|${P("hằng")})\\s+${P("ngày trừ cuối tuần")}${R}`), () => "ngày thường"],
    [
      re(`${L}(${P("từ")}\\s+)?${P("thứ")}\\s*(?:2|${P("hai")})\\s*(?:${P("đến")}|${P("tới")}|-)\\s*${P("thứ")}\\s*(?:6|${P("sáu")})${R}(?!\\s+${P("tuần")}${R})`),
      (m) => `${m[1] ? "từ " : ""}thứ 2 đến thứ 6`,
    ],
    // "đến hết tháng 12": the month's last day ("31/11" reads as 30/11), where "hết tháng" alone is this month's
    [re(`${L}(?:(${P("đến")}|${P("cho đến")})\\s+)?${P("hết")}\\s+${P("tháng")}\\s+(1[0-2]|0?[1-9])${R}(?![/.]\\d)`), (m) => (m[1] ? `${m[1]} 31/${+m[2]}` : `hết 31/${+m[2]}`)],
    // "trước tháng 12", "trc đầu tháng 12": by the last day of the month before ("31/11" reads as 30/11); January's is the year before's December
    [
      re(`${L}(${P("trước")}|trc)\\s+(?:${P("đầu")}\\s+)?${P("tháng")}\\s+(1[0-2]|0?[1-9])${R}(?![/.]\\d)(?:\\s+${P("năm")}\\s+(\\d{4})${R})?`),
      (m) => `trước 31/${+m[2] === 1 ? 12 : +m[2] - 1}${m[3] ? `/${+m[2] === 1 ? +m[3] - 1 : m[3]}` : ""}`,
    ],
    // "đến tháng 12" is until it begins, as "trước"; "sau tháng 12" is from the day after its last
    [
      re(`${L}(${P("đến")}|${P("tới")}|${P("cho đến")})\\s+${P("tháng")}\\s+(1[0-2]|0?[1-9])${R}(?![/.]\\d)(?!\\s+${P("năm")})`),
      (m) => `trước 31/${+m[2] === 1 ? 12 : +m[2] - 1}`,
    ],
    [re(`${L}${P("sau")}\\s+${P("tháng")}\\s+(1[0-2]|0?[1-9])${R}(?![/.]\\d)(?!\\s+${P("năm")})`), (m) => `sau 31/${+m[1]}`],
    // "hết tuần sau nữa": the end of the week after next, as "tuần sau nữa" alone
    [re(`${L}${P("hết")}\\s+(${P("tuần")}\\s+(?:${P("sau")}|${P("tới")})\\s+${P("nữa")})${R}`), (m) => m[1]],
    // "tới 31/12", "tới ngày 31/12": until, never the evening "tối"
    [/(?<!\p{L})([Tt])ới(?=\s+(?:ngày\s+)?\d{1,2}[/.]\d{1,2}(?![\d:]))/gu, (m) => `${m[1] === "T" ? "Đ" : "đ"}ến`],
    // English
    [/(?<![a-z])every\s+week\s?days?(?![a-z])/gi, () => "ngày thường"],
    [/(?<![a-z])every\s+week\s?ends?(?![a-z])/gi, () => "mỗi cuối tuần"],
    [/(?<![a-z])(?:every\s?day|daily)(?![a-z])/gi, () => "mỗi ngày"],
    [new RegExp(`(?<![a-z])except\\s+${EN}(?:\\s*(?:,|and|&)\\s*${EN})?(?![a-z])`, "gi"), (m) => `trừ ${EN_DAY[m[1].toLowerCase()]}${m[2] ? ` và ${EN_DAY[m[2].toLowerCase()]}` : ""}`],
  ];
  return REPEATS;
}
function repairRepeats(src: Repaired): Repaired {
  let r = src;
  for (const [re, rep] of repeats()) r = sub(r, re, rep);
  return r;
}
/** Raw spans a repeat rewrite covers: a reworded repeat is the reader's own wording, not a typo to show. */
export function repeatSpans(raw: string): [number, number][] {
  return repeats().flatMap(([re]) => [...raw.matchAll(re)].map((m): [number, number] => [m.index, m.index + m[0].length]));
}

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
  // "à thì họp nhóm…": an opening "à" or "ừ" before "thì" is a filler, "thì" with it
  [/(?:^|(?<=[.,;!?\n]\s*))(?:à|ừ|ờ|ừm|thì)\s+thì\s+/gimu, () => ""],
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
/** A vowel letter, any tone or mark: "a" matches a, à, ạ, ă, â ... (the folded letter is the key). */
const vowel = (base: string) =>
  `[${base}${[..."àáạảãăằắặẳẵâầấậẩẫèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ"].filter((c) => fold(c).text === base).join("")}]`;
const [VA, VE, VI, VO, VU] = ["a", "e", "i", "o", "u"].map(vowel);
const ANY_VOWEL = `[aeiouy${[..."àáạảãăằắặẳẵâầấậẩẫèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ"].join("")}]`;
/** Between the syllables of a spoken word: a space, a hyphen, or none. */
const SEP = "[\\s-]*";
/** Cues that the word around a spoken form is content (video, a post), dev work, or plain work. Folded text. */
const CONTENT_CUE = /(?<![a-z])(?:quay|video|clip|reel|tiktok|youtube|fb|facebook|fanpage|page|post|dang|content|noi dung|livestream|acc|nick|tai khoan|story|banner|edit|kenh)(?![a-z])/;
const DEV_CUE = /(?<![a-z])(?:code|lap trinh|bug|fix|github|deploy|commit|merge|app|tinh nang|debug|server|api|git|ham|function|test)(?![a-z])/;
const WORK_CUE = /(?<![a-z])(?:lam|viet|hop|chay|review|deadline|nop|team|nhom|marketing|sprint|du an|bao cao|slide|project|ke hoach|thiet ke|design|task|jira)(?![a-z])/;
const cued = (re: RegExp) => (text: string) => re.test(fold(text).text);
/** Spoken English work terms: tone-free and spacing-free patterns, each with its display form. Before the VN rules, which rewrite "rờ". */
const SPOKEN_EN: [RegExp, (m: RegExpExecArray) => string, (text: string, s: number, e: number) => boolean][] = [
  [new RegExp(`(?<!\\p{L})m${VA}[cn]?${SEP}[kc]${VE}t${SEP}t${VI}nh?(?!\\p{L})`, "giu"), () => "marketing", () => true],
  [new RegExp(`(?<!\\p{L})r${VI}${SEP}v${VI}${VU}(?!\\p{L})`, "giu"), () => "review", () => true],
  [new RegExp(`(?<!\\p{L})ph${VE}(?:ch|c|t)(?!\\p{L})`, "giu"), () => "fake", (t) => cued(CONTENT_CUE)(t)],
  // "riêu", "riu", "rin": reel after a content cue, real when it is set against "fake"
  [
    new RegExp(`(?<!\\p{L})r${VI}(?:${VE}${VU}|${VU}|n)(?!\\p{L})`, "giu"),
    (m) => (/fake|phech|phec/.test(fold(m.input).text) ? "real" : "reel"),
    (t) => cued(CONTENT_CUE)(t) || /fake|phech|phec/.test(fold(t).text),
  ],
  // "sót", "sọt": short, after a content cue; "sọt rác" is the bin
  [
    new RegExp(`(?<!\\p{L})s${VO}${VO}?[tc](?!\\p{L})`, "giu"),
    () => "short",
    (t, s, e) => cued(CONTENT_CUE)(t) && !/^\s*rac(?!\p{L})/u.test(fold(t.slice(e)).text),
  ],
  [new RegExp(`(?<!\\p{L})[sx]${ANY_VOWEL}${SEP}p${ANY_VOWEL}?${SEP}r?${ANY_VOWEL}?n(?:h|g)?(?!\\p{L})`, "giu"), () => "sprint", cued(WORK_CUE)],
  [new RegExp(`(?<!\\p{L})[dđ]${VI}${SEP}(?:gi|d|z|r|g)${VA}${VI}(?:n)?(?!\\p{L})`, "giu"), () => "design", cued(WORK_CUE)],
  [new RegExp(`(?<!\\p{L})p${VO}[tsc](?!\\p{L})`, "giu"), () => "post", cued(CONTENT_CUE)],
  [new RegExp(`(?<!\\p{L})(?:${VA}[td]|${VE}t|ad)${SEP}m${VI}n(?!\\p{L})`, "giu"), () => "admin", () => true],
  [new RegExp(`(?<!\\p{L})h${VA}[tc]h?${SEP}t${VA}[ck](?!\\p{L})`, "giu"), () => "hashtag", () => true],
  [new RegExp(`(?<!\\p{L})${VO}${SEP}k${VE}${SEP}(?:${VA}|r${VO})(?!\\p{L}|\\d)`, "giu"), () => "OKR", () => true],
  [new RegExp(`(?<!\\p{L})p${VI}${SEP}${VA}(?!\\p{L}|\\d)`, "giu"), () => "PR", () => true],
  [new RegExp(`(?<!\\p{L})g${VO}${SEP}t${VE}${SEP}${VE}m(?!\\p{L})`, "giu"), () => "GTM", () => true],
  [new RegExp(`(?<!\\p{L})m(?:${VE}|${VI})${SEP}[dđ]${VI}${SEP}${VA}(?!\\p{L}|\\d)`, "giu"), () => "media", () => true],
  // "cốt" is code with a dev cue; "cốt truyện" is the plot
  [
    new RegExp(`(?<!\\p{L})c${VO}t(?!\\p{L})`, "giu"),
    () => "code",
    (t, s, e) => cued(DEV_CUE)(t) && !/^\s*truyen(?!\p{L})/u.test(fold(t.slice(e)).text),
  ],
  [new RegExp(`(?<!\\p{L})ph${VI}t${SEP}b${VA}ch?(?!\\p{L})`, "giu"), () => "feedback", () => true],
  // "den", "gien", "denflow": Zen as a recognizer writes it ("đen", "đến" keep their "đ"); "gien" stays the gene beside a biology word
  [
    /(?<!\p{L})(?:d|gi)[eê]n([\s-]*flow)?(?!\p{L})/giu,
    (m) => (m[1] ? "zenflow" : "zen"),
    (t, s) => !/^gi/i.test(t.slice(s)) || (!/^gien\s+(?:troi|lan)(?![a-z])/.test(fold(t.slice(s)).text) && !/(?<![a-z])(?:di truyen|dot bien|bien doi|ban do|sinh hoc|adn|dna|te bao|nhiem sac)(?![a-z])/.test(fold(t).text)),
  ],
];

const ASR_CONFUSIONS: [
  RegExp,
  (m: RegExpExecArray) => string,
  (text: string, s: number, e: number) => boolean,
][] = [
  ...SPOKEN_EN,
  [/(?<!\p{L})(?:dờ|rờ)(?!\p{L})/giu, () => "giờ", anchored],
  // after a number, a misspelt "giờ" is still the hour: "2 giiờ", "9 gờ"
  [/(?<=(?<![\d.,/:])\d{1,2}\s*)(?:gi+ờ+|gờ+|gi+ơ+)(?!\p{L})/giu, () => "giờ", () => true],
  // toneless, "9 do sang" is only "9 giờ sáng": a number before, a part of the day or a day after
  [/(?<=(?<![\d.,/:])\d{1,2}\s+)(?:do|ro)(?=\s+(?:s[aá]ng|chi[eêề]u|tr[uư]a|t[oốô]i|[dđ][eê]m|mai|nay)(?!\p{L}))/giu, () => "giờ", () => true],
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
  // "hai mươi lăm" is 25: only a "mươi lăm" with no tens word before it is a misheard "mười lăm"
  [/(?<!(?:hai|ba|bốn|tư|năm|sáu|bảy|tám|chín)\s+)(?<!\p{L})mươi lăm(?!\p{L})/giu, () => "mười lăm", anchored],
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

/** The decode when it is a common syllable; else the one that is common once a circumflex, horn or breve is added
 * ("nopj" is "nọp", and a typist who forgot the second o means "nộp"). Undefined when neither is. */
function frequentDecode(dec: string | undefined): string | undefined {
  if (!dec) return undefined;
  if (isFrequentSyllable(dec)) return dec;
  const chars = [...dec.normalize("NFD")];
  const hit = new Set<string>();
  chars.forEach((c, i) => {
    const l = c.toLowerCase();
    const marks = l === "a" ? ["\u0302", "\u0306"] : l === "e" ? ["\u0302"] : l === "o" ? ["\u0302", "\u031b"] : l === "u" ? ["\u031b"] : [];
    for (const mark of marks) {
      const v = [...chars.slice(0, i + 1), mark, ...chars.slice(i + 1)].join("").normalize("NFC");
      if (isFrequentSyllable(v)) hit.add(v);
    }
  });
  if (hit.size === 1) return [...hit][0];
  // a stop final (c, ch, p, t) takes only nặng or sắc: "noop" is "nôp" with its tone key left out, so nặng, else sắc
  if (/(?:c|ch|p|t)$/i.test(fold(dec).text) && !/[\u0300\u0301\u0303\u0309\u0323]/.test(dec.normalize("NFD")))
    for (const tone of ["\u0323", "\u0301"]) {
      const j = chars.findLastIndex((c) => /[aeiouyAEIOUY]/.test(c));
      const k = /[\u0302\u0306\u031b]/.test(chars[j + 1] ?? "") ? j + 1 : j;
      const v = [...chars.slice(0, k + 1), tone, ...chars.slice(k + 1)].join("").normalize("NFC");
      if (isFrequentSyllable(v)) return v;
    }
  return undefined;
}

/** A VNI digit is no English letter, so it needs no frequency check ("Nghe1" is Nghé); a Telex word does. */
const guarded = (w: string) => (/\d/.test(w) ? decodeTypedCore(w) : frequentDecode(decodeTypedCore(w)));

/** A telex or VNI typed word as Vietnamese, or undefined when the keys do not read as one. */
export function decodeTyped(word: string): string | undefined {
  const m = word.match(
    /^([^a-zA-Z0-9\u00C0-\u1EF9]*)(.*?)([^a-zA-Z0-9\u00C0-\u1EF9]*)$/u,
  );
  if (m && (m[1] || m[3])) {
    const core = m[2];
    if (!core) return undefined;
    const dec = guarded(core);
    return dec ? m[1] + dec + m[3] : undefined;
  }
  return guarded(word);
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
    // a tone key typed before a closing glide or final consonant: "nafy" is "này", "hojp" "họp", "lafm" "làm"
    const glide = s.match(/^([a-z]*[aeo])([sfrxj])([iy])$/) ?? s.match(/^([a-z]*[aeiouy]w?)([sfrxj])(ch|ng|nh|[cmnpt])$/);
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
      if (joined(line, idx, idx + m[0].length)) continue;
      const d = decodedWord(m[0], accent);
      if (d) {
        const start = at + idx;
        out.push({ start, end: start + m[0].length, text: d });
      }
    }
    return out;
  });
}

/** A token inside a compound ("b-tree", "v1.2", "a/b", "snake_case") is never decoded. */
function joined(line: string, start: number, end: number): boolean {
  return /[-./_]/.test(line[start - 1] ?? "") || /[-./_]/.test(line[end] ?? "");
}

/**
 * A token read as its Vietnamese form: a typed word that decodes to a syllable. Undefined when it stays as typed.
 * On a line that already has Vietnamese marks (`accent`) only a 3+ letter token with a clear Telex or VNI cue decodes.
 */
function decodedWord(w: string, accent: boolean): string | undefined {
  const lw = w.toLowerCase();
  if (MENTION_TOKEN.test(lw) || EN_WORDS.has(lw) || TELEX_TERMS.has(lw)) return undefined;
  const hasTyped =
    /aa|ee|oo|dd|d9|aw|ow|uw|[1-5]/i.test(w) ||
    (w.length >= 2 &&
      /[sfrxj]$/i.test(w) &&
      !AMBIGUOUS_TYPED.has(lw));
  if (accent) {
    const letters = (w.match(/\p{L}/gu) ?? []).length;
    const vni = /\d/.test(w);
    const cue = hasTyped || vni || /[aeo][sfrxj][iy]$/i.test(w);
    if ((letters < 3 && !vni) || !cue) return undefined;
  }
  if (w.length < 2 || !/\p{L}/u.test(w) || (isSyllable(w) && !hasTyped))
    return undefined;
  const d = decodeTyped(w);
  return d && d !== w && isSyllable(d) ? d : undefined;
}

/** A table cell as the reader reads it after decoding, typo and OCR repair, so its header and shape match clean text. */
export function decodeCell(cell: string): string {
  const accent = /[À-ÿĀ-ſḀ-ỿ]/u.test(cell);
  const words = cell.replace(/[\p{L}\d]+/gu, (w, off: number) =>
    (!joined(cell, off, off + w.length) && decodedWord(w, accent)) || fixTypo(w),
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
  // "nhé1", "nha2": a sentence particle with a stray digit stuck to it, at the end of a clause
  r = sub(r, /(?<![\p{L}\d])(nhé|nhá|nha|nhe|nhen|nghen|ạ)\d{1,2}(?![\p{L}\d:/.,-])/giu, (m) => m[1]);
  // 2.5 an English term typed with Telex left on: "ưeb" is web, "mêting" meeting. Typed text only: speech has no keys.
  if (source !== "voice") {
    // only the words that change are edits: an untouched word keeps its own offsets
    const edits: Edit[] = [];
    for (const m of r.text.matchAll(/(?<![\p{L}\d])\p{L}{3,14}(?![\p{L}\d])/gu)) {
      const at = m.index ?? 0;
      if (EN_WORDS.has(m[0].toLowerCase()) || joined(r.text, at, at + m[0].length)) continue;
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
  // "3 buổi, mỗi buổi 2 tiếng": the length of one sitting, said as a plain length ("mỗi" is no title word, the comma no new item)
  r = sub(r, /\s*,?\s*(?<!\p{L})(?:mỗi|moi)\s+(?:buổi|buoi|lần|lan)\s+(?=(?:\d|một|hai|ba|bốn|năm|nửa|mot|nua)[^,.;\n]*?(?:tiếng|tieng|giờ|gio|phút|phut|p|h)(?!\p{L}))/giu, () => " ");
  // "2 giờ đồng hồ": a length, never the clock 2:00
  r = sub(r, /(?<![\p{L}\d])(\d{1,2}|một|hai|ba|bốn|năm|sáu)\s+(?:giờ|tiếng)\s+đồng\s+hồ(?!\p{L})/giu, (m) => `${m[1]} tiếng`);
  // ", giúp mình", ", nhé": a closing courtesy after a comma is no item of its own
  r = sub(r, /\s*,\s*(?=(?:giúp|giùm|dùm|hộ|giup|gium|dum)(?:\s+(?:mình|tôi|tui|em|anh|chị|với|minh|toi|voi))?(?:\s+(?:nhé|nha|nhá|với|nhe|voi))?[ .!]*(?:\n|$)|(?:nhé|nha|nhá|nhe|ạ|nhen|nghen)[ .!]*(?:\n|$))/giu, () => " ");
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
  r = joinSplitCues(r);
  // a spaced minute after the hour: "23 giờ 5 9" is 23 giờ 59
  r = sub(
    r,
    /((?<![\p{L}\d])[Gg]iờ) (\d) (\d)(?!\d)/gu,
    (m) => `${m[1]} ${m[2]}${m[3]}`,
  );
  // "21h tới nửa đêm": the range word, not the evening (which would split it into two parts)
  r = sub(r, /(?<=(?:\d\s*(?:h|g|giờ)\s*\d{0,2}|:\d\d)\s*)tới(?=\s+nửa đêm)/gu, () => "đến");
  // a tilde between two clocks is a range dash: "22h ~ 1h sáng"
  r = sub(r, /(?<=\d[hHgG]?|\d[hHgG]\d\d)\s*~\s*(?=\d|nửa đêm)/g, () => " - ");
  // a spaced unit and minute: "9 h 30" is 9h30; "t 6" is the weekday T6
  r = sub(
    r,
    /(?<![\p{L}\d:/.])(\d{1,2}) ?([hg]) ?(\d{2})(?![\d/:.])(?!\s*(?:buổi|lần|tuần|tháng|năm|tiết|bài|câu|trang|người|âm|am lịch|am lich)(?!\p{L}))/giu,
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
  r = sub(r, /\n/g, (m) => (!keepLines && joins(text, m.index, source === "typed") ? " " : "\n"));
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
  // a doubled vowel in a time word of a time-like line is a slip of the word, not Telex for a rarer one: "tuần saau 9h" is "sau"
  // (not "sâu"), "thaang sau" is "tháng". A line with no other time word or clock keeps its Telex ("đào hố saau").
  r = sub(r, /\p{L}*(?:aa|ee|oo)\p{L}*/giu, (m) => {
    const c = m[0].replace(/(\p{L})\1+/giu, "$1");
    if (!ELONGATED_CUES.has(fold(c).text)) return m[0];
    const at = m.index ?? 0;
    const from = m.input.lastIndexOf("\n", at - 1) + 1;
    const to = m.input.indexOf("\n", at);
    const line = m.input.slice(from, at) + " " + m.input.slice(at + m[0].length, to < 0 ? undefined : to);
    return TIMELIKE.test(fold(line).text) ? c : m[0];
  });
  // 8 typed forms
  r = decodeTypedForms(r);
  // after the VNI digits are tones again: a word glued to a clock: "nhóm9h", "lớp2 giờ", "mai8h" (a room code has no clock unit after its digits)
  // never a one-letter weekday: "t6 h…" stays T6
  r = sub(r, /(?<=\p{L}\p{Ll})(\d{1,2})(?=(?:h|g|:\d{2})(?![\p{L}\d])|\s*(?:giờ|gio)(?!\p{L}))/gu, (m) => ` ${m[1]}`);
  for (const [re, rep] of ZONE) r = sub(r, re, rep);
  for (const [re, rep] of MIDNIGHT) r = sub(r, re, rep);
  for (const [re, rep] of MONTH_WORDS) r = sub(r, re, rep);
  for (const [re, rep] of ENGLISH_NUMBERS) r = sub(r, re, rep);
  // 9 typos on time and cue words, then spoken numbers, which read the decoded words
  // "30 pht": a length unit with its vowel dropped (no word of 3 letters with no vowel is read otherwise)
  r = sub(r, /(?<=\d\s?)pht(?![\p{L}\d])/giu, () => "phút");
  r = repairTypos(r);
  return repairRepeats(repairSpoken(r));
}
