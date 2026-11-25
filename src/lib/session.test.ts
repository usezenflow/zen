import { beforeEach, describe, expect, it, vi } from "vitest";
import { apply, scopeIds } from "./apply";
import { commandOf } from "./nlu/intent";
import { think } from "./nlu/commands";
import { newModel } from "../planner";
import type { Task } from "./types";

const db = vi.hoisted(() => ({ tasks: new Map<string, any>(), kv: new Map<string, string>() }));
vi.mock("./store", () => ({
  allTasks: async () => [...db.tasks.values()],
  putTasks: async (ts: Task[]) => ts.forEach((x) => db.tasks.set(x.id, x)),
  removeTasks: async (ids: string[]) => ids.forEach((i) => db.tasks.delete(i)),
  allEvents: async () => [],
  putEvent: async () => {},
  removeEvents: async () => {},
  loadModel: async (now: number) => newModel(now),
  saveModel: async () => {},
  kvGet: async (k: string) => db.kv.get(k) ?? null,
  kvSet: async (k: string, v: string) => void db.kv.set(k, v),
}));

const now = new Date("2026-11-13T03:00:00Z"); // 10:00 Fri, UTC+7
const day = (d: number, h: number) => Date.UTC(2026, 10, d, h - 7);
const member = (id: string, start: number, extra: Partial<Task> = {}): Task =>
  ({ id, title: "Gym", start, end: start + 3600_000, effort: 60, kind: "other", createdAt: 0, source: "user", rrule: "FREQ=WEEKLY;BYDAY=MO,WE", seriesId: "s1", tods: [[1080, 1200]], ...extra }) as unknown as Task;
const series = [member("gym1", day(16, 18)), member("gym2", day(18, 18))];
const other = (id: string, title: string) => member(id, day(16, 9), { title, seriesId: id, rrule: "FREQ=WEEKLY;BYDAY=TU" });

describe("session intent", () => {
  it("one-off: a create with the series' title, length, tods and seriesId, and no rule", () => {
    const cmd = commandOf("thêm 1 buổi gym T7 này", now.getTime(), series);
    expect(cmd).toMatchObject({ kind: "session", title: "Gym", weekly: false, count: 1 });
    const [a] = (cmd as any).actions;
    expect(a).toMatchObject({ op: "create", title: "Gym", effortMinutes: 60, seriesId: "s1", tods: [[1080, 1200]] });
    expect(a.repeat).toBeUndefined();
    expect(a.notBefore).toBeDefined();
    expect((cmd as any).alt[0]).toMatchObject({ repeat: "FREQ=WEEKLY;BYDAY=SA" });
  });

  it("no day said: notBefore is now, deadline the next regular session", () => {
    const cmd = commandOf("học thêm gym", now.getTime(), series) as any;
    expect(cmd.actions[0].notBefore).toBe(now.toISOString());
    expect(cmd.actions[0].deadline).toBe(new Date(day(16, 18)).toISOString());
  });

  it("permanent: 'hằng tuần' makes the day part of the series", () => {
    const cmd = commandOf("thêm buổi gym T5 hằng tuần", now.getTime(), series) as any;
    expect(cmd).toMatchObject({ kind: "session", weekly: true, days: "T2, T4, T5" });
    expect(cmd.actions[0]).toMatchObject({ repeat: "FREQ=WEEKLY;BYDAY=TH", seriesId: "s1" });
  });

  it("no series: stays a create", () => {
    expect(commandOf("thêm buổi gặp mặt", now.getTime(), series)).toBeUndefined();
    expect(think("thêm buổi gặp mặt", now, "typed", {}, series).some((a) => a.op === "create" && !a.seriesId)).toBe(true);
  });

  it("two series match: chips to choose", () => {
    const cmd = commandOf("thêm buổi gym", now.getTime(), [...series, other("s2", "Gym chiều")]) as any;
    expect(cmd).toMatchObject({ kind: "choose", ask: "Thêm buổi cho chuỗi nào?" });
    expect(cmd.options).toHaveLength(2);
  });

  it("a synced lecture (no seriesId) is not a series", () => {
    const lec = member("l1", day(16, 9), { source: "dlu", section: "CSDL", seriesId: undefined });
    expect(commandOf("thêm buổi CSDL", now.getTime(), [lec])).toBeUndefined();
  });

  it("the guard: a line like 'gặp mặt' does not reach a series of another name", () => {
    expect(commandOf("thêm buổi gặp mặt", now.getTime(), [other("s2", "Gym chiều")])).toBeUndefined();
  });
});

describe("session apply", () => {
  beforeEach(() => { db.tasks.clear(); db.kv.clear(); series.forEach((x) => db.tasks.set(x.id, x)); });

  it("one-off adds a member without a rule; 'cả chuỗi' removes it with the series", async () => {
    const cmd = commandOf("thêm 1 buổi gym T7 này", now.getTime(), series) as any;
    await apply(cmd.actions, now.getTime());
    const extra = [...db.tasks.values()].find((x) => x.seriesId === "s1" && !x.rrule);
    expect(extra).toBeDefined();
    expect(scopeIds([...db.tasks.values()], "gym1", "all")).toContain(extra!.id);
  });

  it("permanent adds the weekday to every open member's rule and makes its occurrences", async () => {
    const cmd = commandOf("thêm buổi gym T5 hằng tuần", now.getTime(), series) as any;
    await apply(cmd.actions, now.getTime());
    const all = [...db.tasks.values()].filter((x) => x.seriesId === "s1");
    expect(all.filter((x) => x.rrule).every((x) => x.rrule === "FREQ=WEEKLY;BYDAY=MO,WE,TH")).toBe(true);
    expect(all.some((x) => x.rrule === "FREQ=WEEKLY;BYDAY=TH")).toBe(false);
    expect(all.filter((x) => new Date(x.start ?? x.notBefore ?? 0).getDay() === 4).length).toBeGreaterThan(0);
  });
});

describe("session with slang, and in a line with other parts", () => {
  it("a trailing particle or a typo still reads as the session", () => {
    expect(commandOf("thêm 1 buổi gym T7 nhé", now.getTime(), series)).toMatchObject({ kind: "session", title: "Gym", count: 1 });
    expect(commandOf("them 1 buoi gym t7", now.getTime(), series)).toMatchObject({ kind: "session", title: "Gym" });
  });
  it("a session part is applied with a bare create part, one undo for both", () => {
    const acts = think("thêm 1 buổi gym T7, bỏ rác", now, "typed", {}, series);
    expect(acts.find((a) => a.op === "create" && a.seriesId)).toMatchObject({ title: "Gym", seriesId: "s1" });
    expect(acts.find((a) => a.op === "create" && !a.seriesId)?.title).toMatch(/rác/i);
  });
});
