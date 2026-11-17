import { describe, expect, it } from "vitest";
import { embed } from "../lib/nlu/embed";
import { cosine, effort, SIM } from "./habits";
import { newModel } from "./model";
import type { Task } from "../lib/types";

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
