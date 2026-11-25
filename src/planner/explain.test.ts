import { describe, expect, it } from "vitest";
import { plain } from "../lib/i18n";
import { reasonText, sayable } from "../lib/reasons";
import type { Reason, Task } from "../lib/types";
import { type Ask, type DayEnv, type Slot, type TimeEnv, explainDay, explainSize, explainTime } from "./explain";
import { HOUR, dayStart } from "./features";
import { grounded } from "./grounded";

const mon = new Date(2026, 10, 23, 8, 0).getTime(); // Monday 08:00, zero history
const at = (d: number, hh: number, mm = 0) => { const x = new Date(d); x.setHours(hh, mm, 0, 0); return x.getTime(); }; // the clock time on that day
const say = (r: Reason, long = false) => plain(reasonText(r, long));
const tue = dayStart(mon + 24 * HOUR), wed = dayStart(mon + 48 * HOUR);
const task = (over: Partial<Task> = {}): Task => ({ id: "bt", title: "Bài tập Lý", kind: "study", source: "user", effort: 60, createdAt: mon, ...over });
const ask = (t: Task, over: Partial<Ask> = {}): Ask => ({ task: t, effort: t.effort, k: 1, n: 1, ...over });
const lecture = (title: string, s: number, e: number): Slot => ({ title, start: s, end: e, kind: "study", lecture: true });
const noEnv = (over: Partial<TimeEnv> = {}): TimeEnv => ({ others: [], buffer: 30, rate: () => ({ won: 0, n: 0 }), slipping: () => 0, ...over });

describe("day: why not the days before", () => {
  // Monday has two lectures; the task is placed on Tuesday morning.
  const classes = [lecture("Giải tích", at(mon, 8), at(mon, 10)), lecture("CSDL", at(mon, 13), at(mon, 15))];
  const env: DayEnv = { now: mon, classes: (d) => classes.filter((c) => dayStart(c.start) === d), urgent: () => undefined, sibling: () => false, lighter: () => false };

  it("Day-1 counterfactual names the heavy Monday lectures when placing on Tuesday", () => {
    const [r] = explainDay(ask(task()), at(tue, 9), env);
    expect(r.key).toBe("load");
    expect(say(r, true)).toBe("T2 đã kín 2 tiết học, nên xếp vào sáng T3 là ngày thoáng đầu tiên");
  });

  it("a skipped day with one lecture is not heavy, so it names nothing", () => {
    const one = { ...env, classes: (d: number) => classes.slice(0, 1).filter((c) => dayStart(c.start) === d) };
    expect(explainDay(ask(task()), at(tue, 9), one).filter((r) => r.key === "load")).toEqual([]);
  });

  it("placed today to make up for a task that slipped says so", () => {
    const [r] = explainDay(ask(task({ misses: 1 })), at(mon, 15), env);
    expect(r.key).toBe("late");
    expect(say(r, true)).toBe("Việc đã trễ, bù lại chiều nay");
  });
});

describe("moving a task drops stale day and part reasons", () => {
  const classes = [lecture("Giải tích", at(mon, 8), at(mon, 10)), lecture("CSDL", at(mon, 13), at(mon, 15))];
  const env: DayEnv = { now: mon, classes: (d) => classes.filter((c) => dayStart(c.start) === d), urgent: () => undefined, sibling: () => false, lighter: () => false };
  const t = task();
  const why: Reason[] = explainDay(ask(t), at(tue, 9), env);

  it("the Tuesday reason holds on Tuesday and is dropped once the task moves to Wednesday", () => {
    expect(grounded(why, { task: t, start: at(tue, 9), rules: [] })).toEqual(why);
    expect(grounded(why, { task: t, start: at(wed, 9), rules: [] })).toEqual([]);
  });

  it("a part reason for the morning is dropped when the task moves to the afternoon", () => {
    const time = explainTime(ask(t), at(tue, 10, 30), noEnv({ others: [lecture("CSDL", at(tue, 8), at(tue, 10))] }));
    expect(time[0].key).toBe("after");
    expect(grounded(time, { task: t, start: at(tue, 10, 30), rules: [] })).toHaveLength(1);
    expect(grounded(time, { task: t, start: at(tue, 15), rules: [] })).toEqual([]);
  });
});

describe("time: why this part of the day", () => {
  it("names the lecture just before, and the rest learned after it", () => {
    const [r] = explainTime(ask(task()), at(mon, 10, 30), noEnv({ others: [lecture("CSDL", at(mon, 8), at(mon, 10))] }));
    expect(say(r, true)).toBe("Chừa 30p nghỉ sau tiết CSDL rồi mới bắt đầu");
  });

  it("says a part wins when its completion beats the best other part by 20 points over 4 outcomes", () => {
    const rate = (part: number) => (part === 0 ? { won: 5, n: 6 } : { won: 1, n: 6 });
    const r = explainTime(ask(task()), at(mon, 9), noEnv({ rate })).find((x) => x.vars?.won !== undefined)!;
    expect(say(r, true)).toBe("Buổi sáng bạn xong 5/6 việc, hơn các buổi khác");
  });

  it("avoids a part work keeps slipping out of", () => {
    const r = explainTime(ask(task()), at(mon, 9), noEnv({ slipping: (part) => (part === 3 ? 4 : 0) }))[0];
    expect(say(r, true)).toBe("Buổi tối hay bị dời, nên để sáng");
  });

  it("names a same-kind neighbour in the part, once there are two", () => {
    const others = [{ ...task({ id: "a", title: "Ôn chương 3" }), start: at(mon, 9), end: at(mon, 10), lecture: false }, { ...task({ id: "b", title: "Ôn chương 4" }), start: at(mon, 10), end: at(mon, 11), lecture: false }];
    const r = explainTime(ask(task()), at(mon, 13), noEnv({ others: others.map((o) => ({ title: o.title, start: o.start, end: o.end, kind: o.kind })) }))[0];
    // 13:00 is the afternoon part, neither neighbour is in it: nothing said
    expect(r).toBeUndefined();
    const same = explainTime(ask(task()), at(mon, 10, 30), noEnv({ others: others.map((o) => ({ title: o.title, start: o.start, end: o.end, kind: o.kind })) }));
    expect(same.find((x) => x.key === "similar")).toBeDefined();
  });

  it("a learned reason is only said with its evidence", () => {
    const learned: Reason = { key: "after", w: 0.9, vars: { prev: "CSDL", pn: "sáng" } };
    const proven: Reason = { ...learned, vars: { ...learned.vars, ev: 1 } };
    expect(sayable([learned])).toEqual([]);
    expect(sayable([proven])).toEqual([proven]);
  });
});

describe("size: why this length", () => {
  it("a split sitting that finishes a day early says so", () => {
    const due = at(mon, 9) + 1.5 * 24 * HOUR;
    const [r] = explainSize(ask(task(), { k: 1, n: 3 }), at(mon, 9), due);
    expect(say(r)).toBe("Buổi 1/3 · xong sớm 1 ngày trước hạn");
  });

  it("a guessed length that ran long for its kind is said as calibrated", () => {
    const [r] = explainSize(ask(task(), { slow: 1.5 }), at(mon, 9), undefined);
    expect(r.key).toBe("fit");
    expect(say(r, true)).toBe("Xếp 1h cho đủ, vì việc học thường lâu hơn dự kiến");
  });
});
