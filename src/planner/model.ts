import type { Kind } from "../lib/types";
import { type Arm, coldArms } from "./linucb";

export interface Hist { vec: number[]; hour: number; r: number; at: number }
export interface Placed { arm: number; x: number[]; start: number; otherStart?: number; policy?: string; at?: number; moved?: boolean }

// Plain JSON, safe to store as-is.
export interface Model {
  at: number;
  arms: Arm[];
  matrix: number[]; // 7 weekdays * 24 hours
  slip: Record<Kind, { later: number; placed: number }>;
  hist: Hist[];
  doneHours: { hour: number; at: number }[];
  efforts: { vec: number[]; minutes: number; at: number }[];
  placed: Record<string, Placed>;
  mix: number; // share of placements given to linucb
}

export function newModel(now: number): Model {
  const slip = {} as Model["slip"];
  for (const k of ["study", "exercise", "chores", "social", "other"] as Kind[]) slip[k] = { later: 0, placed: 0 };
  return {
    at: now, arms: coldArms(), matrix: new Array(168).fill(0), slip,
    hist: [], doneHours: [], efforts: [], placed: {}, mix: 0.5,
  };
}
