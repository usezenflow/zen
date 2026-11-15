// S3e recurrence: the RRULE base of a phrase the reader reads, and its COUNT and UNTIL bounds. Pure, on folded text.
import type { ReaderWC } from "../shared";
import { fold } from "./fold";

/**
 * "trừ thứ 4": a weekday a rule leaves out. "trừ các hôm có lịch học": a clause of days up to the next
 * comma, which names no day of its own.
 */
const EXCEPT =
  /(?<![a-z])(?:tru|except)\s+(?:(?:thu\s*[2-7]|t[2-7]|cn|chu nhat|mon|tue|wed|thu|fri|sat|sun)(?![a-z])(?:\s*(?:,|va|voi)\s*(?:thu\s*[2-7]|t[2-7]|cn|chu nhat)(?![a-z]))*|(?:cac\s+)?(?:hom|ngay|buoi)\b[^,;.!?\n]*)/g;

/** Raw spans of the "trừ thứ N" phrases, to blank before the mention pass. */
export function exceptSpans(raw: string): [number, number][] {
  const f = fold(raw);
  return [...f.text.matchAll(EXCEPT)].map((m) => {
    const s = m.index ?? 0;
    return [f.map[s], f.map[s + m[0].length - 1] + 1];
  });
}

/** BYDAY codes by JavaScript weekday, Sunday first. */
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const EN_DAYS: Record<string, string> = {
  mon: "MO",
  tue: "TU",
  wed: "WE",
  thu: "TH",
  fri: "FR",
  sat: "SA",
  sun: "SU",
};
/** Days a week for "n buổi một tuần", spread over the week. */
export const SPREAD: Record<number, string> = {
  1: "MO",
  2: "MO,TH",
  3: "MO,WE,FR",
  4: "MO,TU,TH,FR",
  5: "MO,TU,WE,TH,FR",
  6: "MO,TU,WE,TH,FR,SA",
  7: "SU,MO,TU,WE,TH,FR,SA",
};
const pad = (n: number) => String(n).padStart(2, "0");

const DAY_WORD = /(?<![a-z])(?:thu\s*([2-7])|t([2-7])|(cn|chu nhat))(?![a-z\d])/g;
/** JS weekdays named after "trừ", through a list joined by "và" or commas: "trừ thứ 7 và CN". */
function droppedDays(clause: string): Set<number> {
  const m = /(?<![a-z])(?:tru|except)\s+((?:(?:thu\s*[2-7]|t[2-7]|cn|chu nhat)(?:\s*(?:,|va|voi)\s*)?)+)/.exec(clause);
  return new Set(m ? [...m[1].matchAll(DAY_WORD)].map((d) => (d[3] ? 0 : Number(d[1] ?? d[2]) - 1)) : []);
}

/**
 * The base RRULE of a phrase, for a folded text with a recurrence cue. Undefined when the phrase
 * names no rule this module reads: the caller keeps its own rule (a weekday list, "hàng tuần" with a weekday).
 */
export function ruleBase(f: string, clause: string = f): string | undefined {
  // weekdays, minus a named day: "ngày thường", "ngày trong tuần trừ thứ 4"
  if (
    /(?<![a-z])(?:ngay thuong|ngay trong tuan|weekdays?|thu 2 den thu 6|t2 ?- ?t6|t2 den t6)(?![a-z])/.test(
      f,
    )
  ) {
    const drop = /tru (?:thu 4|t4)|except wed/.test(clause);
    return `FREQ=WEEKLY;BYDAY=${["MO", "TU", "WE", "TH", "FR"].filter((d) => !(drop && d === "WE")).join(",")}`;
  }
  // "mỗi ngày trừ chủ nhật", "hằng ngày trừ thứ 7 và CN": a daily rule limited to the days left
  if (/(?<![a-z])(?:moi|hang) (?:ngay|sang|trua|chieu|toi|dem|khuya)(?![a-z])(?! trong tuan)/.test(f)) {
    const out = droppedDays(clause);
    if (out.size) return `FREQ=DAILY;BYDAY=${[1, 2, 3, 4, 5, 6, 0].filter((d) => !out.has(d)).map((d) => DAYS[d]).join(",")}`;
  }
  if (
    /(?<![a-z])(?:moi|hang) cuoi tuan(?![a-z])|weekends?|(?<![a-z])(?:thu ?7|t7) (?:va )?(?:cn|chu nhat)(?![a-z])/.test(
      f,
    )
  )
    return "FREQ=WEEKLY;BYDAY=SA,SU";
  // English weekdays: "every Mon and Thu"
  const en =
    /(?<![a-z])every ((?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)(?:\s*(?:,|and|&)\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)*)(?![a-z])/.exec(
      f,
    );
  if (en) {
    const codes = [...en[1].matchAll(/mon|tue|wed|thu|fri|sat|sun/g)].map(
      (x) => EN_DAYS[x[0]],
    );
    return `FREQ=WEEKLY;BYDAY=${codes.join(",")}`;
  }
  // every other week, or every n weeks
  const iv =
    /(?<![a-z\d])(\d{1,2}) tuan 1 lan(?![a-z])|(?<![a-z])moi (\d{1,2}) tuan(?![a-z])/.exec(
      f,
    );
  if (iv || /cach tuan|every other week/.test(f))
    return `FREQ=WEEKLY;INTERVAL=${iv ? +(iv[1] ?? iv[2]) : 2}`;
  // n a week: "3 buổi một tuần", "3 lần/tuần", "1 tuần 3 buổi"
  // "3 buổi trong 4 tuần": the weeks are the span, the days the rule
  const per =
    /(?<![a-z\d])(\d) (?:buoi|lan)\s*(?:\/|mot|moi)?\s*tuan(?![a-z])|(?<![a-z\d])1 tuan (\d) buoi(?![a-z])/.exec(
      f.replace(/(?<![a-z])trong \d{1,2} tuan(?![a-z])/, "tuan"),
    );
  if (per)
    return `FREQ=WEEKLY;BYDAY=${SPREAD[+(per[1] ?? per[2])] ?? SPREAD[5]}`;
  if (/(?<![a-z])(?:moi|hang) tuan(?![a-z])/.test(f)) return "FREQ=WEEKLY";
  // every n months: "mỗi 2 tháng", "cách tháng"
  const months = /(?<![a-z])moi (\d{1,2}) thang(?![a-z])/.exec(f);
  if (months || /(?<![a-z])cach thang(?![a-z])/.test(f)) return `FREQ=MONTHLY;INTERVAL=${months ? +months[1] : 2}`;
  // yearly on the day and month named beside it
  if (/(?<![a-z])(?:moi|hang) nam(?![a-z])|every year/.test(f)) {
    const d = /(\d{1,2})[/.](\d{1,2})/.exec(f);
    return d
      ? `FREQ=YEARLY;BYMONTH=${+d[2]};BYMONTHDAY=${+d[1]}`
      : "FREQ=YEARLY";
  }
  if (
    /(?<![a-z])(?:moi|hang) cuoi thang(?![a-z])|ngay cuoi (?:moi )?thang/.test(
      f,
    )
  )
    return "FREQ=MONTHLY;BYMONTHDAY=-1";
  // the first or last weekday of the month: "thứ 2 đầu tiên mỗi tháng", "thứ 6 cuối cùng của tháng"
  const nth =
    /(?<![a-z])(?:thu ([2-7])|t([2-7])|(cn|chu nhat)) (dau tien|cuoi cung) (?:moi |hang |cua )?thang(?![a-z])/.exec(
      f,
    );
  if (nth) {
    const code = nth[3] ? "SU" : DAYS[+(nth[1] ?? nth[2]) - 1];
    return `FREQ=MONTHLY;BYDAY=${code};BYSETPOS=${nth[4] === "dau tien" ? 1 : -1}`;
  }
  // every n hours, bounded to the waking day 7-22
  const hr =
    /(?<![a-z\d])(?:moi|every) (\d{1,2}) (?:tieng|hours?)(?![a-z])/.exec(f);
  if (hr) {
    const hours = Array.from({ length: 16 }, (_, i) => i + 7).join(",");
    return `FREQ=HOURLY;INTERVAL=${+hr[1]};BYHOUR=${hours}`;
  }
  if (/(?<![a-z])(?:every day|daily)(?![a-z])/.test(f)) return "FREQ=DAILY";
  return undefined;
}

/**
 * Adds the COUNT and UNTIL bounds to a rule. COUNT is "10 buổi", or the occurrences of "trong 4 tuần":
 * the weeks times the days of a week, over the interval. UNTIL is the day a series stops, end of day.
 */
export function withBounds(rule: string, f: string, until?: ReaderWC): string {
  const parts = [rule];
  const count =
    /(?<![\d/.a-z])(?<!tuan )(?<!ngay )(\d{1,2}) (?:buoi|lan)(?![a-z])(?! (?:sang|trua|chieu|toi|dem)(?![a-z]))(?!\s*(?:\/|mot |moi )?\s*tuan)(?!\s+trong\s+\d{1,2}\s+tuan)/.exec(
      f,
    );
  const weeks = /(?<![a-z\d])trong (\d{1,2}) tuan(?![a-z])/.exec(f);
  if (count) parts.push(`COUNT=${+count[1]}`);
  else if (weeks && !until) {
    const days =
      /BYDAY=([A-Z,]+)/.exec(rule)?.[1].split(",").length ??
      (rule.includes("FREQ=DAILY") ? 7 : 1);
    const every = +(/INTERVAL=(\d+)/.exec(rule)?.[1] ?? 1);
    parts.push(`COUNT=${days * Math.ceil(+weeks[1] / every)}`);
  }
  if (until)
    parts.push(`UNTIL=${until.y}${pad(until.m)}${pad(until.d)}T235959`);
  return parts.join(";");
}
