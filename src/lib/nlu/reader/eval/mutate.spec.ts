// Mutation gate: each family may lose at most GATE points of the clean pass rate (docs/nlu/robustness.md).
import { describe, expect, it } from "vitest";
import { cleanRate, FAMILIES, GATE, score } from "./mutate";
import { loadReference as loadCases } from "./run";

const cases = loadCases();
const clean = cleanRate(cases);

describe("mutation gate", () => {
  it("the clean golden set passes", () => {
    expect(clean).toBe(100);
  });

  for (const f of FAMILIES) {
    it(`${f} keeps the pass rate within ${GATE[f]} points`, () => {
      const s = score(f, cases);
      const rate = (100 * s.pass) / s.total;
      expect(rate >= clean - GATE[f] ? [] : s.failures.slice(0, 5)).toEqual([]);
    });
  }
});
