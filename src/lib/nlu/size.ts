// Minutes, sittings, due and recurrence of one task: what each class of work costs, scaled by its frame.
import { frameOf, type Frame, type Shape, type TaskClass, type Unit } from "./frame";
import { fold } from "./reader/fold";
import { classifyWorkload, detectArtifacts, type ReaderItemType, type WorkloadCategory } from "./shared";

const DAY = 86_400_000;
/** App time is fixed UTC+7 (see dlu/parse/time.ts). */
const VN = 7 * 3_600_000;
/** Most minutes a practice takes on any one day. */
const DAILY_CAP = 90;
/** Due days a plain task gets at most; a thesis gets 60. */
const DUE_CAP = 14;

export interface Size {
  shape: Shape;
  total: number;
  perSitting: number;
  sittings: number;
  dueInDays?: number;
  due?: number;
  rrule?: string;
  tight?: boolean;
}

/** base: minutes of one unit of work (a practice: one session); per: minutes per sitting; days: default due; freq: practice sessions a week;
 * micro: a 2-minute chore that is always 15 minutes (the one exception to the 30-minute steps). */
interface Row {
  shape: Shape;
  base: number;
  per: number;
  days?: number;
  freq?: number;
  micro?: boolean;
}

const T: Record<TaskClass, Row> = {
  code: { shape: "project", base: 180, per: 90, days: 7 },
  fix: { shape: "errand", base: 60, per: 0, days: 2 },
  review_code: { shape: "errand", base: 30, per: 0, days: 2 },
  write_doc: { shape: "project", base: 270, per: 90, days: 7 },
  essay: { shape: "project", base: 1200, per: 90, days: 14 },
  project: { shape: "project", base: 1800, per: 120, days: 14 },
  slides: { shape: "project", base: 90, per: 90, days: 5 },
  thesis: { shape: "project", base: 6000, per: 120, days: 60 },
  exam_review: { shape: "project", base: 180, per: 60, days: 10 },
  homework: { shape: "project", base: 90, per: 90, days: 3 },
  read: { shape: "project", base: 60, per: 60, days: 7 },
  language: { shape: "practice", base: 30, per: 30, freq: 5 },
  skill: { shape: "practice", base: 60, per: 60, freq: 3 },
  workout_gym: { shape: "practice", base: 60, per: 60, freq: 3 },
  workout_run: { shape: "practice", base: 30, per: 30, freq: 3 },
  workout_yoga: { shape: "practice", base: 30, per: 30, freq: 3 },
  workout_swim: { shape: "practice", base: 60, per: 60, freq: 2 },
  habit_read: { shape: "practice", base: 30, per: 30, freq: 7 },
  habit_meditate: { shape: "practice", base: 30, per: 30, freq: 7 },
  habit_journal: { shape: "practice", base: 30, per: 30, freq: 7 },
  clean: { shape: "errand", base: 60, per: 0, days: 3 },
  laundry: { shape: "errand", base: 60, per: 0, days: 3 },
  cook: { shape: "errand", base: 60, per: 0, days: 1 },
  shop: { shape: "errand", base: 60, per: 0, days: 3 },
  bill: { shape: "errand", base: 30, per: 0 },
  budget: { shape: "project", base: 60, per: 60, days: 7 },
  tax: { shape: "project", base: 180, per: 60, days: 7 },
  paperwork: { shape: "errand", base: 60, per: 0, days: 7 },
  call: { shape: "errand", base: 30, per: 0, days: 1 },
  email: { shape: "errand", base: 30, per: 0, days: 1 },
  meeting: { shape: "event", base: 60, per: 0 },
  appointment: { shape: "event", base: 120, per: 0 },
  content: { shape: "project", base: 120, per: 60, days: 5 },
  design: { shape: "project", base: 240, per: 120, days: 7 },
  sales: { shape: "errand", base: 60, per: 0, days: 3 },
  report: { shape: "project", base: 90, per: 90, days: 3 },
  plan: { shape: "project", base: 120, per: 60, days: 7 },
  interview: { shape: "event", base: 60, per: 0 },
  deploy: { shape: "errand", base: 60, per: 0, days: 2 },
  research: { shape: "project", base: 240, per: 120, days: 10 },
  spec: { shape: "project", base: 180, per: 90, days: 5 },
  presentation: { shape: "project", base: 120, per: 60, days: 5 },
  admin_work: { shape: "errand", base: 60, per: 0, days: 3 },
  pet: { shape: "errand", base: 15, per: 0, days: 1, micro: true },
  plants: { shape: "errand", base: 15, per: 0, days: 3, micro: true },
  trash: { shape: "errand", base: 15, per: 0, days: 1, micro: true },
  meds: { shape: "errand", base: 15, per: 0, days: 1, micro: true },
  pickup: { shape: "errand", base: 30, per: 0, days: 1 },
  repair: { shape: "errand", base: 60, per: 0, days: 7 },
  selfcare: { shape: "errand", base: 60, per: 0, days: 7 },
  // a meal or a coffee is a block of its own length, due whenever: no due day
  meal_breakfast: { shape: "errand", base: 30, per: 0 },
  meal_lunch: { shape: "errand", base: 60, per: 0 },
  meal_dinner: { shape: "errand", base: 60, per: 0 },
  cafe: { shape: "errand", base: 60, per: 0 },
};

/** Minutes of a kind the words do not size: a flexible task, an assignment, a fixed exam, lecture or meeting. */
const KIND: Partial<Record<ReaderItemType, number>> = { PLAN: 60, ASSIGNMENT: 270, EXAM: 120, LECTURE: 90, BUSY: 60 };
/**
 * Keyword rows for a plan or an assignment whose words name no class, first match wins (the old workload rules, same keywords):
 * an academic category, else a written report, a defense, a "đồ án", a "nộp/làm bài"; an assignment with none is 270.
 * A row gives a length and no due: a class's due would come with a class.
 */
const CATEGORY_MIN: Partial<Record<WorkloadCategory, number>> = {
  THESIS: 1800, FINAL_EXAM: 1200, MIDTERM: 600, INTERVIEW: 360, ESSAY: 1200, GROUP_WORK: 600, LAB: 240, ADMIN: 30,
};
function keywordMinutes(text: string): number | undefined {
  const art = detectArtifacts(text);
  const cat = classifyWorkload(text);
  if (art.slides && !art.report && cat === "REPORT") return 90;
  if (cat !== "REPORT") return CATEGORY_MIN[cat];
  if (art.report) return 270;
  if (art.defense) return 360;
  const f = fold(text).text;
  if (/\bdo an\b/.test(f)) return 240;
  if (/\b(?:nop|lam|viet|hoan thanh) bai(?: tap)?\b/.test(f)) return 120;
  return undefined;
}

/** Minutes per unit of a book: a chapter, a page, a book. */
const READ_RATE: Partial<Record<Unit, number>> = { chuong: 60, trang: 3, cuon: 360 };
/** Weekdays for a practice's sessions a week. */
const BYDAY: Record<number, string> = {
  1: "MO", 2: "TU,FR", 3: "MO,WE,FR", 4: "MO,TU,TH,FR", 5: "MO,TU,WE,TH,FR", 6: "MO,TU,WE,TH,FR,SA",
};

/** A guessed length is a half or whole hour (user rule: no odd 1h15p guesses); said lengths never come here. */
export const r30 = (x: number): number => Math.max(30, Math.round(x / 30) * 30);
const ymd = (ms: number): string => new Date(ms + VN).toISOString().slice(0, 10).replace(/-/g, "");

/** Whole days left in the VN month, the day itself included: at least 1. */
function billDays(now: number): number {
  const d = new Date(now + VN);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.max(1, last - d.getUTCDate());
}

export function sizeOf(
  f: Frame,
  o: { now: number; prep?: number; classMult?: number; spanEnd?: number; anchorDue?: number },
): Size {
  const cls = f.cls;
  const row: Row = cls && T[cls] ? T[cls] : { shape: "errand", base: 60, per: 0 }; // a class the table lacks (a stale heads.json) sizes as a plain errand
  const n = f.qty?.n ?? 0;
  const unit = f.qty?.unit;

  // a lab is a long homework: 4 h in sittings of 2 h (LAB size)
  const lab = cls === "homework" && !!f.lab;
  const per = lab ? 120 : row.per;
  let base = lab ? 240 : row.base;
  if (cls === "exam_review") base = f.stakes === "quiz" ? 120 : f.stakes === "mid" ? 360 : f.stakes === "final" ? 600 : 180;
  const rate = unit ? READ_RATE[unit] : undefined;
  if ((cls === "read" || cls === "habit_read") && rate !== undefined) base = rate * n;
  if (cls === "write_doc" && unit === "trang") base += 40 * n;
  if (cls === "slides" && unit === "slide") base += 5 * n;
  if (cls === "homework" && unit === "bai") base += 15 * n;

  let total = base * Math.max(1, f.objects.length) * (f.hard ? 1.5 : 1) * (f.group ? 0.6 : 1) + (f.group ? 60 : 0);
  if (f.domain === "study") total *= o.prep ?? 1;
  // shortcut: a micro chore ignores classMult; learning its guesses would only move it off 15 minutes
  total = row.micro ? row.base : r30(total * (o.classMult ?? 1));

  // A counted book or practice with a span: a daily rate that fills the span, capped per day.
  if (f.qty && o.spanEnd !== undefined && (row.shape === "practice" || cls === "read")) {
    const days = Math.max(1, Math.ceil((o.spanEnd - o.now) / DAY));
    const day = r30(total / days);
    return {
      shape: "practice",
      total,
      perSitting: Math.min(DAILY_CAP, day),
      sittings: days,
      rrule: `FREQ=DAILY;UNTIL=${ymd(o.spanEnd)}`,
      tight: day > DAILY_CAP,
    };
  }

  if (row.shape === "practice") {
    const freq = row.freq ?? 1;
    const by = freq >= 7 ? "FREQ=DAILY" : `FREQ=WEEKLY;BYDAY=${BYDAY[freq]}`;
    const until = o.spanEnd !== undefined ? `;UNTIL=${ymd(o.spanEnd)}` : "";
    return { shape: "practice", total, perSitting: total, sittings: 1, rrule: by + until };
  }
  if (row.shape === "event") return { shape: "event", total, perSitting: total, sittings: 1 };

  const project = row.shape === "project";
  const sittings = project ? Math.max(1, Math.ceil(total / per)) : 1;
  const dueInDays =
    cls === "bill" ? billDays(o.now) : row.days === undefined ? undefined : Math.min(row.days, cls === "thesis" ? 60 : DUE_CAP);
  const due = o.anchorDue ?? o.spanEnd ?? (dueInDays === undefined ? undefined : o.now + dueInDays * DAY);
  return { shape: row.shape, total, perSitting: project ? per : total, sittings, dueInDays, due };
}

/** A micro chore keeps its 15 minutes: the reader never rounds it up to 30. */
export const isMicro = (cls: string | undefined): boolean => !!cls && !!(T as Record<string, Row>)[cls]?.micro;

/**
 * The length of an item whose words did not say one, from its class (sized by sizeOf, first object only: the
 * rest of a long piece is not a second object) or else its kind's default. The one place that decides a guessed length.
 */
export function defaultMinutes(type: ReaderItemType, text: string, meeting = false): number {
  if (meeting || (type !== "PLAN" && type !== "ASSIGNMENT")) return KIND[meeting ? "BUSY" : type] ?? 60;
  const kw = keywordMinutes(text);
  if (kw !== undefined) return kw;
  // an assignment with no keyword is the report default; a plan with a class is sized by its class
  if (type === "ASSIGNMENT") return KIND.ASSIGNMENT ?? 270;
  const f = frameOf(text);
  if (!f.cls) return KIND.PLAN ?? 60;
  return sizeOf({ ...f, objects: f.objects.slice(0, 1) }, { now: 0 }).total;
}
