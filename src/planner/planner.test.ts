import { describe, expect, it } from "vitest";
import type { Kind, Task } from "../lib/types";
import { DAY, HOUR, MIN, features, hourOf } from "./features";
import { ALPHA, N0, coldArms, decayArms, prepare, primeBatch, ucb, ucbAt, update } from "./linucb";
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

describe("linucb", () => {
  it("updates toward the reward and decays to the prior", () => {
    const arms = coldArms();
    const x = new Array(16).fill(0); x[0] = 1;
    const before = prepare(arms).theta[3][0];
    for (let i = 0; i < 20; i++) update(arms[3], x, 1);
    expect(prepare(arms).theta[3][0]).toBeGreaterThan(before);
    const a0 = arms[3].A[0];
    decayArms(arms, 21 * DAY);
    expect(arms[3].A[0]).toBeCloseTo(1 + (a0 - 1) / 2, 6);
    expect(arms[3].b[0]).toBeGreaterThan(0);
    expect(N0).toBe(3);
    expect(ALPHA).toBe(0.15);
  });

  it("cold arms follow the default daily curve", () => {
    const p = prepare(coldArms());
    const x = new Array(16).fill(0); x[0] = 1;
    expect(ucb(p, 16, x)).toBeGreaterThan(ucb(p, 3, x));
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
    const ts = [task("big", { effort: 90, deadline: now + 30 * MIN }), task("other", { effort: 60 })];
    const { diff } = plan(ts, [], newModel(now), now);
    expect(diff.warn?.[0]).toMatchObject({ id: "big", need: 90, deadline: now + 30 * MIN });
    expect(diff.warn![0].free).toBeLessThan(90);
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
