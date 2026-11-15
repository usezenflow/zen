import { describe, expect, it } from "vitest";
import { addDays, onDay, shown, startOfDay } from "./cal";
import type { Task } from "../lib/types";

const day0 = startOfDay(Date.now());
const task = (id: string, start: number, mins: number, extra: Partial<Task> = {}): Task =>
  ({ id, title: id, kind: "other", source: "user", effort: mins, start, end: start + mins * 60_000, createdAt: 0, ...extra }) as Task;

describe("shown / onDay", () => {
  it("hides a split parent, shows its sittings, spans a multi-day block", () => {
    const all = [
      task("p", day0 + 9 * 3600_000, 120),
      task("s1", day0 + 9 * 3600_000, 60, { parentId: "p" }),
      task("trip", day0 + 23 * 3600_000, 26 * 60),
    ];
    expect(shown(all).map((x) => x.id)).toEqual(["s1", "trip"]);
    expect(onDay(all, addDays(day0, 1)).map((x) => x.id)).toEqual(["trip"]);
  });

  it.skipIf(!!process.env.CI)("a month grid over a full term stays fast", () => {
    const all = Array.from({ length: 1500 }, (_, i) => task(`t${i}`, addDays(day0, i % 120) + 8 * 3600_000, 90, i % 10 ? {} : { parentId: `t${i + 1}` }));
    const t0 = performance.now();
    for (let i = 0; i < 42; i++) onDay(all, addDays(day0, i));
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
