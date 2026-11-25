import type { Kind } from "../lib/types";

/** The task kinds, in feature order. Append only: a saved model keeps its columns by position. */
export const KINDS: Kind[] = ["study", "exercise", "chores", "social", "other", "work", "errand", "finance", "self"];
/** Feature vector: [1, weekend, busy, due, kind(K), after(K), energy, similar]. */
export const D = 6 + 2 * KINDS.length;
export const ARMS = 24;
export const LAMBDA = 1;
export const ALPHA = 0.12;
export const N0 = 3;
export const HALF_LIFE = 14 * 86400000;

export interface Arm { A: number[]; b: number[] } // A is D*D row-major

// Default daily curve: morning and afternoon bumps, flat low at night.
const bumps = (h: number) => 0.5 * Math.max(Math.exp(-((h - 10) ** 2) / 18), Math.exp(-((h - 16) ** 2) / 18)) - 0.1;
const dip = (h: number) => (h === 12 ? 0.15 : h === 18 ? 0.1 : 0); // lunch and dinner
export const curve = (h: number) => bumps(h) - dip(h);

// Prior on each kind's one-hot weight (features 4..4+K); small, so real outcomes override it.
const g = (h: number, c: number, s = 6) => Math.exp(-((h - c) ** 2) / s);
export const KIND_MASS = 1;
export const kindCurve = (k: number, h: number) => 0.3 * [
  Math.max(g(h, 10), g(h, 15), g(h, 19)), // study
  Math.max(g(h, 7), g(h, 17)), // exercise
  g(h, 17), // chores
  g(h, 19, 10) - 0.7 * g(h, 10, 10) + dip(h), // social: evenings, not dipped at meals
  0, // other
  Math.max(g(h, 10), g(h, 14)), // work: office hours
  g(h, 11), // errand: late morning, shops are open
  g(h, 12, 4), // finance: lunch break
  Math.max(g(h, 7, 4), g(h, 21, 8)), // self: first thing and before sleep
][k];

// v 1 is the prior before per-kind hours, kept to upgrade saved models.
export function coldArms(v = 2): Arm[] {
  return Array.from({ length: ARMS }, (_, a) => {
    const A = new Array(D * D).fill(0);
    for (let i = 0; i < D; i++) A[i * D + i] = LAMBDA;
    A[0] += N0;
    const b = new Array(D).fill(0);
    b[0] = N0 * (v === 1 ? bumps(a) : curve(a));
    if (v > 1) for (let k = 0; k < KINDS.length; k++) { A[(4 + k) * D + 4 + k] += KIND_MASS; b[4 + k] = KIND_MASS * kindCurve(k, a); }
    return { A, b };
  });
}

// Part arms, with no prior (partIdx order): each hour's theta is its own plus LAMBDA_PART times its part's (prepare), so a part's evidence
// reaches hours with none of their own. Tuned on the paired bench; a kind x part pool was tried and broke the focus gates (load, buffer, lead).
export const PARTS = 4;
export const LAMBDA_PART = 0.5;
/** The part of the day of an hour: sáng, trưa, chiều, tối. Lives here, not in features.ts, which imports this file. */
export const partIdx = (h: number) => (h < 11 ? 0 : h < 13 ? 1 : h < 18 ? 2 : 3);
export function coldParts(): Arm[] {
  return Array.from({ length: PARTS }, () => {
    const A = new Array(D * D).fill(0);
    for (let i = 0; i < D; i++) A[i * D + i] = LAMBDA;
    return { A, b: new Array(D).fill(0) };
  });
}

const decayTo = (arm: Arm, cold: Arm, f: number) => {
  for (let k = 0; k < D * D; k++) arm.A[k] = cold.A[k] + f * (arm.A[k] - cold.A[k]);
  for (let i = 0; i < D; i++) arm.b[i] = cold.b[i] + f * (arm.b[i] - cold.b[i]);
};

// Evidence fades toward the cold prior, not past it: a model with no outcomes never looks learned.
export function decayArms(arms: Arm[], dtMs: number, parts?: Arm[]) {
  if (dtMs <= 0) return;
  const f = 0.5 ** (dtMs / HALF_LIFE), cold = coldArms(), cp = coldParts();
  arms.forEach((arm, a) => decayTo(arm, cold[a], f));
  parts?.forEach((arm, p) => decayTo(arm, cp[p], f));
}

/** Feature i of a layout with k0 kinds, in this layout: kinds keep their place, the blocks after them shift. */
export const mapFeat = (i: number, k0: number): number => {
  const k = KINDS.length;
  return i < 4 + k0 ? i : i < 4 + 2 * k0 ? i + k - k0 : i + 2 * (k - k0);
};

/** Arms saved with fewer kinds move onto this layout: shared columns keep their evidence, new ones start at the prior. */
export function fitArms(arms: Arm[]): Arm[] {
  const cold = coldArms();
  return arms.map((arm, a) => {
    const oD = Math.round(Math.sqrt(arm.A.length));
    if (oD === D) return arm;
    if (oD < 6 || oD > D || (oD - 6) % 2 || arm.b.length !== oD) return cold[a]; // not a layout we know: start over
    const k0 = (oD - 6) / 2, A = [...cold[a].A], b = [...cold[a].b];
    for (let i = 0; i < oD; i++) {
      const ni = mapFeat(i, k0);
      b[ni] = arm.b[i];
      for (let j = 0; j < oD; j++) A[ni * D + mapFeat(j, k0)] = arm.A[i * oD + j];
    }
    return { A, b };
  });
}

// Saved models get the new prior once.
// shortcut: the old prior had partly decayed, so the exact delta is unknowable; add the full difference, drop it if a reset is ever acceptable.
export function upgradePrior(m: { arms: Arm[]; prior?: number }) {
  if ((m.prior ?? 1) >= 2) return;
  const o = coldArms(1), n = coldArms();
  m.arms.forEach((arm, a) => {
    for (let k = 0; k < D * D; k++) arm.A[k] += n[a].A[k] - o[a].A[k];
    for (let i = 0; i < D; i++) arm.b[i] += n[a].b[i] - o[a].b[i];
  });
  m.prior = 2;
}

export function update(arm: Arm, x: number[], r: number, w = 1) {
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < D; j++) arm.A[i * D + j] += w * x[i] * x[j];
    arm.b[i] += w * r * x[i];
  }
}

export function invert(A: number[]): number[] {
  const n = D;
  const M = Array.from({ length: n }, (_, i) => [
    ...A.slice(i * n, i * n + n),
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.flatMap((row) => row.slice(n));
}

export interface Prepared { theta: Float64Array[]; inv: Float64Array[] }

const thetaOf = (arm: Arm, inv: Float64Array) => {
  const th = new Float64Array(D);
  for (let i = 0; i < D; i++) { let s = 0; for (let j = 0; j < D; j++) s += inv[i * D + j] * arm.b[j]; th[i] = s; }
  return th;
};

/** theta of each hour arm: its own, plus LAMBDA_PART times its part's (partOf maps hour arm to part). The width stays the hour arm's. */
export function prepare(arms: Arm[], parts?: Arm[], partOf?: number[]): Prepared {
  const inv = arms.map((a) => Float64Array.from(invert(a.A)));
  const theta = arms.map((a, k) => thetaOf(a, inv[k]));
  if (parts && partOf) {
    const pt = parts.map((p) => thetaOf(p, Float64Array.from(invert(p.A))));
    theta.forEach((th, h) => { const q = pt[partOf[h]]; for (let i = 0; i < D; i++) th[i] += LAMBDA_PART * q[i]; });
  }
  return { theta, inv };
}

const HOUR_PART = Array.from({ length: ARMS }, (_, h) => partIdx(h));

/** The one posterior the planner, atlas and insights read. theta and inv are exactly prepare(arms, parts, HOUR_PART): the width stays the hour arm's.
 * A is the blended evidence per hour (hour A + LAMBDA_PART * (part A - its cold A)); atlas counts outcomes on it. */
export interface Posterior extends Prepared { A: number[][] }
export function posteriorOf(m: { arms: Arm[]; parts?: Arm[] }): Posterior {
  const p = prepare(m.arms, m.parts, HOUR_PART), cp = coldParts();
  const A = m.arms.map((arm, h) => {
    const k = HOUR_PART[h], pa = m.parts?.[k];
    return pa ? arm.A.map((v, i) => v + LAMBDA_PART * (pa.A[i] - cp[k].A[i])) : [...arm.A];
  });
  return { ...p, A };
}

export function ucb(p: Prepared, arm: number, x: ArrayLike<number>, alpha = ALPHA): number {
  const th = p.theta[arm], inv = p.inv[arm];
  let mean = 0, q = 0;
  for (let i = 0; i < D; i++) {
    mean += th[i] * x[i];
    let s = 0;
    for (let j = 0; j < D; j++) s += inv[i * D + j] * x[j];
    q += x[i] * s;
  }
  return mean + alpha * Math.sqrt(Math.max(0, q));
}

/** Static half of UCB over a batch of rows X (n x D, row-major), one pass per arm:
 * mean = X·θ, V = X·A⁻¹, q = rowsum(V ⊙ X). V keeps only the `hot` columns (one-hot features patched in later). */
export interface Primed { mean: Float64Array; q: Float64Array; V: Float64Array; arm: Uint8Array; hot: number; w: number }

export function primeBatch(p: Prepared, X: Float64Array, arm: Uint8Array, hot: number, w: number): Primed {
  const n = arm.length;
  const mean = new Float64Array(n), q = new Float64Array(n), V = new Float64Array(n * w);
  const rows: number[][] = Array.from({ length: p.theta.length }, () => []);
  for (let i = 0; i < n; i++) rows[arm[i]].push(i);
  const v = new Float64Array(D);
  for (let a = 0; a < rows.length; a++) {
    const th = p.theta[a], inv = p.inv[a];
    for (const i of rows[a]) {
      const o = i * D;
      let m = 0, s = 0;
      v.fill(0);
      for (let k = 0; k < D; k++) {
        const xk = X[o + k];
        if (!xk) continue; // rows are mostly one-hot zeros
        m += th[k] * xk;
        const r = k * D;
        for (let j = 0; j < D; j++) v[j] += xk * inv[r + j];
      }
      for (let j = 0; j < D; j++) s += v[j] * X[o + j];
      mean[i] = m; q[i] = s;
      for (let j = 0; j < w; j++) V[i * w + j] = v[hot + j];
    }
  }
  return { mean, q, V, arm, hot, w };
}

/** UCB of row i with one-hot column hot+j set to 1 (j < 0: none), O(1): (x+e)ᵀM(x+e) = q + 2(xᵀM)_j + M_jj for symmetric M. */
export function ucbAt(p: Prepared, b: Primed, i: number, j: number, alpha = ALPHA): number {
  let mean = b.mean[i], q = b.q[i];
  if (j >= 0) {
    const a = b.arm[i], c = b.hot + j;
    mean += p.theta[a][c];
    q += 2 * b.V[i * b.w + j] + p.inv[a][c * D + c];
  }
  return mean + alpha * Math.sqrt(Math.max(0, q));
}
