import { describe, expect, it } from "vitest";
import type { Kind, Task } from "../lib/types";
import { D, DAY, HOUR, I_AFTER, I_ENERGY, KINDS, MIN, dayStart, dueOf, features, hourOf } from "./features";
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
    expect(split(150)).toEqual([90, 60]); // half hours, never 75s or 45s
    expect(split(135, 60)).toEqual([60, 60, 30]);
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

  it("a 3 h task due tonight at 19:02 is one sitting that runs past 22:00, not two with one unplaced", () => {
    const n = new Date(2026, 10, 16, 19, 2).getTime();
    const { diff } = plan([task("zf", { effort: 180, deadline: at(0, 23) + 59 * MIN })], [], newModel(n), n);
    expect(diff.split).toHaveLength(0);
    expect(diff.unplaced ?? []).toHaveLength(0);
    expect(diff.placed.map((p) => [p.start, p.end])).toEqual([[new Date(2026, 10, 16, 19, 15).getTime(), new Date(2026, 10, 16, 22, 15).getTime()]]);
  });

  it("a 3 h task said for today (a window to 23:59, no due) at 19:45 is one sitting past 22:00, nothing unplaced", () => {
    const n = new Date(2026, 10, 16, 19, 45).getTime();
    const { diff } = plan([task("zf", { effort: 180, notBefore: at(0, 9), notAfter: at(0, 23) + 59 * MIN })], [], newModel(n), n);
    expect(diff.split).toHaveLength(0);
    expect(diff.unplaced ?? []).toHaveLength(0);
    expect(diff.warn).toBeUndefined();
    expect(diff.placed.map((p) => [p.start, p.end])).toEqual([[n, n + 3 * HOUR]]);
  });

  describe("a window too packed for what was asked: the task still gets a time, and says why", () => {
    const n = at(0, 20);
    const morning = (o: Partial<Task>) => task("zf", { effort: 180, maxSitting: 90, notBefore: at(1, 5), notAfter: at(1, 11), tods: [[300, 660]], ...o });
    const run = (o: Partial<Task>, busy: { start: number; end: number }[]) => {
      const { diff, model } = plan([morning(o)], busy, newModel(n), n);
      expect(diff.unplaced ?? []).toHaveLength(0);
      const p = diff.placed[0];
      return { start: p.start, len: (p.end - p.start) / MIN, why: reasonText(model.placed[p.id].why![0]), long: reasonText(model.placed[p.id].why![0], true) };
    };
    const guessed = { effortGuessed: true, cls: "code", kind: "study" as Kind };
    it("room in the window: the guess takes what is free there", () => {
      const r = run(guessed, [{ start: at(1, 7) + 30 * MIN, end: at(1, 9) }]);
      expect([r.start, r.len]).toEqual([at(1, 9), 120]);
      expect(r.why).toBe("Sáng mai trống 2 tiếng");
      expect(r.long).toBe("Sáng mai trống chừng 2 tiếng, làm trước chừng đó");
    });
    it("only a crumb free: study never shrinks under 1h30, it runs on later that day", () => {
      const r = run(guessed, [{ start: at(1, 7) + 30 * MIN, end: at(1, 11) }]);
      expect(dayStart(r.start)).toBe(at(1, 0));
      expect(r.start).toBeGreaterThanOrEqual(at(1, 11));
      expect(r.len).toBeGreaterThanOrEqual(90);
      expect(r.why).toMatch(/^Sáng mai kín, dời sang (trưa|chiều|tối) mai$/);
    });
    it("a micro chore takes even 15 min of the window (a guessed errand is on the half hour, so it cannot)", () => {
      const r = run({ effort: 15, effortGuessed: true, cls: "pet", kind: "other" }, [{ start: at(1, 7) + 15 * MIN, end: at(1, 11) }]);
      expect([r.start, r.len]).toEqual([at(1, 7), 15]);
    });
    it("a said length never shrinks: it keeps 3 h, later that day", () => {
      const r = run({ maxSitting: undefined }, [{ start: at(1, 7), end: at(1, 11) }]);
      expect(r.len).toBe(180);
      expect(r.why).toMatch(/^Sáng mai kín, dời sang/);
    });
    it("the whole day packed: another day", () => {
      const r = run(guessed, [{ start: at(1, 7), end: at(1, 22) }]);
      expect(dayStart(r.start)).toBeGreaterThan(at(1, 0));
      expect(r.why).toMatch(/^Sáng mai kín, dời sang/);
    });
    it("all of it fits: said, as before", () => {
      expect(run(guessed, []).why).toBe("Đúng buổi bạn nói");
    });
  });

  describe("a pull: a placed task goes only into the freed gap, or stays", () => {
    const gapAt = (h: number, mins: number) => ({ from: at(0, h), to: at(0, h) + mins * MIN });
    it("a task two days out moves into the gap, never to some other earlier free cell", () => {
      const C = task("c", { effort: 60, start: at(2, 15), end: at(2, 16) });
      const { diff } = plan([C], [], newModel(now), now, { pull: gapAt(11, 60) });
      const s = diff.placed.find((p) => p.id === "c")?.start ?? C.start!;
      expect([at(0, 11), at(2, 15)]).toContain(s); // the gap, or where it was: 15:00 today is free but not freed
    });
    it("a candidate that does not fit the gap keeps its prior slot", () => {
      const C = task("c", { effort: 60, start: at(2, 15), end: at(2, 16) });
      const { diff } = plan([C], [], newModel(now), now, { pull: gapAt(11, 30) });
      expect(diff.unplaced ?? []).toEqual([]);
      expect(diff.placed.find((p) => p.id === "c")?.start ?? C.start).toBe(at(2, 15));
    });
  });

  describe("a packed part of the day: a lax task gives way before the window widens", () => {
    const n = at(0, 17); // an hour before the evening: a task starting at 18:00 is not running yet
    const EVENING = [[18 * 60, 22 * 60]] as [number, number][];
    // A lax 4 h task zen-placed over the whole evening, and an urgent 1 h task that can only be in the evening and is due by 22:00.
    const lax = (o: Partial<Task> = {}) => task("lax", { effort: 240, maxSitting: 240, start: at(0, 18), end: at(0, 22), ...o }); // one piece, not split
    const urgent = (o: Partial<Task> = {}) => task("urgent", { effort: 60, deadline: at(0, 22), tods: EVENING, ...o });
    const at_ = (ps: { id: string; start: number }[], id: string, t: Task) => ps.find((p) => p.id === id)?.start ?? t.start!;

    it("the urgent one keeps the evening; the lax one moves to another day (a due it would miss beats the 24 h freeze)", () => {
      const L = lax(), U = urgent();
      const { diff } = plan([L, U], [], newModel(n), n);
      const u = at_(diff.placed, "urgent", U), l = at_(diff.placed, "lax", L);
      expect(u).toBeGreaterThanOrEqual(at(0, 18));
      expect(u + 60 * MIN).toBeLessThanOrEqual(at(0, 22));
      expect(dayStart(l)).toBeGreaterThan(at(0, 0));
      expect(diff.placed.find((p) => p.id === "lax")?.from).toBe(L.start);
    });
    it("equal deadlines: no bump, the lax one keeps its evening", () => {
      const L = lax({ deadline: at(0, 22) }), U = urgent();
      const { diff } = plan([L, U], [], newModel(n), n);
      expect(at_(diff.placed, "lax", L)).toBe(L.start);
      expect(diff.placed.find((p) => p.id === "urgent" && p.start < at(0, 22))).toBeUndefined();
    });
    it("a pinned lax task never gives way: the urgent one falls back, and nothing overlaps", () => {
      const L = lax({ pinned: true, userEdited: ["start"] }), U = urgent();
      const { diff } = plan([L, U], [], newModel(n), n);
      expect(at_(diff.placed, "lax", L)).toBe(L.start);
      const u = at_(diff.placed, "urgent", U);
      expect(u >= L.end! || u + 60 * MIN <= L.start! || u < 0 || u > L.start!).toBe(true);
      expect(diff.placed.find((p) => p.id === "lax")).toBeUndefined();
    });
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

  it("a said due within 30 days aims at ~75% of the window, not its last day", () => {
    const due = at(7, 23);
    const { diff } = plan([task("report", { effort: 60, deadline: due })], [], newModel(now), now);
    const p = diff.placed[0];
    const share = (p.start - now) / (due - now);
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.85);
    expect(p.end).toBeLessThanOrEqual(due);
  });
});

describe("half-hour lengths, calmer replans, today's suggestion", () => {
  it("a guessed length is a half hour multiple, whatever its due", () => {
    for (const effort of [60, 75, 90, 105, 120, 150, 180, 240, 300, 450, 600]) for (const days of [1, 2, 3, 5, 10]) {
      const { diff } = plan([task("g", { effort, effortGuessed: true, kind: "study", cls: "code", deadline: now + days * DAY })], [], newModel(now), now);
      expect(diff.placed.length).toBeGreaterThan(0);
      for (const p of diff.placed) expect(((p.end - p.start) / MIN) % 30).toBe(0);
    }
  });

  it("a said 75 min task stays one 75 min piece", () => {
    const { diff } = plan([task("s", { effort: 75 })], [], newModel(now), now);
    expect(diff.placed).toHaveLength(1);
    expect(diff.placed[0].end - diff.placed[0].start).toBe(75 * MIN);
  });

  it("a guessed 120 min task with an 80 min free gap gets 60, not 75", () => {
    const n = at(0, 20);
    const { diff } = plan([task("g", { effort: 120, effortGuessed: true, notBefore: at(1, 8), notAfter: at(1, 11) + 20 * MIN })],
      [{ start: at(1, 9), end: at(1, 10) }], newModel(n), n);
    expect(diff.unplaced ?? []).toHaveLength(0);
    expect(diff.placed).toHaveLength(1);
    expect((diff.placed[0].end - diff.placed[0].start) / MIN).toBe(60);
    expect(diff.placed[0].start).toBeGreaterThanOrEqual(at(1, 8));
    expect(diff.placed[0].end).toBeLessThanOrEqual(at(1, 11) + 20 * MIN);
  });

  it("a task marked done at 10:00 frees its time, and tomorrow's sitting stays where it is", () => {
    const done = task("d", { effort: 60, start: at(0, 9), end: at(0, 10), doneAt: at(0, 10) });
    const T = task("t", { effort: 60, effortGuessed: true, kind: "other", deadline: at(3, 23), start: at(1, 15), end: at(1, 16) });
    const { diff } = plan([done, T], [], newModel(now), now, { pull: { from: at(0, 10), to: at(0, 11) } });
    expect(diff.placed.find((p) => p.id === "t")?.start ?? T.start).toBe(at(1, 15));
  });

  it("more than 5 cause-free moves: 5 move, the rest keep their slot; a missed task still moves", () => {
    const sit = Array.from({ length: 6 }, (_, i) => task(`s${i}`, { effort: 60, start: at(1, 15 + i), end: at(1, 16 + i) }));
    const missed = task("m", { effort: 60, start: at(0, 6), end: at(0, 7) });
    const { diff } = plan([...sit, missed], [], newModel(now), now, { pull: { from: at(1, 9), to: at(1, 15) } });
    const moved = diff.placed.filter((p) => p.id.startsWith("s") && p.from !== undefined && p.from !== p.start);
    expect(moved).toHaveLength(5);
    const m = diff.placed.find((p) => p.id === "m");
    expect(m).toBeDefined();
    expect(m!.start).toBeGreaterThanOrEqual(now);
  });

  it("the gap card suggests only today's work, never a task placed tomorrow", () => {
    const tomorrow = task("tm", { effort: 30, start: at(1, 10), end: at(1, 10) + 30 * MIN });
    const today = task("td", { effort: 30 });
    expect(suggest([tomorrow, today], [], newModel(now), now)?.task.id).toBe("td");
  });
});

describe("reasons follow the time", () => {
  it("a task moved by hand says 'Giờ bạn chọn', not the reasons of its old slot", () => {
    const p0 = plan([task("r", { deadline: at(3, 23) })], [], newModel(now), now), s0 = p0.diff.placed[0];
    const mine = at(1, 15);
    const p1 = plan([task("r", { deadline: at(3, 23), start: mine, end: mine + HOUR, userEdited: ["start"] })], [], p0.model, now + MIN);
    expect(s0.start).not.toBe(mine);
    expect(p1.model.placed.r.start).toBe(mine);
    expect(p1.model.placed.r.why?.[0].key).toBe("chose");
    expect(reasonText(p1.model.placed.r.why![0], true)).toBe("Bạn chọn giờ này, mình giữ");
  });
  it("says facts in loose words, and old stored reasons still read", () => {
    expect(reasonText({ key: "deadline", w: 1, vars: { due: "T6 23:59", left: 3 * 1440 + 20 } })).toBe("Còn 3 ngày tới hạn, làm dần");
    expect(reasonText({ key: "deadline", w: 1, vars: { due: "hôm nay 23:59", left: 40 } }, true)).toBe("Hạn hôm nay 23:59, giờ này là vừa kịp");
    expect(reasonText({ key: "deadline", w: 1, vars: { due: "T6 23:59" } })).toBe("Hạn T6 23:59, làm sớm");
    expect(reasonText({ key: "guess", w: 1, vars: { m: 60, part: "Tối nay", after: "Giải tích 2" } })).toBe("Rảnh sau Giải tích 2");
    expect(reasonText({ key: "guess", w: 1, vars: { m: 60, part: "Tối nay" } }, true)).toBe("Tối nay còn trống, vừa cho việc này");
    expect(reasonText({ key: "hour", w: 1, vars: { hour: 20, n: 3 } }, true)).toBe("Mấy lần gần đây bạn xong việc quanh 20h");
    expect(reasonText({ key: "hour", w: 1, vars: { hour: 20, n: 1 } }, true)).toBe("Giờ này bạn hay xong việc");
    expect(reasonText({ key: "kind", w: 1, vars: { kind: "chores" } })).toBe("Hợp việc nhà");
    expect(reasonText({ key: "kind", w: 1, vars: { kind: "work" } })).toBe("Hợp công việc");
  });
});

describe("a repeat's day bound is no due", () => {
  it("a daily occurrence ending at midnight is a plan with no deadline reason; a said due stays", () => {
    const day = task("lc", { rrule: "FREQ=DAILY", deadline: at(1, 0), notBefore: now, tods: [[1080, 1320]] });
    expect(dueOf(day)).toBeUndefined();
    expect(typeOf(day)).toBe("plan");
    expect(dueOf({ ...day, deadline: at(0, 17) })).toBe(at(0, 17)); // "mỗi ngày trước 17h"
    expect(dueOf({ ...day, rrule: undefined })).toBe(at(1, 0)); // a one-off due at midnight is a due
    const { diff } = plan([day], [], newModel(now), now);
    expect(diff.placed[0].why?.some((r) => r.key === "deadline")).toBe(false);
    // placed before this fix: the kept "Hạn 0:00" reason is dropped on the next plan
    const p0 = plan([day], [], newModel(now), now), s0 = p0.diff.placed[0];
    p0.model.placed[s0.id].why = [{ key: "deadline", w: 1, vars: { due: "0:00" } }, ...(p0.model.placed[s0.id].why ?? [])];
    const p1 = plan([{ ...day, start: s0.start, end: s0.end }], [], p0.model, now + MIN);
    expect(p1.model.placed[s0.id].why?.some((r) => r.key === "deadline")).toBe(false);
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

  it("a guessed length gives way to 2+ alike done tasks, a said one stands", () => {
    const m = newModel(now);
    const v = new Float32Array(4).fill(0); v[1] = 1;
    for (let i = 0; i < 3; i++) m.efforts.push({ vec: Array.from(v), minutes: 120, at: now });
    const guessed = plan([task("x", { effort: 180, effortGuessed: true, vec: v })], [], m, now).diff;
    expect(guessed.placed[0].end - guessed.placed[0].start).toBe(120 * MIN);
    const said = plan([task("y", { effort: 45, vec: v })], [], m, now).diff;
    expect(said.placed[0].end - said.placed[0].start).toBe(45 * MIN);
  });
});

describe("policy and events", () => {
  it("has no heuristic policy: linucb logs arm, x and why", () => {
    const { diff } = plan([task("a"), task("b", { kind: "study" })], [], newModel(now), now);
    for (const p of diff.placed) {
      expect(p.policy).toBe("linucb");
      expect(p.arm).toBe(Math.floor(hourOf(p.start)));
      expect(p.x).toHaveLength(D);
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
    // a rename/note/place edit teaches nothing: the same model, so apply skips rewriting it
    expect(learn(model, { id: "e4", taskId: "a", type: "edit", at: p.end }, placed)).toBe(model);
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

  it("a 120-day daily repeat: the planner places none past now+30d and leaves those occurrences without a time", () => {
    const occ = Array.from({ length: 120 }, (_, d) => task(`r${d}`, { title: "Đọc", rrule: "FREQ=DAILY", effort: 90, notBefore: at(d, 7), deadline: at(d + 1, 0) }));
    const { diff } = plan(occ, [], newModel(now), now);
    expect(diff.placed.length).toBeGreaterThan(0);
    for (const p of diff.placed) expect(p.start).toBeLessThan(now + 30 * DAY);
    expect(diff.placed.some((p) => p.id === "r40")).toBe(false);
  });

  it("a deadline 90 days out is planned inside the 30-day horizon, the due date kept", () => {
    const far = now + 90 * DAY;
    const { diff } = plan([task("far", { deadline: far })], [], newModel(now), now);
    const p = diff.placed.find((x) => x.id === "far")!;
    expect(p.start).toBeGreaterThanOrEqual(now);
    expect(p.end).toBeLessThanOrEqual(now + 30 * DAY);
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

  it("near a deadline other work is not split, keeps its size, and splits only past 3 h a sitting", () => {
    const go = (eff: number, due?: number) => plan([task("w", { effort: eff, deadline: due })], [], newModel(now), now).diff;
    const lone = go(180, now + 20 * HOUR);
    expect(lone.split).toHaveLength(0);
    const p = lone.placed.find((x) => x.id === "w")!;
    expect(p.end - p.start).toBe(180 * MIN);
    expect(go(360, now + 20 * HOUR).split[0].ids).toHaveLength(2); // 6 h in one day: two of 3 h
    expect(go(240, at(2, 18)).split[0].ids).toHaveLength(2); // 2.x days: two of 2 h, as before
    expect(go(180, at(5, 18)).split[0].ids).toHaveLength(2); // plenty of time: the usual 2 h cap
  });

  it("a parent whose open sittings were dropped (resized) splits what is left again, with new ids", () => {
    const p = task("p", { effort: 180, maxSitting: 60, deadline: at(5, 18) });
    const k = (n: number, o: Partial<Task>) => task(`p#${n}`, { parentId: "p", effort: 45, ...o });
    const { diff } = plan([p, k(1, { doneAt: now - HOUR }), k(2, { deletedAt: now }), k(3, { deletedAt: now })], [], newModel(now), now);
    expect(diff.split).toEqual([{ parentId: "p", ids: ["p#4", "p#5", "p#6"] }]); // 135 left: 60, 60, 30
    const sizes = diff.placed.filter((x) => x.id.startsWith("p#")).map((x) => (x.end - x.start) / MIN).sort((a, b) => b - a);
    expect(sizes).toEqual([60, 60, 30]);
    // a pinned open sitting is busy time already: nothing new
    expect(plan([p, k(1, { pinned: true, start: at(1, 9), end: at(1, 10) })], [], newModel(now), now).diff.split).toEqual([]);
  });

  it("a slot freed by a task done early is free for others", () => {
    const done = task("d", { start: at(0, 9), end: at(0, 12), doneAt: now, pinned: true, deadline: at(0, 23) });
    const busy = Array.from({ length: 24 }, (_, h) => h).filter((h) => h < 9 || h >= 12).map((h) => ({ start: at(0, h), end: at(0, h + 1), title: "x" }));
    const busyLater = Array.from({ length: 6 }, (_, d) => ({ start: at(d + 1, 0), end: at(d + 2, 0), title: "x" }));
    const { diff } = plan([done, task("n", { effort: 60, deadline: at(0, 23) })], [...busy, ...busyLater], newModel(now), now);
    const n = diff.placed.find((x) => x.id === "n")!;
    expect(n.start).toBeGreaterThanOrEqual(at(0, 9));
    expect(n.end).toBeLessThanOrEqual(at(0, 12));
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
    for (let i = 0; i < 24; i++) update(m.arms[i], new Array(D).fill(0).map((_, k) => (k ? 0 : 1)), i % 3);
    const { diff } = plan([task("a", { deadline: at(3, 12) }), task("b", { deadline: at(2, 12) })], [], m, now);
    for (const p of diff.placed) expect(p.explore).toBe(false);
  });
});

describe("batched linucb", () => {
  it("primeBatch + ucbAt equals per-row ucb with the after one-hot patched in", () => {
    const arms = coldArms();
    let s = 1; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 200; k++) { const x = Array.from({ length: D }, () => r()); update(arms[k % 24], x, r() - 0.5); }
    const p = prepare(arms);
    const n = 50, X = new Float64Array(n * D), arm = new Uint8Array(n);
    for (let i = 0; i < n; i++) { arm[i] = i % 24; for (let k = 0; k < D; k++) if (k < I_AFTER || k >= I_ENERGY) X[i * D + k] = r(); }
    const b = primeBatch(p, X, arm, I_AFTER, KINDS.length);
    for (let i = 0; i < n; i++) for (let j = -1; j < KINDS.length; j++) {
      const x = Array.from(X.subarray(i * D, i * D + D)); if (j >= 0) x[I_AFTER + j] = 1;
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

  it("effort ignores unlike titles; a guessed length rounds to the nearest half hour (floor 30), a said one stays", () => {
    const m = newModel(now);
    const a = new Float32Array(4).fill(0); a[0] = 1;
    const b = new Float32Array(4).fill(0); b[1] = 1;
    m.efforts.push({ vec: Array.from(a), minutes: 120, at: now });
    const d = plan([task("x", { effort: 0, kind: "chores", vec: b }), task("y", { effort: 10, effortGuessed: true }), task("z", { effort: 10 })], [], m, now).diff;
    expect(d.placed.find((p) => p.id === "x")!.end - d.placed.find((p) => p.id === "x")!.start).toBe(30 * MIN);
    expect(d.placed.find((p) => p.id === "y")!.end - d.placed.find((p) => p.id === "y")!.start).toBe(30 * MIN);
    expect(d.placed.find((p) => p.id === "z")!.end - d.placed.find((p) => p.id === "z")!.start).toBe(10 * MIN);
  });

  it("six 15 minute errands pay no per-day count penalty", () => {
    const ps: Piece[] = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, task: task(`e${i}`), effort: 15, k: 1, n: 1, slip: 0 }));
    const r = solve(ps, { busy: [], fixedEnds: [], now, util: () => 0 }, 1);
    expect(new Set([...r.starts.values()].map(dayStart)).size).toBe(1);
  });

  it("a missed task lands within 2 days and its hour's score drops", () => {
    const n = at(0, 14), old = at(0, 10);
    const m = newModel(n), x = new Array(D).fill(0); x[0] = 1;
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
    const m = newModel(now), x = new Array(D).fill(0); x[0] = 1;
    for (let i = 0; i < 24; i++) update(m.arms[i], x, i % 3);
    for (let i = 0; i < 5; i++) m.doneHours.push({ hour: 10, at: now });
    const { diff } = plan(["a", "b", "c", "d", "e", "f"].map((id) => task(id)), [], m, now);
    expect(diff.placed.filter((p) => p.explore).length).toBeLessThanOrEqual(1);
    for (const p of diff.placed) expect(p.why!.some((r) => LEARNED.includes(r.key))).toBe(false); // 1 update per hour, under 3
  });

  it("said parts of the day hold every sitting in one of them: morning or evening, the free one when the other is taken", () => {
    const tods: [number, number][] = [[5 * 60, 12 * 60], [17 * 60, 22 * 60]];
    // mornings are taken all week: only the evening is left
    const busy = Array.from({ length: 8 }, (_, d) => ({ start: at(d, 5), end: at(d, 12) }));
    const { diff } = plan([task("w", { tods, deadline: at(3, 23) }), task("x", { tods, effort: 30 })], busy, newModel(now), now);
    expect(diff.placed.length).toBe(2);
    for (const p of diff.placed) {
      const m = (p.start - dayStart(p.start)) / MIN, e = (p.end - dayStart(p.start)) / MIN;
      expect(tods.some(([a, b]) => m >= a && e <= b), `${p.id} ${m}-${e}`).toBe(true);
      expect(m).toBeGreaterThanOrEqual(17 * 60);
    }
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
    expect(reasonText({ key: "hour", w: -1 })).toBe("Giờ khác hợp hơn");
    expect(reasonText({ key: "after", w: 1, vars: { prev: "study" } })).toBe("Sau giờ học, như mọi khi");
  });
});

describe("hard constraints (review fixes)", () => {
  const over = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
  const tidy = (ps: { start: number; end: number }[], busy: { start: number; end: number }[]) => {
    for (const p of ps) {
      expect(busy.some((b) => over(p, b))).toBe(false);
      const s = new Date(p.start), m = s.getHours() * 60 + s.getMinutes();
      expect(m >= 7 * 60 && m + (p.end - p.start) / MIN <= 22 * 60).toBe(true); // awake, same day
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(over(ps[i], ps[j])).toBe(false);
  };
  it("never overlaps a fixed class, even when only asleep time is left before the due", () => {
    const busy = [{ start: at(0, 8), end: at(0, 22) }];
    for (let d = 1; d < 8; d++) busy.push({ start: at(d, 7), end: at(d, 22) });
    const { diff } = plan([task("a", { deadline: at(0, 23) })], busy, newModel(now), now);
    expect(diff.placed).toEqual([]);
    expect(diff.unplaced?.map((u) => u.id)).toEqual(["a"]);
    expect(diff.warn?.map((w) => w.id)).toEqual(["a"]);
  });
  it("overloaded: flexible tasks run late rather than overlap each other", () => {
    const ts = Array.from({ length: 40 }, (_, i) => task(`q${i}`, { deadline: at(1, 18) }));
    const { diff } = plan(ts, [], newModel(now), now);
    tidy(diff.placed, []);
    expect(diff.placed.length + (diff.unplaced?.length ?? 0)).toBe(40);
  });
  it("a passed window goes to the next free, awake slot, not onto a lecture at now or 02:00", () => {
    const t = task("w", { createdAt: now - DAY, notBefore: now - 14 * HOUR, notAfter: now - 8 * HOUR });
    const lec = [{ start: now - HOUR, end: now + 3 * HOUR }];
    tidy(plan([t], lec, newModel(now), now).diff.placed, lec);
    const night = at(1, 2);
    const d2 = plan([t], [], newModel(night), night).diff.placed;
    expect(d2).toHaveLength(1);
    tidy(d2, []);
  });
  it("a held slot that is now asleep is not kept", () => {
    const { diff } = plan([task("h", { start: at(1, 23), end: at(2, 0) + 30 * MIN })], [], newModel(now), now);
    tidy(diff.placed, []);
  });
  it("a parent whose sittings are all done or pinned is not split again", () => {
    const p = task("p", { effort: 300, deadline: at(3, 23) });
    const kids = [task("p#1", { parentId: "p", effort: 100, doneAt: now }), task("p#2", { parentId: "p", effort: 100, pinned: true, start: at(2, 15), end: at(2, 16) + 40 * MIN })];
    const { diff } = plan([p, ...kids], [], newModel(now), now);
    expect(diff.split).toEqual([]);
    expect(diff.placed).toEqual([]);
  });
  it.skipIf(!!process.env.CI)("stays fast with many tasks over a long horizon", () => { // timing: off in CI, its runners vary 3x
    const ts = Array.from({ length: 150 }, (_, i) => task(`p${i}`, { deadline: at(30 + (i % 60), 18), effort: 60 + (i % 4) * 30 }));
    const busy = Array.from({ length: 100 }, (_, d) => ({ start: at(d, 9), end: at(d, 11) }));
    const t0 = Date.now();
    const { diff } = plan(ts, busy, newModel(now), now);
    expect(Date.now() - t0).toBeLessThan(2500); // was ~9 s; ~0.4 s here, slack for slow CI
    tidy(diff.placed, busy);
  });
});

// The veil tells what the plan did: a new 30-day repeat is one line with every occurrence, not "Đặt … vào T2", "T3", "T4" then the rest at once,
// and the read line names how far it planned, not "tuần này".
it("a new repeat is narrated as one series line, and the read line reaches as far as the plan", () => {
  const xs = Array.from({ length: 30 }, (_, i) => task(`r${i}`, { title: "Tập thể dục", kind: "exercise", rrule: "FREQ=DAILY", notBefore: at(i + 1, 0), deadline: at(i + 2, 0), tods: [[300, 660]] }));
  const { diff } = plan(xs, [], newModel(now), now);
  const series = diff.steps!.filter((s) => s.key === "series");
  expect(series).toHaveLength(1);
  expect(series[0].ids).toHaveLength(diff.placed.length);
  expect(diff.steps!.some((s) => s.key === "place")).toBe(false);
  expect(diff.steps![0].vars.what).toMatch(/^đến \d+\/\d+$/);
  expect(stepText(series[0])).toMatch(/^Xếp \d+ buổi Tập thể dục, (T\d|CN) \d+\/\d+ - (T\d|CN) \d+\/\d+$/);
});

describe("reach of an undated task", () => {
  it("is a week, not 2 days: today and tomorrow full, it lands later that week", () => {
    const busy = [...[0, 1].map((d) => ({ start: at(d, 6), end: at(d + 1, 0) })), { start: at(2, 6), end: at(2, 10) }]; // 2 days from 08:00 end at 08:00 on day 3
    const { diff } = plan([task("u", { effortGuessed: true })], busy, newModel(now), now);
    const p = diff.placed.find((x) => x.id === "u");
    expect(p?.start).toBeGreaterThanOrEqual(at(2, 10));
    expect(p!.start).toBeLessThan(at(7, 0));
  });
});

describe("sitting lengths follow free time", () => {
  it("split by weights keeps count and total on the 30 grid, 30 to 2× the sitting", () => {
    for (const eff of [120, 180, 240, 300, 360, 600]) for (const cap of [60, 90, 120]) for (const w of [[15, 2, 15, 9], [1, 1, 14], [0, 15], [3, 3, 3, 3, 15, 0]]) {
      const even = split(eff, cap), ws = even.map((_, i) => w[i % w.length]), got = split(eff, cap, ws);
      expect(got.length).toBe(even.length);
      expect(got.reduce((a, x) => a + x, 0)).toBe(even.reduce((a, x) => a + x, 0));
      for (const x of got) { expect(x % 30).toBe(0); expect(x).toBeGreaterThanOrEqual(30); expect(x).toBeLessThanOrEqual(Math.max(Math.min(120, 2 * cap), Math.max(...even))); }
      if (even.length > 1 && new Set(ws).size > 1) expect(got[ws.indexOf(Math.max(...ws))]).toBeGreaterThanOrEqual(got[ws.indexOf(Math.min(...ws))]);
    }
  });
  it("equal free days give equal sittings (no weights effect)", () => {
    expect(split(240, 60, [5, 5, 5, 5])).toEqual([60, 60, 60, 60]);
  });
  it("a prep over a week with class-heavy days: one longer sitting a light day, none on the full days", () => {
    const heavy = [1, 3, 5].map((d) => ({ start: at(d, 7), end: at(d, 19) })); // 12 h of classes
    const t = task("prep", { effort: 360, maxSitting: 60, deadline: at(7, 8), forId: "exam", kind: "study" });
    const ps = plan([t], heavy, newModel(now), now).diff.placed.filter((p) => p.id.startsWith("prep#"));
    const dayOf = (p: { start: number }) => Math.round((dayStart(p.start) - dayStart(now)) / DAY);
    expect(ps.reduce((a, p) => a + (p.end - p.start) / MIN, 0)).toBe(360);
    expect(ps.some((p) => [1, 3, 5].includes(dayOf(p)))).toBe(false);
    expect(new Set(ps.map(dayOf)).size).toBe(ps.length); // one a day
    expect(Math.max(...ps.map((p) => (p.end - p.start) / MIN))).toBeGreaterThan(60);
    expect(ps.every((p) => p.end <= at(6, 22))).toBe(true); // done by the evening before the exam
  });
  it("two sittings before an exam in 4 days with classes on day 2 take two days, not one", () => {
    const heavy = [1, 3].map((d) => ({ start: at(d, 7), end: at(d, 19) }));
    const t = task("prep", { effort: 180, maxSitting: 60, deadline: at(4, 8), forId: "exam", kind: "study" });
    const ps = plan([t], heavy, newModel(now), now).diff.placed.filter((p) => p.id.startsWith("prep#"));
    expect(new Set(ps.map((p) => dayStart(p.start))).size).toBe(ps.length);
  });
  it("free days: sittings spread one a day, never two of one task on a day", () => {
    const t = task("p", { effort: 300, maxSitting: 60, deadline: at(9, 22), kind: "study" });
    const ps = plan([t], [], newModel(now), now).diff.placed.filter((p) => p.id.startsWith("p#"));
    expect(ps.length).toBe(5);
    expect(new Set(ps.map((p) => dayStart(p.start))).size).toBe(5);
  });
});
