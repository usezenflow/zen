export type Row = {
  install: string; at: number; policy: string; arm: number;
  x: number[]; theta?: number[]; reward: number; kind: string; zeroEdit: boolean;
};

export const MAX_BATCH = 500;
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const TAG = /^[a-z0-9_]{1,24}$/;
const KEYS = new Set(["install", "at", "policy", "arm", "x", "theta", "reward", "kind", "zeroEdit"]);
const vec = (v: unknown, max: number) =>
  Array.isArray(v) && v.length <= max && v.every((n) => typeof n === "number" && Number.isFinite(n));

export function validateRow(r: unknown): Row | null {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  // free text can only hide in unknown keys or strings: whitelist both
  if (Object.keys(o).some((k) => !KEYS.has(k))) return null;
  if (typeof o.install !== "string" || !ID.test(o.install)) return null;
  if (typeof o.policy !== "string" || !TAG.test(o.policy)) return null;
  if (typeof o.kind !== "string" || !TAG.test(o.kind)) return null;
  if (!Number.isInteger(o.at) || (o.at as number) < 1e9 || (o.at as number) > 4e9) return null;
  if (!Number.isInteger(o.arm) || (o.arm as number) < 0 || (o.arm as number) > 1000) return null;
  if (!vec(o.x, 64)) return null;
  if (o.theta !== undefined && !vec(o.theta, 64)) return null;
  if (typeof o.reward !== "number" || !Number.isFinite(o.reward)) return null;
  if (typeof o.zeroEdit !== "boolean") return null;
  return o as unknown as Row;
}

export function validateBatch(b: unknown): { ok: true; rows: Row[] } | { ok: false; error: string } {
  if (!Array.isArray(b)) return { ok: false, error: "array" };
  if (b.length === 0 || b.length > MAX_BATCH) return { ok: false, error: "size" };
  const rows: Row[] = [];
  for (const r of b) {
    const v = validateRow(r);
    if (!v) return { ok: false, error: "row" };
    rows.push(v);
  }
  return { ok: true, rows };
}

const mean = (a: number[]) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0);

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentile bootstrap CI of the mean. */
export function bootstrapCI(vals: number[], iters = 1000, seed = 1, level = 0.95): [number, number] {
  if (!vals.length) return [0, 0];
  const rand = rng(seed), n = vals.length, ms: number[] = [];
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += vals[Math.floor(rand() * n)];
    ms.push(s / n);
  }
  ms.sort((a, b) => a - b);
  const a = (1 - level) / 2;
  return [ms[Math.floor(a * (iters - 1))], ms[Math.ceil((1 - a) * (iters - 1))]];
}

const DAY = 86400;
function by<T>(rows: Row[], f: (r: Row) => T) {
  const m = new Map<T, Row[]>();
  for (const r of rows) { const l = m.get(f(r)); l ? l.push(r) : m.set(f(r), [r]); }
  return m;
}

export function aggregate(rows: Row[], now: number) {
  const week = rows.filter((r) => r.at >= now - 7 * DAY);
  const policies = [...by(rows, (r) => r.policy)].map(([policy, rs]) => {
    const rw = rs.map((r) => r.reward), ze = rs.map((r) => (r.zeroEdit ? 1 : 0));
    return {
      policy, n: rs.length,
      reward: { mean: mean(rw), ci: bootstrapCI(rw, 1000, 1) },
      zeroEdit: { mean: mean(ze), ci: bootstrapCI(ze, 1000, 2) },
    };
  }).sort((a, b) => a.policy.localeCompare(b.policy));
  const kinds = [...by(rows, (r) => r.kind)].map(([kind, rs]) => ({
    kind, n: rs.length, keptRate: mean(rs.map((r) => (r.reward > 0 ? 1 : 0))), meanReward: mean(rs.map((r) => r.reward)),
  })).sort((a, b) => a.kind.localeCompare(b.kind));
  const hours = [...by(rows, (r) => r.arm)].map(([arm, rs]) => ({ arm, n: rs.length, meanReward: mean(rs.map((r) => r.reward)) }))
    .sort((a, b) => a.arm - b.arm);
  // cohort = install's first-seen week; cumulative reward by day offset from now
  const first = new Map<string, number>();
  for (const r of rows) first.set(r.install, Math.min(first.get(r.install) ?? Infinity, r.at));
  const cohorts = new Map<number, Map<number, number>>();
  for (const r of rows) {
    const c = Math.floor(first.get(r.install)! / (7 * DAY)) * 7;
    const d = Math.floor(r.at / DAY);
    const m = cohorts.get(c) ?? cohorts.set(c, new Map()).get(c)!;
    m.set(d, (m.get(d) ?? 0) + r.reward);
  }
  const cumulative = [...cohorts].sort((a, b) => a[0] - b[0]).map(([c, m]) => {
    let s = 0;
    return { cohort: c, points: [...m].sort((a, b) => a[0] - b[0]).map(([d, v]) => ({ day: d, cum: (s += v) })) };
  });
  const th = rows.filter((r) => r.theta?.length);
  const len = Math.max(0, ...th.map((r) => r.theta!.length));
  const weights = Array.from({ length: len }, (_, i) => mean(th.filter((r) => r.theta!.length > i).map((r) => r.theta![i])));
  return {
    installs: first.size, rows: rows.length,
    zeroEdit7d: { n: week.length, rate: mean(week.map((r) => (r.zeroEdit ? 1 : 0))) },
    policies, kinds, hours, cumulative, weights,
  };
}
export type Stats = ReturnType<typeof aggregate>;
