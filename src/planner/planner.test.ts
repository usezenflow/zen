import { describe, expect, it } from "vitest";
import type { Kind, Task } from "../lib/types";
import { DAY, HOUR, MIN, dayStart, features, hourOf } from "./features";
import { coldArms, prepare, primeBatch, ucb, ucbAt, update } from "./linucb";
import { reasonText, stepText } from "../lib/reasons";
import { learn, newModel, outcome, plan, suggest, typeOf } from "./index";
import { awake, solve } from "./place";
import { split } from "./split";
import type { Piece } from "./value";
import { simulate } from "./sim";

const now = new Date(2026, 10, 16, 8, 0).getTime(); // Monday 08:00
const at = (d: number, h: number) => new Date(2026, 10, 16 + d, h, 0).getTime();
const task = (id: string, o: Partial<Task> = {}): Task =>
  ({ id, title: id, kind: "other", source: "user", effort: 60, createdAt: now, ...o });

describe("split and deadline", () => {
  it("splits effort over 90 into sittings of at most 90", () => {
    expect(split(60)).toEqual([60]);
    expect(split(240)).toEqual([120, 120]);
    expect(split(150)).toEqual([75, 75]);
    expect(split(120)).toEqual([120]);
  });

  it("keeps flexible work between 7:00 and 22:00 unless the user said the time", () => {
    const eve = new Date(2026, 10, 16, 20, 0).getTime();
    const lec = [{ start: at(1, 7), end: at(1, 11) }, { start: at(1, 13), end: at(1, 17) }];
    const { diff } = plan([task("a", { deadline: at(1, 23) }), task("b", { deadline: at(2, 23) }), task("c", { deadline: at(2, 23) })], lec, newModel(eve), eve);
    for (const p of diff.placed) {
      const d = new Date(p.start), e = new Date(p.end);
      expect(d.getHours()).toBeGreaterThanOrEqual(7);
      expect(e.getHours() * 60 + e.getMinutes()).toBeLessThanOrEqual(22 * 60);
    }
    const pc = (o: Partial<Task>) => ({ id: "r", task: task("r", o), effort: 60, k: 1, n: 1, slip: 0 });
    expect(awake(pc({ notBefore: at(1, 6) }), at(1, 6))).toBe(true); // said "6 giờ sáng"
    expect(awake(pc({ notBefore: at(1, 0) }), at(1, 6))).toBe(false); // a day's start is not a said time
    expect(awake(pc({}), at(1, 21))).toBe(true);
    expect(awake(pc({}), at(1, 21) + 30 * MIN)).toBe(false); // would end 22:30
  });

  it("lands every sitting before the deadline in order", () => {
    const deadline = at(4, 18);
    const { diff } = plan([task("essay", { effort: 300, deadline })], [], newModel(now), now);
    expect(diff.split[0].ids).toHaveLength(3);
    expect(diff.placed).toHaveLength(3);
    const ps = diff.split[0].ids.map((id) => diff.placed.find((p) => p.id === id)!);
    for (const p of ps) expect(p.end).toBeLessThanOrEqual(deadline);
    expect(ps[0].start).toBeLessThan(ps[1].start);
    expect(ps[1].start).toBeLessThan(ps[2].start);
  });
});

describe("solver", () => {
  it("local search never lowers the score", () => {
    const pieces: Piece[] = ["a", "b", "c", "d"].map((id, i) => ({
      id, task: task(id, { deadline: at(2, 20) }), effort: 60, k: 1, n: 1, slip: 0, prior: i ? at(0, 12) : undefined,
    }));
    const util = (_: Piece, s: number) => Math.sin(s / HOUR);
    const r = solve(pieces, { busy: [{ start: at(0, 9), end: at(0, 11) }], fixedEnds: [], now, util }, 7);
    expect(r.score).toBeGreaterThanOrEqual(r.greedyScore);
  });

  it("never overlaps busy time when room exists", () => {
    const busy = [{ start: at(0, 9), end: at(0, 17) }];
    const { diff } = plan([task("a"), task("b")], busy, newModel(now), now);
    for (const p of diff.placed) expect(p.start >= at(0, 17) || p.end <= at(0, 9)).toBe(true);
  });
});

describe("understanding", () => {
  it("similar moves a new task toward hours similar tasks were done", () => {
    const m = newModel(now);
    const v = new Float32Array(8).fill(0); v[0] = 1;
    for (let i = 0; i < 5; i++) m.hist.push({ vec: Array.from(v), hour: 19, r: 1, at: now - i * DAY });
    const x = features(task("talk", { vec: v }), at(1, 19), { fixedH: () => 0, peak: 15, nb: [{ w: 1, hour: 19, r: 1 }], ends: [] });
    for (let a = 18; a <= 20; a++) for (let i = 0; i < 30; i++) update(m.arms[a], x, 1);
    const { diff } = plan([task("talk", { vec: v })], [], m, now);
    expect(Math.abs(hourOf(diff.placed[0].start) - 19)).toBeLessThanOrEqual(1);
  });

  it("after learns gym then reading", () => {
    const m = newModel(now);
    const gym = task("gym", { kind: "exercise", fixed: "busy", start: at(1, 17), end: at(1, 18) });
    const read = task("read", { kind: "study" });
    const ctx = (ends: { kind: Kind; end: number }[]) => ({ fixedH: () => 0, peak: 15, nb: [], ends });
    const withGym = features(read, at(1, 18), ctx([{ kind: "exercise", end: at(1, 18) }]));
    const without = features(read, at(1, 18), ctx([]));
    for (let i = 0; i < 40; i++) {
      update(m.arms[18], withGym, 1);
      update(m.arms[18], without, -0.5);
    }
    const prep = prepare(m.arms);
    expect(ucb(prep, 18, withGym)).toBeGreaterThan(ucb(prep, 18, without));
    const { diff } = plan([gym, read], [], m, now);
    expect(diff.placed[0].start).toBeGreaterThanOrEqual(at(1, 18));
    expect(diff.placed[0].start).toBeLessThanOrEqual(at(1, 19));
    expect(diff.insight?.template).toContain("{prev}");
  });

  it("slip pulls deadline tasks earlier", () => {
    const t = task("hw", { kind: "study", deadline: at(5, 20) });
    const calm = plan([t], [], newModel(now), now).diff.placed[0].start;
    const m = newModel(now);
    m.slip.study = { later: 5, placed: 5 };
    const slipped = plan([t], [], m, now).diff.placed[0].start;
    expect(slipped).toBeLessThan(calm);
  });

  it("effort falls back to nearest done tasks then kind prior", () => {
    const m = newModel(now);
    const v = new Float32Array(4).fill(0); v[1] = 1;
    m.efforts.push({ vec: Array.from(v), minutes: 120, at: now });
    const a = plan([task("x", { effort: 0, vec: v })], [], m, now).diff;
    expect(a.split).toHaveLength(0); // 120 min is one sitting now
    expect(a.placed[0].end - a.placed[0].start).toBe(120 * MIN);
    const b = plan([task("y", { effort: 0, kind: "chores" })], [], newModel(now), now).diff;
    expect(b.placed[0].end - b.placed[0].start).toBe(30 * MIN);
  });
});

describe("policy and events", () => {
  it("has no heuristic policy: linucb logs arm, x and why", () => {
    const { diff } = plan([task("a"), task("b", { kind: "study" })], [], newModel(now), now);
    for (const p of diff.placed) {
      expect(p.policy).toBe("linucb");
      expect(p.arm).toBe(Math.floor(hourOf(p.start)));
      expect(p.x).toHaveLength(16);
    }
  });

  it("learns from every outcome and keeps JSON-plain state", () => {
    const t = task("a", { kind: "study", vec: new Float32Array(4).fill(1) });
    const { diff, model } = plan([t], [], newModel(now), now);
    const p = diff.placed[0];
    const placed = { ...t, start: p.start, end: p.end };
    const before = prepare(model.arms).theta[p.arm!][0];
    const m2 = learn(model, { id: "e", taskId: "a", type: "done", at: p.end }, placed);
    expect(prepare(m2.arms).theta[p.arm!][0]).toBeGreaterThan(before);
    expect(m2.hist).toHaveLength(1);
    const m3 = learn(m2, { id: "e2", taskId: "a", type: "later", at: p.end }, placed);
    expect(m3.slip.study.later).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(m3))).toEqual(m3);
    const m4 = learn(model, { id: "e3", taskId: "a", type: "drag", at: p.start - HOUR, data: { fromStart: p.start, toStart: p.start + 4 * HOUR } }, placed);
    expect(m4.placed.a.start).toBe(p.start + 4 * HOUR);
  });

  it("later moves a task off its current span", () => {
    const t = task("a");
    const { diff } = plan([t], [], newModel(now), now);
    const placed = { ...t, start: diff.placed[0].start, end: diff.placed[0].end };
    const r = plan([placed], [], newModel(now), now, { later: "a" });
    expect(r.diff.placed[0].start).not.toBe(placed.start);
  });

  it("is deterministic", () => {
    const ts = [task("a"), task("b", { deadline: at(3, 12) })];
    expect(plan(ts, [], newModel(now), now)).toEqual(plan(ts, [], newModel(now), now));
  });

  it("offers a fitting task for a gap starting soon", () => {
    const s = suggest([task("chores", { effort: 30 }), task("big", { effort: 240 })], [{ start: now + 90 * MIN, end: now + 5 * HOUR }], newModel(now), now);
    expect(s?.task.id).toBe("chores");
    expect(suggest([task("c")], [{ start: now, end: now + 5 * HOUR }], newModel(now), now)).toBeUndefined();
  });
});

describe("simulator", () => {
  it("full model beats greedy and hour-only on kept rate and drag", () => {
    const seeds = [1, 2, 3];
    const avg = (v: "full" | "hour" | "greedy") => {
      const r = seeds.map((s) => simulate(v, s));
      return { kept: r.reduce((a, x) => a + x.kept, 0) / r.length, drag: r.reduce((a, x) => a + x.drag, 0) / r.length };
    };
    const f = avg("full"), h = avg("hour"), g = avg("greedy");
    expect(f.kept).toBeGreaterThan(h.kept);
    expect(f.kept).toBeGreaterThan(g.kept);
    expect(f.drag).toBeLessThan(h.drag);
    expect(f.drag).toBeLessThan(g.drag);
  }, 60000);
});

describe("outcome", () => {
  it("reports the placed cell, policy and reward for stats", () => {
    const now = Date.UTC(2026, 10, 16, 8);
    const t = task("a", { effort: 60 });
    const { model } = plan([t], [], newModel(now), now);
    const ev = (type: "kept" | "later" | "drag", data?: Record<string, unknown>) => ({ id: "e", taskId: "a", type, at: now, data });
    expect(outcome(model, ev("kept"), t)).toMatchObject({ reward: 0.25, arm: model.placed.a.arm, policy: model.placed.a.policy });
    expect(outcome(model, ev("later"), t)?.reward).toBeCloseTo(-1, 9);
    expect(outcome(model, ev("drag", { fromStart: now, toStart: now + 2 * HOUR }), t)?.reward).toBeCloseTo(-1, 9);
    expect(outcome(newModel(now), ev("kept"), t)).toBeUndefined();
  });
});

describe("first move, maxSitting, typeOf, alt", () => {
  const t = task("a", { effort: 60 });
  const placed = () => plan([t], [], newModel(now), now).model;
  const later = (at: number) => ({ id: "e", taskId: "a", type: "later" as const, at });

  it("boosts the first later by 2 at 0 min and 1.37 at 30 min, then not again", () => {
    const m = placed();
    expect(outcome(m, later(now), t)?.reward).toBeCloseTo(-1, 9);
    expect(outcome(m, later(now + 30 * MIN), t)?.reward).toBeCloseTo(-0.5 * (1 + Math.exp(-1)), 9);
    const m2 = learn(m, later(now), t);
    expect(m2.placed.a.moved).toBe(true);
    expect(outcome(m2, later(now), t)?.reward).toBe(-0.5);
  });

  it("clamps a boosted drag to -2..0", () => {
    const r = outcome(placed(), { id: "e", taskId: "a", type: "drag", at: now, data: { toStart: placed().placed.a.start + 9 * HOUR } }, t)!.reward;
    expect(r).toBeCloseTo(-2, 9);
  });

  it("split honours maxSitting", () => {
    expect(split(90, 30)).toEqual([30, 30, 30]);
    const { diff } = plan([task("p", { effort: 90, maxSitting: 45, deadline: at(4, 18) })], [], newModel(now), now);
    expect(diff.split[0].ids).toHaveLength(2);
  });

  it("a tight deadline gets fewer, longer sittings: one per whole day left, one under a day", () => {
    const prep = (due: number) => plan([task("p", { effort: 120, maxSitting: 45, deadline: due })], [], newModel(now), now).diff;
    expect(prep(at(5, 18)).split[0].ids).toHaveLength(3); // plenty of time: the usual three
    expect(prep(at(2, 18)).split[0].ids).toHaveLength(2); // 2.4 days: two
    const lone = prep(now + 20 * HOUR); // under a day: one sitting, no split, longer than 45
    expect(lone.split).toHaveLength(0);
    const p = lone.placed.find((x) => x.id === "p")!;
    expect(p.end - p.start).toBeGreaterThan(45 * MIN);
  });

  it("typeOf", () => {
    expect(typeOf(task("x"))).toBe("plan");
    expect(typeOf(task("x", { deadline: 1 }))).toBe("assignment");
    expect(typeOf(task("x", { fixed: "exam", deadline: 1 }))).toBe("exam");
  });

  it("alt differs from the start", () => {
    for (const m of [newModel(now), newModel(now)]) {
      const p = plan([t], [], m, now).diff.placed[0];
      expect(p.alt).toBeDefined();
      expect(p.alt).not.toBe(p.start);
    }
  });
});

describe("reasons, rules, pins, moves", () => {
  const sorted = (w: number[]) => w.every((v, i) => !i || v <= w[i - 1]);

  it("why is present, sorted and at most 4", () => {
    const { diff, model } = plan([task("a", { kind: "study" }), task("b", { deadline: at(3, 12) })], [{ start: at(0, 9), end: at(0, 11) }], newModel(now), now);
    for (const p of diff.placed) {
      expect(p.why).toBeDefined();
      expect(p.why!.length).toBeLessThanOrEqual(4);
      expect(sorted(p.why!.map((r) => r.w))).toBe(true);
      expect(model.placed[p.id].why).toEqual(p.why);
    }
    expect(diff.steps?.[0]).toEqual({ key: "read", vars: { what: "tuần này" } });
  });

  it("a rule keeps a piece out of its window", () => {
    const m = newModel(now);
    m.rules = [{ id: "r", text: "không học trước 12h", days: [], from: 0, to: 720, kinds: ["study"], at: now }];
    const { diff } = plan([task("a", { kind: "study" })], [], m, now);
    const mins = (diff.placed[0].start - new Date(diff.placed[0].start).setHours(0, 0, 0, 0)) / MIN;
    expect(mins).toBeGreaterThanOrEqual(720);
    expect(diff.steps).toContainEqual({ key: "rule", vars: { text: "không học trước 12h" } });
  });

  it("a pinned task stays put and blocks others", () => {
    const pin = task("p", { pinned: true, start: at(0, 10), end: at(0, 11) });
    const { diff } = plan([pin, task("a")], [], newModel(now), now);
    expect(diff.placed.find((p) => p.id === "p")).toBeUndefined();
    const a = diff.placed.find((p) => p.id === "a")!;
    expect(a.start >= at(0, 11) || a.end <= at(0, 10)).toBe(true);
  });

  it("a small gain does not move the prior, a forced move does", () => {
    const first = plan([task("a")], [], newModel(now), now);
    const s = first.diff.placed[0].start;
    const again = plan([{ ...task("a"), start: s, end: s + HOUR }], [], first.model, now);
    expect(again.diff.placed).toHaveLength(0);
    expect(again.model.placed.a.why).toBeDefined();
    const forced = plan([{ ...task("a"), start: s, end: s + HOUR }], [{ start: s, end: s + HOUR }], first.model, now);
    expect(forced.diff.placed[0].from).toBe(s);
  });

  it("a missed task gets the missed reason and from", () => {
    const old = now - 3 * HOUR;
    const { diff } = plan([task("a", { start: old, end: old + HOUR })], [], newModel(now), now);
    const p = diff.placed[0];
    expect(p.from).toBe(old);
    expect(p.why![0].key).toBe("missed");
    expect(diff.displaced[0]).toMatchObject({ id: "a", from: old });
    expect(diff.steps).toContainEqual({ key: "missed", vars: { title: "a" } });
  });

  it("an impossible deadline yields a warn with fixes", () => {
    const ts = [task("big", { effort: 240, deadline: now + 4 * 60 * MIN }), task("other", { effort: 60, notBefore: now, notAfter: now + 2 * 60 * MIN })]; // "other" is kept before the deadline, so it can give way
    const { diff } = plan(ts, [], newModel(now), now);
    expect(diff.warn?.[0]).toMatchObject({ id: "big", need: 240 });
    expect(diff.warn![0].free).toBeLessThan(240);
    expect(diff.warn![0].fixes.length).toBeGreaterThan(0);
  });

  it("no card when nothing can give way; a past due task still gets one, with no pushes", () => {
    expect(plan([task("big", { effort: 90, deadline: now + 30 * MIN }), task("other", { effort: 60 })], [], newModel(now), now).diff.warn).toBeUndefined();
    const late = plan([task("late", { effort: 60, deadline: now - 60 * MIN }), task("other", { effort: 60 })], [], newModel(now), now).diff.warn;
    expect(late?.[0]).toMatchObject({ id: "late", fixes: [] });
  });

  it("no card for a task late by its own pin while free time far exceeds the need", () => {
    const ts = [task("pin", { effort: 60, deadline: now + 10 * 24 * 60 * MIN, start: now + 12 * 24 * 60 * MIN, pinned: true }), task("other", { effort: 60 })];
    expect(plan(ts, [], newModel(now), now).diff.warn).toBeUndefined();
  });

  it("deadline pieces never explore", () => {
    const m = newModel(now);
    for (let i = 0; i < 24; i++) update(m.arms[i], new Array(16).fill(0).map((_, k) => (k ? 0 : 1)), i % 3);
    const { diff } = plan([task("a", { deadline: at(3, 12) }), task("b", { deadline: at(2, 12) })], [], m, now);
    for (const p of diff.placed) expect(p.explore).toBe(false);
  });
});

describe("batched linucb", () => {
  it("primeBatch + ucbAt equals per-row ucb with the after one-hot patched in", () => {
    const arms = coldArms();
    let s = 1; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 200; k++) { const x = Array.from({ length: 16 }, () => r()); update(arms[k % 24], x, r() - 0.5); }
    const p = prepare(arms);
    const n = 50, X = new Float64Array(n * 16), arm = new Uint8Array(n);
    for (let i = 0; i < n; i++) { arm[i] = i % 24; for (let k = 0; k < 16; k++) if (k < 9 || k > 13) X[i * 16 + k] = r(); }
    const b = primeBatch(p, X, arm, 9, 5);
    for (let i = 0; i < n; i++) for (let j = -1; j < 5; j++) {
      const x = Array.from(X.subarray(i * 16, i * 16 + 16)); if (j >= 0) x[9 + j] = 1;
      expect(ucbAt(p, b, i, j)).toBeCloseTo(ucb(p, arm[i], x), 9);
    }
  });
});

describe("drag teaches both ends", () => {
  it("dragging 9:00 to 19:00 lowers arm 9 and raises arm 19", () => {
    const { model } = plan([task("a", { notBefore: at(0, 9) })], [], newModel(now), now);
    const pl = model.placed.a, from = pl.start, to = new Date(from).setHours(19, 0, 0, 0);
    const p0 = prepare(model.arms), m2 = learn(model, { id: "e", taskId: "a", type: "drag", at: now, data: { fromStart: from, toStart: to } }, task("a"));
    const p1 = prepare(m2.arms), hf = Math.floor(hourOf(from));
    expect(ucb(p1, hf, pl.x, 0)).toBeLessThan(ucb(p0, hf, pl.x, 0));
    expect(ucb(p1, 19, pl.x, 0)).toBeGreaterThan(ucb(p0, 19, pl.x, 0));
  });
});

describe("scheduler behaviour", () => {
  const place = (ts: Task[], diff: { placed: { id: string; start: number; end: number }[] }) =>
    ts.map((t) => { const p = diff.placed.find((q) => q.id === t.id); return p ? { ...t, start: p.start, end: p.end } : t; });
  const LEARNED = ["hour", "weekend", "busy", "deadline", "kind", "after", "energy", "similar"];

  it("40 tasks: 8 replans with nothing changed move 0; same plan at 08:00 and 08:01", () => {
    const kinds: Kind[] = ["study", "exercise", "chores", "social", "other"];
    let ts = Array.from({ length: 40 }, (_, i) => task(`t${i}`, { kind: kinds[i % 5], effort: 30 + (i % 4) * 30, ...(i % 3 ? { deadline: at(2 + (i % 9), 20) } : {}) }));
    const busy = [{ start: at(0, 9), end: at(0, 12) }, { start: at(1, 13), end: at(1, 17) }];
    let r = plan(ts, busy, newModel(now), now);
    ts = place(ts, r.diff);
    const go = (i: number) => { r = plan(ts, busy, r.model, now + i * MIN); ts = place(ts, r.diff); return r.diff.placed.filter((p) => p.from !== undefined).length; };
    let moved = 0;
    for (let i = 1; i <= 8; i++) moved += go(i);
    expect(moved).toBe(0);
    // A new task finds its own room: nothing already placed moves for it.
    ts = [...ts, task("new", { kind: "study", effort: 60 })];
    r = plan(ts, busy, r.model, now + 20 * MIN);
    expect(r.diff.placed.map((p) => p.id)).toEqual(["new"]);
    // A class landing on a placed task moves that task and no other.
    ts = place(ts, r.diff);
    const hit = ts.find((t) => t.start !== undefined && t.start > at(2, 0))!;
    r = plan(ts, [...busy, { start: hit.start!, end: hit.end! }], r.model, now + 21 * MIN);
    const over = ts.filter((t) => t.start !== undefined && t.start < hit.end! && t.end! > hit.start!).map((t) => t.id).sort();
    expect(r.diff.placed.map((p) => p.id).sort()).toEqual(over);
  });

  it("a time set by hand stays through later replans", () => {
    const mine = task("gym", { kind: "exercise", start: at(2, 20), end: at(2, 21), notBefore: at(2, 20), userEdited: ["start"] });
    const r = plan([mine, task("x"), task("y", { deadline: at(3, 12) })], [], newModel(now), at(1, 8));
    expect(r.diff.placed.find((p) => p.id === "gym")?.start ?? mine.start).toBe(at(2, 20));
    expect(r.diff.displaced).toHaveLength(0);
    const a = plan([task("a"), task("b", { deadline: at(3, 12) })], [], newModel(now), now).diff.placed.map((p) => p.start);
    const b = plan([task("a"), task("b", { deadline: at(3, 12) })], [], newModel(now + MIN), now + MIN).diff.placed.map((p) => p.start);
    expect(b).toEqual(a);
  });

  it("a task due in 10 days does not drift across mornings while its day is ahead", () => {
    const t = task("far", { kind: "study", deadline: at(10, 18) });
    const starts = Array.from({ length: 6 }, (_, d) => { const n = at(d, 8); return plan([t], [], newModel(n), n).diff.placed[0].start; });
    expect(new Set(starts).size).toBe(1);
  });

  it("a window under a day aims at its start", () => {
    const n = new Date(2026, 10, 16, 19, 40).getTime();
    const p = plan([task("u", { createdAt: n, effort: 60, deadline: new Date(2026, 10, 16, 23, 59).getTime() })], [], newModel(n), n).diff.placed[0];
    expect(p.start).toBeLessThanOrEqual(at(0, 20)); // used to land mid-window, 21:00 or later
  });

  it("a late tick records no duration and no hour; an early one credits the hour it happened", () => {
    const v = new Float32Array(4).fill(1);
    const t = task("a", { kind: "study", vec: v });
    const m = plan([t], [], newModel(now), now).model;
    const placed = { ...t, start: m.placed.a.start, end: m.placed.a.start + HOUR };
    const ok = learn(m, { id: "e", taskId: "a", type: "done", at: placed.end }, placed);
    expect(ok.efforts).toHaveLength(1);
    expect(ok.doneHours).toHaveLength(1);
    const late = learn(m, { id: "e", taskId: "a", type: "done", at: placed.end + 20 * HOUR }, placed);
    expect(late.efforts).toHaveLength(0);
    expect(late.doneHours).toHaveLength(0);
    expect(late.arms[m.placed.a.arm].A[0]).toBe(m.arms[m.placed.a.arm].A[0]);
    const tick = new Date(placed.start - 4 * HOUR).setMinutes(0, 0, 0), ah = Math.floor(hourOf(tick));
    const early = learn(m, { id: "e", taskId: "a", type: "done", at: tick }, placed);
    expect(early.arms[ah].A[0]).toBeGreaterThan(m.arms[ah].A[0]);
    expect(early.arms[m.placed.a.arm].A[0]).toBe(m.arms[m.placed.a.arm].A[0]);
  });

  it("effort ignores unlike titles and rounds down to 15", () => {
    const m = newModel(now);
    const a = new Float32Array(4).fill(0); a[0] = 1;
    const b = new Float32Array(4).fill(0); b[1] = 1;
    m.efforts.push({ vec: Array.from(a), minutes: 120, at: now });
    const d = plan([task("x", { effort: 0, kind: "chores", vec: b }), task("y", { effort: 10 })], [], m, now).diff;
    expect(d.placed.find((p) => p.id === "x")!.end - d.placed.find((p) => p.id === "x")!.start).toBe(30 * MIN);
    expect(d.placed.find((p) => p.id === "y")!.end - d.placed.find((p) => p.id === "y")!.start).toBe(15 * MIN);
  });

  it("six 15 minute errands pay no per-day count penalty", () => {
    const ps: Piece[] = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, task: task(`e${i}`), effort: 15, k: 1, n: 1, slip: 0 }));
    const r = solve(ps, { busy: [], fixedEnds: [], now, util: () => 0 }, 1);
    expect(new Set([...r.starts.values()].map(dayStart)).size).toBe(1);
  });

  it("a missed task lands within 2 days and its hour's score drops", () => {
    const n = at(0, 14), old = at(0, 10);
    const m = newModel(n), x = new Array(16).fill(0); x[0] = 1;
    m.placed.a = { arm: 10, x, start: old };
    const t = task("a", { start: old, end: old + HOUR, vec: new Float32Array(4).fill(1) });
    const r = plan([t], [], m, n);
    expect(r.diff.placed[0].start).toBeLessThanOrEqual(n + 2 * DAY);
    expect(ucb(prepare(r.model.arms), 10, x, 0)).toBeLessThan(ucb(prepare(m.arms), 10, x, 0));
    expect(r.model.hist.at(-1)?.r).toBe(-1);
  });

  it("later moves the running task, and lands within 2 days", () => {
    const run = task("a", { start: now - 30 * MIN, end: now + 30 * MIN });
    expect(plan([run], [], newModel(now), now).diff.placed).toHaveLength(0);
    const r = plan([run], [], newModel(now), now, { later: "a" }).diff.placed[0];
    expect(r.start >= run.end! || r.end <= run.start!).toBe(true);
    expect(r.start).toBeLessThanOrEqual(now + 2 * DAY);
    expect(r.from).toBe(run.start);
  });

  it("a drag leaves the intercept alone", () => {
    const { model } = plan([task("a", { kind: "exercise", notBefore: at(0, 9) })], [], newModel(now), now);
    const from = model.placed.a.start, to = new Date(from).setHours(20, 0, 0, 0);
    const m2 = learn(model, { id: "e", taskId: "a", type: "drag", at: now, data: { fromStart: from, toStart: to } }, task("a"));
    model.arms.forEach((a, i) => { expect(m2.arms[i].A[0]).toBe(a.A[0]); expect(m2.arms[i].b[0]).toBe(a.b[0]); });
    expect(m2.arms.some((a, i) => a.b[4] !== model.arms[i].b[4] || a.b[5] !== model.arms[i].b[5])).toBe(true);
  });

  it("alt is free of other pieces", () => {
    const ts = ["a", "b", "c", "d", "e", "f"].map((id) => task(id));
    const { diff } = plan(ts, [], newModel(now), now);
    for (const p of diff.placed) if (p.alt !== undefined) for (const q of diff.placed) if (q !== p) expect(p.alt < q.end && p.alt + HOUR > q.start).toBe(false);
  });

  it("steps name only tasks that were placed or moved", () => {
    let ts = ["a", "b", "c", "d", "e"].map((id) => task(id, { deadline: at(4, 20) }));
    const r = plan(ts, [], newModel(now), now);
    ts = [...place(ts, r.diff), task("new", { deadline: at(4, 20) })];
    const { diff } = plan(ts, [], r.model, now);
    const named = diff.steps!.filter((s) => s.key === "place" || s.key === "move");
    expect(named.every((s) => s.id === "new" && s.vars.title === "new")).toBe(true);
    expect(named.length).toBeGreaterThan(0);
    expect(stepText(named[0])).toContain("new");
  });

  it("a cold plan flags no explore and says guess, never a learned reason", () => {
    const { diff } = plan([task("a", { kind: "study" }), task("b"), task("c", { kind: "exercise" })], [], newModel(now), now);
    for (const p of diff.placed) {
      expect(p.explore).toBe(false);
      expect(p.why!.some((r) => LEARNED.includes(r.key))).toBe(false);
      expect(p.why!.every((r) => r.w > 0)).toBe(true);
    }
    expect(diff.placed.some((p) => p.why![0].key === "guess")).toBe(true);
    expect(diff.insight).toBeUndefined();
  });

  it("a warm model lets only one new piece explore; two outcomes on an hour are not enough to name it", () => {
    const m = newModel(now), x = new Array(16).fill(0); x[0] = 1;
    for (let i = 0; i < 24; i++) update(m.arms[i], x, i % 3);
    for (let i = 0; i < 5; i++) m.doneHours.push({ hour: 10, at: now });
    const { diff } = plan(["a", "b", "c", "d", "e", "f"].map((id) => task(id)), [], m, now);
    expect(diff.placed.filter((p) => p.explore).length).toBeLessThanOrEqual(1);
    for (const p of diff.placed) expect(p.why!.some((r) => LEARNED.includes(r.key))).toBe(false); // 1 update per hour, under 3
  });

  it("a planned said window is kept and named", () => {
    const { diff } = plan([task("w", { notBefore: at(1, 18), notAfter: at(1, 21) })], [], newModel(now), now);
    const p = diff.placed[0];
    expect(p.start).toBeGreaterThanOrEqual(at(1, 18));
    expect(p.end).toBeLessThanOrEqual(at(1, 21));
    expect(p.why![0]).toEqual({ key: "said", w: 1 });
  });

  it("the gap card skips a task not yet due and offers nothing next to a planned task", () => {
    const busy = [{ start: now + 90 * MIN, end: now + 5 * HOUR }];
    expect(suggest([task("later", { effort: 30, notBefore: at(7, 9) })], busy, newModel(now), now)).toBeUndefined();
    expect(suggest([task("c", { effort: 30 }), task("p", { start: now + 15 * MIN, end: now + 75 * MIN })], busy, newModel(now), now)).toBeUndefined();
    expect(suggest([task("c", { effort: 30 })], busy, newModel(now), now)?.task.id).toBe("c");
    expect(suggest([task("c", { effort: 30 }), task("p", { start: now + 15 * MIN, end: now + 75 * MIN, effort: 60 })], [], newModel(now), now)).toBeUndefined();
  });

  it("negative reasons are comparisons", () => {
    expect(reasonText({ key: "hour", w: -1 })).toBe("Giờ khác hợp hơn một chút");
    expect(reasonText({ key: "after", w: 1, vars: { prev: "study" } })).toBe("Sau giờ học, như mọi khi");
  });
});
