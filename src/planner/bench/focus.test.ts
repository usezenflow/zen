import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FOCUS, FOCUS_DAYS, FOCUS_NAMES, type FocusName } from "./focus";
import { run } from "./sim";
import { type Metrics, score } from "./score";
import { type Gate, type PerSeed, type Row, gateFails, paired, summarize } from "./stats";

// Each focus is read on its own metrics. The baseline is kept per seed; a change is gated on its paired per-seed deltas.
// Every focus also asserts its primary metric is not at its perfect value, so the scenario has room to show an improvement.
const SEEDS = [1, 2, 3, 4, 5, 6], BUDGET_MS = 6000, TIMEOUT = 120_000; // a seed runs in ~2 s alone; the budget leaves room for a loaded machine
const FILE = new URL("./focus.baseline.json", import.meta.url);

interface Spec { key: keyof Metrics; dir: "drop" | "rise" | null; tol: number; best?: number } // best: the perfect value (headroom check on the primary only)
// the first entry of each focus is its primary metric: the one with a `best`
const METRICS: Record<FocusName, Spec[]> = {
  // No move at all for a user who is happy (movesPerDay 0), and no churn. No `best`: with fill passes the scenario already sits at 0
  // (no headroom to show), so it is kept as a regression gate only.
  doubt: [{ key: "movesPerDay", dir: "rise", tol: 0.1 }, { key: "churn", dir: "rise", tol: 0.02 }, { key: "keepRate", dir: "drop", tol: 0.02 }],
  // Perfect: no placement in the hated band 9–11h, so no ignores there.
  missed: [{ key: "missBand", dir: "rise", tol: 0.02, best: 0 }, { key: "keepRate", dir: "drop", tol: 0.02 }],
  // Perfect: every said-evening task is placed in its 21–23h window, so all are kept.
  parts: [{ key: "keepTod", dir: "drop", tol: 0.02, best: 1 }, { key: "keepRate", dir: "drop", tol: 0.02 }],
  // Every placement inside the awake window (10h to 02h). No `best`: with the sweep and fill passes every placement is already inside
  // it (outsideShare 0), so it is a regression gate only, with no headroom left.
  awake: [{ key: "outsideShare", dir: "rise", tol: 0.02 }, { key: "keepRate", dir: "drop", tol: 0.02 }],
  // Perfect: no day with more true hours than capacity + 1h.
  load: [{ key: "overloadDays", dir: "rise", tol: 0.1, best: 0 }, { key: "keepRate", dir: "drop", tol: 0.02 }],
  // Perfect: no overload by true length, and guessed lengths equal the true ones (0 minutes off).
  fallacy: [{ key: "overloadDays", dir: "rise", tol: 0.1, best: 0 }, { key: "lenErrMin", dir: "rise", tol: 5 }],
  // Every dated placement in the first 80% of its window; no dated task left late. No `best`: with the early buffer every placement already is
  // (leadShare 1), so it is kept as a regression gate only.
  lead: [{ key: "leadShare", dir: "drop", tol: 0.02 }, { key: "keepDated", dir: "drop", tol: 0.02 }, { key: "lateRate", dir: "rise", tol: 0.02 }],
  // Perfect: no placement inside the 40 min rest after class.
  buffer: [{ key: "bufferShare", dir: "rise", tol: 0.02, best: 0 }, { key: "keepRate", dir: "drop", tol: 0.02 }],
  // Perfect: every errand kept, because each is placed next to another.
  group: [{ key: "keepErrand", dir: "drop", tol: 0.02, best: 1 }, { key: "switchesPerDay", dir: "rise", tol: 0.1 }],
};

// place.ts cuts a solve off after 400 ms of wall clock: the bench freezes Date, so the solve never depends on the machine's load.
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); });

const load = (): Record<string, PerSeed> | undefined => { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return undefined; } };
const table: { focus: string; metric: string; mean: number | null; "min–max": string; best: number | string; se: number | string }[] = [];

describe("focus scenarios", () => {
  for (const name of FOCUS_NAMES) {
    it(name, () => {
      const rows: PerSeed = {}, slow: number[] = [];
      for (const seed of SEEDS) {
        const t0 = performance.now();
        const m = score(run(FOCUS[name], { days: FOCUS_DAYS, seed }));
        slow.push(Math.round(performance.now() - t0));
        rows[seed] = Object.fromEntries(METRICS[name].map(({ key }) => [key, typeof m[key] === "number" ? (m[key] as number) : null])) as Row;
      }
      if (!process.env.CI) expect(Math.max(...slow), `${name}: a seed took over 6 s (${slow.join(", ")} ms)`).toBeLessThanOrEqual(BUDGET_MS);

      const [primary] = METRICS[name];
      const base = load()?.[name];
      for (const { key, best } of METRICS[name]) {
        const s = summarize(SEEDS.map((seed) => rows[seed][key]));
        const se = base ? paired(base, rows, key, METRICS[name].find((x) => x.key === key)!.dir ?? "rise").se : "–";
        table.push({ focus: name, metric: key, mean: s.mean, "min–max": `${s.min}–${s.max}`, best: best ?? "", se: typeof se === "number" ? Math.round(se * 1000) / 1000 : se });
      }
      if (primary.best !== undefined) {
        const m = summarize(SEEDS.map((seed) => rows[seed][primary.key])).mean;
        expect(m, `${name}: ${primary.key} is at its perfect value ${primary.best}, so the focus has no headroom`).not.toBe(primary.best);
      }

      if (process.env.BENCH_WRITE === "1") {
        writeFileSync(FILE, JSON.stringify({ ...load(), [name]: rows }, null, 2) + "\n");
        return;
      }
      expect(base, `no focus baseline for ${name}: run BENCH_WRITE=1 pnpm vitest run src/planner/bench/focus.test.ts`).toBeDefined();
      const gates: Gate[] = METRICS[name].filter((m) => m.dir).map((m) => [m.key, m.dir!, m.tol]);
      expect(gateFails(base!, rows, gates, name)).toEqual([]);
    }, TIMEOUT);
  }

  it("prints the focus table", () => {
    console.table(table);
  });
});
