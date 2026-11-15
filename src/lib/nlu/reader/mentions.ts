import { MAX_TASK_MINUTES } from "../shared";
// S2 mentions: dates, times, durations, places and courses, plus masks that win every overlap.
// Matches run on folded text (lowercase, no diacritics) and map back to raw offsets.
import { lengthMin } from "./calendar";
import { fold } from "./fold";
import { HOLIDAY_RE } from "./holidays";

// A bare "tết" or "noel" is a holiday only beside a holiday word: "nghỉ tết", "trước tết", "tết năm nay".
const HOLIDAY_BEFORE =
  /(?:^|\s)(?:dip|ngay|nghi|ve que|an|don|mung|truoc|sau|het|den|tu|trc|nam nay|nam sau|nguyen dan|am lich|duong lich)\s*$/;
const HOLIDAY_AFTER =
  /^\s*(?:nam nay|nam sau|nghi|ngay|dip|ve que|an|don|mung|duong lich|am lich|nguyen dan)\b/;

/** A holiday phrase on folded text. A bare tết needs a holiday word beside it and its own tone: "tét", "tẹt" are not it. */
function holidayRead(
  m: RegExpMatchArray,
  raw: string,
  f: { text: string; map: number[] },
) {
  const fs = m.index ?? 0;
  const fe = fs + m[0].length;
  if (m[1] === "tet") {
    const word = raw
      .slice(f.map[fs], f.map[fe - 1] + 1)
      .normalize("NFC")
      .toLowerCase();
    if (
      word !== "tet" &&
      word !== "tết" &&
      /[\u0300-\u036f]/.test(word.normalize("NFD"))
    )
      return null;
    // "họp lớp tết": a marked tết ending the clause is the holiday too ("tết tóc", to braid, has its object after)
    if (
      !HOLIDAY_BEFORE.test(f.text.slice(0, fs)) &&
      !HOLIDAY_AFTER.test(f.text.slice(fe)) &&
      !(word === "tết" && /^\s*(?:[,.;!?]|$)/.test(f.text.slice(fe)))
    )
      return null;
  }
  return { k: "holiday" as const, phrase: m[1] };
}

/** "mai" is tomorrow in plain spelling only: a tone mark makes "mãi" or "mái", a capital mid-sentence or a person cue ("chị Mai") a name. */
function tomorrowRead(
  m: RegExpMatchArray,
  raw: string,
  f: { text: string; map: number[] },
) {
  const fs = m.index ?? 0;
  const fe = fs + m[0].length;
  const word = raw.slice(f.map[fe - 3], f.map[fe - 1] + 1);
  if (/[\u0300-\u036f]/.test(word.normalize("NFD"))) return null;
  // a clock after it ("gặp chị Mai lúc 9h") makes the day word, whatever the case
  if (/^\s*(?:luc|vao|\d)/.test(f.text.slice(fe)))
    return { k: "rel" as const, off: 1 };
  if (/^\p{Lu}/u.test(word) && fs > 0) return null;
  // "học tiếng Anh mai": the language, then tomorrow
  if (
    /(?:^|\s)(?:anh|chi|ban|em|co|be|ong|ba|bac|thay)\s*$/.test(
      f.text.slice(0, fs),
    ) &&
    !/(?:^|\s)tieng anh\s*$/.test(f.text.slice(0, fs))
  )
    return null;
  return { k: "rel" as const, off: 1 };
}
import type { ReaderMention } from "../shared";

export type Val =
  | {
      k: "date";
      form: "full" | "long" | "short";
      d: number;
      m: number;
      y?: number;
    }
  | { k: "dow"; dow: number; wk?: number; bare?: boolean; more?: number[] }
  | { k: "week"; off: number }
  | {
      k: "recur";
      freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "HOURLY";
      interval?: number;
    }
  /** A day of the month with no month: the next such day ("ngày 20", "mùng 5"). */
  | { k: "dom"; d: number }
  | { k: "rel"; off: number }
  | { k: "weekend" }
  | { k: "weekend_next" }
  | { k: "month_end" }
  | { k: "month_end_next" }
  /** A span of days named by key: "dau_tuan_sau", "cuoi_thang", ... (see `spanOf` in assemble). */
  | { k: "span"; key: string }
  /** A count from now in minutes: "2 tiếng nữa". */
  | { k: "after"; min: number }
  /** `after`: the start of work "sau giờ trưa", so the clock is a notBefore. */
  | {
      k: "time";
      h: number;
      mi: number;
      part?: string;
      after?: boolean;
      /** "24:30" is 00:30 of the day after its date. */
      next?: boolean;
    }
  | { k: "dur"; min: number; days?: boolean }
  /** Tết, the lunar new year of the reference year or the next. */
  | { k: "holiday"; phrase: string }
  | { k: "place"; text: string }
  | { k: "course"; text: string }
  | { k: "period"; p1: number; p2: number }
  | { k: "mask" };

export interface Found {
  kind:
    | "date"
    | "time"
    | "dur"
    | "place"
    | "course"
    | "period"
    | "recur"
    | "mask";
  /** Raw offsets, end exclusive. */
  start: number;
  end: number;
  v: Val;
}

const WORD_NUM: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
  muoi: 10,
  "muoi mot": 11,
  "muoi hai": 12,
};
const WEEK_WORD: Record<string, number> = {
  hai: 1,
  ba: 2,
  tu: 3,
  nam: 4,
  sau: 5,
  bay: 6,
};
/** Week words after a weekday or alone: "tuần này" 0, "tuần sau" 1, "tuần sau nữa" 2. */
const WEEK_OFF: Record<string, number> = {
  nay: 0,
  sau: 1,
  toi: 1,
  truoc: -1,
  "sau nua": 2,
};
const WEEK_WORDS = "nay|sau\\s+nua|sau|toi|truoc";
/** The second day of a range: "từ d1 đến d2/m(/y)", "d1-d2/m(/y)"; its month and year are groups 2 and 3. */
const RANGE_TAIL =
  /^\s*(?:-|den|toi|ket thuc)\s*:?\s*(?:het\s*)?(?:ngay\s*:?\s*)?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4,5}|\d{2}|0))?(?!\d)/;

/**
 * A day and month as written. A "/" date clamps an invalid day or month to the nearest valid one
 * ("0" is 1, a day past 31 is 31, a month past 12 is 12); other separators must already be valid.
 */
function dayMonthOf(
  d: number,
  mo: number,
  slash: boolean,
): [number, number] | null {
  if (slash)
    return [Math.min(Math.max(d, 1), 31), Math.min(Math.max(mo, 1), 12)];
  return d < 1 || d > 31 || mo < 1 || mo > 12 ? null : [d, mo];
}

/** A written year as a year: a 5-digit year is its first four digits. Null outside ref's year -1 to +5, and for year 0. */
export function writtenYear(y: number, refY: number): number | undefined {
  const n = y >= 10000 ? Math.floor(y / 10) : y;
  return n >= refY - 1 && n <= refY + 5 ? n : undefined;
}

/** A day and month, with a year when written. Null when the date does not exist on the calendar. */
function dayMonth(
  d: string,
  mo: string,
  y?: string,
  slash = false,
): Val | null {
  const dm = dayMonthOf(+d, +mo, slash);
  if (!dm) return null;
  const [dd, mm] = dm;
  if (y)
    return {
      k: "date",
      form: "full",
      d: dd,
      m: mm,
      y: y.length === 2 ? 2000 + +y : +y,
    };
  return { k: "date", form: "short", d: dd, m: mm };
}

/** English weekday names to the dow index used by Val (0 is Sunday). */
const EN_DAY: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};
/** English month names, by their first three letters. */
const EN_MONTH: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const EN_MONTH_RE =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
/** Abbreviated weekdays that are also Vietnamese words ("mon" is môn, "thu" is thu) read only after next, on, by or this. */
const EN_DAY_ABBR_ONLY = new Set(["mon", "thu", "thur", "thurs", "tues"]);
/** An English month and day, with a year when written. "May" only capitalised: "may" is a Vietnamese word. */
function englishDate(
  m: RegExpExecArray,
  raw: string,
  f: { text: string; map: number[] },
  month: string,
  day: string,
  year: string | undefined,
): Val | null {
  const word = raw.slice(
    f.map[m.index ?? 0],
    f.map[(m.index ?? 0) + month.length - 1] + 1,
  );
  if (month.toLowerCase() === "may" && !/^May$/.test(word)) return null;
  const mo = EN_MONTH[month.slice(0, 3).toLowerCase()];
  const d = +day;
  if (!mo || d < 1 || d > 31) return null;
  return year
    ? {
        k: "date",
        form: "full",
        d,
        m: mo,
        y: year.length === 2 ? 2000 + +year : +year,
      }
    : { k: "date", form: "short", d, m: mo };
}

const PART = /(?<![a-z])(sang|trua|chieu|toi|dem|khuya)(?![a-z])/g;
/** Words that make a dotted pair after them a clock: "lúc 9.20". "trước", "sau" and "đến" also head dates. */
const CLOCK_CUE_BEFORE = /(?<![a-z])(?:luc|hen|bat dau|khoang|tam|dung)\s+$/;
/** The clock a work starts at after a part of the day: "sau giờ trưa" is 13:00. */
const AFTER_HOUR: Record<string, number> = {
  sang: 12,
  trua: 13,
  chieu: 17,
  toi: 20,
  dem: 23,
};
/** Words that end a place or course phrase. */
const STOP_WORD =
  "(?:luc|thu\\s+(?:hai|ba|tu|bon|nam|sau|bay|[2-7])|ngay|tu|vao|den|trong|ghi chu|noi dung|thoi gian|lich|hoc|buoi|truoc|va|hom|mai|sang|chieu|toi|trua|dem|nop|tai|tiet)";

/** Day phrases that end a place or course name the way a stop word does: "quán Highlands tuần sau", "phòng A1 20/11". Folded. */
const DAY_STOP =
  "\\s(?:tuan\\s+(?:nay|sau|toi|truoc)|chu\\s+nhat|cn|thang\\s+(?:nay|sau|toi)|mot|\\d{1,2}(?:[/.-]\\d|\\s+(?:thang|tuan|ngay)(?![a-z])))(?![a-z])";

type Rule = [
  Found["kind"],
  RegExp,
  (
    m: RegExpExecArray,
    raw: string,
    f: { text: string; map: number[] },
  ) => Val | null,
];

const RULES: Rule[] = [
  // masks: never a date, time or place
  [
    "mask",
    /https?:\/\/\S+|[a-z0-9-]+\.(?:vn|com|gle|edu\.vn)\/\S*/g,
    () => ({ k: "mask" }),
  ],
  ["mask", /(?<!\d)0\d{8,10}(?!\d)/g, () => ({ k: "mask" })],
  [
    "mask",
    /\b\d[\d.,]*\s*(?:usd|dong|vnd|trieu|tr|k)(?![a-z])/g,
    () => ({ k: "mask" }),
  ],
  // a grade "8/10" only with a grade word or a decimal: a bare "1/10" is a date
  [
    "mask",
    /\b(?:diem|duoc|dat)\s*:?\s*\d+(?:[.,]\d+)?\/10(?![\d/])|(?<![\d/.-])\b\d+[.,]\d+\/10(?![\d/])|\b\d+(?:[.,]\d+)? diem(?![a-z])/g,
    () => ({ k: "mask" }),
  ],
  [
    "mask",
    /\b\d{1,5}\/[a-z][a-z0-9/.-]*(?:\s+ngay\s+\d{1,2}\/\d{1,2}\/\d{2,4})?/g,
    () => ({ k: "mask" }),
  ],
  [
    "mask",
    /\b(?:tinh den|cap nhat|tu khi ban hanh)(?:\s+(?:ngay|thoi diem))?\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g,
    () => ({ k: "mask" }),
  ],
  // "bài 3", "lab 1-2"; never the day of a date ("bài 20/11")
  [
    "mask",
    /\b(?:buoi thu|lab|bai|buoi|tuan|lan|cau|muc|trang|slide|doi|nhom)\s*\d+(?![-/]\d{1,2}[-/]\d)(?:\s*-\s*\d+)?(?!\s+(?:lan|tuan|buoi)(?![a-z]))(?!\s+(?:ngay|tuan)\s+(?:nua|toi|sau)(?![a-z])|\s*thang\s*\d)(?![\d/.]*\d)(?![/.]\d)(?!\s*(?:[hg](?![a-z])|gio|tieng|phut|p(?![a-z])|a\.?m(?![a-z])|p\.?m(?![a-z])|:\d))(?!-\s*\d{1,2}\s*(?:h|g|gio)(?![a-z]))/g,
    (m) => {
      // "họp nhóm 20-11", "cà phê với Lan 5-12": a day and month, not groups 20 to 11. A count runs upward ("bài 1-3"),
      // and people, teams and groups are not counted in runs
      const r = /^(buoi thu|lab|bai|buoi|tuan|lan|cau|muc|trang|slide|doi|nhom)\s*(\d+)\s*-\s*(\d+)$/.exec(m[0]);
      if (r && (/^(?:lan|doi|nhom)$/.test(r[1]) || +r[3] <= +r[2]) && +r[2] <= 31 && +r[3] <= 12) return null;
      return { k: "mask" };
    },
  ],
  ["mask", /\b\d+\s*[/]\s*\d+\s*tiet/g, () => ({ k: "mask" })],

  // campus places before any clock or date can claim their numbers: "tòa B", "nhà A24.1", "tầng 3", "phòng 302 nhà A"
  [
    "place",
    /(?<![a-z\d])(?:phong\s+\d{1,4}(?:\.\d{1,3})?\s+)?(?:(?:tang|lau)\s+\d{1,2}\s+)?(?:(?:toa|nha)(?:\s+nha)?\s+[a-z]\d{0,3}(?:\.\d{1,3})?|(?:tang|lau)\s+\d{1,2})(?![a-z\d/:]|\.\d|\s*(?:h|g|gio)(?![a-z]))/g,
    () => ({ k: "place", text: "" }),
  ],
  // a street address with a ward or district tail: "123 Nguyễn Văn Linh, Q.7", "số 5 Lê Lợi, P. Bến Nghé"
  [
    "place",
    /(?<![a-z\d/.])(?:so\s+)?\d{1,4}[a-z]?\s+(?:(?!(?:mai|nay|hom|sang|chieu|toi|trua|dem|khuya|thu|chu|luc|hen|truoc|sau|tuan|thang|ngay|nop|hoc|hop|mua|lam)(?![a-z]))[a-z]+\s+){0,4}[a-z]+\s*,\s*(?:q|p|quan|phuong|tp)\.?\s*[a-z\d]+(?:\s+(?!(?:mai|nay|hom|sang|chieu|toi|trua|dem|khuya|thu|chu|luc|hen|truoc|sau|tuan|thang|ngay|nop|hoc|hop|mua|lam)(?![a-z]))[a-z]+){0,2}(?![a-z\d/])/g,
    () => ({ k: "place", text: "" }),
  ],
  [
    "place",
    /(?<![a-z])(?:thu vien|can tin|ktx|ky tuc xa|san van dong|phong lab|phong thi nghiem)(?![a-z])/g,
    () => ({ k: "place", text: "" }),
  ],
  // a bare "cơ sở" is the campus; "môn cơ sở" is a course, and "cơ sở vật chất" is not a place
  [
    "place",
    /(?<!\b(?:mon|hoc phan|khoi)\s+(?:[a-z]+\s+){0,2})(?<![a-z])co so(?![a-z])(?!\s*\d)(?!\s+(?:vat chat|du lieu|nghien cuu|ly thuyet|kien thuc))/g,
    () => ({ k: "place", text: "" }),
  ],

  // periods: Tiết 1-3, Tiết: 7-9, Tiết 1
  [
    "period",
    /(?<![a-z])(?:tiet)\s*:?\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?(?![a-z\d])/g,
    (m) => ({ k: "period", p1: +m[1], p2: m[2] ? +m[2] : +m[1] }),
  ],

  // recurrence: "hàng ngày", "mỗi tối" (daily); "mỗi thứ 6" (weekly, the weekday is the date). Only the word "mỗi" is taken before a part of day or weekday.
  // "mỗi 2 ngày", "cách ngày": every N days, every other day by default
  [
    "recur",
    /(?<![a-z])(?:moi\s+(\d{1,2})\s+ngay|cach\s+ngay)(?![a-z])/g,
    (m) => ({ k: "recur", freq: "DAILY", interval: m[1] ? +m[1] : 2 }),
  ],
  // "mỗi đầu tháng": every month on the first, the rule is built with the piece
  [
    "recur",
    /(?<![a-z])(?:moi|hang)\s+dau\s+thang(?![a-z])/g,
    () => ({ k: "recur", freq: "MONTHLY" }),
  ],
  // "mỗi tháng", "hàng tháng": every month, on the day of the month named beside it
  [
    "recur",
    /(?<![a-z])(?:moi|hang)\s+thang(?![a-z])/g,
    () => ({ k: "recur", freq: "MONTHLY" }),
  ],
  // "hàng tuần": every week, on the weekday named beside it
  [
    "recur",
    /(?<![a-z])hang\s+tuan(?![a-z])/g,
    () => ({ k: "recur", freq: "WEEKLY" }),
  ],
  [
    "recur",
    /(?<![a-z])(?:hang|moi)\s+ngay(?![a-z])/g,
    () => ({ k: "recur", freq: "DAILY" }),
  ],
  [
    "recur",
    // "mỗi tối", "hằng đêm", "mỗi tối thứ 2"; "dọn hàng tối nay", "bán hàng tối mai" name one evening
    /(?<![a-z])(?:moi|hang)(?=\s+(?:sang|trua|chieu|toi|dem|khuya)(?![a-z])(?!\s+(?:nay|mai|mot|qua)(?![a-z])))/g,
    () => ({ k: "recur", freq: "DAILY" }),
  ],
  [
    "recur",
    /(?<![a-z])moi(?=\s+(?:thu\s?(?:hai|ba|tu|nam|sau|bay|[2-7])|t[2-7]|cn|chu\s+nhat)(?![a-z\d]))/g,
    () => ({ k: "recur", freq: "WEEKLY" }),
  ],

  // complex recurrence (rules.ts reads the rule itself): weekdays, weekends, every n weeks, n a week, yearly, nth weekday, hourly
  [
    "recur",
    /(?<![a-z])(?:(?:moi|hang)\s+ngay\s+trong\s+tuan|ngay\s+thuong|weekdays?|thu\s*2\s+den\s+thu\s*6|t2\s*-\s*t6|t2\s+den\s+t6)(?![a-z])/g,
    () => ({ k: "recur", freq: "WEEKLY" }),
  ],
  [
    "recur",
    /(?<![a-z])(?:(?:moi|hang)\s+cuoi\s+tuan|weekends?)(?![a-z])/g,
    () => ({ k: "recur", freq: "WEEKLY" }),
  ],
  [
    "recur",
    /(?<![a-z\d])(?:cach\s+tuan|every\s+other\s+week|\d{1,2}\s+tuan\s+1\s+lan|moi\s+\d{1,2}\s+tuan|moi\s+tuan|\d\s+(?:buoi|lan)\s*(?:\/|mot|moi)?\s*tuan|\d\s+(?:buoi|lan)\s+trong\s+\d{1,2}\s+tuan|1\s+tuan\s+\d\s+buoi)(?![a-z])/g,
    () => ({ k: "recur", freq: "WEEKLY" }),
  ],
  [
    "recur",
    /(?<![a-z])every\s+(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:\s*(?:,|and|&)\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)*(?![a-z])/g,
    () => ({ k: "recur", freq: "WEEKLY" }),
  ],
  [
    "recur",
    /(?<![a-z])(?:(?:moi|hang)\s+nam|every\s+year)(?![a-z])/g,
    () => ({ k: "recur", freq: "YEARLY" }),
  ],
  [
    "recur",
    /(?<![a-z])(?:moi|hang)\s+cuoi\s+thang(?![a-z])/g,
    () => ({ k: "recur", freq: "MONTHLY" }),
  ],
  [
    "recur",
    /(?<![a-z])(?:thu\s*[2-7]|t[2-7]|cn|chu\s+nhat)\s+(?:dau\s+tien|cuoi\s+cung)\s+(?:moi\s+|hang\s+|cua\s+)?thang(?![a-z])/g,
    () => ({ k: "recur", freq: "MONTHLY" }),
  ],
  [
    "recur",
    /(?<![a-z\d])(?:moi|every)\s+\d{1,2}\s+(?:tieng|hours?)(?![a-z])/g,
    () => ({ k: "recur", freq: "HOURLY" }),
  ],
  [
    "recur",
    /(?<![a-z])(?:every\s+day|daily)(?![a-z])/g,
    () => ({ k: "recur", freq: "DAILY" }),
  ],

  // whole and half days, and the length of a part-of-day window: "cả ngày" 480, "nửa ngày" 240
  ["dur", /(?<![a-z])ca\s+ngay(?![a-z])/g, () => ({ k: "dur", min: 480 })],
  ["dur", /(?<![a-z])nua\s+ngay(?![a-z])/g, () => ({ k: "dur", min: 240 })],
  // "4 hours", "1.5 hours": English length
  [
    "dur",
    /(?<![a-z\d])(\d{1,2}(?:[.,]\d)?)\s+hours?(?![a-z])/g,
    (m) => ({ k: "dur", min: Math.round(+m[1].replace(",", ".") * 60) }),
  ],
  [
    "dur",
    /(?<![a-z])ca\s+buoi\s+(?:sang|trua|chieu|toi|dem)(?![a-z])/g,
    () => ({ k: "dur", min: 180 }),
  ],
  // "1h30p", "2 tiếng 15 phút": hours and minutes of one length. A clock cue before or a part of day after
  // makes it a clock ("lúc 1h30p", "3h15p chiều")
  [
    "dur",
    /(?<![\d.,:a-z])(?<!(?:luc|vao|tu|den|toi|truoc|sau|han|hen|bat dau|khoang)\s+)(\d{1,2})\s*(?:tieng|h)\s*(\d{1,2})\s*(?:phut|p)(?![a-z])(?!\s*(?:sang|trua|chieu|toi|dem|khuya)(?![a-z]))/g,
    (m) => ({ k: "dur", min: Math.min(MAX_TASK_MINUTES, lengthMin(+m[1] * 60 + +m[2])) }),
  ],
  // "3 ngày" is a span of days, read as a busy block only with a travel or rest word (see assemble)
  [
    "dur",
    /(?<![\d.,:a-z])(?<!cach\s)(?<!thu\s)(?<!gio\s)(\d{1,2})\s+ngay(?![a-z])(?!\s+(?:nua|toi|sau|tuoi))/g,
    (m) => ({ k: "dur", min: +m[1] * 1440, days: true }),
  ],

  // holidays name their date through the shared calendar (see holidays.ts)
  ["date", HOLIDAY_RE, holidayRead],

  // English time words
  ["date", /(?<![a-z])today(?![a-z])/g, () => ({ k: "rel", off: 0 })],
  [
    "date",
    /(?<![a-z])(?:tomorrow|tmrw?)(?![a-z])/g,
    () => ({ k: "rel", off: 1 }),
  ],
  ["date", /(?<![a-z])tonight(?![a-z])/g, () => ({ k: "rel", off: 0 })],
  ["date", /(?<![a-z])next\s+week(?![a-z])/g, () => ({ k: "week", off: 1 })],
  [
    "date",
    /(?<![a-z])(?:(next|on|by|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues|thurs|thur|sun|mon|tue|wed|thu|fri|sat)(?![a-z])/g,
    (m, raw, f) => {
      if (!m[1] && EN_DAY_ABBR_ONLY.has(m[2])) return null;
      // an English day word is a Vietnamese word when it carries a tone mark: "sát" is not sat
      const fe = (m.index ?? 0) + m[0].length;
      if (
        /[\u0300-\u036f]/.test(
          raw
            .slice(f.map[fe - m[2].length], f.map[fe - 1] + 1)
            .normalize("NFD"),
        )
      )
        return null;
      return {
        k: "dow",
        dow: EN_DAY[m[2]],
        wk: m[1] === "next" ? 1 : undefined,
      };
    },
  ],

  // dates
  // ISO: 2026-11-20 or 2026/11/20; the clock after "T" or a space is read by the time rule
  [
    "date",
    /(?<![\d/.:a-z-])(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?![\d/:-])/g,
    (m) => {
      const d = +m[3];
      const mo = +m[2];
      if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
      return { k: "date", form: "full", d, m: mo, y: +m[1] };
    },
  ],
  // English months: "Nov 20", "Nov 20, 2026", "20 November", "20th of November"
  [
    "date",
    new RegExp(
      `(?<![a-z])(${EN_MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s+(\\d{4})(?!\\d))?(?![a-z\\d:])`,
      "g",
    ),
    (m, raw, f) => englishDate(m, raw, f, m[1], m[2], m[3]),
  ],
  [
    "date",
    new RegExp(
      `(?<![a-z\\d])(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?[\\s-]+(${EN_MONTH_RE})\\.?(?![a-z])(?:,?\\s+(\\d{4})(?!\\d)|-(\\d{2})(?![\\d:]))?`,
      "g",
    ),
    (m, raw, f) =>
      englishDate(
        m,
        raw,
        f,
        m[2],
        m[1],
        m[3] ?? (m[4] ? `20${m[4]}` : undefined),
      ),
  ],
  // an English ordinal with no month: "the 20th", "5th" (the next such day, as "ngày 20")
  [
    "date",
    /(?<![a-z\d])(\d{1,2})(?:st|nd|rd|th)(?![a-z])/g,
    (m) => (+m[1] >= 1 && +m[1] <= 31 ? { k: "dom", d: +m[1] } : null),
  ],
  // "in 3 days", "in 2 weeks": a count from today
  [
    "date",
    /(?<![a-z\d.])in\s+(\d{1,2})\s+(days?|weeks?)(?![a-z])/g,
    (m) => ({ k: "rel", off: m[2].startsWith("week") ? 7 * +m[1] : +m[1] }),
  ],
  // one separator twice: "1-2/10" is a day range, not 1/2/2010
  [
    "date",
    /(?<![\d/.a-z-])(\d{1,2})([/.-])(\d{1,2})\2(\d{4,5}|\d{2}|0)(?!\d)/g,
    (m) => {
      const [d, mo] =
        m[2] === "/" && +m[3] > 12 && +m[1] <= 12
          ? [+m[3], +m[1]]
          : [+m[1], +m[3]];
      const dm = dayMonthOf(d, mo, m[2] === "/");
      if (!dm) return null;
      // the year is checked against the reference date when the date is resolved (resolveDate)
      return {
        k: "date",
        form: "full",
        d: dm[0],
        m: dm[1],
        y: m[4].length === 2 ? 2000 + +m[4] : +m[4],
      };
    },
  ],
  [
    "date",
    /(?<!\d)(?:(?<![a-z])(?:ngay|mung|mong)\s+)?(\d{1,2})\s*thang\s*(\d{1,2})(?:\s*nam\s*(\d{4}))?(?!\d)/g,
    (m) => {
      const dm = dayMonthOf(+m[1], +m[2], true);
      if (!dm) return null;
      return {
        k: "date",
        form: "long",
        d: dm[0],
        m: dm[1],
        y: m[3] ? +m[3] : undefined,
      };
    },
  ],
  // "21-22/11", "từ 15 đến 22/11": the first day takes the month and year of the second date
  [
    "date",
    /(?<![\d/.a-z-])(\d{1,2})(?=\s*(?:-|den|toi|ket thuc)\s*:?\s*(?:het\s*)?(?:ngay\s*:?\s*)?\d{1,2}[/.-]\d{1,2})/g,
    (m) => {
      const t = RANGE_TAIL.exec(m.input.slice((m.index ?? 0) + m[0].length));
      return t ? dayMonth(m[1], t[2], t[3], t[0].includes("/")) : null;
    },
  ],
  [
    "date",
    /(?<=(?<![a-z])(?:den|toi|ket thuc)\s*:?\s*(?:het\s*)?(?:ngay\s*:?\s*)?|-\s*(?:het\s*)?(?:ngay\s*:?\s*)?)\d{1,2}[/.-]\d{1,2}(?:[/.-](?:\d{4,5}|\d{2}|0))?(?!\d)/g,
    (m) => {
      const t = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4,5}|\d{2}|0))?$/.exec(
        m[0],
      );
      return t ? dayMonth(t[1], t[2], t[3], m[0].includes("/")) : null;
    },
  ],
  [
    "date",
    /(?<![\d/.:a-z-])(\d{1,2})[/.-](\d{1,2})(?![\d/-])(?!\.\d)(?!\s*(?:h|gio)(?![a-z]))/g,
    (m) => {
      // "11/20" is 20 November: a second number over 12 is the day
      const [d, mo] =
        m[0].includes("/") && +m[2] > 12 && +m[1] <= 12
          ? [+m[2], +m[1]]
          : [+m[1], +m[2]];
      const dm = dayMonthOf(d, mo, m[0].includes("/"));
      if (!dm) return null;
      // "lúc 9.20" is a clock: a dotted pair after a clock cue is no date
      if (
        m[0].includes(".") &&
        CLOCK_CUE_BEFORE.test(m.input.slice(0, m.index))
      )
        return null;
      return { k: "date", form: "short", d: dm[0], m: dm[1] };
    },
  ],
  // "ngày 2 lần": twice a day, not a day of the month
  [
    "recur",
    /(?<![a-z])ngay\s+\d{1,2}\s+(?:lan|buoi)(?![a-z])/g,
    () => ({ k: "recur", freq: "DAILY" }),
  ],
  // a day of the month with no month: "ngày 20", "mùng 5"; "ngày 20/11" and "5 tháng 1" are read by the rules above
  [
    "date",
    /(?<![a-z\d])(?:ngay|mung|mong)\s+(\d{1,2})(?![\d/.:,])(?!\s*(?:thang|gio|h|tieng|phut|p|km|trang|tuan|nam|lan|buoi)(?![a-z]))(?![a-z])/g,
    (m) => (+m[1] >= 1 && +m[1] <= 31 ? { k: "dom", d: +m[1] } : null),
  ],
  // "tuần thứ 2 của tháng 12": the second week of the month
  [
    "date",
    /(?<![a-z])tuan\s+thu\s+([1-5])\s+cua\s+thang\s+(\d{1,2})(?!\d)/g,
    (m) => ({ k: "span", key: `tuan_${m[1]}_thang_${m[2]}` }),
  ],
  // "thứ 6 này" is this week, "thứ 6 tới" next week; "thứ 6 tối" is the evening, so "tối" counts only as "tới"
  [
    "date",
    new RegExp(
      `(?:(?<![a-z])tuan\\s+(?<pw>${WEEK_WORDS})\\s+)?(?<![a-z])(?:thu\\s?(?<wd>hai|ba|tu|nam|sau|bay|[2-7])|t(?<td>[2-7]))(?![a-z\\d])(?<rest>(?:\\s*(?:,|va)?\\s*(?:thu\\s?|t)?[2-7](?![\\d:./-])(?!\\s*(?:h|g|gio|tieng|phut|p|ngay|tuan|thang|nua|nam|ruoi|kem|am|pm)(?![a-z])))*)(?:\\s+tuan\\s+(?<sw>${WEEK_WORDS})(?![a-z])|\\s+(?<bw>nay|toi)(?![a-z]))?`,
      "g",
    ),
    (m, raw, f) => {
      const g = m.groups ?? {};
      const dow =
        g.td !== undefined
          ? +g.td - 1
          : /^\d$/.test(g.wd)
            ? +g.wd - 1
            : WEEK_WORD[g.wd];
      const fs = m.index ?? 0;
      const word = raw
        .slice(f.map[fs], f.map[fs + m[0].length - 1] + 1)
        .normalize("NFC")
        .toLowerCase();
      // "thử hai", "thư 2": another word with a tone on "thu", only "thứ" is the weekday
      if (/(?:^|\s)(?:thử|thư|thú|thụ)(?=\s|\d)/.test(word)) return null;
      const bw =
        g.bw === "nay"
          ? "nay"
          : g.bw && word.endsWith("tới")
            ? "sau"
            : undefined;
      const wk = g.pw ?? g.sw ?? bw;
      // "thứ 6 này" with no "tuần": the coming Friday when this week's has passed
      const bare = g.bw === "nay" && !g.pw && !g.sw;
      // "t2, t4, t6": the other weekdays of the list, the first one is `dow`
      const more = [...(g.rest ?? "").matchAll(/[2-7]/g)].map((x) => +x[0] - 1);
      return {
        k: "dow",
        dow,
        wk: wk === undefined ? undefined : WEEK_OFF[wk.replace(/\s+/g, " ")],
        bare,
        ...(more.length ? { more } : {}),
      };
    },
  ],
  // "chủ nhật tuần sau", "tuần sau chủ nhật", "CN này", "chủ nhật tới": Sunday with its week, like "thứ 7 tuần sau"
  [
    "date",
    new RegExp(
      `(?<![a-z])(?:tuan\\s+(?<pw>${WEEK_WORDS})\\s+)?(?:chu nhat|cn)(?:\\s+tuan\\s+(?<sw>${WEEK_WORDS})|\\s+(?<bw>nay|toi))?(?![a-z])`,
      "g",
    ),
    (m, raw, f) => {
      const g = m.groups ?? {};
      if (!g.pw && !g.sw && !g.bw) return null;
      const fs = m.index ?? 0;
      const word = raw
        .slice(f.map[fs], f.map[fs + m[0].length - 1] + 1)
        .normalize("NFC")
        .toLowerCase();
      // "chủ nhật tối" is Sunday evening: only "tới" with its mark is the coming Sunday
      if (g.bw === "toi" && !word.endsWith("tới")) return null;
      const wk = g.pw ?? g.sw;
      return {
        k: "dow",
        dow: 0,
        wk: wk === undefined ? undefined : WEEK_OFF[wk.replace(/\s+/g, " ")],
        bare: g.bw === "nay",
      };
    },
  ],
  ["date", /(?<![a-z])(?:chu nhat|cn)(?![a-z])/g, () => ({ k: "dow", dow: 0 })],
  [
    "date",
    /(?<![a-z])(?:(?:noi\s+)?trong\s+(?:hom\s+)?nay|trong\s+ngay(?!\s+(?:mai|\d))|hom nay|ngay nay|(?<!\d\s*(?:h\d{0,2}|gio|g\d{0,2}|[:.]\d{2})\s*(?:\d{1,2}\s*)?)(?:sang|trua|chieu|toi|dem)\s+nay)(?![a-z])/g,
    () => ({ k: "rel", off: 0 }),
  ],
  // "3h chiều nay": the clock takes its part, the day is "nay"
  [
    "date",
    /(?<=\d\s*(?:h\d{0,2}|gio|g\d{0,2}|[:.]\d{2})\s*(?:\d{1,2}\s*)?(?:sang|trua|chieu|toi|dem)\s+)nay(?![a-z])/g,
    () => ({ k: "rel", off: 0 }),
  ],
  ["date", /(?<![a-z])tu gio(?![a-z])/g, () => ({ k: "after", min: 0 })],
  [
    "date",
    /(?<![a-z])bay gio(?![a-z])(?!\s+(?:ruoi|kem|sang|trua|chieu|toi|dem))/g,
    () => ({ k: "rel", off: 0 }),
  ],
  [
    "date",
    /(?<![a-z])(?:(?<!(?:ca|nua) )ngay mai|mai)(?![a-z])(?!\s+mot(?![a-z]))/g,
    tomorrowRead,
  ],
  [
    "date",
    /(?<![a-z])(?:(?:ngay|mai)\s+mot|mot(?!\s+(?:so|vai|it|buoi|lan|bai|cai|mon|phan|chut|nguoi|trong|hai|ba|nam|thang|ngay|gio|tieng|h|g|p|phut|chiec|tiet|lop|khoa|khoan)\b))(?![a-z])/g,
    (m, raw, f) => {
      const fs = m.index ?? 0;
      const fe = fs + m[0].length;
      const rawWord = raw.slice(f.map[fs], f.map[fe - 1] + 1);
      if (/[\u0323ộọ]/i.test(rawWord.normalize("NFD"))) return null;
      const after = f.text.slice(fe).trimStart();
      if (
        /^(?:so|vai|it|buoi|lan|bai|cai|mon|phan|chut|nguoi|trong|hai|ba|nam|thang|ngay|gio|tieng|h|g|p|phut)\b/i.test(
          after,
        )
      ) {
        return null;
      }
      return { k: "rel", off: 2 };
    },
  ],
  // "ngày kìa" is three days on, "ngày kia" two
  [
    "date",
    /(?<![a-z])ngay kia(?![a-z])/g,
    (m, raw, f) => ({
      k: "rel",
      off: /ì/.test(
        raw
          .slice(
            f.map[m.index ?? 0],
            f.map[(m.index ?? 0) + m[0].length - 1] + 1,
          )
          .normalize("NFC"),
      )
        ? 3
        : 2,
    }),
  ],
  ["date", /(?<![a-z])bua sau(?![a-z])/g, () => ({ k: "rel", off: 7 })],
  ["date", /(?<![a-z])hom qua(?![a-z])/g, () => ({ k: "rel", off: -1 })],
  // counts from today: "2 ngày nữa", "vài ngày tới", "1 tuần nữa" (2 tuần nữa is the week after next)
  [
    "date",
    /(?<![\d.a-z])(\d{1,2})\s+(?:ngay|hom|bua)\s+nua(?![a-z])/g,
    (m) => ({ k: "rel", off: +m[1] }),
  ],
  [
    "date",
    /(?<![a-z])(?:vai|may)\s+(?:ngay|hom|bua)\s+(?:toi|nua)(?![a-z])/g,
    () => ({ k: "rel", off: 3 }),
  ],
  [
    "date",
    /(?<![\d.,a-z])(?:(\d{1,3})\s*(tieng|gio|phut|p)|(nua)\s+tieng)\s+nua(?![a-z])/g,
    (m) => ({
      k: "after",
      min: m[3] ? 30 : m[2] === "tieng" || m[2] === "gio" ? +m[1] * 60 : +m[1],
    }),
  ],
  [
    "date",
    /(?<![\d.a-z])(?:(2|mot)\s+)?tuan\s+nua(?![a-z])/g,
    (m) => (m[1] === "2" ? { k: "week", off: 2 } : { k: "rel", off: 7 }),
  ],
  // weeks and months: "hết" and "cuối" as deadlines, "đầu/giữa/cuối" and "trong" as spans
  [
    "date",
    /(?<![a-z])het\s+tuan\s+(?:sau|toi)(?![a-z])/g,
    () => ({ k: "weekend_next" }),
  ],
  [
    "date",
    /(?<![a-z])(?<!ngay\s)(?:het|trong)\s+tuan(?!\s+(?:sau|toi))(?:\s+nay)?(?![a-z])/g,
    () => ({ k: "weekend" }),
  ],
  [
    "date",
    /(?<![a-z])het\s+thang\s+sau(?![a-z])/g,
    () => ({ k: "month_end_next" }),
  ],
  [
    "date",
    /(?<![a-z])(?:het\s+thang(?:\s+nay)?|thang\s+nay)(?![a-z])/g,
    () => ({ k: "month_end" }),
  ],
  [
    "date",
    /(?<![a-z])(?:(dau|giua|cuoi)\s+tuan\s+(?:sau|toi)|cuoi\s+tuan(?:\s+nay)?)(?![a-z])/g,
    (m) => ({ k: "span", key: m[1] ? `${m[1]}_tuan_sau` : "cuoi_tuan" }),
  ],
  [
    "date",
    /(?<![a-z])(?:(dau|cuoi)\s+nam\s+sau|cuoi\s+nam(?:\s+nay)?)(?![a-z])/g,
    (m) => ({ k: "span", key: m[1] ? `${m[1]}_nam_sau` : "cuoi_nam" }),
  ],
  [
    "date",
    /(?<![a-z])(dau|giua|cuoi)\s+thang\s+(\d{1,2})(?!\d)(?![/.:-]\d)(?!\s*nam\s*\d{4})(?![a-z])/g,
    (m) => ({ k: "span", key: `${m[1]}_thang_${+m[2]}` }),
  ],
  [
    "date",
    /(?<![a-z])quy\s+([1-4])(?![a-z\d])/g,
    (m) => ({ k: "span", key: `quy_${m[1]}` }),
  ],
  [
    "date",
    /(?<![a-z])(?:(dau|giua|cuoi)\s+thang\s+sau|(cuoi)\s+thang(?:\s+nay)?|sang\s+thang|(?:sang\s+)?thang\s+(?:sau|toi))(?![a-z])/g,
    (m) => ({
      k: "span",
      key: m[1] ? `${m[1]}_thang_sau` : m[2] ? "cuoi_thang" : "thang_sau",
    }),
  ],
  [
    "date",
    new RegExp(
      `(?<![a-z])(?:(sang)\\s+)?tuan(?:\\s+(${WEEK_WORDS}))?(?![a-z])`,
      "g",
    ),
    (m, raw, f) => {
      // "8h sáng tuần sau": "sáng" is the morning of the clock before it, not "sang tuần"
      const at = f.map[m.index ?? 0];
      if (
        m[1] &&
        (raw.slice(at, at + 4).normalize("NFC").toLowerCase() === "sáng" ||
          /\d\s*(?:h|g|gio|phut)?\s*$/.test(m.input.slice(0, m.index)))
      )
        return null;
      return m[2]
        ? { k: "week", off: WEEK_OFF[m[2].replace(/\s+/g, " ")] }
        : m[1]
          ? { k: "week", off: 1 }
          : null;
    },
  ],
  // the week word alone, when the "sang" before it was a morning
  [
    "date",
    new RegExp(`(?<![a-z])tuan\\s+(${WEEK_WORDS})(?![a-z])`, "g"),
    (m) => ({ k: "week", off: WEEK_OFF[m[1].replace(/\s+/g, " ")] }),
  ],

  // the clock after an ISO date: "2026-11-12T14:30" or "2026-11-12 14:30"
  [
    "time",
    /(?<=\d{4}[/-]\d{1,2}[/-]\d{1,2}[t ]+)(\d{1,2}):(\d{2})(?!\d)/g,
    (m) =>
      +m[1] <= 23 && +m[2] <= 59 ? timeVal(+m[1], +m[2], undefined) : null,
  ],
  // times: word clocks need a suffix or a part word, so "hai gio" (two hours) is not a clock
  // "08:00 SA", "3:30 CH": the phone's own morning and afternoon marks after a clock with minutes
  [
    "time",
    /(?<![\d./a-z])(\d{1,2})[:.](\d{2})\s*(sa|ch)(?![a-z])/g,
    (m) => {
      let h = +m[1];
      if (m[3] === "ch" && h < 12) h += 12;
      if (m[3] === "sa" && h === 12) h = 0;
      return clockVal(h, +m[2], m[3] === "ch" ? "chieu" : "sang", true);
    },
  ],
  [
    "time",
    /(?<![\d./a-z])(\d{1,2})(?::(\d{2})|h(\d{2})?)?\s*(a\.m\.?|p\.m\.?|am|pm)(?![a-z])/g,
    (m) => {
      let h = +m[1];
      const mi = +(m[2] ?? m[3] ?? 0);
      const pm = m[4].startsWith("p");
      // "13pm" is 13:00 and "0am" is 00:00: an hour past 12 is already a 24-hour clock
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
      return clockVal(
        h,
        mi,
        pm ? "toi" : "sang",
        m[2] !== undefined || m[3] !== undefined,
      );
    },
  ],
  [
    "time",
    /(?<![a-z])(?!sau\s+gio\s+(?:sang|trua|chieu|toi|dem|khuya)(?![a-z]))(muoi mot|muoi hai|muoi|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin)\s+gio(?:\s+(ruoi|kem\s+(?:muoi mot|muoi hai|muoi|mot|hai|ba|bon|nam|sau|bay|tam|chin)))?(?:\s+(sang|trua|chieu|toi|dem|khuya))?(?![a-z])/g,
    (m) => {
      const h = WORD_NUM[m[1]];
      const suffix = m[2];
      const partSuffix = m[3]?.toLowerCase();
      const near = partSuffix ?? partNear(m);
      if (!suffix && !near) return null;
      if (suffix === "ruoi") return timeVal(h, 30, near);
      if (suffix?.startsWith("kem"))
        return timeVal(h - 1, 60 - WORD_NUM[suffix.slice(4)], near);
      return timeVal(h, 0, near);
    },
  ],
  // "sau giờ trưa", "sau tối": work starts after that part of the day
  [
    "time",
    /(?<![a-z])sau\s+(?:gio\s+)?(sang|trua|chieu|toi|dem)(?![a-z])/g,
    (m) => {
      const v = timeVal(AFTER_HOUR[m[1]], 0, m[1]);
      return v?.k === "time" ? { ...v, after: true } : null;
    },
  ],
  // "ngoài giờ học": work starts after school, at 17h
  [
    "time",
    /(?<![a-z])ngoai gio hoc(?![a-z])/g,
    () => {
      const v = timeVal(17, 0, "chieu");
      return v?.k === "time" ? { ...v, after: true } : null;
    },
  ],
  // a range start with no unit, "9-11h", "chiều 2-5h": its part is its own, else the end's; the end is read by its own clock
  [
    "time",
    /(?<![\d./:a-z])(?:(sang|trua|chieu|toi|dem|khuya)\s+)?(\d{1,2})(?=\s*(?:-|den|toi)\s*(?:truoc\s+)?\d{1,2}\s*(?:h|g|gio|:\d{2})(?![a-z]))/g,
    (m) => {
      const t =
        /^\s*(?:-|den|toi)\s*(?:truoc\s+)?\d{1,2}\s*(?:h|g|gio|:\d{2})(?:\s*(sang|trua|chieu|toi|dem|khuya)(?![a-z]))?/.exec(
          m.input.slice((m.index ?? 0) + m[0].length),
        );
      return timeVal(+m[2], 0, m[1] ?? t?.[1]);
    },
  ],
  // "9 giờ kém 15", "9h kém 15": a quarter to the hour before
  [
    "time",
    /(?<![\d./a-z])(\d{1,2})\s*(?:gio|h|g)\s*kem\s*(\d{1,2})(?![\d:h])/g,
    (m) => {
      const mi = +m[2];
      if (mi < 1 || mi > 59) return null;
      return timeVal((+m[1] + 23) % 24, 60 - mi, partNear(m));
    },
  ],
  // a clock after a time cue with no unit: "lúc 9.20", "lúc 1700", "lúc trưa", "đến trưa", "đến nửa đêm"
  [
    "time",
    /(?<=(?<![a-z])(?:luc|hen|bat dau|khoang|tam|dung)\s+)(\d{1,2})\.(\d{2})(?![\d./])/g,
    (m) => clockVal(+m[1], +m[2], partNear(m), true),
  ],
  [
    "time",
    /(?<=(?<![a-z])(?:luc|vao|tu|den|toi|truoc|sau|han|hen|bat dau)\s+)([01]\d|2[0-3])([0-5]\d)(?![\d/.:-])/g,
    (m) => timeVal(+m[1], +m[2], partNear(m)),
  ],
  [
    "time",
    /(?<=(?<![a-z])(?:luc|vao|tu|den|toi|hen|bat dau)\s+)(trua|nua dem)(?![a-z])|(?<=(?<![a-z])(?:truoc|han)\s+)(nua dem)(?![a-z])/g,
    // "trước nửa đêm" is the day's last minute: as 0:00 the before-rule would end the day before
    (m) => (m[1] === "trua" ? timeVal(12, 0, "trua") : m[2] ? timeVal(23, 59, "dem") : timeVal(0, 0, "dem")),
  ],
  [
    "time",
    /(?<=(?<![a-z])(?:at|by|before|until)\s+)(noon|midnight)(?![a-z])/g,
    (m) => (m[1] === "noon" ? timeVal(12, 0, "trua") : timeVal(0, 0, "dem")),
  ],
  [
    "time",
    /(?<![\d./a-z])(?:(?:dung|khoang|tam)\s+)?(\d{1,2})\s*(?:gio(?:\s+(\d{1,2})(?!\d)(?!\s*thang\s*\d)(?!\s*(?:tieng|buoi|lan)(?![a-z]))(?!(?<=\s\d)\s*(?:tuan|ngay|thang)\s+(?:nua|toi|sau|truoc)(?![a-z])))?(?:\s+phut)?|h(?:(\d{2})(?:\s*(?:phut|p)(?![a-z]))?)?(?![a-z])|g(\d{2})?(?![a-z\d])|:(\d{2})(?!\d)|\.(00|15|30|45)(?![\d./]))(?:\s*(am|pm)(?![a-z]))?(?:\s*(sang|trua|chieu|toi|dem|khuya)(?![a-z])(?!\s*\d{1,2}\s*(?:h|g|gio|:\d)))?/g,
    (m) => {
      // "09.00": a dotted clock only with minutes no month can be, so "9.11" stays a date
      const mi = +(m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? 0);
      let h = +m[1];
      const ap = m[7]?.toLowerCase();
      const partSuffix = m[8]?.toLowerCase();
      // "trong 25h" is a length: an hour past 23 after a length cue, in hours or giờ, is no clock
      if (
        h > 23 &&
        !ap &&
        m[5] === undefined &&
        m[6] === undefined &&
        SPAN_CUE.test(m.input.slice(0, m.index))
      )
        return null;
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      const part = ap
        ? ap === "pm"
          ? "toi"
          : "sang"
        : (partSuffix ?? partNear(m));
      const hasMin = [m[2], m[3], m[4], m[5], m[6]].some(
        (x) => x !== undefined,
      );
      return clockVal(h, mi, part, hasMin);
    },
  ],
  [
    "time",
    /(?<![a-z])(sang|trua|chieu|toi|dem|khuya)\s+(\d{1,2})\s*(?:gio(?:\s+(\d{1,2})(?!\d)(?!\s*thang\s*\d)(?!\s*(?:tieng|buoi|lan)(?![a-z]))(?!(?<=\s\d)\s*(?:tuan|ngay|thang)\s+(?:nua|toi|sau|truoc)(?![a-z])))?(?:\s+phut)?|h(\d{2})?(?![a-z])|g(\d{2})(?!\d)|:(\d{2})(?!\d))(?![a-z])/g,
    (m) => {
      const part = m[1].toLowerCase();
      const h = +m[2];
      const mi = +(m[3] ?? m[4] ?? m[5] ?? m[6] ?? 0);
      if (h > 23 || mi > 59) return null;
      return timeVal(h, mi, part);
    },
  ],

  // durations
  ["dur", /(?<![a-z])nua tieng(?![a-z])/g, () => ({ k: "dur", min: 30 })],
  [
    "dur",
    /(?<![\d.,])(\d+)\s*(?:tieng|gio|h)\s+ruoi(?![a-z])/g,
    (m) => ({ k: "dur", min: +m[1] * 60 + 30 }),
  ],
  // "3h chiều" is a clock, never a length
  [
    "dur",
    /(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(tieng|gio|h(?!\s*(?:sang|trua|chieu|toi|dem|khuya)(?![a-z]))|phut|p|tiet)(?![a-z])/g,
    (m) => {
      const n = parseFloat(m[1].replace(",", "."));
      const unit = m[2];
      const raw =
        unit === "phut" || unit === "p" ? n : unit === "tiet" ? n * 50 : n * 60;
      return {
        k: "dur",
        min: Math.min(MAX_TASK_MINUTES, lengthMin(raw)),
      };
    },
  ],

  // "cổng trường" is a place by its own name; "công ty" is not (folded, both read cong)
  [
    "place",
    /(?<![a-z])cong\s+truong(?![a-z])/g,
    () => ({ k: "place", text: "" }),
  ],

  // a meeting link is the location, whole: its digits are not a date or clock
  [
    "place",
    /https?:\/\/(?:[\w-]+\.)*(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)\S*/g,
    () => ({ k: "place", text: "" }),
  ],
  // "room A1.203", "room 302": the word goes, the code stays
  [
    "place",
    /(?<![a-z])(room)(\s+)([a-z]{0,2}\d{1,3}(?:\.\d{1,3})?)(?![a-z\d.])/g,
    () => ({ k: "place", text: "" }),
  ],
  // "at the library", "in the lab": the place is the noun
  [
    "place",
    /(?<=(?<![a-z])(?:at|in) the\s+)(library|lab|hall|gym|office|canteen|cafeteria)(?![a-z])/g,
    () => ({ k: "place", text: "" }),
  ],
  // Google Meet and Teams, named as the place of the event
  [
    "place",
    /(?<![a-z])google\s+meet(?![a-z])|(?<=(?<![a-z])(?:on|in|via|at)\s+)teams(?![a-z])/g,
    () => ({ k: "place", text: "" }),
  ],
  // campus and zone names: "cơ sở 2", "CS2", "khu A"
  [
    "place",
    /(?<![a-z])(?:co so\s*\d|cs\s?[1-9]|khu\s+[a-z])(?![a-z\d])/g,
    () => ({ k: "place", text: "" }),
  ],

  // a bare "online" is the place Online
  [
    "place",
    /(?<![a-z])online(?![a-z])/g,
    () => ({ k: "place", text: "Online" }),
  ],

  // a room code with a dot: "A24.1" (the value reads the raw text, so the code keeps its case)
  [
    "place",
    /(?<![a-z\d.])(?:[a-z]\d{1,3}\.\d{1,3}|[a-z]\.\d{3})(?!\d)/g,
    () => ({ k: "place", text: "" }),
  ],

  // places: the trigger word, then the phrase up to a stop or a clock
  [
    "place",
    new RegExp(
      `\\b(phong|hoi truong|giang duong|san|tai|o|dia diem|online|zoom|meet)\\b(\\s*:?\\s*)(?!lieu\\b|lien ket\\b|dinh kem\\b|day\\b|sang\\b|chieu\\b|toi\\b|trua\\b|dem\\b|khuya\\b)(?!\\s*nha\\b)([^,;:!?\\n()]+?)(?=\\s*(?:[,;:!?\\n()]|\\.(?:\\s|$)|-\\s|\\b${STOP_WORD}\\b|${DAY_STOP}|\\s\\d{1,2}\\s*(?:h|g|gio)(?![a-z])|$))`,
      "g",
    ),
    (m) => {
      // "dọn phòng", "đặt phòng" are chores, and "phòng trước 5h" has no name after it: neither is where the task happens
      if (
        m[1] === "phong" &&
        (/(?<![a-z])(?:don|quet|lau|thue|dat|tim|doi|tra|sua|son|trang tri|sap xep|ve sinh)\s+$/.test(
          m.input.slice(0, m.index),
        ) ||
          /^(?:truoc|sau|han|han chot|deadline|cham nhat|muon nhat|tre nhat|xong|som|gap)(?![a-z])/.test(
            m[3].trim(),
          ))
      )
        return null;
      return m[3].trim() ? { k: "place", text: m[3].trim() } : null;
    },
  ],

  // courses: "mon X", "hoc phan X"
  [
    "course",
    new RegExp(
      `\\b(mon|hoc phan|course)(?![a-z])(\\s*:?\\s*)([^,;:!?\\n()]+?)(?=\\s*(?:[,;:!?\\n()]|\\.(?:\\s|$)|-\\s|\\b${STOP_WORD}\\b|$))`,
      "g",
    ),
    (m) => ({ k: "course", text: m[3].trim() }),
  ],
];

/** The clock with a part of the day it lacks: "6h" after "chiều" is 18:00. Timed rows only. */
export function withPart(f: Found, part: string): Found {
  if (f.v.k !== "time" || f.v.part) return f;
  return { ...f, v: timeVal(f.v.h, f.v.mi, part) ?? f.v };
}

/** Cues that correct the words before them ("à không", "ý là", "nhầm"). Folded. */
export const CORRECTION =
  /\b(a\d? khong|a\d? nham|a\d? quen|khong phai,? ma la|khong phai|nham|doi lai|ma khong|y la|oi nham|sorry|ko phai)\b/g;

/** The folded text after the last correction cue, or the whole text when it has none. */
export function afterCorrection(folded: string): string {
  let end = 0;
  for (const m of folded.matchAll(CORRECTION))
    end = (m.index ?? 0) + m[0].length;
  return folded.slice(end);
}

export interface Correction {
  /** The raw text with the cue and the replaced day or clock blanked to spaces. */
  text: string;
  /** Raw offset where the words after the cue start. */
  cut: number;
  /** The part of day the replaced clock had, for a new clock without one. */
  inherit?: string;
}

/** A self-correction: the words before the cue keep the title, and only the day or clock they name is replaced. Null when nothing follows the cue. */
export function correctionOf(raw: string): Correction | undefined {
  if (
    !/kh[oô]ng|nh[aầáà]m|[yý] l[aà]|sorry|ko |đổi lại|doi lai|ph[aả]i|qu[eê]n/i.test(
      raw,
    )
  )
    return undefined;
  const f = fold(raw);
  let last: RegExpExecArray | null = null;
  for (const m of f.text.matchAll(CORRECTION)) last = m;
  if (!last) return undefined;
  let s = f.map[last.index ?? 0];
  let e = f.map[(last.index ?? 0) + last[0].length - 1] + 1;
  while (s > 0 && /[\s,;]/.test(raw[s - 1])) s--;
  while (e < raw.length && /[\s,;]/.test(raw[e])) e++;
  const found = findMentions(raw).filter(
    (x) => x.kind === "date" || x.kind === "time",
  );
  const post = found.filter((x) => x.start >= e);
  if (!post.length) return undefined;
  const postDate = post.some((x) => x.kind === "date");
  const postTime = post.some((x) => x.kind === "time");
  const dropped = found.filter(
    (x) =>
      x.end <= s &&
      ((x.kind === "date" && postDate) || (x.kind === "time" && postTime)),
  );
  let text = raw.slice(0, s) + " ".repeat(e - s) + raw.slice(e);
  for (const x of dropped)
    text =
      text.slice(0, x.start) + " ".repeat(x.end - x.start) + text.slice(x.end);
  const inherit = dropped.find((x) => x.v.k === "time" && x.v.part)?.v;
  return {
    text,
    cut: e,
    inherit: inherit?.k === "time" ? inherit.part : undefined,
  };
}

/** A length cue before a number: "trong 25h", "tổng 30 giờ". Folded text. */
const SPAN_CUE =
  /(?<![a-z])(?:trong|mat|keo dai|tong(?: cong)?|in total)\s+(?:(?:khoang|hon|gan|tam)\s+)?$/;

/**
 * A clock typed with an invalid hour or minute, clamped: minutes past 59 are :59, an hour past 23 is 23
 * with its minutes. Hour 24 with minutes is 00:MM of the next day; "24:00" is the end of the day.
 */
function clockVal(
  h: number,
  mi: number,
  part: string | undefined,
  hasMin: boolean,
): Val | null {
  const m = Math.min(mi, 59);
  if (h === 24 && hasMin) {
    const v = timeVal(0, m, part);
    return v?.k === "time" && m > 0 ? { ...v, next: true } : v;
  }
  return timeVal(Math.min(h, 23), m, part);
}

function timeVal(h: number, mi: number, part: string | undefined): Val | null {
  let hh = h;
  if (part === "chieu" || part === "toi") {
    if (hh < 12) hh += 12;
  } else if (part === "trua") {
    if (hh >= 1 && hh <= 4) hh += 12;
  } else if (part === "dem") {
    if (hh >= 6 && hh <= 11) hh += 12;
    else if (hh === 12) hh = 0;
  }
  if (hh < 0 || hh > 23) return null;
  return { k: "time", h: hh, mi, part };
}

/** The part of the day word closest to a clock match, within 14 folded chars. */
/** The text `findMentions` is reading, for the checks that need a word's marks. */
let reading: { raw: string; map: number[] } | undefined;

function partNear(m: RegExpExecArray): string | undefined {
  const s = m.index;
  const e = m.index + m[0].length;
  const from = Math.max(0, s - 14);
  const to = e + 14;
  const window = m.input.slice(from, to);
  let best: { word: string; dist: number } | undefined;
  for (const p of window.matchAll(PART)) {
    // "tuần tới", "tháng tới": the whole text before decides, the window may start mid-phrase
    if (
      /(?:tuan|thang|nam)\s+$/.test(m.input.slice(0, from + (p.index ?? 0))) &&
      p[1] === "toi"
    )
      continue;
    if (/tuan\s+$/.test(window.slice(0, p.index))) continue;
    // "nhắc tôi 8h họp": "tôi" is the speaker
    if (p[1] === "toi" && reading) {
      const r0 = reading.map[from + (p.index ?? 0)];
      // "chơi game tới 1h": "tới" is until, never the evening
      if (["tôi", "tới"].includes(reading.raw.slice(r0, r0 + 3).normalize("NFC").toLowerCase())) continue;
    }
    // "7h tới 17h": a "tới" between two clocks is a range end, not an evening word
    if (
      p[1] === "toi" &&
      /\d\s*(?:h|g|gio)\s*$/.test(window.slice(0, p.index)) &&
      // the next number must be a clock: "9h tối 20/11" is the evening, then a date
      /^\s+\d{1,2}\s*(?:h|g|gio|:\d)/.test(
        m.input.slice(from + (p.index ?? 0) + p[0].length),
      )
    )
      continue;
    const at = from + (p.index ?? 0);
    // a part word after this clock that heads the next clock is that clock's part
    if (
      at >= e &&
      /^\s*\d{1,2}\s*(?:h|g|gio|:\d)/.test(
        window.slice((p.index ?? 0) + p[0].length),
      )
    )
      continue;
    // "từ 11h đến 1h chiều": a part word after another clock is that clock's, not this one's
    if (at >= e && /\d\s*(?:h|g|gio|:\d)/.test(m.input.slice(e, at))) continue;
    const dist = at < s ? s - at : at >= e ? at - e : 0;
    if (!best || dist < best.dist) best = { word: p[1], dist };
  }
  return best?.word;
}

/** Mentions in `raw`, with raw offsets. Masks come first, so a phrase inside a mask is never read again. */
export function findMentions(raw: string): Found[] {
  const f = fold(raw);
  reading = { raw, map: f.map };
  const out: Found[] = [];
  const taken = (s: number, e: number) =>
    out.some((x) => s < x.end && e > x.start);
  for (const [kind, re, make] of RULES) {
    for (const m of f.text.matchAll(re)) {
      const v = make(m, raw, f);
      if (!v) continue;
      const fs = m.index ?? 0;
      const fe = fs + m[0].length;
      if (fe <= fs) continue;
      const start = f.map[fs];
      const end = f.map[fe - 1] + 1;
      if (taken(start, end)) continue;
      if (v.k === "place" || v.k === "course") {
        // The value keeps the raw text: diacritics stay, room codes read as A24.1.
        // "ở", "tại", "địa điểm" are prepositions and drop out; "phòng", "hội trường" stay in the name
        const trigger = m[1] ?? "";
        // folded spellings collide: "tài liệu" (materials) reads as "tại", "sản phẩm" as "sân"
        const rawTrigger = raw
          .slice(f.map[fs], f.map[fs + trigger.length - 1] + 1)
          .normalize("NFC")
          .toLowerCase();
        if (trigger && ["tài", "sản"].includes(rawTrigger)) continue;
        // a marked word that folds to a trigger is another word: "khách sạn" is no "sân", "ô" no "ở"
        const marked: Record<string, string> = { san: "sân", tai: "tại", o: "ở", phong: "phòng" };
        if (marked[trigger] && rawTrigger !== trigger && rawTrigger !== marked[trigger]) continue;
        const preposition = /^(o|tai|dia diem|room)$/.test(trigger);
        const from = preposition
          ? fs + trigger.length + (m[2]?.length ?? 0)
          : fs;
        let text = raw.slice(f.map[from], end).trim();
        // a link keeps its case and digits
        if (/\b[a-z]{1,3}\d/i.test(text) && !/^https?:/i.test(text))
          text = text.toUpperCase();
        out.push({ kind, start, end, v: { ...v, text } });
        continue;
      }
      out.push({ kind, start, end, v });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Mentions for the underline on the capture screen. Masks are not shown. */
export function mentionsOf(raw: string): ReaderMention[] {
  const out: ReaderMention[] = [];
  for (const x of findMentions(raw)) {
    if (x.kind === "mask" || x.kind === "recur") continue;
    out.push({
      kind: x.kind === "period" ? "time" : x.kind,
      start: x.start,
      end: x.end,
    });
  }
  return out;
}
