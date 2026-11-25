import { describe, expect, it } from "vitest";
import { rolledPick } from "./rolled";
import type { Task } from "./types";

const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "study", source: "user", effort: 60, createdAt: 0, ...o } as Task);

describe("rolledPick: a flexible task rolled five times, asked once", () => {
  it("picks a flexible task with five misses", () => {
    expect(rolledPick([task("a", { misses: 5 })])?.id).toBe("a");
  });
  it("not before the fifth miss", () => {
    expect(rolledPick([task("a", { misses: 4 })])).toBeUndefined();
  });
  it("never asked twice", () => {
    expect(rolledPick([task("a", { misses: 6, askedRolled: true })])).toBeUndefined();
  });
  it("skips fixed tasks, tasks with a deadline, done and deleted ones", () => {
    const rolled = { misses: 5 };
    expect(rolledPick([task("f", { ...rolled, fixed: "busy" })])).toBeUndefined();
    expect(rolledPick([task("d", { ...rolled, deadline: 1 })])).toBeUndefined();
    expect(rolledPick([task("o", { ...rolled, doneAt: 1 })])).toBeUndefined();
    expect(rolledPick([task("x", { ...rolled, deletedAt: 1 })])).toBeUndefined();
  });
  it("skips repeating tasks: a rule or a series id", () => {
    expect(rolledPick([task("r", { misses: 5, rrule: "FREQ=WEEKLY" })])).toBeUndefined();
    expect(rolledPick([task("s", { misses: 5, seriesId: "s1" })])).toBeUndefined();
  });
  it("skips sittings and a split parent, but not its unrelated neighbours", () => {
    const parent = task("p", { misses: 5 });
    const sitting = task("p#1", { misses: 5, parentId: "p" });
    expect(rolledPick([parent, sitting])).toBeUndefined();
    expect(rolledPick([task("n", { misses: 5 }), parent, sitting])?.id).toBe("n");
  });
});
