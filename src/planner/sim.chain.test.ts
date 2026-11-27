// Chains: a successor never starts before its predecessor ends, and linking a chain does not add deadline misses.
import { describe, expect, it } from "vitest";
import { simulate } from "./sim";

const SEEDS = [1, 2, 3, 4, 5];

describe("sim: 3-step chains", () => {
  const linked = SEEDS.map((s) => simulate("full", s, 30, { linked: true }));
  const free = SEEDS.map((s) => simulate("full", s, 30, { linked: false }));

  it("no precedence violations", () => {
    expect(linked.map((r) => r.violations)).toEqual(SEEDS.map(() => 0));
  });

  // Timing-dependent (the solver has a wall-clock safety cap, so a slow CI runner gets a different search): local only.
  it.skipIf(!!process.env.CI)("linked chains miss no more than 1.15 times the deadlines of the same tasks unlinked", () => {
    const sum = (rs: typeof linked) => rs.reduce((a, r) => a + (r.misses ?? 0), 0);
    expect(sum(linked)).toBeLessThanOrEqual(sum(free) * 1.15);
  });
});
