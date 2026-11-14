// Phase 0.5/0.6: the scorecard. Pass rates by source and family, metrics beyond pass/fail, and the no-regression baseline.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReaderItem } from "../../shared";
import { read } from "../reader";
import { hardScores } from "./hard-score";
import { FAMILIES, NOISY, score, scoreNoisy } from "./mutate";
import { NEGATIVES } from "./negatives";
import { type Case, type Exp, loadCases, loadReference, matches, runCase } from "./run";

const BASELINE = join(__dirname, "golden/baseline.json");
const familyOf = (c: Case) => /^(3[a-n]\d?)\b/.exec(c.name)?.[1] ?? (c.from ? "blend" : /^probe/.test(c.name) ? "probe" : "other");
const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 100);

const optsOf = (c: Case) => ({
  ref: { y: c.ref[0], m: c.ref[1], d: c.ref[2], h: c.ref[3], mi: c.ref[4] },
  source: c.source ?? "typed",
  hint: c.hint,
  calendar: c.calendar,
});

type Slot = "type" | "title" | "date" | "time" | "duration" | "repeat" | "place";
const SLOTS: Slot[] = ["type", "title", "date", "time", "duration", "repeat", "place"];
const expSlot = (e: Exp): Record<Slot, Exp | undefined> => ({
  type: e.type ? { type: e.type } : undefined,
  title: e.title || e.titleIs ? { title: e.title, titleIs: e.titleIs } : undefined,
  date: e.startsDay || e.deadlineDay || e.days || e.notBefore ? { startsDay: e.startsDay, deadlineDay: e.deadlineDay, days: e.days, notBefore: e.notBefore } : undefined,
  time: e.startsAt || e.deadline || e.clocks || e.windows ? { startsAt: e.startsAt, deadline: e.deadline, clocks: e.clocks, windows: e.windows } : undefined,
  duration: e.durationMinutes !== undefined ? { durationMinutes: e.durationMinutes } : undefined,
  repeat: e.rrule ? { rrule: e.rrule } : undefined,
  place: e.location ? { location: e.location } : undefined,
});
const hasSlot = (it: ReaderItem, s: Slot) =>
  ({ type: true, title: !!it.title, date: !!(it.startsAt || it.deadline || it.days?.length || it.notBefore), time: !!(it.startsAt || it.deadline || it.clocks?.length || it.windows?.length), duration: it.durationMinutes !== undefined, repeat: !!it.rrule, place: !!it.location })[s];

export function metrics(cases: Case[] = loadCases(true)) {
  const slot = Object.fromEntries(SLOTS.map((s) => [s, { tp: 0, wrong: 0, missing: 0 }])) as Record<Slot, { tp: number; wrong: number; missing: number }>;
  let expItems = 0, found = 0, checked = 0, checkedOk = 0, dropExp = 0, dropOk = 0, none = 0, noneFp = 0;
  const conf = { hi: [0, 0], lo: [0, 0] }; // [correct, total]
  const ms: number[] = [];
  for (const c of cases) {
    const t0 = performance.now();
    const res = read(c.text, optsOf(c));
    ms.push(performance.now() - t0);
    for (const e of c.items ?? []) {
      expItems++;
      const { after: _a, ...shape } = e;
      if (res.items.some((it) => matches(it, shape))) found++;
      const sl = expSlot(shape);
      // pair with the item that satisfies the most expected slots
      const score = (it: ReaderItem) => SLOTS.filter((s) => sl[s] && matches(it, sl[s]!)).length;
      const best = [...res.items].sort((a, b) => score(b) - score(a))[0];
      for (const s of SLOTS) {
        if (!sl[s]) continue;
        if (best && matches(best, sl[s]!)) slot[s].tp++;
        else if (best && hasSlot(best, s)) slot[s].wrong++;
        else slot[s].missing++;
      }
    }
    for (const it of res.items) {
      const ok = (c.items ?? []).some((e) => matches(it, { ...e, after: undefined } as Exp));
      if (it.checked && c.items) { checked++; if (ok) checkedOk++; }
      if (c.items) { const b = it.confidence >= 0.8 ? conf.hi : conf.lo; b[1]++; if (ok) b[0]++; }
    }
    if (c.dropped) { dropExp += c.dropped.length; dropOk += c.dropped.filter((r) => res.dropped.some((d) => d.reason === r)).length; }
    if (c.count === 0) { none++; if (res.items.length) noneFp++; }
  }
  for (const n of NEGATIVES) { none++; if (read(n.text, optsOf({ ...n, name: "", ref: n.ref ?? [2026, 11, 14, 9, 0] } as Case)).items.some((i) => i.deadline || i.startsAt || i.rrule)) noneFp++; }
  ms.sort((a, b) => a - b);
  return {
    itemRecall: pct(found, expItems),
    slotF1: Object.fromEntries(SLOTS.map((s) => { const { tp, wrong, missing } = slot[s]; return [s, pct(2 * tp, 2 * tp + wrong + missing + wrong)]; })),
    checkedPrecision: pct(checkedOk, checked),
    dropAccuracy: pct(dropOk, dropExp),
    falsePositiveRate: pct(noneFp, none),
    calibration: { "conf>=0.8 correct": pct(conf.hi[0], conf.hi[1]), "conf<0.8 correct": pct(conf.lo[0], conf.lo[1]) },
    latencyMs: { median: +ms[Math.floor(ms.length / 2)].toFixed(2), p95: +ms[Math.floor(ms.length * 0.95)].toFixed(2) },
  };
}

/** Everything the scorecard prints, and what the baseline stores. */
export function scorecard() {
  const all = loadCases(true);
  const rows = all.map((c) => ({ c, ok: runCase(c).length === 0 }));
  const group = (key: (c: Case) => string) => {
    const m = new Map<string, [number, number]>();
    for (const { c, ok } of rows) { const t = m.get(key(c)) ?? [0, 0]; t[1]++; if (ok) t[0]++; m.set(key(c), t); }
    return Object.fromEntries([...m].sort().map(([k, [p, t]]) => [k, `${p}/${t} ${pct(p, t)}%`]));
  };
  const hard = hardScores();
  const clean = loadReference();
  const mutation = Object.fromEntries([
    ...FAMILIES.map((f) => { const s = score(f, clean); return [f, pct(s.pass, s.total)]; }),
    ...NOISY.map((f) => { const s = scoreNoisy(f, clean); return [`${f}*`, pct(s.pass, s.total)]; }),
  ]);
  const byPhase: Record<string, number> = {};
  for (const { c } of rows) byPhase[c.phase ?? 0] = (byPhase[c.phase ?? 0] ?? 0) + 1;
  return {
    summary: { golden: `${rows.filter((r) => r.ok).length}/${rows.length}`, hard: `${hard.filter((h) => h.s.pass).length}/${hard.length}`, casesByPhase: byPhase },
    bySource: group((c) => c.source ?? "typed"),
    byFamily: group(familyOf),
    mutationPassPct: mutation,
    metrics: metrics(all),
    passing: { golden: rows.filter((r) => r.ok).map((r) => r.c.name), hard: hard.filter((h) => h.s.pass).map((h) => h.c.id) },
    hardFieldAcc: pct(Math.round(hard.reduce((a, h) => a + h.s.fieldAcc, 0) * 1000), hard.length * 1000),
  };
}

export const readBaseline = (): { passing: { golden: string[]; hard: string[] }; mutationPassPct: Record<string, number> } | undefined => {
  try { return JSON.parse(readFileSync(BASELINE, "utf8")); } catch { return undefined; }
};
export const writeBaseline = (card: ReturnType<typeof scorecard>) =>
  writeFileSync(BASELINE, JSON.stringify({ passing: card.passing, mutationPassPct: card.mutationPassPct, summary: card.summary }, null, 1) + "\n");
