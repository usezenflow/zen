// Insights from the outcomes (what was done, moved away from, or missed): which contrasts the history supports, each as a structured finding.
// A completion rate per group is a Beta(2,2) posterior; a contrast is said once both sides have N_MIN outcomes and the chance its gap
// clears LIFT is at least SURE_P. Pure: no UI, no writes.
import type { Kind } from "../lib/types";
import { PART_NAMES } from "../lib/parts";
import { KIND_VI, kindW } from "../lib/reasons";
import { INSIGHT, fill } from "../lib/i18n";
import { KINDS, PARTS } from "./linucb";
import { DAY, I_AFTER, partIdx } from "./features";
import { ROW_KEY, insights } from "./insights";
import type { Model } from "./model";

export interface Finding {
  type: "kindPart" | "sequence" | "busy" | "weekend" | "deadline" | "length";
  feature: number; // index in the feature vector: kindPart and length the kind (4 + kind), sequence the kind before (I_AFTER + kind), busy 2, weekend 1, deadline 3
  armP: number; // part of the day (-1 for length, which has none)
  armQ?: number; // second part, for kindPart only
  direction: 1 | -1; // 1: armP (or the first part, or the context on) completes more; -1: less. For length, 1 runs over the guess
  z: number; // signed gap over its spread
  n: number; // outcomes behind it (the smaller side of a contrast)
  behaviour?: "contradicts" | "agrees"; // only kindPart, from drags tagged with a kind; undefined = no data
  surprise: number; // |z| x (2 contradicts, 1 none, 0.5 agrees)
  of?: Kind; // sequence only: the kind whose outcome is compared (feature is the kind done before it)
  sure?: number; // 0..1: the chance the gap really clears LIFT in this direction (said at SURE_P or more)
}

const WEEK = 7 * DAY;
const N_MIN = 5; // outcomes on each side of a contrast before it is said
const LIFT = 0.15; // the smallest real gap in completion rate worth saying (15 points)
const SURE_P = 0.9; // the chance the gap clears LIFT, under the posterior, before it is said
const ON = 0.5; // a one-hot or context flag counts as on from here
const BUSY_ON = 0.25; // busy is fixed hours / 8: from two hours of fixed lessons that day
const OVER = 1.15, UNDER = 0.85; // a guessed task ran over or under its guess by more than 15%
const SURE = 10; // drags behind a behaviour verdict, in total

// Standard normal CDF (Abramowitz & Stegun 7.1.26, error under 1.5e-7). shortcut: normal approximation to the Beta posteriors; upgrade to exact Beta tails if small-n verdicts look wrong.
const phi = (z: number) => {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const e = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + e) / 2 : (1 - e) / 2;
};

// Beta(2,2) prior on a completion rate, after s good outcomes of n: the posterior mean and variance.
const post = (s: number, n: number) => { const a = 2 + s, b = 2 + n - s; return { mu: a / (a + b), v: (a * b) / ((a + b) ** 2 * (a + b + 1)) }; };

// A gap d with spread sd: the side it clears LIFT on, and how sure.
const verdict = (d: number, sd: number) => {
  const up = phi((d - LIFT) / sd), down = phi((-d - LIFT) / sd);
  return up >= SURE_P ? { dir: 1 as const, sure: up } : down >= SURE_P ? { dir: -1 as const, sure: down } : undefined;
};

interface Out { kind?: Kind; part: number; ok: boolean; x: number[] }
const kindIn = (x: number[], from: number) => KINDS.find((_, i) => x[from + i] >= ON);
// Outcomes are the history rows with a sign: r > 0 went well, r < 0 did not (a later, a drag, a miss). r = 0 counts nothing.
const outcomes = (m: Model): Out[] => m.hist.filter((h) => h.r !== 0).map((h) => ({ kind: kindIn(h.vec, 4), part: partIdx(h.hour), ok: h.r > 0, x: h.vec }));

// Does group a complete more than group b, by more than LIFT? Both sides need N_MIN outcomes.
const contrast = (a: Out[], b: Out[]) => {
  if (a.length < N_MIN || b.length < N_MIN) return undefined;
  const A = post(a.filter((o) => o.ok).length, a.length), B = post(b.filter((o) => o.ok).length, b.length);
  const d = A.mu - B.mu, sd = Math.sqrt(A.v + B.v), v = verdict(d, sd);
  return v && { ...v, z: d / sd, n: Math.min(a.length, b.length) };
};

const keyOf = (f: Finding) => `${f.type}:${f.feature}:${f.armP}:${f.armQ ?? ""}:${f.direction}:${f.of ?? ""}`;
const learnedKeys = (m: Model, now: number) => insights(m, now).learned.map((x) => ROW_KEY + x.text);

// Where the user puts this kind by hand: drags tagged with the kind.
function behaviour(m: Model, ki: number, p: number, q: number, dir: 1 | -1): Finding["behaviour"] {
  let mp = 0, mq = 0;
  for (const x of m.moved ?? []) {
    if ((x as { kind?: Kind }).kind !== KINDS[ki]) continue;
    const part = partIdx(x.hour);
    if (part === p) mp++; else if (part === q) mq++;
  }
  if (mp + mq < SURE || mp === mq) return undefined;
  return (mp > mq) === (dir === 1) ? "agrees" : "contradicts";
}

const surpriseOf = (z: number, b?: Finding["behaviour"]) => Math.abs(z) * (b === "contradicts" ? 2 : b === "agrees" ? 0.5 : 1);

/** Every finding the history supports now, strongest first (pure; not yet surfaced). Empty for a thin history. */
export function candidates(m: Model): Finding[] {
  const os = outcomes(m);
  const out: Finding[] = [];

  // Kind x part: the same kind completes more in one part of the day than in another (p before q).
  KINDS.forEach((k, ki) => {
    for (let p = 0; p < PARTS; p++) for (let q = p + 1; q < PARTS; q++) {
      const r = contrast(os.filter((o) => o.kind === k && o.part === p), os.filter((o) => o.kind === k && o.part === q));
      if (!r) continue;
      const bh = behaviour(m, ki, p, q, r.dir);
      out.push({ type: "kindPart", feature: 4 + ki, armP: p, armQ: q, direction: r.dir, z: r.z, n: r.n, behaviour: bh, surprise: surpriseOf(r.z, bh), sure: r.sure });
    }
  });

  // What was done right before (a kind), in one part: kind k after prev against kind k done some other way, in that part.
  KINDS.forEach((prev, j) => KINDS.forEach((k) => {
    for (let p = 0; p < PARTS; p++) {
      const same = os.filter((o) => o.kind === k && o.part === p);
      const r = contrast(same.filter((o) => kindIn(o.x, I_AFTER) === prev), same.filter((o) => kindIn(o.x, I_AFTER) !== prev));
      if (r) out.push({ type: "sequence", feature: I_AFTER + j, armP: p, direction: r.dir, z: r.z, n: r.n, surprise: Math.abs(r.z), of: k, sure: r.sure });
    }
  }));

  // One context at a time, within each part of the day: the context on against off (busy day, weekend, near a deadline).
  const flags: [Finding["type"], number, number][] = [["busy", 2, BUSY_ON], ["weekend", 1, ON], ["deadline", 3, ON]];
  for (const [type, feat, at] of flags) for (let p = 0; p < PARTS; p++) {
    const here = os.filter((o) => o.part === p);
    const r = contrast(here.filter((o) => o.x[feat] >= at), here.filter((o) => o.x[feat] < at));
    if (r) out.push({ type, feature: feat, armP: p, direction: r.dir, z: r.z, n: r.n, surprise: Math.abs(r.z), sure: r.sure });
  }

  // Length: guessed tasks of this kind (last 20) that ran over or under their guess by 15%+, against the half that would be a fair guess.
  KINDS.forEach((k, ki) => {
    const rs = m.efforts.filter((e) => e.kind === k && e.guess && e.guess > 0).slice(-20).map((e) => e.minutes / e.guess!);
    if (rs.length < N_MIN) return;
    for (const [dir, n] of [[1, rs.filter((r) => r > OVER).length], [-1, rs.filter((r) => r < UNDER).length]] as const) {
      const P = post(n, rs.length), v = verdict(P.mu - 0.5, Math.sqrt(P.v));
      if (v?.dir === 1) out.push({ type: "length", feature: 4 + ki, armP: -1, direction: dir, z: (P.mu - 0.5) / Math.sqrt(P.v), n: rs.length, surprise: Math.abs((P.mu - 0.5) / Math.sqrt(P.v)), sure: v.sure });
    }
  });

  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

/** The findings said to the user: those already surfaced (see surface). */
export function mine(m: Model, now: number): Finding[] {
  void now;
  const said = new Set((m.surfaced ?? []).map((s) => s.key));
  return candidates(m).filter((f) => said.has(keyOf(f)));
}

/** Surfaces at most one new finding and one new learned row (insights.learned, the Sunday card's) a week: the strongest not said before.
 *  Called by learn, so the model is the only state. Findings and rows keep their own week, so one never holds back the other. */
export function surface(m: Model, now: number): void {
  const said = m.surfaced ?? [];
  const next = (keys: () => string[], row: boolean) => {
    if (said.some((s) => s.key.startsWith(ROW_KEY) === row && now - s.at < WEEK)) return [];
    const known = new Set(said.map((s) => s.key));
    const k = keys().find((x) => !known.has(x));
    return k ? [{ key: k, at: now }] : [];
  };
  const add = [...next(() => candidates(m).map(keyOf), false), ...next(() => learnedKeys(m, now), true)];
  if (add.length) m.surfaced = [...said, ...add].slice(-50);
}

/** One literal Vietnamese clause for a finding: the measured contrast and nothing else. */
export function clause(f: Finding): string {
  const k = f.type === "sequence" ? f.feature - I_AFTER : f.type === "kindPart" || f.type === "length" ? f.feature - 4 : -1;
  const kind = k >= 0 ? (KINDS[k] as Kind) : undefined;
  const part = PART_NAMES[f.armP] ?? "";
  const tpl = INSIGHT[f.type][f.direction === 1 ? 0 : 1];
  return fill(tpl, {
    kind: kind ? kindW(kind, true) : "",
    prev: kind ? KIND_VI[kind] : "",
    of: f.of ? kindW(f.of) : "",
    part,
    to: f.armQ === undefined ? "" : PART_NAMES[f.armQ],
  });
}

/** The findings that speak for this slot: a part where this kind does better, or an active context (after a kind, a busy day, a weekend,
 *  a near due) that does better in this part. A finding against the slot, or about a context not present, is not said. Length findings
 *  for this kind come last: they explain the block's length, not its time. `x` is the slot's feature vector (Placed.x), when known. */
export function findingsFor(fs: Finding[], kind: Kind, start: number, x?: number[]): Finding[] {
  const part = partIdx(new Date(start).getHours() + new Date(start).getMinutes() / 60), kf = 4 + KINDS.indexOf(kind);
  const on = (i: number, at = ON) => (x?.[i] ?? 0) >= at;
  const slot = fs.filter((f) => {
    if (f.of !== undefined && f.of !== kind) return false; // a sequence speaks about its own kind's outcome
    if (f.type === "kindPart") return f.feature === kf && ((f.armP === part && f.direction === 1) || (f.armQ === part && f.direction === -1));
    if (f.type === "length") return false;
    return f.armP === part && f.direction === 1 && on(f.feature, f.type === "busy" ? BUSY_ON : ON);
  });
  return [...slot, ...fs.filter((f) => f.type === "length" && f.feature === kf)];
}
