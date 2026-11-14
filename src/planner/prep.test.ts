import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { split } from "./split";
import { preps } from "./prep";

const exam = (over: Partial<Task> = {}): Task => ({
  id: "dlu:e", title: "Toán", kind: "study", source: "dlu", fixed: "exam", effort: 90, start: 1e12, end: 1e12 + 9e6, deadline: 1e12, createdAt: 0, ...over,
});

describe("preps", () => {
  it("gives 1 or 2 sittings of 45 min due at the exam", () => {
    for (const [weak, n] of [[0, 1], [0.4, 1], [0.5, 2], [1, 2]] as const) {
      const [p] = preps(exam(), weak);
      expect(p).toMatchObject({ title: "Ôn Toán", source: "user", forId: "dlu:e", deadline: 1e12, maxSitting: 45, effort: 45 * n });
      expect(split(p.effort, p.maxSitting)).toEqual(Array(n).fill(45));
    }
  });
  it("gives none for a report exam", () => {
    expect(preps(exam({ format: "Báo cáo(TL)" }), 0.5)).toEqual([]);
  });
});
