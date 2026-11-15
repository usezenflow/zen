// Spoken Vietnamese numbers (0–999) to digits (parseSpokenNumber).
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
const TENS_RE = `(?:(?:(?:hai|ba|bon|nam|sau|bay|tam|chin) muoi|ham|muoi)(?: (?:${UNIT_RE}))?|(?:hai|ba|bon|nam|sau|bay|tam|chin) (?:mot|tu|lam|nham)|${UNIT_RE})`;
/** "ba trăm", "một trăm linh năm", "hai trăm ba mươi": hundreds first, else a number under 100. */
const NUM_RE = `(?:(?:${UNIT_RE}) tram(?: (?:linh|le) (?:${UNIT_RE})| ${TENS_RE})?|${TENS_RE})`;
/** Unit words: the numbers sit next to them ("ba chương" is a count of chapters). Few per text, so the scan starts here. */
const ANCHOR =
  /(?<![a-z])(gio|tieng|phut|ngay|tuan|thang|mung|mong|ruoi|chuong|bai|trang|buoi|lan)(?![a-z])/g;
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

/** Parses a folded spoken number 0–999 ("hai muoi mot", "muoi lam", "ba tram linh nam"), or undefined. */
export function parseSpokenNumber(text: string): number | undefined {
  const w = text.trim().split(/\s+/);
  if (w[1] === "tram" && (UNIT[w[0]] ?? 0) >= 1) {
    const base = UNIT[w[0]] * 100;
    const rest = w.slice(2);
    if (!rest.length) return base;
    if (rest.length === 2 && (rest[0] === "linh" || rest[0] === "le") && Object.hasOwn(UNIT, rest[1])) return base + UNIT[rest[1]];
    const tens = parseSpokenNumber(rest.join(" "));
    return tens !== undefined && tens >= 10 && tens < 100 ? base + tens : undefined;
  }
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
  if (!/gio|tieng|phut|ngay|tuan|thang|mung|mong|ruoi|chuong|bai|trang/.test(t))
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
    // "thứ hai mười giờ" is Monday at ten: "mười" with its mark is ten, only "mươi" makes "hai mươi" twenty
    if (rest[0] === "muoi" && rawOf(s + w0.length + 1, s + w0.length + 5).toLowerCase() === "mười" && parseSpokenNumber(rest.join(" ")) !== undefined)
      return { s: s + w0.length + 1, e: s + m[1].length, word: rest.join(" ") };
    // "tháng mười hai một giờ" is December at one: "một" is one, only "mốt" makes "hai mốt" twenty-one
    if (rest.length === 1 && rest[0] === "mot" && w0 !== "muoi" && w0 !== "ham" && rawOf(s + w0.length + 1, s + m[1].length).toLowerCase() === "một")
      return { s: s + w0.length + 1, e: s + m[1].length, word: "mot" };
    return { s, e: s + m[1].length, word: m[1] };
  };
  const numAfter = (at: number): Word | undefined => {
    const m = RIGHT_NUM.exec(t.slice(at, at + 40));
    if (!m) return undefined;
    const s = at + m[1].length;
    return { s, e: s + m[2].length, word: m[2] };
  };
  /** The next word is "mươi", the tens of another number ("hai | hai mươi"). "mười" with its mark is ten and opens its own number. */
  const tensNext = (at: number) => {
    const m = /^\s+muoi(?![a-z])/.exec(t.slice(at, at + 7));
    return !!m && rawOf(at + m[0].length - 4, at + m[0].length).toLowerCase() === "mươi";
  };
  /** A number word here: not a weekday ("thứ hai"), and not an ambiguous word without its mark. */
  const countable = (n: Word) => {
    if (WEEKDAY_BEFORE.test(t.slice(Math.max(0, n.s - 8), n.s))) return false;
    if (
      AMBIGUOUS.has(n.word) &&
      rawOf(n.s, n.e).normalize("NFD") === rawOf(n.s, n.e)
    )
      return false;
    // "tháng sau làm slide" is next month then a verb, not month 65: "làm" is never "lăm", and "sau lam" with no marks is two words
    const parts = n.word.split(" ");
    if (parts.length === 2 && parts[1] === "lam") {
      const first = rawOf(n.s, n.s + parts[0].length);
      const last = rawOf(n.e - 3, n.e);
      if (last.toLowerCase() === "làm" || (AMBIGUOUS.has(parts[0]) && first.normalize("NFD") === first)) return false;
    }
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
      if (hm) continue;
      // "8 rưỡi", "8h rưỡi", "tám rưỡi": half past with no "giờ"; a count has its unit first ("2 tiếng rưỡi")
      const before = t.slice(from, us);
      const bare = /(?<![a-z\d.,:/])(\d{1,2})(\s*h)?(\s+)$/.exec(before);
      if (bare && +bare[1] <= 23) {
        hits.set(us - bare[3].length, { e: ue, text: bare[2] ? "30" : "h30" });
        continue;
      }
      let left = numBefore(us);
      // "ngày hai mươi tám rưỡi": the 20th at half past eight
      const hw = left?.word.split(" ") ?? [];
      if (left && hw.length > 1 && /(?:ngay|mung|mong|thang)\s+$/.test(t.slice(Math.max(0, left.s - 8), left.s))) {
        const last = hw[hw.length - 1];
        left = { s: left.e - last.length, e: left.e, word: last };
      }
      const h = left && countable(left) ? (parseSpokenNumber(left.word) ?? 99) : 99;
      // "một năm rưỡi" is a year and a half: "năm" is five only before a part of the day
      const year = left?.word === "nam" && !/^\s+(?:sang|trua|chieu|toi|dem|khuya)(?![a-z])/.test(t.slice(ue, ue + 8));
      if (left && h <= 12 && !year) {
        put(left);
        hits.set(left.e, { e: ue, text: "h30" });
      }
      continue;
    }

    if (unit === "gio") {
      // the hour: a number word before "giờ" that is a clock here
      let left = numBefore(us);
      // "ngày hai mươi tám giờ": no day has a 28th hour, so the last word is the hour and the rest the day
      const lw = left?.word.split(" ") ?? [];
      // after a day word the split holds for "lăm" too ("ngày hai mươi lăm giờ" is the 20th at five); alone, "hai mươi lăm giờ" stays 25
      if (
        left &&
        lw.length > 1 &&
        (/(?:ngay|mung|mong|thang)\s+$/.test(t.slice(Math.max(0, left.s - 8), left.s)) ||
          ((parseSpokenNumber(left.word) ?? 0) > 24 && !["lam", "nham"].includes(lw[lw.length - 1])))
      ) {
        const last = lw[lw.length - 1];
        left = { s: left.e - last.length, e: left.e, word: last };
      }
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
      let right = numAfter(ue);
      // "giờ ba mươi ba ngày nữa": thirty minutes, then three days from now
      const mw = right?.word.split(" ") ?? [];
      // "giờ ba mươi hai mươi tháng": thirty minutes, then the 20th
      if (right && mw.length > 2 && (/^\s+(?:ngay|tuan|thang)\s+(?:nua|toi|sau|truoc)(?![a-z])/.test(t.slice(right.e, right.e + 16)) || tensNext(right.e))) {
        const cut = mw[mw.length - 1].length + 1;
        right = { s: right.s, e: right.e - cut, word: mw.slice(0, -1).join(" ") };
      }
      if (
        right &&
        hourOk &&
        countable(right) &&
        // "giờ ba mươi ngày hai mươi": minutes, then a date. "giờ hai mươi tháng mười một": a clock, then the 20th of a month.
        // "giờ hai tuần nữa", "giờ ba ngày nữa": a clock, then a count
        !/^\s*(?:ngay(?![a-z])(?!\s+(?:\d|mung|hai|ba|bon|nam|sau|bay|tam|chin|muoi)(?![a-z])(?!\s+(?:nua|sau|toi|truoc)))|(?:thang|tieng|tuan)(?![a-z]))/.test(t.slice(right.e, right.e + 30))
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

    // "hai tuần nữa" counts weeks from now; "3 buổi một tuần" is a rate and keeps its word
    if (unit === "tuan" && !/^\s+(?:nua|sau|toi|truoc)(?![a-z])/.test(t.slice(ue, ue + 7))) continue;
    // "hai tiếng", "ba mươi phút", "hai ngày", "một tháng": the number before is the count
    if (unit !== "mung" && unit !== "mong") {
      let left = numBefore(us);
      // "giờ ba mươi ba ngày nữa": the minutes are read already, the count is what is left of the number
      const read = left && hits.get(left.s);
      if (left && read && read.e < left.e) left = { s: read.e + 1, e: left.e, word: t.slice(read.e + 1, left.e) };
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
      let right = numAfter(ue);
      // "ngày hai mươi tám giờ": the last word is the hour of the clock after the day
      const rw = right?.word.split(" ") ?? [];
      if (
        right &&
        rw.length > 1 &&
        // or the tens of the hour: "ngày hai mươi hai mươi giờ" is the 20th at twenty
        (/^\s+(?:gio|ruoi)(?![a-z])/.test(t.slice(right.e, right.e + 7)) || tensNext(right.e))
      ) {
        const cut = rw[rw.length - 1].length + 1;
        right = { s: right.s, e: right.e - cut, word: rw.slice(0, -1).join(" ") };
      }
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
