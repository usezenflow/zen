import { describe, expect, it } from "vitest";
import { partIdx } from "./features";
import { ARMS, D, LAMBDA_PART, coldParts, posteriorOf, prepare, update } from "./linucb";
import { newModel } from "./model";

const PART_OF = Array.from({ length: ARMS }, (_, h) => partIdx(h));
const row = (k: number) => Array.from({ length: D }, (_, i) => (i === 0 || i === 4 + k ? 1 : 0));

describe("posteriorOf: the one blended posterior", () => {
  const m = newModel(0);
  for (const h of [8, 9, 14, 17]) update(m.arms[h], row(h % 3), -0.5, 2);
  update(m.parts![1], row(1), 0.5, 4);
  update(m.parts![2], row(2), -1, 3);

  it("theta and width are exactly prepare(arms, parts, PART_OF), the planner's own", () => {
    const p = posteriorOf(m), q = prepare(m.arms, m.parts, PART_OF);
    expect(p.theta.map((t) => Array.from(t))).toEqual(q.theta.map((t) => Array.from(t)));
    expect(p.inv.map((t) => Array.from(t))).toEqual(q.inv.map((t) => Array.from(t)));
  });

  it("the blended evidence is the hour's A plus LAMBDA_PART times its part's A minus the part's cold A", () => {
    const p = posteriorOf(m), cold = coldParts();
    for (const h of [0, 9, 12, 14, 20]) {
      const k = PART_OF[h];
      p.A[h].forEach((v, i) => expect(v).toBeCloseTo(m.arms[h].A[i] + LAMBDA_PART * (m.parts![k].A[i] - cold[k].A[i]), 9));
    }
  });

  it("without parts it is the hour arms alone", () => {
    const arms = m.arms, p = posteriorOf({ arms });
    expect(p.theta.map((t) => Array.from(t))).toEqual(prepare(arms).theta.map((t) => Array.from(t)));
    expect(p.A[9]).toEqual(arms[9].A);
  });
});
