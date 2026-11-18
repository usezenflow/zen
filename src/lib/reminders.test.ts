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

it("skips a reminder whose fire time is within 15 min after an open; an older open does not", () => {
  const fire = now + 3600_000 - 10 * 60_000;
  expect(upcoming([task("a", now + 3600_000)], now, [fire - 5 * 60_000]).map((x) => x.id)).toEqual([]);
  expect(upcoming([task("a", now + 3600_000)], now, [fire - 20 * 60_000]).map((x) => x.id)).toEqual(["a"]);
  // an exam, a pinned task or a said clock rings anyway: an open is no proof the user will be there on time
  const said = [task("ex", now + 3600_000, { fixed: "exam", source: "dlu" }), task("pin", now + 3600_000, { pinned: true }), task("set", now + 3600_000, { userEdited: ["start"] })];
  expect(upcoming(said, now, [fire - 5 * 60_000]).map((x) => x.id)).toEqual(["ex", "pin", "set"]);
});

it("a flexible task reminds at the learned lead once 5 done tasks show it; a fixed lecture keeps 10 min", () => {
  const h = 3600_000;
  const past = [1, 2, 3, 4, 5].map((i) => now - i * h);
  const done = past.map((s, i) => task("d" + i, s, { doneAt: s + 60_000 }));
  const opens = past.map((s) => s - 5 * 60_000);
  const r = upcoming([...done, task("flex", now + 3 * h), task("lec", now + 2 * h, { fixed: "lecture", source: "dlu" })], now, opens);
  expect(r.find((x) => x.id === "flex")!.at).toBe(now + 3 * h - 5 * 60_000);
  expect(r.find((x) => x.id === "lec")!.at).toBe(now + 2 * h - 10 * 60_000);
});

it("with fewer than 5 done tasks showing a lead, a flexible task keeps 10 min", () => {
  const h = 3600_000;
  const past = [1, 2, 3, 4].map((i) => now - i * h);
  const done = past.map((s, i) => task("d" + i, s, { doneAt: s + 60_000 }));
  const r = upcoming([...done, task("flex", now + 3 * h)], now, past.map((s) => s - 5 * 60_000));
  expect(r.find((x) => x.id === "flex")!.at).toBe(now + 3 * h - 10 * 60_000);
});

it("an assignment block names its due date across weeks, the same as the card", () => {
  const r = upcoming([task("essay", Date.UTC(2026, 10, 16, 2), { deadline: Date.UTC(2026, 10, 23, 16, 59) })], now);
  expect(r[0].body).toBe("Bắt đầu lúc 9:00 · Hạn T2 23/11 23:59");
});
