import type { Task } from "../lib/types";

export const PREP_SITTING = 45; // minutes

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

// What to do for each exam format and its minutes for an average student; first match wins, so "Báo cáo(TL)" is a report.
const FORMATS: [RegExp, string, number][] = [
  [/bao cao/, "Viết báo cáo", 180],
  [/tieu luan/, "Viết tiểu luận", 180],
  [/thuc hanh|thi may/, "Luyện thực hành", 120],
  [/van dap/, "Luyện vấn đáp", 120],
  [/tu luan/, "Ôn lý thuyết, luyện đề", 120],
];

/** What a text asks for (an exam format, or an assignment's title and content) and its minutes in 45 min sittings. `mult` (0.75 to 1.6, from the marks) scales the length. */
export function workOf(text: string, mult = 1): { title: string; effort: number } {
  const f = fold(text);
  const [, title, base] = FORMATS.find(([re]) => re.test(f)) ?? [null, "Ôn thi", 120];
  return { title, effort: Math.max(1, Math.round((base * Math.min(1.6, Math.max(0.75, mult))) / PREP_SITTING)) * PREP_SITTING };
}

/**
 * The user's own plan item (source "user"; UI tells a prep by `forId`, not by deadline). One task due at the exam start; the planner splits it into sittings.
 * The title says what to do for the exam format and never names the subject, which is in `course`.
 */
export function preps(exam: Task, mult = 1): Task[] {
  const due = exam.start ?? exam.deadline;
  if (due === undefined) return [];
  return [{
    id: `prep:${exam.id}`, ...workOf(exam.format ?? "", mult), course: exam.title, kind: "study", source: "user", forId: exam.id,
    maxSitting: PREP_SITTING, deadline: due, createdAt: exam.createdAt,
  }];
}
