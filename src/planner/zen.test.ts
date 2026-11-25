import { describe, expect, it } from "vitest";
import type { Task, TaskEvent } from "../lib/types";
import { ZEN_RULES, zenWeights, type ZenMode, type ZenRule } from "./zen";

const MIN = 60_000;
const now = new Date(2026, 10, 25, 12, 0).getTime();
const all = (mode: ZenMode): Record<ZenRule, ZenMode> => ({ rest: mode, early: mode, night: mode, balance: mode });
const auto = all("auto");

// Planned one hour at `hour` on an October day; `done` ticks it (doneAt plus a done event).
function history(n: number, hour: number, doneCount: number, offset: number): { tasks: Task[]; events: TaskEvent[] } {
  const tasks: Task[] = [], events: TaskEvent[] = [];
  for (let i = 0; i < n; i++) {
    const start = new Date(2026, 9, 1 + ((i + offset) % 20), hour).getTime();
    const id = `${hour}-${offset}-${i}`;
    const done = i < doneCount;
    tasks.push({ id, title: "Học bài", kind: "study", source: "user", effort: 60, createdAt: start - 1, start, end: start + 60 * MIN, doneAt: done ? start + 60 * MIN : undefined });
    if (done) events.push({ id: `e${id}`, taskId: id, type: "done", at: start + 60 * MIN });
  }
  return { tasks, events };
}

describe("zenWeights", () => {
  it("is 0 on neutral history (same completion day and night)", () => {
    const a = history(20, 10, 10, 0), b = history(20, 23, 10, 5);
    const w = zenWeights([...a.tasks, ...b.tasks], [...a.events, ...b.events], now, auto);
    expect(w.night).toBe(0);
  });

  it("is 0 for a night owl whose night work completes as well as daytime work", () => {
    const a = history(20, 10, 10, 0), b = history(20, 23, 20, 5);
    const w = zenWeights([...a.tasks, ...b.tasks], [...a.events, ...b.events], now, auto);
    expect(w.night).toBe(0);
  });

  it("is above 0 when night completion drops", () => {
    const a = history(20, 10, 20, 0), b = history(20, 23, 5, 5);
    const w = zenWeights([...a.tasks, ...b.tasks], [...a.events, ...b.events], now, auto);
    expect(w.night).toBeGreaterThan(0);
    expect(w.night).toBeLessThanOrEqual(1.5);
  });

  it("is 0 with no history", () => {
    expect(zenWeights([], [], now, auto)).toEqual({ rest: 0, early: 0, night: 0, balance: 0 });
  });

  it("strict gives 2.5 and off gives 0", () => {
    const a = history(20, 10, 20, 0), b = history(20, 23, 5, 5);
    const tasks = [...a.tasks, ...b.tasks], events = [...a.events, ...b.events];
    for (const r of ZEN_RULES) {
      expect(zenWeights(tasks, events, now, all("strict"))[r]).toBe(2.5);
      expect(zenWeights(tasks, events, now, all("off"))[r]).toBe(0);
    }
  });
});
