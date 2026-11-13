// Spoken Vietnamese numbers (0–99) to digits (parseSpokenNumber).
// Works on folded text and returns edits on the raw text. Only clock, day, month, duration and minute shapes convert.
import { fold } from "./fold";

export interface SpokenEdit {
  start: number;
  end: number;
  text: string;
}

const UNIT: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  lam: 5,
  nham: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
};
const UNIT_RE = "mot|hai|ba|bon|tu|nam|lam|nham|sau|bay|tam|chin";
const NUM_RE = `(?:(?:(?:hai|ba|bon|nam|sau|bay|tam|chin) muoi|ham|muoi)(?: (?:${UNIT_RE}))?|(?:hai|ba|bon|nam|sau|bay|tam|chin) (?:mot|tu|lam|nham)|${UNIT_RE})`;
/** Unit words: the numbers sit next to them ("ba chương" is a count of chapters). Few per text, so the scan starts here. */
const ANCHOR =
  /(?<![a-z])(gio|tieng|phut|ngay|thang|mung|mong|ruoi|chuong|bai|trang)(?![a-z])/g;
/** A number word ending before the window's end, after spaces. */
const LEFT_NUM = new RegExp(`(?<![a-z\\d])(${NUM_RE})(\\s+)$`);
/** A number word starting the window, after spaces. */
const RIGHT_NUM = new RegExp(`^(\\s+)(${NUM_RE}|ruoi)(?![a-z])`);
/** The hour before "giờ" and the space after it: "chín giờ ", "9 giờ ". */
const HOUR_BEFORE = new RegExp(`(?<![a-z\\d])(\\d{1,2}|${NUM_RE})\\s+gio\\s+$`);
/** After the hour: minutes or a part of the day, so "giờ" is a clock and not a count. */
const HOUR_NEXT = new RegExp(
  `^\\s+gio\\s+(?:${NUM_RE}|ruoi|kem|sang|trua|chieu|toi|dem|khuya)(?![a-z])`,
);
const WEEKDAY_BEFORE = /(?:^|[^a-z])thu\s+$/;
/** Words that are also a common word unaccented ("sau" after, "bay" now): counted only with their mark. */
const AMBIGUOUS = new Set(["sau", "tu", "tam", "bay", "mot", "nam"]);

/** Parses a folded spoken number 0–99 ("hai muoi mot", "muoi lam", "chin"), or undefined. */
export function parseSpokenNumber(text: string): number | undefined {
  const w = text.trim().split(/\s+/);
  let base: number;
  let rest: string[];
  if (w[0] === "muoi") [base, rest] = [10, w.slice(1)];
  else if (w[0] === "ham") [base, rest] = [20, w.slice(1)];
  else if (w[1] === "muoi" && (UNIT[w[0]] ?? 0) >= 2)
    [base, rest] = [UNIT[w[0]] * 10, w.slice(2)];
  else if (
    w.length === 2 &&
    (UNIT[w[0]] ?? 0) >= 2 &&
    ["mot", "tu", "lam", "nham"].includes(w[1])
  )
    return UNIT[w[0]] * 10 + UNIT[w[1]];
  else
    return w.length === 1 && Object.hasOwn(UNIT, w[0]) ? UNIT[w[0]] : undefined;
  if (!rest.length) return base;
  if (rest.length === 1 && Object.hasOwn(UNIT, rest[0]))
    return base + UNIT[rest[0]];
  return undefined;
}

interface Word {
  s: number;
  e: number;
  word: string;
}

/** Spoken numbers that are a clock, duration, day or month, as digit edits on `raw`. */
export function spokenEdits(raw: string): SpokenEdit[] {
  const f = fold(raw);
  const t = f.text;
  if (!/gio|tieng|phut|ngay|thang|mung|mong|ruoi|chuong|bai|trang/.test(t))
    return [];
  const rawOf = (s: number, e: number) =>
    raw.slice(f.map[s], f.map[e - 1] + 1).normalize("NFC");
  const hits = new Map<number, { e: number; text: string }>();
  const hourDone = new Set<number>();

  const numBefore = (at: number): Word | undefined => {
    const from = Math.max(0, at - 40);
    const m = LEFT_NUM.exec(t.slice(from, at));
    if (!m) return undefined;
    const s = from + (m.index ?? 0);
    // "sau mười một giờ" is after eleven, not 61: an unmarked ambiguous first word is the word, the rest is the number
    const [w0, ...rest] = m[1].split(" ");
    if (rest.length && AMBIGUOUS.has(w0) && rawOf(s, s + w0.length).normalize("NFD") === rawOf(s, s + w0.length) && parseSpokenNumber(rest.join(" ")) !== undefined)
      return { s: s + w0.length + 1, e: s + m[1].length, word: rest.join(" ") };
    return { s, e: s + m[1].length, word: m[1] };
  };
  const numAfter = (at: number): Word | undefined => {
    const m = RIGHT_NUM.exec(t.slice(at, at + 40));
    if (!m) return undefined;
    const s = at + m[1].length;
    return { s, e: s + m[2].length, word: m[2] };
  };
  /** A number word here: not a weekday ("thứ hai"), and not an ambiguous word without its mark. */
  const countable = (n: Word) => {
    if (WEEKDAY_BEFORE.test(t.slice(Math.max(0, n.s - 8), n.s))) return false;
    if (
      AMBIGUOUS.has(n.word) &&
      rawOf(n.s, n.e).normalize("NFD") === rawOf(n.s, n.e)
    )
      return false;
    // "làm" (to do) is not "lăm" (five), so "làm bài tập" keeps its verb
    if (
      n.word === "lam" &&
      rawOf(n.s, n.e).normalize("NFC").toLowerCase() === "làm"
    )
      return false;
    // "từ" (from) is not "tư" (four), so "từ ngày 07/12" keeps its word
    if (
      n.word === "tu" &&
      rawOf(n.s, n.e).normalize("NFC").toLowerCase() === "từ"
    )
      return false;
    return parseSpokenNumber(n.word) !== undefined;
  };
  const put = (n: Word) =>
    hits.set(n.s, { e: n.e, text: String(parseSpokenNumber(n.word)) });

  for (const a of t.matchAll(ANCHOR)) {
    const unit = a[1];
    const us = a.index ?? 0;
    const ue = us + unit.length;

    // "chín giờ rưỡi": half past, when the hour is digits or was converted
    if (unit === "ruoi") {
      const from = Math.max(0, us - 40);
      const hm = HOUR_BEFORE.exec(t.slice(from, us));
      if (
        hm &&
        (/\d/.test(hm[1]) ||
          hourDone.has(from + (hm.index ?? 0) + hm[1].length))
      )
        hits.set(us, { e: ue, text: "30" });
      continue;
    }

    if (unit === "gio") {
      // the hour: a number word before "giờ" that is a clock here
      const left = numBefore(us);
      let hourOk = /\d\s+$/.test(t.slice(Math.max(0, us - 6), us));
      if (left && countable(left)) {
        const v = parseSpokenNumber(left.word) ?? 0;
        // "bây giờ" is now: only "bảy giờ" with its hook is seven
        const bayNow =
          left.word === "bay" && !/[ảẩ]/i.test(rawOf(left.s, left.e));
        if (
          !bayNow &&
          (v >= 10 || HOUR_NEXT.test(t.slice(left.e, left.e + 60)))
        ) {
          put(left);
          hourDone.add(left.e);
          hourOk = true;
        }
      }
      // the minutes after it: "giờ ba mươi"
      const right = numAfter(ue);
      if (
        right &&
        hourOk &&
        countable(right) &&
        !/^\s*(ngay|thang|tieng)(?![a-z])/.test(t.slice(right.e, right.e + 12))
      ) {
        const v = parseSpokenNumber(right.word) ?? 0;
        if (v >= 1 && v <= 59) put(right);
      }
      // the minutes before the next hour: "giờ kém mười lăm"
      const kem = /^ kem(?![a-z])/.exec(t.slice(ue, ue + 5));
      const minus = kem && hourOk ? numAfter(ue + kem[0].length) : undefined;
      if (
        minus &&
        countable(minus) &&
        (parseSpokenNumber(minus.word) ?? 0) <= 59
      )
        put(minus);
      continue;
    }

    // "hai tiếng", "ba mươi phút", "hai ngày", "một tháng": the number before is the count
    if (unit !== "mung" && unit !== "mong") {
      const left = numBefore(us);
      // "lam bai" is the verb to do, not five exercises
      const verbLam = left?.word === "lam" && /^(chuong|bai|trang)$/.test(unit);
      if (left && countable(left) && !verbLam) put(left);
    }
    // "ngày mười lăm", "tháng mười một": the number after a day or month word, but never a standalone "mốt" (day after tomorrow)
    if (
      unit === "ngay" ||
      unit === "thang" ||
      unit === "mung" ||
      unit === "mong"
    ) {
      const right = numAfter(ue);
      if (right && countable(right) && right.word !== "mot") put(right);
    }
  }

  return [...hits]
    .sort((x, y) => x[0] - y[0])
    .map(([s, h]) => ({
      start: f.map[s],
      end: f.map[h.e - 1] + 1,
      text: h.text,
    }));
}
