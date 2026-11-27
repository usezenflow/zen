import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyProposal, canRebalance, dismissProposal, maybeRebalance, proposalFor, proposeRebalance } from "./apply";
import { newModel } from "../planner";
import type { Task } from "./types";

const db = vi.hoisted(() => ({ tasks: new Map<string, any>(), events: new Map<string, any>(), kv: new Map<string, string>(), model: null as any }));
vi.mock("./store", () => ({
  allTasks: async () => [...db.tasks.values()],
  putTasks: async (ts: Task[]) => ts.forEach((x) => db.tasks.set(x.id, x)),
  removeTasks: async (ids: string[]) => ids.forEach((i) => db.tasks.delete(i)),
  allEvents: async () => [...db.events.values()],
  keptPlaced: async () => ({ kept: new Set<string>(), placed: new Map<string, number>() }),
  putEvent: async (e: any) => void db.events.set(e.id, e),
  putEvents: async (es: any[]) => es.forEach((e) => db.events.set(e.id, e)),
  removeEvents: async (ids: string[]) => ids.forEach((i) => db.events.delete(i)),
  loadModel: async (now: number) => db.model ?? newModel(now),
  saveModel: async (m: unknown) => void (db.model = m),
  kvGet: async (k: string) => db.kv.get(k) ?? null,
  kvSet: async (k: string, v: string) => void db.kv.set(k, v),
}));

const NOW = new Date("2026-11-13T08:00:00").getTime();
const H = 3600_000;
const DAY1 = new Date("2026-11-14T00:00:00").getTime();

/** Four 2 h tasks booked on tomorrow (8 h, over the 6 h cap), with a far deadline so they can move. */
function overloaded() {
  const day = DAY1;
  [[9, 11], [11, 13], [14, 16], [16, 18]].forEach(([a, b], i) => {
    const start = day + a * H, end = day + b * H;
    db.tasks.set(`t${i}`, { id: `t${i}`, title: `Việc ${i}`, kind: "work", source: "user", effort: 120, createdAt: NOW - H, start, end });
  });
}
const starts = () => Object.fromEntries([...db.tasks.values()].map((x) => [x.id, x.start]));

beforeEach(() => { db.tasks.clear(); db.events.clear(); db.kv.clear(); db.model = null; });

describe("rebalance proposal", () => {
  it("no proposal for a calm calendar", async () => {
    db.tasks.set("a", { id: "a", title: "Đọc", kind: "study", source: "user", effort: 30, createdAt: NOW - H, start: DAY1 + 9 * H, end: DAY1 + 9.5 * H, deadline: DAY1 + 3 * 24 * H });
    expect(await proposeRebalance(NOW)).toBeUndefined();
    expect(db.kv.get("rebalance.proposal")).toBe("");
  });

  it("an overloaded day yields a proposal, and nothing moves until applied", async () => {
    overloaded();
    const before = starts();
    const moves = await proposeRebalance(NOW);
    expect(moves?.length).toBeGreaterThanOrEqual(1);
    for (const m of moves!) expect(m.from).not.toBe(m.to);
    expect(starts()).toEqual(before); // dry run: the calendar is untouched
    expect(await proposalFor([...db.tasks.values()])).toEqual(moves);
  });

  it("canRebalance mirrors the proposal and stores nothing", async () => {
    expect(await canRebalance(NOW)).toBe(false);
    overloaded();
    expect(await canRebalance(NOW)).toBe(true);
    expect(db.kv.get("rebalance.proposal")).toBeUndefined(); // dry: no proposal written
  });

  it("applyProposal moves exactly the proposed tasks, undoably", async () => {
    overloaded();
    const before = starts();
    const moves = (await proposeRebalance(NOW))!;
    const r = await applyProposal(NOW);
    expect(r?.undoable).toBe(true);
    for (const m of moves) expect(db.tasks.get(m.id).start).toBe(m.to);
    for (const id of Object.keys(before)) if (!moves.some((m) => m.id === id)) expect(db.tasks.get(id).start).toBe(before[id]);
    expect(await proposalFor([...db.tasks.values()])).toBeUndefined(); // applied: the calendar changed, so no proposal stands
    await r!.undo();
    expect(starts()).toEqual(before);
  });

  it("a dismissed proposal is not offered again until the tasks change", async () => {
    overloaded();
    expect(await proposeRebalance(NOW)).toBeDefined();
    await dismissProposal();
    expect(await proposalFor([...db.tasks.values()])).toBeUndefined();
    expect(await proposeRebalance(NOW)).toBeUndefined();
    expect(await proposeRebalance(NOW, true)).toBeDefined(); // the user's own ask still works
    await dismissProposal();
    // a change to the task set that leaves the overloaded day as it was: the proposal is offered again
    db.tasks.set("later", { id: "later", title: "Đi chợ", kind: "errand", source: "user", effort: 60, createdAt: NOW - H, start: DAY1 + 2 * 24 * H + 9 * H, end: DAY1 + 2 * 24 * H + 10 * H });
    expect(await proposeRebalance(NOW)).toBeDefined();
  });

  it("maybeRebalance offers at most once a day", async () => {
    overloaded();
    expect(await maybeRebalance(NOW)).toBeDefined();
    expect(await maybeRebalance(NOW + H)).toBeUndefined();
  });
});
