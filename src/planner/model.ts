import type { Kind, Reason, Rule } from "../lib/types";
import { type Arm, KINDS, D, coldArms, fitArms, mapFeat } from "./linucb";
import type { PartName } from "../lib/parts";

export interface Hist { vec: number[]; hour: number; r: number; at: number; miss?: true } // miss: the planner saw a block pass undone, not a move you made
export interface Placed { arm: number; x: number[]; start: number; policy?: string; at?: number; moved?: boolean; why?: Reason[]; alt?: number; explore?: boolean; missCharged?: number /* the missed start already charged: a stale block is not charged twice */ }

// Plain JSON, safe to store as-is.
export interface Model {
  at: number;
  arms: Arm[];
  matrix?: number[]; // legacy heuristic cells; no longer read or written
  slip: Record<Kind, { later: number; placed: number }>;
  hist: Hist[];
  kept?: number[]; // when a placement was left where Zen put it (a silent keep): the Sunday keep share counts these, ≤300
  doneHours: { hour: number; at: number }[];
  moved?: { hour: number; at: number }[]; // hours you dragged work to, whether or not the planner had placed it
  left?: { hour: number; at: number }[]; // hours you dragged work away from: the slots not to fill again
  efforts: { vec: number[]; minutes: number; at: number; kind?: Kind; guess?: number }[]; // guess: the length it had when it was only a guess
  afterClass?: number[]; // minutes from a lecture or exam's end to the start of the work you ticked after it (the same day), last 30
  placed: Record<string, Placed>;
  lead?: Partial<Record<Kind, number[]>>; // per kind, the share of a dated task's window left when it was done (last 20)
  prior?: number; // cold-prior version; see upgradePrior
  exploredAt?: number; // the last time a new piece was placed as the explorer: one explorer a day
  mix: number; // legacy A/B share; unused since linucb is the only policy
  rules?: Rule[]; // said by the user; absent on models saved before rules
  partSeen?: Partial<Record<PartName, number[]>>; // minute-of-day of done ticks for tasks whose tods named exactly one part (≤50 each)
  active?: { first: number; last: number; day: number }[]; // per local day (dayStart ms): minute-of-day of the first and last learn() event (≤30 days)
}

export function newModel(now: number): Model {
  const slip = {} as Model["slip"];
  for (const k of KINDS) slip[k] = { later: 0, placed: 0 };
  return {
    at: now, arms: coldArms(), slip,
    hist: [], doneHours: [], moved: [], efforts: [], placed: {}, mix: 1, rules: [], prior: 2,
  };
}

/** Minutes of rest you leave after a lecture or exam before own work starts: the median of 5 or more samples (0 to 60), else 15. */
export function afterBuffer(m: Model): number {
  const xs = m.afterClass ?? [];
  if (xs.length < 5) return 15;
  const s = [...xs].sort((a, b) => a - b);
  return Math.min(60, Math.max(0, s[Math.floor(s.length / 2)]));
}

/** A saved model from an older layout (fewer kinds): arms, slip counts and placed feature rows move onto this one. */
export function migrateModel(m: Model): Model {
  m.arms = fitArms(m.arms);
  for (const k of KINDS) m.slip[k] ??= { later: 0, placed: 0 };
  m.moved ??= [];
  m.partSeen ??= {};
  m.active ??= [];
  m.afterClass ??= [];
  m.lead ??= {};
  for (const p of Object.values(m.placed)) {
    if (p.x.length === D) continue;
    const k0 = (p.x.length - 6) / 2, x = new Array(D).fill(0);
    if (Number.isInteger(k0) && k0 >= 0) p.x.forEach((v, i) => { x[mapFeat(i, k0)] = v; });
    p.x = x;
  }
  return m;
}
