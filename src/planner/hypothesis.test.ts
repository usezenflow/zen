import { describe, expect, it } from "vitest";
import { MIN } from "./features";
import { forgetWhen, noteHyp, settleHyp } from "./habits";
import { newModel } from "./model";
import { learn } from "./index";
import type { Task } from "../lib/types";

const now = new Date(2026, 10, 16, 8, 0).getTime();
const hm = (h: number) => new Date(2026, 10, 16, h, 0).getTime();
const task = (id: string, kind: Task["kind"]): Task => ({ id, title: id, kind, source: "user", effort: 60, createdAt: now });
const drag = (m: ReturnType<typeof newModel>, id: string, from: number, to: number) =>
  learn(m, { id: `e${id}`, taskId: id, type: "drag", at: now, data: { fromStart: from, toStart: to } }, { ...task(id, "study"), start: from, end: from + 60 * MIN });

describe("a drag to another part of the day is a hypothesis about its kind", () => {
  it("one drag leaves it new; a second consistent drag makes it a rule", () => {
    let m = newModel(now);
    m = drag(m, "a", hm(9), hm(15));
    expect(m.hypNow).toMatchObject({ kind: "study", part: 2, n: 1, state: "new" });
    m = drag(m, "b", hm(10), hm(16));
    expect(m.hypNow).toMatchObject({ kind: "study", part: 2, n: 2, state: "rule" });
  });

  it("Chỉ lần này (off) is never promoted", () => {
    let m = newModel(now);
    m = drag(m, "a", hm(9), hm(15));
    settleHyp(m, "study", 2, "off");
    m = drag(m, "b", hm(10), hm(16));
    expect(m.hyps).toEqual([expect.objectContaining({ kind: "study", part: 2, state: "off" })]);
  });

  it("a drag within one part teaches no hypothesis", () => {
    const m = newModel(now);
    expect(noteHyp(m, "study", hm(9), hm(10), now)).toBeUndefined();
  });

  it("forgetWhen a part switches its hypotheses off and resets its learned part arm", () => {
    let m = drag(newModel(now), "a", hm(9), hm(15));
    forgetWhen(m, { part: 2 });
    expect(m.hyps?.[0].state).toBe("off");
    expect(m.parts![2].b.every((v) => v === 0)).toBe(true);
  });
});
