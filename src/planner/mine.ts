// Insights from LinUCB's part arms: which contrasts the outcomes support, each as a structured finding. Pure: no UI, no writes.
import type { Kind } from "../lib/types";
import { PART_NAMES } from "../lib/parts";
import { KIND_VI, kindW } from "../lib/reasons";
import { INSIGHT, fill } from "../lib/i18n";
import { D, KINDS, PARTS, coldParts, invert, type Arm } from "./linucb";
import { DAY, I_AFTER, partIdx } from "./features";
import { ROW_KEY, insights } from "./insights";
import type { Model } from "./model";

export interface Finding {
  type: "kindPart" | "sequence" | "busy" | "weekend" | "deadline" | "length";
  feature: number; // index in the feature vector (length: 4 + the kind's index)
  armP: number; // part of the day (-1 for length, which is not an arm)
  armQ?: number; // second part, for kindPart only
  direction: 1 | -1; // 1: armP (or the first part) scores higher, or the length runs over the guess
  z: number; // signed contrast
  n: number; // decayed outcomes behind it (the smaller side for a contrast)
  behaviour?: "contradicts" | "agrees"; // only kindPart, from drags tagged with a kind; undefined = no data
  surprise: number; // |z| x (2 contradicts, 1 none, 0.5 agrees)
}

const SIGMA = 0.5; // shortcut: fixed at the reward scale; upgrade to the residual sigma from m.hist once there are 50+ outcomes
const SURE = 10; // outcomes behind any insight, on each side of a contrast, before it is said (decayed counts, so the real number is higher)
const WEEK = 7 * DAY;
const GATE_Z = 3; // ~100 candidates are tested: at |z|≥3 well under one is expected by chance
const CONF = 0.8; // |corr| above this with another active feature: the data cannot separate them, so nothing is said
const LEN_LO = 0.85, LEN_HI = 1.15;

interface Fit { th: number[]; se: number[]; n: number[]; Ae: number[]; inv: number[] }

// Learned change from the cold prior: theta - theta_cold, its standard error, and the evidence Ae = A - A_cold (flat, row-major).
function fitPart(arm: Arm, cold: Arm): Fit {
  const inv = invert(arm.A), ic = invert(cold.A);
  const th = new Array(D), se = new Array(D), n = new Array(D);
  const Ae = arm.A.map((v, i) => v - cold.A[i]);
  for (let i = 0; i < D; i++) {
    let s = 0, sc = 0;
    for (let j = 0; j < D; j++) { s += inv[i * D + j] * arm.b[j]; sc += ic[i * D + j] * cold.b[j]; }
    th[i] = s - sc;
    se[i] = SIGMA * Math.sqrt(Math.max(0, inv[i * D + i]));
    n[i] = Ae[i * D + i];
  }
  return { th, se, n, Ae, inv };
}

// The prediction for a kind in a part (intercept + its one-hot), learned change and standard error. The kind one-hots sum to the
// intercept, so a kind's own weight is not identified (ridge splits it with the intercept); the prediction is, and its error shrinks with n.
function kindAt(f: Fit, feat: number): { mu: number; se: number } {
  const v = f.inv[0] + 2 * f.inv[feat] + f.inv[feat * D + feat]; // xᵀA⁻¹x for x = e0 + e_feat (A⁻¹ symmetric)
  return { mu: f.th[0] + f.th[feat], se: SIGMA * Math.sqrt(Math.max(0, v)) };
}

// Another active feature (not the intercept) that moves with k: the contrast is not credited to k.
function confounded(f: Fit, k: number): boolean {
  for (let l = 1; l < D; l++) {
    if (l === k || !(f.n[l] > 0) || !(f.n[k] > 0)) continue;
    if (Math.abs(f.Ae[k * D + l]) / Math.sqrt(f.n[k] * f.n[l]) > CONF) return true;
  }
  return false;
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const surpriseOf = (z: number, b?: Finding["behaviour"]) => Math.abs(z) * (b === "contradicts" ? 2 : b === "agrees" ? 0.5 : 1);

// Where the user puts this kind by hand: drags tagged with the kind (m.moved has no kind yet, so this is empty until learn adds it).
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

const keyOf = (f: Finding) => `${f.type}:${f.feature}:${f.armP}:${f.armQ ?? ""}:${f.direction}`;
const learnedKeys = (m: Model, now: number) => insights(m, now).learned.map((x) => ROW_KEY + x.text);

/** Every finding the model supports now, strongest |z| first (pure; not yet surfaced). Empty when there is no model or no significant contrast. */
export function candidates(m: Model): Finding[] {
  if (!m.parts || m.parts.length !== PARTS) return [];
  const cold = coldParts();
  const fits = m.parts.map((arm, p) => fitPart(arm, cold[p]));
  const out: Finding[] = [];

  // Kind x part: each pair of parts, p before q.
  KINDS.forEach((_, ki) => {
    const feat = 4 + ki;
    for (let p = 0; p < PARTS; p++) for (let q = p + 1; q < PARTS; q++) {
      const a = fits[p], b = fits[q];
      if (a.n[feat] < SURE || b.n[feat] < SURE || confounded(a, feat) || confounded(b, feat)) continue;
      const ka = kindAt(a, feat), kb = kindAt(b, feat);
      const z = (ka.mu - kb.mu) / Math.hypot(ka.se, kb.se);
      if (Math.abs(z) < GATE_Z) continue;
      const direction = z > 0 ? 1 : -1, bh = behaviour(m, ki, p, q, direction);
      out.push({ type: "kindPart", feature: feat, armP: p, armQ: q, direction, z, n: Math.min(a.n[feat], b.n[feat]), behaviour: bh, surprise: surpriseOf(z, bh) });
    }
  });

  // One part at a time against zero: the feature's own effect there.
  const single = (type: Finding["type"], feat: number, p: number) => {
    const f = fits[p];
    if (f.n[feat] < SURE || confounded(f, feat)) return;
    const z = f.th[feat] / f.se[feat];
    if (Math.abs(z) < GATE_Z) return;
    out.push({ type, feature: feat, armP: p, direction: z > 0 ? 1 : -1, z, n: f.n[feat], surprise: surpriseOf(z) });
  };
  for (let p = 0; p < PARTS; p++) {
    KINDS.forEach((_, j) => single("sequence", I_AFTER + j, p));
    single("busy", 2, p);
    single("weekend", 1, p);
    single("deadline", 3, p);
  }

  // Length: the median of actual / guessed minutes per kind, over the last 20 guessed tasks.
  KINDS.forEach((k: Kind, ki) => {
    const rs = m.efforts.filter((e) => e.kind === k && e.guess && e.guess > 0).slice(-20).map((e) => e.minutes / e.guess!);
    if (rs.length < SURE) return;
    const med = median(rs);
    if (med >= LEN_LO && med <= LEN_HI) return;
    const mean = rs.reduce((s, r) => s + r, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rs.length - 1));
    const z = (med - 1) / (Math.max(sd, 0.05) / Math.sqrt(rs.length));
    out.push({ type: "length", feature: 4 + ki, armP: -1, direction: med > 1 ? 1 : -1, z, n: rs.length, surprise: Math.abs(z) });
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
    part,
    to: f.armQ === undefined ? "" : PART_NAMES[f.armQ],
  });
}

/** The findings that speak for this slot: a part where this kind does better, or an active context (after a kind, a busy day, a weekend,
 *  a near due) that does better in this part. A finding against the slot, or about a context not present, is not said. Length findings
 *  for this kind come last: they explain the block's length, not its time. `x` is the slot's feature vector (Placed.x), when known. */
export function findingsFor(fs: Finding[], kind: Kind, start: number, x?: number[]): Finding[] {
  const part = partIdx(new Date(start).getHours() + new Date(start).getMinutes() / 60), kf = 4 + KINDS.indexOf(kind);
  const on = (i: number, at = 0.5) => (x?.[i] ?? 0) >= at;
  const slot = fs.filter((f) => {
    if (f.type === "kindPart") return f.feature === kf && ((f.armP === part && f.direction === 1) || (f.armQ === part && f.direction === -1));
    if (f.type === "length") return false;
    return f.armP === part && f.direction === 1 && on(f.feature, f.type === "deadline" || f.type === "busy" ? 0.5 : 1);
  });
  return [...slot, ...fs.filter((f) => f.type === "length" && f.feature === kf)];
}
