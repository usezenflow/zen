import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { split } from "./split";
import { preps } from "./prep";

const exam = (over: Partial<Task> = {}): Task => ({
  id: "dlu:e", title: "Toán", kind: "study", source: "dlu", fixed: "exam", effort: 90, start: 1e12, end: 1e12 + 9e6, deadline: 1e12, createdAt: 0, ...over,
});

describe("preps", () => {
  it("gives 2 or 3 sittings of 30 min due at the exam", () => {
    for (const [weak, n] of [[0, 2], [0.4, 2], [0.5, 3], [1, 3]] as const) {
      const [p] = preps(exam(), weak);
      expect(p).toMatchObject({ title: "Review Toán", deadline: 1e12, maxSitting: 30, effort: 30 * n });
      expect(split(p.effort, p.maxSitting)).toEqual(Array(n).fill(30));
    }
  });
  it("gives none for a report exam", () => {
    expect(preps(exam({ format: "Báo cáo(TL)" }), 0.5)).toEqual([]);
  });
});
