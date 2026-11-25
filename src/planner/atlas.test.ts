import { describe, expect, it } from "vitest";
import { partIdx } from "./features";
import { D, KINDS, update } from "./linucb";
import { type Model, newModel } from "./model";
import { contextCorr, hourView, lasoGrid } from "./atlas";

const STUDY = KINDS.indexOf("study"), WORK = KINDS.indexOf("work");
const vec = (kind: number, busy = 0) => { const v = new Array(D).fill(0); v[0] = 1; v[4 + kind] = 1; v[2] = busy; return v; };
const model = (): Model => newModel(0);
const plant = (m: Model, hour: number, kind: number, r: number, busy = 0) => {
  update(m.arms[hour], vec(kind, busy), r);
  update(m.parts![partIdx(hour)], vec(kind, busy), r);
};

describe("atlas", () => {
  it("is neutral on a cold model", () => {
    const m = model();
    for (let h = 0; h < 24; h++) {
      const v = hourView(m, h);
      expect(v.kinds.map((c) => c.kind)).toEqual(KINDS);
      for (const c of v.kinds) expect(c.enough).toBe(false); // the hour view's estimate is the starting curve here, hidden until enough
      expect(v.ctx).toEqual([]);
    }
    for (const c of lasoGrid(m)) { expect(c.enough).toBe(false); expect(Math.abs(c.mu)).toBeLessThan(1e-9); }
    for (let p = 0; p < 4; p++) expect(contextCorr(m, p).r).toEqual([]);
  });

  it("is neutral when the model has no arms or parts", () => {
    const m = { ...model(), arms: undefined, parts: undefined } as unknown as Model;
    expect(hourView(m, 9).kinds.every((c) => !c.enough)).toBe(true);
    expect(lasoGrid(m).every((c) => !c.enough)).toBe(true);
    expect(contextCorr(m, 0).r).toEqual([]);
  });

  it("says what the planted outcomes support", () => {
    const m = model();
    for (let i = 0; i < 30; i++) { plant(m, 9, STUDY, 0.5); plant(m, 21, STUDY, -0.5); }
    for (const k of [1, 3, 5]) for (let i = 0; i < 20; i++) { plant(m, 9, k, 0); plant(m, 21, k, 0); }

    const morning = hourView(m, 9).kinds[STUDY], evening = hourView(m, 21).kinds[STUDY];
    expect(morning.mu).toBeGreaterThan(0);
    expect(morning.enough).toBe(true);
    expect(evening.mu).toBeLessThan(0);
    expect(evening.enough).toBe(true);

    const grid = lasoGrid(m);
    const at = (p: number) => grid.find((c) => c.part === p && c.kind === "study")!.mu;
    expect(at(0)).toBeGreaterThan(at(3));
  });

  it("lists a context that holds most of an hour's outcomes", () => {
    const m = model();
    for (let i = 0; i < 40; i++) plant(m, 9, STUDY, 0.5, i % 5 < 4 ? 1 : 0);
    const busy = hourView(m, 9).ctx.find((c) => c.feature === 2);
    expect(busy).toBeDefined();
    expect(busy!.share).toBeCloseTo(0.8, 1);
  });

  it("correlates a kind with the busy context in its part", () => {
    const m = model();
    for (let i = 0; i < 30; i++) {
      update(m.parts![0], vec(STUDY, 1), 0.5);
      update(m.parts![0], vec(WORK, 0), 0.5);
    }
    const c = contextCorr(m, 0);
    const bi = c.ctx.indexOf(2);
    const study = c.r[c.kinds.indexOf("study")][bi], work = c.r[c.kinds.indexOf("work")][bi];
    expect(study).toBeGreaterThan(0.8);
    expect(work).toBeLessThan(-0.8);
  });
});
