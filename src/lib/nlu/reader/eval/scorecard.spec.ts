// `pnpm eval` prints the scorecard; `pnpm eval:write` also rewrites golden/baseline.json. Skipped in a plain test run.
import { describe, expect, it } from "vitest";
import { readBaseline, scorecard, writeBaseline } from "./metrics";

describe.runIf(process.env.EVAL)("scorecard", () => {
  it("prints, and fails if a mutation family drops below the baseline", () => {
    const card = scorecard();
    const { passing, ...show } = card;
    process.stdout.write(`\n${JSON.stringify(show, null, 1)}\n`);
    const base = readBaseline();
    if (process.env.EVAL === "write") writeBaseline(card);
    else if (base)
      for (const [f, v] of Object.entries(base.mutationPassPct)) expect([f, card.mutationPassPct[f] >= v - 0.1]).toEqual([f, true]);
    expect(passing.golden.length).toBeGreaterThan(0);
  }, 120_000);
});
