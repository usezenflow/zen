import type { Task } from "../lib/types";
import { frameOf } from "../lib/nlu/frame";
import { sizeOf } from "../lib/nlu/size";

export const PREP_SITTING = 60; // minutes: the planner splits a prep into sittings of at most an hour, in half hours

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// What to do for each exam format and its minutes for an average student; first match wins, so "Báo cáo(TL)" is a report.
const FORMATS: [RegExp, string, number][] = [
  [/bao cao/, "Viết báo cáo", 180],
  [/tieu luan/, "Viết tiểu luận", 180],
  [/thuc hanh|thi may/, "Luyện thực hành", 120],
  [/van dap/, "Luyện vấn đáp", 120],
  [/tu luan/, "Ôn lý thuyết, luyện đề", 120],
];

/** What a text asks for (an exam format, or an assignment's title and content) and its minutes in half hours. `mult` (0.75 to 1.6, from the marks) scales the length. */
export function workOf(text: string, mult = 1): { title: string; effort: number } {
  const f = fold(text);
  const [, title, base] = FORMATS.find(([re]) => re.test(f)) ?? [null, "Ôn thi", 120];
  return { title, effort: Math.max(1, Math.round((base * clamp(mult, 0.75, 1.6)) / 30)) * 30 };
}

/** A report or essay format is written, so sized as a report; any other exam is reviewed, as the exam_review row. */
const prepClass = (exam: Task) => (/bao cao|tieu luan/.test(fold(exam.format ?? "")) ? "write_doc" : "exam_review");

/** Minutes of an exam's prep: marks (`mult`), credits, retake, and the learned `pace` of its class; the planner's half hours. */
function prepEffort(exam: Task, mult: number, pace: number): number {
  // shortcut: a plain "Thi …" exam row is a final; no credits or retake, Task carries neither
  const stakes = frameOf(exam.title).stakes ?? (/^thi\b/.test(fold(exam.title)) ? "final" : undefined);
  const credits = exam.credits && exam.credits > 0 ? clamp(exam.credits / 3, 0.67, 1.67) : 1; // 2 to 5 credits
  const retake = exam.retake ? 1.3 : 1;
  const classMult = clamp(mult, 0.75, 1.6) * credits * retake * clamp(pace, 0.7, 1.5);
  return sizeOf({ objects: [], group: false, hard: false, cls: prepClass(exam), stakes }, { now: 0, classMult }).total;
}

/**
 * The user's own plan item (source "user"; UI tells a prep by `forId`, not by deadline). One task due at the exam start; the planner splits it into sittings.
 * The title says what to do for the exam format and never names the subject, which is in `course`.
 * `pace`: the learned multiplier per class (loadClassMult). `guessMin` is the length before it, as a done task's minutes are measured against.
 * shortcut: effortGuessed stays off, a guessed prep would shrink to fit its exam window (policy.ts); so the class learns nothing yet.
 */
export function preps(exam: Task, mult = 1, pace: Record<string, number> = {}): Task[] {
  const due = exam.start ?? exam.deadline;
  if (due === undefined) return [];
  const cls = prepClass(exam);
  return [{
    id: `prep:${exam.id}`, title: workOf(exam.format ?? "").title, effort: prepEffort(exam, mult, pace[cls] ?? 1), course: exam.title, kind: "study", source: "user", forId: exam.id,
    maxSitting: PREP_SITTING, deadline: due, createdAt: exam.createdAt, cls, guessMin: prepEffort(exam, mult, 1),
  }];
}
