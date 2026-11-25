import { describe, expect, it } from "vitest";
import { D, KINDS, update } from "./linucb";
import { newModel, type Model } from "./model";
import { candidates, clause, findingsFor, mine, surface, type Finding } from "./mine";

// Feature vector: intercept, plus the kind's one-hot, plus optional weekend.
const x = (ki: number, weekend = 0) => { const v = new Array(D).fill(0); v[0] = 1; v[1] = weekend; v[4 + ki] = 1; return v; };
const STUDY = KINDS.indexOf("study"), WORK = KINDS.indexOf("work");
// Neutral outcomes (reward 0) of other kinds in both parts: they pin the shared intercept, so a kind's effect is identifiable.
const background = (m: Model) => { for (const p of [0, 3]) for (const ki of [1, 2, 3, 5]) for (let i = 0; i < 20; i++) update(m.parts![p], x(ki), 0); };

const DAY_MS = 86400_000;
// A planted study contrast (morning good, evening bad), 20 and 24 outcomes behind it.
const planted = (): Model => {
  const m: Model = newModel(0);
  for (let i = 0; i < 20; i++) update(m.parts![0], x(STUDY), 0.5);
  for (let i = 0; i < 24; i++) update(m.parts![3], x(STUDY), -0.5);
  background(m);
  return m;
};

describe("mine", () => {
  it("finds a planted kind x part effect with its direction", () => {
    const m = planted();
    const f = candidates(m).find((g) => g.type === "kindPart" && g.feature === 4 + STUDY);
    expect(f).toBeDefined();
    expect(f!.armP).toBe(0);
    expect(f!.armQ).toBe(3);
    expect(f!.direction).toBe(1);
    expect(Math.abs(f!.z)).toBeGreaterThanOrEqual(3);
    expect(f!.n).toBeGreaterThanOrEqual(3);
    expect(f!.surprise).toBeCloseTo(Math.abs(f!.z));
  });

  it("returns nothing for a cold model or for noise with no contrast", () => {
    expect(mine(newModel(0), 0)).toEqual([]);
    const m: Model = newModel(0);
    for (let p = 0; p < 4; p++) for (let i = 0; i < 40; i++) update(m.parts![p], x(i % KINDS.length), i % 2 ? 0.5 : -0.5);
    expect(mine(m, 0)).toEqual([]);
  });

  it("credits no single feature when two features are always on together", () => {
    const m: Model = newModel(0);
    // every outcome is a weekend study: weekend and study move together, so neither is named alone
    for (let i = 0; i < 10; i++) update(m.parts![0], x(STUDY, 1), 0.5);
    for (let i = 0; i < 12; i++) update(m.parts![3], x(STUDY, 1), -0.5);
    const named = candidates(m).filter((g) => g.feature === 1 || g.feature === 4 + STUDY);
    expect(named).toEqual([]);
  });

  it("uses the behaviour of tagged drags, and says nothing when there are none", () => {
    const m: Model = newModel(0);
    for (let i = 0; i < 20; i++) update(m.parts![0], x(STUDY), 0.5);
    for (let i = 0; i < 24; i++) update(m.parts![3], x(STUDY), -0.5);
    background(m);
    const pick = () => candidates(m).find((g) => g.type === "kindPart" && g.feature === 4 + STUDY)!;
    expect(pick().behaviour).toBeUndefined();
    // the user drags study to the evening (tối, hour 20) four times: against the effect
    m.moved = Array.from({ length: 10 }, () => ({ hour: 20, at: 0, kind: "study" }) as never);
    expect(pick().behaviour).toBe("contradicts");
    expect(pick().surprise).toBeCloseTo(2 * Math.abs(pick().z));
  });

  it("finds a length that runs over the guesses, and none that matches", () => {
    const m: Model = newModel(0);
    m.efforts = Array.from({ length: 10 }, (_, i) => ({ vec: [], minutes: 90, at: i, kind: "study" as const, guess: 60 }));
    const f = candidates(m).find((g) => g.type === "length");
    expect(f).toBeDefined();
    expect(f!.direction).toBe(1);
    m.efforts = Array.from({ length: 10 }, (_, i) => ({ vec: [], minutes: 60, at: i, kind: "study" as const, guess: 60 }));
    expect(candidates(m).some((g) => g.type === "length")).toBe(false);
  });

  it("says a contrast only with 10 outcomes on each side", () => {
    const m: Model = newModel(0);
    for (let i = 0; i < 9; i++) update(m.parts![0], x(STUDY), 0.5);
    for (let i = 0; i < 9; i++) update(m.parts![3], x(STUDY), -0.5);
    background(m);
    expect(candidates(m).some((g) => g.type === "kindPart" && g.feature === 4 + STUDY)).toBe(false);
  });

  it("says nothing until surfaced, then one new insight a week", () => {
    const m = planted();
    m.efforts = Array.from({ length: 10 }, (_, i) => ({ vec: [], minutes: 90, at: i, kind: "study" as const, guess: 60 }));
    expect(candidates(m).length).toBe(2);
    expect(mine(m, 0)).toEqual([]);
    surface(m, 0);
    expect(mine(m, 0)).toEqual([candidates(m)[0]]); // the strongest first
    surface(m, DAY_MS);
    expect(mine(m, DAY_MS)).toHaveLength(1); // within the week: no new one
    surface(m, 8 * DAY_MS);
    expect(mine(m, 8 * DAY_MS)).toHaveLength(2); // a week on, the next one
    surface(m, 16 * DAY_MS);
    expect(mine(m, 16 * DAY_MS)).toHaveLength(2); // nothing left to say
  });
});

describe("clause", () => {
  const cases: Finding[] = [
    { type: "kindPart", feature: 4 + STUDY, armP: 0, armQ: 3, direction: 1, z: 3, n: 10, surprise: 3 },
    { type: "kindPart", feature: 4 + STUDY, armP: 0, armQ: 3, direction: -1, z: -3, n: 10, surprise: 3 },
    { type: "sequence", feature: 13 + STUDY, armP: 2, direction: 1, z: 2.5, n: 5, surprise: 2.5 },
    { type: "sequence", feature: 13 + STUDY, armP: 2, direction: -1, z: -2.5, n: 5, surprise: 2.5 },
    { type: "busy", feature: 2, armP: 1, direction: 1, z: 2, n: 4, surprise: 2 },
    { type: "busy", feature: 2, armP: 1, direction: -1, z: -2, n: 4, surprise: 2 },
    { type: "weekend", feature: 1, armP: 3, direction: 1, z: 2, n: 4, surprise: 2 },
    { type: "weekend", feature: 1, armP: 3, direction: -1, z: -2, n: 4, surprise: 2 },
    { type: "deadline", feature: 3, armP: 0, direction: 1, z: 2, n: 4, surprise: 2 },
    { type: "deadline", feature: 3, armP: 0, direction: -1, z: -2, n: 4, surprise: 2 },
    { type: "length", feature: 4 + WORK, armP: -1, direction: 1, z: 2, n: 4, surprise: 2 },
    { type: "length", feature: 4 + WORK, armP: -1, direction: -1, z: -2, n: 4, surprise: 2 },
  ];

  it("renders one literal clause per type and direction, with no separator, digits or causal words", () => {
    const seen = new Set<string>();
    for (const f of cases) {
      const s = clause(f);
      expect(s.length).toBeGreaterThan(0);
      expect(s).not.toContain("·");
      expect(s).not.toMatch(/\d/);
      expect(s).not.toMatch(/\b(nên|vì|bởi)\b/iu);
      seen.add(s);
    }
    expect(seen.size).toBe(cases.length);
  });
});

describe("findingsFor", () => {
  const f = (o: Partial<Finding>): Finding => ({ type: "kindPart", feature: 4 + STUDY, armP: 0, armQ: 3, direction: 1, z: 4, n: 10, surprise: 4, ...o });
  const at = (h: number) => new Date(2026, 10, 16, h).getTime();
  it("says a kind x part finding only in the part it favours, and a context only when it is present", () => {
    const fs = [f({}), f({ type: "sequence", feature: 13 + WORK, armP: 2, armQ: undefined }), f({ type: "length", armP: -1, armQ: undefined })];
    expect(findingsFor(fs, "study", at(9)).map((x) => x.type)).toEqual(["kindPart", "length"]); // morning, the side that does better
    expect(findingsFor(fs, "study", at(20)).map((x) => x.type)).toEqual(["length"]); // evening is the side that does worse
    const x = new Array(D).fill(0); x[13 + WORK] = 1;
    expect(findingsFor(fs, "study", at(15), x).map((y) => y.type)).toEqual(["sequence", "length"]);
    expect(findingsFor(fs, "study", at(15)).map((y) => y.type)).toEqual(["length"]); // no "after" in this slot
    expect(findingsFor(fs, "work", at(9))).toEqual([]);
  });
});
