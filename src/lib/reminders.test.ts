import { expect, it, vi } from "vitest";
vi.mock("expo-notifications", () => ({}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./store", () => ({}));
import { upcoming } from "./reminders";
import type { Task } from "./types";

const now = Date.UTC(2026, 10, 13, 2); // 09:00 in Vietnam
const task = (id: string, start: number | undefined, more: Partial<Task> = {}): Task => ({ id, title: id, kind: "study", source: "user", effort: 30, start, createdAt: 0, ...more });

it("reminds open timed tasks 10 min ahead, soonest first", () => {
  const h = 3600_000;
  const r = upcoming([
    task("b", now + 3 * h, { location: "A1.2" }),
    task("a", now + h),
    task("done", now + h, { doneAt: now }),
    task("busy", now + h, { fixed: "busy", source: "dlu" }),
    task("mine", now + 2 * h, { fixed: "busy" }), // the user's own busy block
    task("soon", now + 5 * 60_000),
    task("untimed", undefined),
    task("c", now + 4 * h, { deadline: now + 2 * 24 * h + 13 * h }),
  ], now);
  expect(r.map((x) => x.id)).toEqual(["a", "mine", "b", "c"]);
  expect(r[0].at).toBe(now + h - 10 * 60_000);
  expect(r[2].body).toBe("Bắt đầu lúc 12:00 · A1.2");
  expect(r[3].body).toBe("Bắt đầu lúc 13:00 · Hạn CN 22:00"); // an assignment block names its deadline
});

it("an assignment block names its due date across weeks, the same as the card", () => {
  const r = upcoming([task("essay", Date.UTC(2026, 10, 16, 2), { deadline: Date.UTC(2026, 10, 23, 16, 59) })], now);
  expect(r[0].body).toBe("Bắt đầu lúc 9:00 · Hạn T2 23/11 23:59");
});
