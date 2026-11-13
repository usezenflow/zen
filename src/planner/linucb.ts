export const D = 16;
export const ARMS = 24;
export const LAMBDA = 1;
export const ALPHA = 0.15;
export const N0 = 3;
export const HALF_LIFE = 21 * 86400000;

export interface Arm { A: number[]; b: number[] } // A is D*D row-major

// Default daily curve: morning and afternoon bumps, flat low at night.
export const curve = (h: number) =>
  0.5 * Math.max(Math.exp(-((h - 10) ** 2) / 18), Math.exp(-((h - 16) ** 2) / 18)) - 0.1;

export function coldArms(): Arm[] {
  return Array.from({ length: ARMS }, (_, a) => {
    const A = new Array(D * D).fill(0);
    for (let i = 0; i < D; i++) A[i * D + i] = LAMBDA;
    A[0] += N0;
    const b = new Array(D).fill(0);
    b[0] = N0 * curve(a);
    return { A, b };
  });
}

// Evidence fades toward the ridge prior.
export function decayArms(arms: Arm[], dtMs: number) {
  if (dtMs <= 0) return;
  const g = 0.5 ** (dtMs / HALF_LIFE);
  for (const arm of arms) {
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) {
      const k = i * D + j;
      const base = i === j ? LAMBDA : 0;
      arm.A[k] = base + g * (arm.A[k] - base);
    }
    for (let i = 0; i < D; i++) arm.b[i] *= g;
  }
}

export function update(arm: Arm, x: number[], r: number, w = 1) {
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < D; j++) arm.A[i * D + j] += w * x[i] * x[j];
    arm.b[i] += w * r * x[i];
  }
}

function invert(A: number[]): number[] {
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

export interface Prepared { theta: number[][]; inv: number[][] }

export function prepare(arms: Arm[]): Prepared {
  const inv = arms.map((a) => invert(a.A));
  const theta = arms.map((a, k) =>
    Array.from({ length: D }, (_, i) => {
      let s = 0;
      for (let j = 0; j < D; j++) s += inv[k][i * D + j] * a.b[j];
      return s;
    }));
  return { theta, inv };
}

export function ucb(p: Prepared, arm: number, x: number[], alpha = ALPHA): number {
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
