import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { HOUR } from "./features";
import { type Env, solve } from "./place";
import type { Piece } from "./value";

const now = new Date(2026, 10, 16, 8, 0).getTime();
const at = (d: number, h: number) => new Date(2026, 10, 16 + d, h, 0).getTime();
const piece = (id: string, o: Partial<Task> = {}, effort = 60): Piece =>
  ({ id, task: { id, title: id, kind: "other", source: "user", effort, createdAt: now, ...o }, effort, k: 1, n: 1, slip: 0 });
const env = (util: Env["util"], busy: Env["busy"] = []): Env => ({ busy, fixedEnds: [], now, util });
const hourly = (p: Piece, s: number) => -Math.abs(new Date(s).getHours() - 10) * 0.1 + (p.id.length % 3) * 0.01;

describe("solve", () => {
  const ps = ["a", "bb", "ccc", "d", "ee"].map((id, i) => piece(id, { deadline: at(1 + i, 20) }));
  const e = env(hourly, [{ start: at(0, 9), end: at(0, 12) }]);

  it("never scores below greedy, is deterministic, logs only gains", () => {
    const r = solve(ps, e, 7);
    expect(r.score).toBeGreaterThanOrEqual(r.greedyScore - 1e-9);
    const r2 = solve(ps, e, 7);
    expect([...r2.starts]).toEqual([...r.starts]);
    expect(r2.score).toBe(r.score);
    expect(r.log.length).toBeGreaterThan(0);
    for (const l of r.log) expect(l.gain).toBeGreaterThan(0);
  });

  it("stays off busy time when room exists", () => {
    const r = solve(ps, e, 3);
    for (const p of ps) { const s = r.starts.get(p.id)!; expect(s + HOUR <= at(0, 9) || s >= at(0, 12)).toBe(true); }
  });

  it("an ejection chain beats greedy when the first piece sits on the second's best cell", () => {
    const X = at(0, 10), Z = at(0, 15);
    // a is placed first and takes X (1.0 vs 0.9 at Z); b only likes X. Moving b to X alone overlaps a, so only a chain pays.
    const u: Env["util"] = (p, s) => (s === X ? 1 : p.id === "a" && s === Z ? 0.9 : 0.1);
    const r = solve([piece("a"), piece("b")], env(u), 1);
    expect(r.score).toBeGreaterThan(r.greedyScore + 0.5);
    expect(r.starts.get("b")).toBe(X);
    expect(r.starts.get("a")).toBe(Z);
    expect(r.log.some((l) => l.kind === "chain")).toBe(true);
  });
});
