import { describe, expect, it } from "vitest";
import { DAY } from "./features";
import { ALPHA, ARMS, D, KINDS, N0, coldArms, decayArms, fitArms, mapFeat, prepare, ucb, update, upgradePrior } from "./linucb";
import { newModel } from "./model";

const x = (kind = -1) => { const v = new Array(D).fill(0); v[0] = 1; if (kind >= 0) v[4 + kind] = 1; return v; };
const score = (kind: number, h: number) => ucb(prepare(coldArms()), h, x(kind));
const EXERCISE = 1, SOCIAL = 3;

describe("linucb", () => {
  it("updates toward the reward and decays to the prior", () => {
    const arms = coldArms();
    const before = prepare(arms).theta[3][0];
    for (let i = 0; i < 20; i++) update(arms[3], x(), 1);
    expect(prepare(arms).theta[3][0]).toBeGreaterThan(before);
    const a0 = arms[3].A[0], c0 = coldArms()[3].A[0];
    decayArms(arms, 21 * DAY);
    expect(arms[3].A[0]).toBeCloseTo(c0 + (a0 - c0) / 2, 6);
    expect(arms[3].b[0]).toBeGreaterThan(0);
    expect(N0).toBe(3);
    expect(ALPHA).toBe(0.15);
  });

  it("decays to the cold prior and never past it", () => {
    const arms = coldArms();
    for (let i = 0; i < 20; i++) update(arms[3], x(1), 1);
    const cold = coldArms()[3];
    let gap = Infinity;
    for (let d = 0; d < 400; d += 40) {
      decayArms(arms, 40 * DAY);
      const g = Math.max(...arms[3].A.map((v, k) => Math.abs(v - cold.A[k])));
      expect(g).toBeLessThanOrEqual(gap);
      gap = g;
    }
    expect(gap).toBeLessThan(1e-3);
  });

  it("keeps a cold model identical to the cold prior after any decay", () => {
    const arms = coldArms();
    decayArms(arms, 90 * DAY);
    expect(arms).toEqual(coldArms());
  });

  it("cold arms follow the default daily curve, with a dip at lunch", () => {
    const p = prepare(coldArms());
    expect(ucb(p, 16, x())).toBeGreaterThan(ucb(p, 3, x()));
    expect(ucb(p, 12, x())).toBeLessThan(ucb(p, 10, x()));
  });

  it("has default hours per kind", () => {
    expect(score(EXERCISE, 7)).toBeGreaterThan(score(EXERCISE, 13));
    expect(score(SOCIAL, 19)).toBeGreaterThan(score(SOCIAL, 10));
    expect(ARMS).toBe(24);
  });

  it("upgrades a saved model once", () => {
    const m = newModel(0);
    m.arms = coldArms(1); delete m.prior;
    upgradePrior(m);
    expect(m.prior).toBe(2);
    m.arms.forEach((a, i) => { a.A.forEach((v, k) => expect(v).toBeCloseTo(coldArms()[i].A[k], 9)); a.b.forEach((v, k) => expect(v).toBeCloseTo(coldArms()[i].b[k], 9)); });
    const once = JSON.stringify(m);
    upgradePrior(m);
    expect(JSON.stringify(m)).toBe(once);
    expect(D).toBe(24);
  });
});

describe("fitArms", () => {
  it("moves a 5-kind layout (D=16) onto this one, keeping the evidence of shared columns", () => {
    const old = { A: new Array(16 * 16).fill(0), b: new Array(16).fill(0) };
    for (let i = 0; i < 16; i++) old.A[i * 16 + i] = 1;
    old.A[1 * 16 + 1] = 7; // kind 1 (exercise) of the old layout
    old.A[11 * 16 + 11] = 9; // after-kind 2 (chores) of the old layout: indices 9..13
    old.A[14 * 16 + 14] = 4; // energy
    old.b[15] = 2; // similar
    const [arm] = fitArms([old]);
    expect(arm.A).toHaveLength(D * D);
    expect(arm.A[mapFeat(1, 5) * D + mapFeat(1, 5)]).toBe(7);
    expect(arm.A[mapFeat(11, 5) * D + mapFeat(11, 5)]).toBe(9);
    expect(arm.A[(4 + 2 * KINDS.length) * D + (4 + 2 * KINDS.length)]).toBe(4);
    expect(arm.b[5 + 2 * KINDS.length]).toBe(2);
    expect(arm.A[(4 + KINDS.length + 1) * D + (4 + KINDS.length + 1)]).toBe(1); // a new after column starts at the identity
  });
  it("starts over on a layout it does not know", () => {
    expect(fitArms([{ A: new Array(9).fill(0), b: [0, 0, 0] }])[0].A).toHaveLength(D * D);
  });
});
