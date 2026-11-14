// Golden cases for the rule reader, in eval/golden/reader.jsonl. Reference dates: 5 Nov 2026 is a Thursday.
import { describe, expect, it } from "vitest";
import { type Case, loadCases, runCase } from "./run";

/** The section tag a golden name starts with ("3c", "3a2"), or "untagged". */
export function familyOf(c: Case): string {
  return /^(3[a-n]\d?)\b/.exec(c.name)?.[1] ?? "untagged";
}

/** Pass rate per family, as the scorecard prints it. */
export function scorecard(cases: Case[] = loadCases()) {
  const tally = new Map<string, { pass: number; total: number }>();
  for (const c of cases) {
    const t = tally.get(familyOf(c)) ?? { pass: 0, total: 0 };
    t.total++;
    if (runCase(c).length === 0) t.pass++;
    tally.set(familyOf(c), t);
  }
  return [...tally]
    .map(([family, t]) => ({
      family,
      pass: t.pass,
      total: t.total,
      rate: (100 * t.pass) / t.total,
    }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

describe("reader: informal and formal inputs", () => {
  for (const c of loadCases()) {
    it(c.name, () => {
      expect(runCase(c)).toEqual([]);
    });
  }
});

describe("reader: scorecard per family", () => {
  it("passes each new family (3c, 3f, 3g) at 95% or above", () => {
    const card = scorecard();
    const lines = card.map(
      (r) =>
        `${r.family.padEnd(9)} ${String(r.pass).padStart(4)}/${String(r.total).padEnd(4)} ${r.rate.toFixed(1)}%`,
    );
    console.log(`golden scorecard\n${lines.join("\n")}`);
    for (const r of card.filter((x) => /^3[cfg]$/.test(x.family)))
      expect([r.family, r.rate >= 95]).toEqual([r.family, true]);
  });
});
