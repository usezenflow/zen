// Shared by bench.test.ts and focus.test.ts: per-seed rows, paired deltas against the baseline, and the gate.
// The sim is deterministic per seed, so a change is judged on the same seeds before and after: the delta is paired.

export const NEVER = 31; // a run that never converges (or never adapts) averages as day 31 in the display
export type Row = Record<string, number | null>;
export type PerSeed = Record<string, Row>; // seed -> that run's metrics
export type Gate = [key: string, dir: "drop" | "rise", tol: number];

export const round = (x: number) => Math.round(x * 1000) / 1000;

/** Mean and min–max over the seeds of one metric; a null counts as `fill` when given, else is left out. */
export function summarize(xs: (number | null | undefined)[], fill?: number): { mean: number | null; min: number | null; max: number | null } {
  const v = xs.map((x) => (x === null || x === undefined ? fill : x)).filter((x): x is number => x !== undefined);
  if (!v.length) return { mean: null, min: null, max: null };
  return { mean: round(v.reduce((a, b) => a + b, 0) / v.length), min: round(Math.min(...v)), max: round(Math.max(...v)) };
}

export interface Paired { mean: number; se: number; n: number } // mean of (before − after or after − before) per seed, its standard error, seeds used

/** Paired deltas over the seeds both runs have: a regression is positive (drop: before − after; rise: after − before). */
export function paired(base: PerSeed, cur: PerSeed, key: string, dir: "drop" | "rise"): Paired {
  const d: number[] = [];
  for (const seed of Object.keys(cur)) {
    const b = base[seed]?.[key], c = cur[seed][key];
    if (b === null || b === undefined || c === null || c === undefined) continue;
    d.push(dir === "drop" ? b - c : c - b);
  }
  const n = d.length;
  if (!n) return { mean: 0, se: 0, n: 0 };
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, se: n > 1 ? sd / Math.sqrt(n) : 0, n };
}

/** Gate failures: a metric whose mean paired regression exceeds its tolerance. Tolerances are the plain ones, never widened. */
export function gateFails(base: PerSeed, cur: PerSeed, gates: Gate[], name: string): string[] {
  const bad: string[] = [];
  for (const [k, dir, tol] of gates) {
    const p = paired(base, cur, k, dir);
    // a regression must be over the tolerance AND clear of the paired noise: any planner change reshuffles the sim, so a mean
    // under 2 SE is chaos, not a cause
    if (p.mean > tol && p.mean > 2 * p.se) bad.push(`${name} ${k}: paired ${dir} ${round(p.mean)} (SE ${round(p.se)}, n=${p.n}) > ${tol}`);
  }
  return bad;
}
