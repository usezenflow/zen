import type { Kind, Reason, Rule } from "../lib/types";
import { type Arm, KINDS, D, coldArms, fitArms, mapFeat } from "./linucb";

export interface Hist { vec: number[]; hour: number; r: number; at: number; miss?: true } // miss: the planner saw a block pass undone, not a move you made
export interface Placed { arm: number; x: number[]; start: number; policy?: string; at?: number; moved?: boolean; why?: Reason[]; alt?: number; explore?: boolean }

// Plain JSON, safe to store as-is.
export interface Model {
  at: number;
  arms: Arm[];
  matrix?: number[]; // legacy heuristic cells; no longer read or written
  slip: Record<Kind, { later: number; placed: number }>;
  hist: Hist[];
  doneHours: { hour: number; at: number }[];
  moved?: { hour: number; at: number }[]; // hours you dragged work to, whether or not the planner had placed it
  left?: { hour: number; at: number }[]; // hours you dragged work away from: the slots not to fill again
  efforts: { vec: number[]; minutes: number; at: number; kind?: Kind }[];
  placed: Record<string, Placed>;
  prior?: number; // cold-prior version; see upgradePrior
  mix: number; // legacy A/B share; unused since linucb is the only policy
  rules?: Rule[]; // said by the user; absent on models saved before rules
}

export function newModel(now: number): Model {
  const slip = {} as Model["slip"];
  for (const k of KINDS) slip[k] = { later: 0, placed: 0 };
  return {
    at: now, arms: coldArms(), slip,
    hist: [], doneHours: [], moved: [], efforts: [], placed: {}, mix: 1, rules: [], prior: 2,
  };
}

/** A saved model from an older layout (fewer kinds): arms, slip counts and placed feature rows move onto this one. */
export function migrateModel(m: Model): Model {
  m.arms = fitArms(m.arms);
  for (const k of KINDS) m.slip[k] ??= { later: 0, placed: 0 };
  m.moved ??= [];
  for (const p of Object.values(m.placed)) {
    if (p.x.length === D) continue;
    const k0 = (p.x.length - 6) / 2, x = new Array(D).fill(0);
    if (Number.isInteger(k0) && k0 >= 0) p.x.forEach((v, i) => { x[mapFeat(i, k0)] = v; });
    p.x = x;
  }
  return m;
}
