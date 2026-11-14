import type { Kind, Reason, Rule } from "../lib/types";
import { type Arm, coldArms } from "./linucb";

export interface Hist { vec: number[]; hour: number; r: number; at: number }
export interface Placed { arm: number; x: number[]; start: number; policy?: string; at?: number; moved?: boolean; why?: Reason[]; alt?: number; explore?: boolean }

// Plain JSON, safe to store as-is.
export interface Model {
  at: number;
  arms: Arm[];
  matrix?: number[]; // legacy heuristic cells; no longer read or written
  slip: Record<Kind, { later: number; placed: number }>;
  hist: Hist[];
  doneHours: { hour: number; at: number }[];
  efforts: { vec: number[]; minutes: number; at: number }[];
  placed: Record<string, Placed>;
  prior?: number; // cold-prior version; see upgradePrior
  mix: number; // legacy A/B share; unused since linucb is the only policy
  rules?: Rule[]; // said by the user; absent on models saved before rules
}

export function newModel(now: number): Model {
  const slip = {} as Model["slip"];
  for (const k of ["study", "exercise", "chores", "social", "other"] as Kind[]) slip[k] = { later: 0, placed: 0 };
  return {
    at: now, arms: coldArms(), slip,
    hist: [], doneHours: [], efforts: [], placed: {}, mix: 1, rules: [], prior: 2,
  };
}
