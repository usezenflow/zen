import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERSONAS } from "./personas";
import { run } from "./sim";
import { type Metrics, score } from "./score";
import { type Gate, type PerSeed, type Row, NEVER, gateFails, paired, summarize } from "./stats";

// Synthetic users drive the real plan() and learn() at every app open. The sim is deterministic per seed, so the baseline is kept
// per seed and a change is gated on its paired per-seed deltas. Each persona is its own test (its own timeout).
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8], DAYS = 30;
const FILE = new URL("./baseline.json", import.meta.url);
const TIMEOUT = 120_000;

// column name, metric, value a run that never converges or adapts takes for the display (undefined metric: left out)
const COLS: [string, (m: Metrics) => number | null | undefined, number?][] = [
  ["keepRate", (m) => m.keepRate], ["earlyKeep", (m) => m.earlyKeep], ["lateKeep", (m) => m.lateKeep], ["coldKeep", (m) => m.coldKeep],
  ["tapsPerDay", (m) => m.tapsPerDay], ["dragsPerDay", (m) => m.dragsPerDay], ["dragsToLearn", (m) => m.dragsToLearn], ["transferKeep", (m) => m.transferKeep],
  ["touchesPerDay", (m) => m.touchesPerDay], ["movesPerDay", (m) => m.movesPerDay],
  ["churn", (m) => m.churn], ["surpriseMoves", (m) => m.surpriseMoves], ["overdueMoves", (m) => m.overdueMoves], ["regretH", (m) => m.regretH],
  ["overloadDays", (m) => m.overloadDays], ["lateRate", (m) => m.lateRate], ["deadlineSlackH", (m) => m.deadlineSlackH],
  ["convergeDay", (m) => m.convergeDay, NEVER], ["adaptDays", (m) => m.adaptDays, NEVER],
];
// gated on the mean paired delta: [metric, direction that is a regression, tolerance]
const GATES: Gate[] = [
  ["keepRate", "drop", 0.02], ["movesPerDay", "rise", 0.1],
  ["lateKeep", "drop", 0.02], ["touchesPerDay", "rise", 0.1], ["churn", "rise", 0.02], ["surpriseMoves", "rise", 0.05], ["lateRate", "rise", 0.02],
];

const toRow = (m: Metrics): Row => Object.fromEntries(COLS.filter(([, f]) => f(m) !== undefined).map(([k, f]) => [k, f(m) ?? null]));
const load = (): Record<string, PerSeed> | undefined => { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return undefined; } };
const table: Record<string, Record<string, string | number | null>> = {};

describe("synthetic benchmark", () => {
  for (const p of PERSONAS) {
    it(p.name, () => {
      const rows: PerSeed = {};
      for (const seed of SEEDS) rows[seed] = toRow(score(run(p, { days: p.days ?? DAYS, seed })));

      const row: Record<string, string | number | null> = {};
      for (const [k, , fill] of COLS) {
        if (SEEDS.every((s) => rows[s][k] === undefined)) continue;
        const ms = summarize(SEEDS.map((s) => rows[s][k]), fill);
        row[k] = ms.mean;
      }
      row.keepRange = `${summarize(SEEDS.map((s) => rows[s].keepRate)).min}–${summarize(SEEDS.map((s) => rows[s].keepRate)).max}`;

      if (process.env.BENCH_WRITE === "1") {
        writeFileSync(FILE, JSON.stringify({ ...load(), [p.name]: rows }, null, 2) + "\n");
        table[p.name] = row;
        return;
      }
      const base = load()?.[p.name];
      expect(base, `no baseline for ${p.name}: run BENCH_WRITE=1 pnpm vitest run src/planner/bench/bench.test.ts`).toBeDefined();
      row.keepSE = round3(paired(base!, rows, "keepRate", "drop").se);
      table[p.name] = row;
      expect(gateFails(base!, rows, GATES, p.name)).toEqual([]);
    }, TIMEOUT);
  }

  it("no-op: the sim is deterministic per seed, so two runs give paired deltas of exactly 0", () => {
    const p = PERSONAS.find((x) => x.name === "newbie")!;
    const once = () => toRow(score(run(p, { days: p.days ?? DAYS, seed: 1 })));
    expect(once()).toEqual(once());
  }, TIMEOUT);

  it("prints the table", () => {
    console.table(table);
  });
});

function round3(x: number) { return Math.round(x * 1000) / 1000; }
