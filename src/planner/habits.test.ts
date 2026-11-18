import { describe, expect, it } from "vitest";
import { embed } from "../lib/nlu/embed";
import { aimOf, cosine, effort, SIM } from "./habits";
import { DAY, MIN } from "./features";
import { learn, plan } from "./policy";
import { type Model, newModel } from "./model";
import type { Kind, Task, TaskEvent } from "../lib/types";

const c = (a: string, b: string) => cosine(embed(a), embed(b));

describe("similar titles in embed() space", () => {
  it("synonyms clear SIM", () => {
    expect(c("đọc sách", "đọc truyện")).toBeGreaterThan(SIM);
    expect(c("code b-tree", "code lsm")).toBeGreaterThan(SIM);
  });

  it("unrelated pairs stay under SIM", () => {
    expect(c("code b-tree", "đi chợ")).toBeLessThan(SIM);
    expect(c("tập gym", "đóng tiền điện")).toBeLessThan(SIM);
    expect(c("đọc sách", "code lsm")).toBeLessThan(SIM);
    expect(c("code b-tree", "giặt đồ")).toBeLessThan(SIM);
  });

  // Known miss: "tập gym" ~ "tập thể dục" is 0.36, under SIM. A lower SIM lets in unrelated pairs (e.g. "đi khám răng" ~ "đi ngủ sớm", 0.71).

  it("a length mismatch is never alike", () => {
    expect(cosine(embed("code lsm"), new Float32Array(256).fill(1))).toBe(0);
  });
});

describe("effort from alike done tasks", () => {
  const now = Date.now();
  const base = { id: "x", title: "code b-tree", kind: "study", source: "user", createdAt: now, effortGuessed: true, cls: "code" } as Task;

  it("a guessed length takes the median of 2+ alike done tasks; a stale 256-dim entry does not count", () => {
    const v = embed("code b-tree");
    const m = newModel(now);
    m.efforts.push({ vec: Array.from(embed("code lsm")), minutes: 120, at: now }, { vec: Array.from(embed("code lsm tree")), minutes: 120, at: now });
    expect(effort({ ...base, effort: 180, vec: v }, m)).toBe(120);
    m.efforts = [{ vec: Array.from(embed("code lsm")), minutes: 120, at: now }, { vec: new Array(256).fill(0.0625), minutes: 15, at: now }];
    expect(effort({ ...base, effort: 180, vec: v }, m)).toBe(180); // one alike done task is not enough to override
  });
  it("an alike title of another kind never sets the length", () => {
    const v = embed("code b-tree"), m = newModel(now);
    m.efforts.push({ vec: Array.from(v), minutes: 30, at: now, kind: "chores" }, { vec: Array.from(v), minutes: 30, at: now, kind: "chores" });
    expect(effort({ ...base, effort: 180, vec: v }, m)).toBe(180);
  });
});

describe("planning fallacy: a guess runs as long as this kind really takes", () => {
  const now = Date.now();
  // Five study sittings the user ticked at 90 min, planned as 60 min guesses.
  const sitting = { id: "s", title: "code lsm", kind: "study", source: "user", createdAt: now, effortGuessed: true, effort: 60, cls: "code", vec: embed("code lsm"), start: now, end: now + 60 * MIN } as Task;
  const learned = () => {
    let m = newModel(now);
    for (let i = 0; i < 5; i++) m = learn(m, { id: `e${i}`, taskId: "s", type: "done", at: now + 90 * MIN } as TaskEvent, sitting);
    return m;
  };
  const guessed = { id: "x", title: "đọc sách", kind: "study", source: "user", createdAt: now, effortGuessed: true, cls: "read", effort: 60, vec: embed("đọc sách") } as Task;

  it("5 ticks at 1.5x a guess of 60 make a new guessed study task 90 min", () => {
    expect(effort(guessed, learned())).toBe(90);
    expect(effort(guessed, newModel(now))).toBe(60); // cold: the guess stands
  });
  it("a said length of 60 is never scaled", () => {
    expect(effort({ ...guessed, effortGuessed: false }, learned())).toBe(60);
  });
  it("fewer than 5 guessed samples leave the guess alone", () => {
    let m = newModel(now);
    for (let i = 0; i < 4; i++) m = learn(m, { id: `e${i}`, taskId: "s", type: "done", at: now + 90 * MIN } as TaskEvent, sitting);
    expect(effort(guessed, m)).toBe(60);
  });
});

describe("deadline lead: finishing early aims dated work earlier", () => {
  const now = new Date(2026, 10, 16, 9, 0).getTime();
  const span = 10 * DAY;
  // A dated task finished with `left` share of its window still open (the deadline is 10 days out).
  const finish = (m: Model, kind: Kind, left: number, i: number) => {
    const task = { id: `d${i}`, title: "ôn thi", kind, source: "user", createdAt: now, deadline: now + span, effort: 60 } as Task;
    return learn(m, { id: `e${i}`, taskId: task.id, type: "done", at: now + span - left * span } as TaskEvent, task);
  };
  const newTask = { id: "n", title: "ôn thi", kind: "study", source: "user", createdAt: now, deadline: now + span, effort: 120 } as Task;
  const startOf = (m: Model) => plan([newTask], [], m, now).diff.placed[0].start;

  it("cold model: no aim is learned", () => {
    expect(aimOf(newModel(now), "study")).toBeUndefined();
  });
  it("3 samples are not enough; 4 are", () => {
    let m = newModel(now);
    for (let i = 0; i < 3; i++) m = finish(m, "study", 0.8, i);
    expect(aimOf(m, "study")).toBeUndefined();
    m = finish(m, "study", 0.8, 3);
    expect(aimOf(m, "study")).toBe(0.4); // 1 - 0.8, kept at the 0.4 floor
  });
  it("a crammer (finishing with 5% left) is capped at an aim of 0.9", () => {
    let m = newModel(now);
    for (let i = 0; i < 4; i++) m = finish(m, "study", 0.05, i);
    expect(aimOf(m, "study")).toBe(0.9);
  });
  it("4 finishes with 80% of the window left make a new dated study sitting land earlier than a cold model", () => {
    let m = newModel(now);
    for (let i = 0; i < 4; i++) m = finish(m, "study", 0.8, i);
    expect(startOf(m)).toBeLessThan(startOf(newModel(now)));
  });
});
