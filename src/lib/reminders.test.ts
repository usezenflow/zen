import { describe, expect, it, vi } from "vitest";
const n = vi.hoisted(() => ({ cat: vi.fn(async () => {}), schedule: vi.fn(async () => {}) }));
vi.mock("expo-notifications", () => ({
  AndroidImportance: {}, SchedulableTriggerInputTypes: { DATE: "date" },
  getPermissionsAsync: async () => ({ granted: true }), getAllScheduledNotificationsAsync: async () => [],
  setNotificationCategoryAsync: n.cat, scheduleNotificationAsync: n.schedule,
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./store", () => ({}));
import { dealOf, pushDeal, upcoming } from "./reminders";
import { t } from "./i18n";
import type { Task } from "./types";

const now = Date.UTC(2026, 10, 13, 2); // 09:00 in Vietnam
const task = (id: string, start: number | undefined, more: Partial<Task> = {}): Task => ({ id, title: id, kind: "study", source: "user", effort: 30, start, createdAt: 0, ...more });

it("reminds said or due timed tasks 10 min ahead, soonest first", () => {
  const h = 3600_000;
  const r = upcoming([
    task("b", now + 3 * h, { location: "A1.2", userEdited: ["start"] }), // a clock the user set
    task("a", now + h, { pinned: true }),
    task("done", now + h, { doneAt: now }),
    task("busy", now + h, { fixed: "busy", source: "dlu" }),
    task("mine", now + 2 * h, { fixed: "busy" }), // the user's own busy block
    task("soon", now + 5 * 60_000),
    task("untimed", undefined),
    task("plain", now + 4 * h), // flexible, no due: no reminder
    task("c", now + 4 * h, { deadline: now + 2 * 24 * h + 13 * h }), // due far past 12 h: no reminder either
  ], now);
  expect(r.map((x) => x.id)).toEqual(["a", "mine", "b"]);
  expect(r[0].at).toBe(now + h - 10 * 60_000);
  expect(r[2].body).toBe("Bắt đầu lúc 12:00 · A1.2");
});

it("a flexible block reminds only when its due is within 12 h of its start", () => {
  const h = 3600_000;
  const r = upcoming([task("near", now + 2 * h, { deadline: now + 2 * h + 11 * h }), task("far", now + 2 * h, { deadline: now + 2 * h + 13 * h })], now);
  expect(r.map((x) => x.id)).toEqual(["near"]);
});

it("skips a reminder whose fire time is within 15 min after an open; an older open does not", () => {
  const fire = now + 3600_000 - 10 * 60_000;
  const flex = task("a", now + 3600_000, { deadline: now + 2 * 3600_000 });
  expect(upcoming([flex], now, [fire - 5 * 60_000]).map((x) => x.id)).toEqual([]);
  expect(upcoming([flex], now, [fire - 20 * 60_000]).map((x) => x.id)).toEqual(["a"]);
  // an exam, a pinned task or a said clock rings anyway: an open is no proof the user will be there on time
  const said = [task("ex", now + 3600_000, { fixed: "exam", source: "dlu" }), task("pin", now + 3600_000, { pinned: true }), task("set", now + 3600_000, { userEdited: ["start"] })];
  expect(upcoming(said, now, [fire - 5 * 60_000]).map((x) => x.id)).toEqual(["ex", "pin", "set"]);
});

it("a flexible task reminds at the learned lead once 5 done tasks show it; a fixed lecture keeps 10 min", () => {
  const h = 3600_000;
  const past = [1, 2, 3, 4, 5].map((i) => now - i * h);
  const done = past.map((s, i) => task("d" + i, s, { doneAt: s + 60_000 }));
  const opens = past.map((s) => s - 5 * 60_000);
  const r = upcoming([...done, task("flex", now + 3 * h, { deadline: now + 4 * h }), task("lec", now + 2 * h, { fixed: "lecture", source: "dlu" })], now, opens);
  expect(r.find((x) => x.id === "flex")!.at).toBe(now + 3 * h - 5 * 60_000);
  expect(r.find((x) => x.id === "lec")!.at).toBe(now + 2 * h - 10 * 60_000);
});

it("with fewer than 5 done tasks showing a lead, a flexible task keeps 10 min", () => {
  const h = 3600_000;
  const past = [1, 2, 3, 4].map((i) => now - i * h);
  const done = past.map((s, i) => task("d" + i, s, { doneAt: s + 60_000 }));
  const r = upcoming([...done, task("flex", now + 3 * h, { deadline: now + 4 * h })], now, past.map((s) => s - 5 * 60_000));
  expect(r.find((x) => x.id === "flex")!.at).toBe(now + 3 * h - 10 * 60_000);
});

it("an assignment block names its due date across weeks, the same as the card", () => {
  const r = upcoming([task("essay", Date.UTC(2026, 10, 16, 2), { deadline: Date.UTC(2026, 10, 23, 16, 59), userEdited: ["start"] })], now);
  expect(r[0].body).toBe("Bắt đầu lúc 9:00 · Hạn T2 23/11 23:59");
});

describe("night-before note", () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, 13 + d, h, m).getTime();
  const plan = (id: string, start: number, more: Partial<Task> = {}) => task(id, start, { effort: 60, ...more });
  it("fires at the next 21:30 and names the day after it: count, total effort, and the near deadlines", () => {
    const tmr = at(1, 10);
    const d = dealOf([plan("a", tmr), plan("b", at(1, 15), { effort: 90, deadline: at(1, 20) }), plan("c", at(2, 9))], at(0, 20));
    expect(d).toEqual({ at: at(0, 21, 30), title: "Mai: 2 việc, 2h30", body: "1 việc gần hạn. Chạm để xem hoặc xếp nhẹ lại." });
  });
  it("after 21:30 the note is for the next evening, about the day after tomorrow", () => {
    const d = dealOf([plan("a", at(2, 10))], at(0, 22));
    expect(d).toEqual({ at: at(1, 21, 30), title: "Mai: 1 việc, 1h", body: undefined });
  });
  it("omits the body when no task is due within 48 h, and skips an empty tomorrow", () => {
    expect(dealOf([plan("a", at(1, 10), { deadline: at(4, 10) })], at(0, 20))?.body).toBeUndefined();
    expect(dealOf([plan("a", at(0, 10)), plan("b", at(2, 10))], at(0, 20))).toBeUndefined();
  });
  it("the note schedules under deal:tomorrow with the zen-deal category: see tomorrow, or a light re-plan", async () => {
    await pushDeal([plan("a", at(1, 10))], at(0, 20));
    expect(n.cat).toHaveBeenCalledWith("zen-deal", [expect.objectContaining({ identifier: "see", buttonTitle: t("dealSee") }), expect.objectContaining({ identifier: "light", buttonTitle: t("dealLight") })]);
    expect(n.schedule).toHaveBeenCalledWith(expect.objectContaining({ identifier: "deal:tomorrow", content: expect.objectContaining({ categoryIdentifier: "zen-deal" }) }));
  });
  it("counts only open, placed, non-deleted work, and a busy block only when the user made it", () => {
    const tmr = at(1, 10);
    const d = dealOf([plan("done", tmr, { doneAt: 1 }), plan("gone", tmr, { deletedAt: 1 }), plan("dlu", tmr, { fixed: "busy", source: "dlu" }), plan("mine", tmr, { fixed: "busy", effort: 30 })], at(0, 20));
    expect(d?.title).toBe("Mai: 1 việc, 30p");
  });
});
