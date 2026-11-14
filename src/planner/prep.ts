import type { Task } from "../lib/types";

export const PREP_SITTING = 45; // minutes

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** The user's own plan item (source "user"; UI tells a prep by `forId`, not by deadline). Internally one task of `1 + round(weak)` sittings of 45 min due at the exam start; the planner splits it. None for a report exam. */
export function preps(exam: Task, weak: number): Task[] {
  const due = exam.start ?? exam.deadline;
  if (due === undefined || fold(exam.format ?? "").includes("bao cao")) return [];
  const n = 1 + Math.round(Math.min(1, Math.max(0, weak)));
  return [{
    id: `prep:${exam.id}`, title: `Ôn ${exam.title}`, kind: "study", source: "user", forId: exam.id,
    effort: n * PREP_SITTING, maxSitting: PREP_SITTING, deadline: due, createdAt: exam.createdAt,
  }];
}
