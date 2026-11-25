// Synthetic user over 30 days: full model vs greedy vs LinUCB on the hour only.
import type { Kind, Task } from "../lib/types";
import { DAY, HOUR, KINDS, MIN, cdist, hourOf } from "./features";
import { type Model, learn, newModel, plan } from "./index";
import type { Busy } from "./place";

export type Variant = "full" | "hour" | "greedy";
const PREF: Record<Kind, number> = { study: 20, exercise: 7, chores: 17, social: 19, other: 12, work: 10, errand: 11, finance: 14, self: 8 };
const SLIP_KIND: Kind = "study";

function rngOf(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const vecOf = (kind: Kind, r: () => number) => {
  const v = new Float32Array(16).fill(0);
  v[KINDS.indexOf(kind)] = 1;
  for (let i = 5; i < 16; i++) v[i] = (r() - 0.5) * 0.2;
  return v;
};

export interface Result { kept: number; drag: number; n: number; violations?: number; misses?: number }
/** A chain scenario: each day adds a 3-step chain with a deadline; `linked` makes each step follow the one before it. */
export interface Chain { linked: boolean }

export function simulate(variant: Variant, seed: number, days = 30, chain?: Chain): Result {
  const gen = rngOf(seed), out = rngOf(seed + 1000), crng = rngOf(seed + 2000);
  let violations = 0;
  const base = new Date(2026, 10, 2, 0, 0, 0, 0).getTime();
  let model: Model = newModel(base);
  const tasks: Task[] = [];
  let kept = 0, dragSum = 0, n = 0, id = 0;

  for (let d = 0; d < days; d++) {
    const now = base + d * DAY + 7 * HOUR;
    const dow = new Date(now).getDay();
    const busy: Busy[] = [];
    for (let k = 0; k < 4; k++) {
      const day = base + (d + k) * DAY;
      const w = new Date(day).getDay();
      if (w !== 0 && w !== 6) busy.push({ start: day + 9 * HOUR, end: day + 11 * HOUR });
    }
    const kinds: Kind[] = ["exercise", "study", "study", (["chores", "social", "other"] as Kind[])[Math.floor(gen() * 3)]];
    for (const kind of kinds) {
      const dl = gen() < 0.5 ? now + (2 + Math.floor(gen() * 4)) * DAY : undefined;
      tasks.push({ id: `t${id++}`, title: kind, kind, source: "user", effort: gen() < 0.5 ? 30 : 60, deadline: dl, vec: vecOf(kind, gen), createdAt: now });
    }
    if (chain) {
      const dl = now + (3 + Math.floor(crng() * 3)) * DAY;
      let prev: Task | undefined;
      for (let k = 0; k < 3; k++) {
        const t: Task = { id: `c${id++}`, title: `chain ${d}.${k}`, kind: "study", source: "user", effort: crng() < 0.5 ? 30 : 60, deadline: dl, vec: vecOf("study", crng), createdAt: now, after: chain.linked && prev ? [prev.id] : undefined };
        tasks.push(t);
        prev = t;
      }
    }
    const open = tasks.filter((t) => !t.doneAt && (t.deadline === undefined || t.deadline > now));

    if (variant === "greedy") {
      const occ = [...busy];
      for (const t of [...open].sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity))) {
        let s = Math.ceil((now + HOUR) / (30 * MIN)) * 30 * MIN;
        const len = t.effort * MIN;
        while (occ.some((o) => s < o.end && s + len > o.start)) s += 30 * MIN;
        t.start = s; t.end = s + len; occ.push({ start: s, end: s + len });
      }
    } else {
      const r = plan(open, busy, model, now, { hourOnly: variant === "hour" });
      model = r.model;
      // a task placed whole that is split now lives in its sittings: its own slot goes
      for (const s of r.diff.split) { const par = tasks.find((y) => y.id === s.parentId)!; par.start = undefined; par.end = undefined; }
      // a split sitting `${id}#n` is its own task with parentId, as the app persists it; the parent is done when all its sittings are
      const sitting = (id: string, effort: number) => {
        let x = tasks.find((y) => y.id === id);
        if (!x) { const par = tasks.find((y) => y.id === id.split("#")[0])!; tasks.push(x = { ...par, id, parentId: par.id, after: undefined, effort, start: undefined, end: undefined }); open.push(x); }
        return x;
      };
      const first = new Map<string, number>();
      for (const p of r.diff.placed) {
        const pid = p.id.split("#")[0];
        const x = p.id.includes("#") ? sitting(p.id, (p.end - p.start) / MIN) : tasks.find((y) => y.id === p.id)!;
        x.start = p.start; x.end = p.end;
        first.set(pid, Math.min(first.get(pid) ?? Infinity, p.start));
      }
      for (const u of r.diff.unplaced ?? []) if (u.id.includes("#")) sitting(u.id, u.effort);
      // a successor placed this round starts after its predecessor's last sitting ends
      for (const t of tasks) for (const pid of t.after ?? []) {
        const pre = Math.max(-Infinity, ...tasks.filter((x) => (x.id === pid || x.parentId === pid) && x.end !== undefined).map((x) => x.end!));
        const s = first.get(t.id);
        if (s !== undefined && s < pre) violations++;
      }
    }

    const today = open.filter((t) => t.start !== undefined && t.start < now + DAY).sort((a, b) => a.start! - b.start!);
    const ends: { kind: Kind; end: number }[] = [];
    const ev = (type: "kept" | "done" | "later" | "drag", t: Task, at: number, data?: Record<string, unknown>) => {
      if (variant !== "greedy") model = learn(model, { id: `e${at}${t.id}${type}`, taskId: t.id, type, at, data }, t);
    };
    // a parent is done when its last sitting is
    const settle = (t: Task) => {
      if (!t.parentId) return;
      const sib = tasks.filter((x) => x.parentId === t.parentId);
      if (sib.every((x) => x.doneAt !== undefined)) tasks.find((x) => x.id === t.parentId)!.doneAt = Math.max(...sib.map((x) => x.doneAt!));
    };
    for (const t of today) {
      n++;
      const s = t.start!;
      const afterGym = t.kind === "study" && ends.some((e) => e.kind === "exercise" && e.end <= s && e.end >= s - HOUR);
      const late = t.kind === SLIP_KIND && t.deadline !== undefined && (s - t.createdAt) / (t.deadline - t.createdAt) > 0.5;
      if (late && out() < 0.8) { ev("later", t, s - HOUR); t.start = undefined; continue; }
      const p = afterGym ? 0.95 : Math.exp(-(cdist(hourOf(s), PREF[t.kind]) ** 2) / 8);
      if (out() < p) {
        kept++;
        ev("kept", t, s);
        ev("done", t, s + t.effort * MIN);
        t.doneAt = s + t.effort * MIN;
        settle(t);
        ends.push({ kind: t.kind, end: t.doneAt });
      } else {
        const to = new Date(s); to.setHours(Math.floor(PREF[t.kind]), 0, 0, 0);
        const dm = Math.abs(to.getTime() - s) / MIN;
        dragSum += Math.min(1, dm / 240);
        ev("drag", t, s - HOUR, { fromStart: s, toStart: to.getTime() });
        t.start = to.getTime(); t.end = t.start + t.effort * MIN;
        ev("done", t, t.end);
        t.doneAt = t.end;
        settle(t);
        ends.push({ kind: t.kind, end: t.end });
      }
    }
    void dow;
  }
  if (!chain) return { kept: kept / n, drag: dragSum / n, n };
  // chain deadlines missed: no done time on or before the deadline
  const misses = tasks.filter((t) => t.id.startsWith("c") && !t.parentId && t.deadline !== undefined && !(t.doneAt !== undefined && t.doneAt <= t.deadline)).length;
  return { kept: kept / n, drag: dragSum / n, n, violations, misses };
}

export function report(seeds = [1, 2, 3, 4, 5]) {
  const rows = (["greedy", "hour", "full"] as Variant[]).map((v) => {
    const rs = seeds.map((s) => simulate(v, s));
    const avg = (f: (r: Result) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    return { variant: v, kept: avg((r) => r.kept), drag: avg((r) => r.drag) };
  });
  return rows;
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("sim.ts")) {
  for (const r of report()) console.log(`${r.variant.padEnd(7)} kept ${(r.kept * 100).toFixed(1)}%  drag ${r.drag.toFixed(3)}`);
}
