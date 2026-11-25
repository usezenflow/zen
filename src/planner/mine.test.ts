import { describe, expect, it } from "vitest";
import type { Kind } from "../lib/types";
import { D, KINDS } from "./linucb";
import { I_AFTER } from "./features";
import { newModel, type Hist, type Model } from "./model";
import { candidates, clause, findingsFor, mine, surface, type Finding } from "./mine";

const STUDY = KINDS.indexOf("study"), WORK = KINDS.indexOf("work");
const DAY_MS = 86400_000;

// One history row: the feature vector as the planner wrote it (kind one-hot, what came before, busy, weekend), and whether it went well.
const hist = (kind: Kind, hour: number, ok: boolean, o: { after?: Kind; busy?: number; weekend?: number } = {}): Hist => {
  const v = new Array(D).fill(0);
  v[0] = 1; v[1] = o.weekend ?? 0; v[2] = o.busy ?? 0; v[4 + KINDS.indexOf(kind)] = 1;
  if (o.after) v[I_AFTER + KINDS.indexOf(o.after)] = 1;
  return { vec: v, hour, r: ok ? 0.5 : -0.5, at: 0 };
};
const rows = (n: number, make: () => Hist) => Array.from({ length: n }, make);
const withHist = (...hs: Hist[][]) => { const m: Model = newModel(0); m.hist = hs.flat(); return m; };

// Six study blocks done in the morning, six dragged away from in the evening: a real, sure contrast.
const studyContrast = () => withHist(rows(6, () => hist("study", 9, true)), rows(6, () => hist("study", 20, false)));

describe("mine", () => {
  it("six real outcomes each side surface a part contrast", () => {
    const f = candidates(studyContrast()).find((g) => g.type === "kindPart" && g.feature === 4 + STUDY);
    expect(f).toBeDefined();
    expect(f!.armP).toBe(0);
    expect(f!.armQ).toBe(3);
    expect(f!.direction).toBe(1);
    expect(f!.n).toBe(6);
    expect(f!.sure).toBeGreaterThanOrEqual(0.9);
    expect(f!.surprise).toBeCloseTo(Math.abs(f!.z));
    expect(clause(f!)).toBe("Việc học buổi sáng hay xong hơn buổi tối");
  });

  it("a thin history surfaces nothing: a cold model, and four outcomes a side", () => {
    expect(candidates(newModel(0))).toEqual([]);
    expect(mine(newModel(0), 0)).toEqual([]);
    const thin = withHist(rows(4, () => hist("study", 9, true)), rows(4, () => hist("study", 20, false)));
    expect(candidates(thin)).toEqual([]);
  });

  it("a busy day that completes less in the evening, and a sequence after a kind, are both found", () => {
    const busyEvening = withHist(rows(6, () => hist("study", 20, false, { busy: 0.5 })), rows(6, () => hist("study", 20, true)));
    const b = candidates(busyEvening).find((g) => g.type === "busy");
    expect(b).toMatchObject({ armP: 3, direction: -1 });

    const after = withHist(rows(6, () => hist("study", 9, true, { after: "work" })), rows(6, () => hist("study", 9, false)));
    const s = candidates(after).find((g) => g.type === "sequence");
    expect(s).toMatchObject({ feature: I_AFTER + WORK, armP: 0, direction: 1, of: "study" });
  });

  it("uses the behaviour of tagged drags, and says nothing when there are none", () => {
    const m = studyContrast();
    const pick = () => candidates(m).find((g) => g.type === "kindPart" && g.feature === 4 + STUDY)!;
    expect(pick().behaviour).toBeUndefined();
    // the user drags study to the evening (tối, hour 20) ten times: against the effect
    m.moved = Array.from({ length: 10 }, () => ({ hour: 20, at: 0, kind: "study" }));
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

  it("says nothing until surfaced, then one new insight a week", () => {
    const m = withHist(rows(6, () => hist("study", 9, true)), rows(6, () => hist("study", 20, false)), rows(6, () => hist("work", 9, false)), rows(6, () => hist("work", 20, true)));
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
    { type: "sequence", feature: I_AFTER + WORK, armP: 2, direction: 1, z: 2.5, n: 5, surprise: 2.5, of: "study" },
    { type: "sequence", feature: I_AFTER + WORK, armP: 2, direction: -1, z: -2.5, n: 5, surprise: 2.5, of: "study" },
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
    const fs = [f({}), f({ type: "sequence", feature: I_AFTER + WORK, armP: 2, armQ: undefined, of: "study" }), f({ type: "length", armP: -1, armQ: undefined })];
    expect(findingsFor(fs, "study", at(9)).map((x) => x.type)).toEqual(["kindPart", "length"]); // morning, the side that does better
    expect(findingsFor(fs, "study", at(20)).map((x) => x.type)).toEqual(["length"]); // evening is the side that does worse
    const x = new Array(D).fill(0); x[I_AFTER + WORK] = 1;
    expect(findingsFor(fs, "study", at(15), x).map((y) => y.type)).toEqual(["sequence", "length"]);
    expect(findingsFor(fs, "study", at(15)).map((y) => y.type)).toEqual(["length"]); // no "after" in this slot
    expect(findingsFor(fs, "work", at(9))).toEqual([]);
  });
});
