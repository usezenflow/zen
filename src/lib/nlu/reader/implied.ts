// Length, parts of the day and earliest start that a task's activity implies when its text names none. Pure.
import type { ReaderItem, ReaderWC, ReaderWindow } from "../shared";
import { stamp } from "./calendar";
import { fold } from "./fold";
import { afterCorrection } from "./mentions";

interface Activity {
  /** Folded text the activity matches. */
  pattern: RegExp;
  minutes: number;
  windows?: ReaderWindow[];
  /** A bare clock with this activity is PM: "ăn tối 8h" is 20:00. */
  pm?: boolean;
}

/** First match wins. Only sizes a task whose text gives no length. */
export const ACTIVITIES: Activity[] = [
  {
    pattern: /\ban sang\b|\bbua sang\b|\bbreakfast\b/,
    minutes: 30,
    windows: ["MORNING"],
  },
  {
    pattern: /\ban trua\b|\bbua trua\b|\blunch\b/,
    minutes: 60,
    windows: ["NOON"],
  },
  {
    pattern: /\ban toi\b|\bbua toi\b|\bdinner\b/,
    minutes: 60,
    windows: ["EVENING"],
    pm: true,
  },
  {
    pattern: /\bcafe\b|\bca phe\b|\bcf\b|\bcoffee\b/,
    minutes: 60,
    windows: ["MORNING", "AFTERNOON", "EVENING"],
  },
  { pattern: /\bgym\b|\bchay bo\b/, minutes: 60 },
  { pattern: /\bgoi dien\b|\bcall\b/, minutes: 30 },
  { pattern: /\bdoc\b|\bread\b/, minutes: 60 },
  { pattern: /\bgiat do\b|\blaundry\b/, minutes: 60 },
  { pattern: /\bdon nha\b|\bclean\b/, minutes: 60 },
  // "mua hộp" folds to "mua hop": a box, not a meeting
  { pattern: /(?<!mua )\bhop\b|\bmeeting\b/, minutes: 60 },
];

/** Minutes per counted unit: "3 chương" is 3 hours, "5 bài" 2.5 hours, "10 trang" 50 minutes. */
const UNITS: [RegExp, number][] = [
  [/\b(\d+)\s*(?:chuong|chapters?)\b/g, 60],
  [/\b(\d+)\s*(?:bai|exercises?)\b/g, 30],
  [/\b(\d+)\s*(?:trang|pages?)\b/g, 5],
];

const AFTER_LUNCH = /\bsau (?:bua|an) trua\b|\bafter lunch\b/;
const AFTER_DINNER = /\bsau (?:bua|an) toi\b|\bafter dinner\b/;
const BEFORE_BED = /\btruoc khi ngu\b|\bbefore bed\b/;
const FIRST_THING =
  /\bviec dau tien\b|\bfirst thing\b|\bngay khi thuc day\b|\bsau khi thuc day\b/;

const ANCHORS = [AFTER_LUNCH, AFTER_DINNER, BEFORE_BED, FIRST_THING];

export const activityOf = (f: string) => {
  // an anchor names a time, not the activity: "chạy bộ sau bữa tối" is a run
  const core = ANCHORS.reduce((s, re) => s.replace(re, " "), f);
  return ACTIVITIES.find((a) => a.pattern.test(core));
};

/** Whether the activity of a folded text is PM when its clock is bare: the one rule `nextClock` takes. */
export const activityPm = (folded: string) => !!activityOf(folded)?.pm;

/**
 * Minutes a folded text implies: its counted units, rounded to the 30 minute grid and at least 30,
 * else its activity's length. Undefined when neither is named.
 */
export function impliedMinutes(folded: string): number | undefined {
  let total = 0;
  for (const [re, unit] of UNITS)
    for (const m of folded.matchAll(re)) total += +m[1] * unit;
  if (total) return Math.max(30, Math.round(total / 30) * 30);
  return activityOf(folded)?.minutes;
}

/**
 * Fills a PLAN's length from its count or activity, and its parts of the day and earliest start from
 * the activity or an anchor ("sau bữa trưa" is notBefore 13:00). `sized` is true when the workload
 * already sizes the item. Every filled field goes in `inferred`; the history prior runs after and wins.
 */
export function applyImplied(
  it: ReaderItem,
  ref: ReaderWC,
  sized: boolean,
): void {
  if (it.type !== "PLAN" && it.type !== "ASSIGNMENT") return;
  const f = fold(it.evidence || it.title).text;
  // a correction replaces the words before its cue: "chạy bộ sau bữa trưa, à không sau bữa tối" is dinner
  const when = afterCorrection(f).trim() ? afterCorrection(f) : f;
  const mark = (key: string) => {
    if (!it.inferred.includes(key)) it.inferred.push(key);
  };
  // a length the text typed stays; a free task with none, or an inferred one, takes the activity's
  const typed =
    it.durationMinutes !== undefined &&
    !it.inferred.includes("durationMinutes");
  if (it.type === "PLAN" && !sized && !typed) {
    const m = impliedMinutes(f);
    if (m !== undefined) {
      it.durationMinutes = m;
      mark("durationMinutes");
    }
  }
  if (!it.windows?.length && !it.startsAt) {
    const windows: ReaderWindow[] | undefined = FIRST_THING.test(when)
      ? ["EARLY_MORNING"]
      : BEFORE_BED.test(when)
        ? ["NIGHT"]
        : activityOf(f)?.windows;
    if (windows) {
      it.windows = windows;
      mark("windows");
    }
  }
  const anchor = AFTER_LUNCH.test(when)
    ? "13:00"
    : AFTER_DINNER.test(when)
      ? "19:30"
      : undefined;
  // a whole-day start ("cn này" is 00:00) narrows to the anchor
  if (
    anchor &&
    (!it.notBefore || it.notBefore.endsWith(" 00:00")) &&
    !it.startsAt
  ) {
    const day = it.deadline?.slice(0, 10) ?? stamp(ref, 0, 0).slice(0, 10);
    it.notBefore = `${day} ${anchor}`;
    mark("notBefore");
  }
}
