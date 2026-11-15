import * as store from "./store";
import type { Move, Warn } from "./types";

const DAY = 86400_000;
const read = async <T>(k: string): Promise<T[]> => {
  try { return JSON.parse((await store.kvGet(k)) ?? "[]"); } catch { return []; }
};

export const loadMoves = (): Promise<Move[]> => read<Move>("moves");
export const loadWarn = (): Promise<Warn[]> => read<Warn>("warn");
export const saveWarn = (w: Warn[]) => store.kvSet("warn", JSON.stringify(w));

/** Keeps the last 60 moves of the last 7 days. */
export async function recordMoves(moves: Move[]): Promise<void> {
  if (!moves.length) return;
  const cut = Math.max(...moves.map((m) => m.at)) - 7 * DAY;
  await store.kvSet("moves", JSON.stringify([...(await loadMoves()), ...moves].filter((m) => m.at >= cut).slice(-60)));
}

/** The brief showed these: it never shows them again. Their trail dots stay until seen. */
export async function briefMoves(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const all = await loadMoves();
  await store.kvSet("moves", JSON.stringify(all.map((m) => (ids.includes(m.id) ? { ...m, briefed: true } : m))));
}

export async function seeMoves(ids?: string[]): Promise<void> {
  const all = await loadMoves();
  await store.kvSet("moves", JSON.stringify(all.map((m) => (!ids || ids.includes(m.id) ? { ...m, seen: true } : m))));
}
