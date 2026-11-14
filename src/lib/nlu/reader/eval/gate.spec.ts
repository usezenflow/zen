// The phase gate: hard cases with phase in DONE_PHASES pass, and nothing the baseline recorded as passing regresses.
// The golden cases of the same gate run in golden.spec.ts; the baseline is written by `pnpm eval:write`.
import { describe, expect, it } from "vitest";
import { HARD_PHASE } from "./hard";
import { hardScores } from "./hard-score";
import { readBaseline } from "./metrics";
import { FAMILIES, NOISY, score, scoreNoisy } from "./mutate";
import { held, loadCases, loadReference, runCase } from "./run";

describe("gate: hard cases", () => {
  for (const { c, s } of hardScores()) {
    const phase = HARD_PHASE[c.id]?.phase ?? 0;
    (held(phase) ? it : it.skip)(`${c.id} (phase ${phase})`, () => expect(s.misses).toEqual([]));
  }
});

describe("gate: no regression against the baseline", () => {
  const base = readBaseline();
  it("has a baseline (run `pnpm eval:write`)", () => expect(base).toBeDefined());
  it("every golden case that passed still passes", () => {
    const now = new Set(loadCases(true).filter((c) => runCase(c).length === 0).map((c) => c.name));
    expect((base?.passing.golden ?? []).filter((n) => !now.has(n))).toEqual([]);
  });
  it("every hard case that passed still passes", () => {
    const now = new Set(hardScores().filter((h) => h.s.pass).map((h) => h.c.id));
    expect((base?.passing.hard ?? []).filter((n) => !now.has(n))).toEqual([]);
  });
  it("no mutation family falls below the baseline pass rate", () => {
    const clean = loadReference();
    const now: Record<string, number> = {};
    for (const f of FAMILIES) { const s = score(f, clean); now[f] = (100 * s.pass) / s.total; }
    for (const f of NOISY) { const s = scoreNoisy(f, clean); now[`${f}*`] = s.total ? (100 * s.pass) / s.total : 100; }
    const low = Object.entries(base?.mutationPassPct ?? {}).filter(([f, v]) => now[f] < v - 0.1);
    expect(low).toEqual([]);
  }, 60_000);
});
