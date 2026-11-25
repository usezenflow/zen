import { expect, it, vi } from "vitest";
import { nudgesOf, overdue } from "./nudges";
import type { Task } from "./types";
vi.mock("expo-notifications", () => ({}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./store", () => ({}));
vi.mock("./apply", () => ({ apply: vi.fn(), moveToDay: vi.fn() }));

const now = Date.UTC(2026, 10, 13, 2); // 09:00 in Vietnam
const h = 3600_000;
const task = (id: string, start: number | undefined, more: Partial<Task> = {}): Task => ({ id, title: id, kind: "study", source: "user", effort: 30, start, end: start === undefined ? undefined : start + h, createdAt: 0, ...more });

it("a start nudge at the start and an overrun nudge at the end, soonest first; silence is never a miss", () => {
  const r = nudgesOf([task("a", now + h), task("b", now - h / 2)], now);
  expect(r.map((n) => `${n.id}:${n.kind}`)).toEqual(["b:over", "a:start", "a:over"]);
  expect(r[0].at).toBe(now + h / 2);
});

it("done, deleted, fixed and untimed tasks get no nudge", () => {
  const r = nudgesOf([
    task("done", now + h, { doneAt: now }),
    task("gone", now + h, { deletedAt: now }),
    task("class", now + h, { fixed: "lecture" }),
    task("untimed", undefined),
  ], now);
  expect(r).toEqual([]);
});

it("overdue: today's said or due blocks past the 15 min grace, earliest first; flexible blocks are no miss", () => {
  const r = overdue([
    task("due", now - 2 * h, { deadline: now - h }),
    task("flex", now - 2 * h), // placed by Zen, no due: its clock passing is no miss
    task("grace", now - h - 5 * 60_000, { deadline: now }),
    task("done", now - 2 * h, { doneAt: now, deadline: now - h }),
    task("class", now - 3 * h, { fixed: "lecture" }),
    task("yday", now - 30 * h, { deadline: now - 29 * h }),
  ], now);
  expect(r.map((x) => x.id)).toEqual(["class", "due"]);
});
