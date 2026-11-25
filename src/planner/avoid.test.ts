import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { DAY, MIN } from "./features";
import { newModel, plan } from "./index";

const now = new Date(2026, 10, 16, 8, 0).getTime(); // Monday 08:00
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "study", source: "user", effort: 180, createdAt: now, ...o });
const sittings = (placed: { id: string; start: number; end: number }[], id: string) =>
  placed.filter((p) => p.id === id || p.id.startsWith(`${id}#`)).map((p) => (p.end - p.start) / MIN);

describe("anti-avoidance sizes", () => {
  it("a deadline kind the user keeps pushing gets sittings of at most 45 minutes (half hours: 30)", () => {
    const m = newModel(now);
    m.slip.study = { later: 9, placed: 10 }; // slipOf 0.9
    const { diff } = plan([task("a", { deadline: now + 3 * DAY })], [], m, now);
    const s = sittings(diff.placed, "a");
    expect(s.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...s)).toBeLessThanOrEqual(45);
  });

  it("a kind that is not slipping keeps its longer sittings", () => {
    const { diff } = plan([task("a", { deadline: now + 3 * DAY })], [], newModel(now), now);
    expect(Math.max(...sittings(diff.placed, "a"))).toBeGreaterThan(45);
  });

  it("prep (forId) is not capped", () => {
    const m = newModel(now);
    m.slip.study = { later: 9, placed: 10 };
    const { diff } = plan([task("p", { deadline: now + 3 * DAY, forId: "exam" })], [], m, now);
    expect(Math.max(...sittings(diff.placed, "p"))).toBeGreaterThan(45);
  });
});
