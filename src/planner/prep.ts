import type { Task } from "../lib/types";

export const PREP_SITTING = 30; // minutes

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** One task of `2 + round(weak)` sittings of 30 min due at the exam start; the planner splits it. None for a report exam. */
export function preps(exam: Task, weak: number): Task[] {
  const due = exam.start ?? exam.deadline;
  if (due === undefined || fold(exam.format ?? "").includes("bao cao")) return [];
  const n = 2 + Math.round(Math.min(1, Math.max(0, weak)));
  return [{
    id: `prep:${exam.id}`, title: `Review ${exam.title}`, kind: "study", source: "dlu",
    effort: n * PREP_SITTING, maxSitting: PREP_SITTING, deadline: due, createdAt: exam.createdAt,
  }];
}
