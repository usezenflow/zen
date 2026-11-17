// Parts of the day and earliest start that a task's activity implies when its text names none. Pure.
// Lengths are not here: size.ts (lengthOf and the class table) decides them.
import { frameOf, type TaskClass } from "../frame";
import type { ReaderItem, ReaderWC, ReaderWindow } from "../shared";
import { stamp } from "./calendar";
import { fold } from "./fold";
import { afterCorrection } from "./mentions";

/** When in the day an activity of a class happens. A bare clock with dinner is PM: "ăn tối 8h" is 20:00. */
export const PARTS: Partial<Record<TaskClass, { windows: ReaderWindow[]; pm?: boolean }>> = {
  meal_breakfast: { windows: ["MORNING"] },
  meal_lunch: { windows: ["NOON"] },
  meal_dinner: { windows: ["EVENING"], pm: true },
  cafe: { windows: ["MORNING", "AFTERNOON", "EVENING"] },
};

const AFTER_LUNCH = /\bsau (?:bua|an) trua\b|\bafter lunch\b/;
const AFTER_DINNER = /\bsau (?:bua|an) toi\b|\bafter dinner\b/;
const BEFORE_BED = /\btruoc khi ngu\b|\bbefore bed\b/;
const FIRST_THING =
  /\bviec dau tien\b|\bfirst thing\b|\bngay khi thuc day\b|\bsau khi thuc day\b/;

const ANCHORS = [AFTER_LUNCH, AFTER_DINNER, BEFORE_BED, FIRST_THING];

/** The activity's parts of the day: its class's, the anchor words left out ("chạy bộ sau bữa tối" is a run). */
export const activityOf = (f: string) => {
  const core = ANCHORS.reduce((s, re) => s.replace(re, " "), f);
  const cls = frameOf(core).cls;
  return cls ? PARTS[cls] : undefined;
};

/** Whether the activity of a folded text is PM when its clock is bare: the one rule `nextClock` takes. */
export const activityPm = (folded: string) => !!activityOf(folded)?.pm;

/**
 * Fills a PLAN's or ASSIGNMENT's parts of the day and earliest start from the activity or an anchor
 * ("sau bữa trưa" is notBefore 13:00). Every filled field goes in `inferred`; the history prior runs after and wins.
 */
export function applyImplied(it: ReaderItem, ref: ReaderWC): void {
  if (it.type !== "PLAN" && it.type !== "ASSIGNMENT") return;
  const f = fold(it.evidence || it.title).text;
  // a correction replaces the words before its cue: "chạy bộ sau bữa trưa, à không sau bữa tối" is dinner
  const when = afterCorrection(f).trim() ? afterCorrection(f) : f;
  const mark = (key: string) => {
    if (!it.inferred.includes(key)) it.inferred.push(key);
  };
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
