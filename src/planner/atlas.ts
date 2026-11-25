// Learned tastes by hour and part of day, as cells with an error bar: what the outcomes say about each kind, and which context moves it. Pure: no UI, no writes.
import type { Kind } from "../lib/types";
import { I_AFTER, partIdx } from "./features";
import { type Arm, D, KINDS, LAMBDA_PART, coldArms, coldParts, invert } from "./linucb";
import type { Model } from "./model";

export interface Cell { mu: number; se: number; n: number; enough: boolean }

const SIGMA = 0.5; // same reward scale as mine.ts
const ENOUGH_N = 3, ENOUGH_SE = 0.25; // outcomes for a kind, and the largest error bar it may have, before it is said
const CTX_N = 3, CTX_SHARE = 0.4; // outcomes at an hour, and the share of them a context must cover, before it is listed
// Context features: weekend, busy, due, then the "right after a block of kind j" block.
const CTX = [1, 2, 3, ...KINDS.map((_, k) => I_AFTER + k)];

const thetaOf = (arm: Arm): number[] => {
  const inv = invert(arm.A);
  return Array.from({ length: D }, (_, i) => {
    let s = 0;
    for (let j = 0; j < D; j++) s += inv[i * D + j] * arm.b[j];
    return s;
  });
};

// The prediction for x = e0 + e_f (intercept + kind), its learned change from the cold prior, its error, and the kind's evidence.
function cell(A: number[], Ae: number[], th: number[], thCold: number[], f: number): Cell {
  const inv = invert(A);
  const se = SIGMA * Math.sqrt(Math.max(0, inv[0] + 2 * inv[f] + inv[f * D + f])); // xᵀA⁻¹x, A⁻¹ symmetric
  const n = Ae[f * D + f];
  return { mu: th[0] + th[f] - thCold[0] - thCold[f], se, n, enough: n >= ENOUGH_N && se < ENOUGH_SE };
}

// The hour arm blended with its part arm, as the planner reads it (prepare). Evidence: hour + LAMBDA_PART * part, on the hour's cold A.
function hourBlend(m: Model, hour: number) {
  const cold = coldArms()[hour], part = partIdx(hour), coldP = coldParts()[part];
  const ha = m.arms?.[hour] ?? cold, pa = m.parts?.[part] ?? coldP;
  const Ae = ha.A.map((v, i) => v - cold.A[i] + LAMBDA_PART * (pa.A[i] - coldP.A[i]));
  const A = Ae.map((e, i) => cold.A[i] + e);
  const tp = thetaOf(pa), tcp = thetaOf(coldP);
  const th = thetaOf(ha).map((v, i) => v + LAMBDA_PART * tp[i]);
  const thCold = thetaOf(cold).map((v, i) => v + LAMBDA_PART * tcp[i]);
  return { A, Ae, th, thCold };
}

/** One hour as the planner sees it: each kind's cell, and the contexts that hold most of its outcomes (share >= 0.4, biggest first). */
export function hourView(m: Model, hour: number): { kinds: (Cell & { kind: Kind })[]; ctx: { feature: number; share: number; n: number }[] } {
  const b = hourBlend(m, hour);
  // The planner's own estimate, not the change from its starting curve: that curve already rates some hours high, so a change would
  // understate them. Shown only once `enough`, when the outcomes outweigh the curve.
  const zero = new Array(D).fill(0);
  const kinds = KINDS.map((kind, k) => ({ kind, ...cell(b.A, b.Ae, b.th, zero, 4 + k) }));
  const n = b.Ae[0];
  const ctx = CTX.map((feature) => ({ feature, share: n > 0 ? b.Ae[feature] / n : 0, n }))
    .filter((c) => c.n >= CTX_N && c.share >= CTX_SHARE)
    .sort((x, y) => y.share - x.share);
  return { kinds, ctx };
}

/** Every kind in every part, from the part arms alone (no hour blend). */
export function lasoGrid(m: Model): (Cell & { kind: Kind; part: number })[] {
  const cp = coldParts();
  return cp.flatMap((cold, p) => {
    const arm = m.parts?.[p] ?? cold;
    const Ae = arm.A.map((v, i) => v - cold.A[i]);
    const th = thetaOf(arm), thCold = thetaOf(cold);
    return KINDS.map((kind, k) => ({ kind, part: p, ...cell(arm.A, Ae, th, thCold, 4 + k) }));
  });
}
