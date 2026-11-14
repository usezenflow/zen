// The model's weights as things a friend would notice. Pure; the rhythm page, memory page and Sunday card read it.
import { KIND_VI } from "../lib/reasons";
import type { Kind } from "../lib/types";
import { D, energy, I_AFTER, I_ENERGY, KINDS } from "./features";
import { peakHour, slipOf } from "./habits";
import { coldArms, prepare } from "./linucb";
import type { Model } from "./model";

export interface Insights {
  hours: number[]; // 24 values in 0..1: how well each hour tends to go
  golden?: { from: number; to: number; sure?: number }; // best contiguous hours, to exclusive
  pairs: { before: Kind; w: number }[]; // "after" weights worth saying, strongest first
  slip: { kind: Kind; rate: number }[]; // kinds pushed later often, highest first
  unsure?: { from: number; to: number }; // waking hours the model knows least about
  guesses: { text: string; sure: number }[]; // sentences for "Mình đoán", sure in 0..1
  byKind: { kind: Kind; from: number; to: number; sure: number }[]; // best 3-hour window per kind, only when clearly better than its average
  weekly?: string; // one sentence for the Sunday card
}

const COLD = prepare(coldArms());
const U0 = Math.sqrt(COLD.inv[0][0]); // uncertainty of an arm with no evidence
const KC = KINDS.map((_, j) => 4 + j); // the kind one-hot columns
const UK = KC.map((c) => Math.sqrt(COLD.inv[0][c * D + c]));
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
const clamp = (x: number) => Math.max(0, Math.min(1, x));

export function insights(m: Model, now: number): Insights {
  const cold = coldArms();
  const learned = m.arms.some((arm, a) => arm.A.some((v, i) => Math.abs(v - cold[a].A[i]) > 1e-6));
  const p = prepare(m.arms);
  const peak = peakHour(m, now);
  // An hour's quality counts what was learned for any kind too: a moved task teaches its kind's columns, never the intercept.
  const raw = range(0, 24).map((h) => p.theta[h][0] + mean(KC.map((c) => p.theta[h][c])) + p.theta[h][I_ENERGY] * energy(h + 0.5, peak));
  const lo = Math.min(...raw), hi = Math.max(...raw);
  const hours = raw.map((v) => (hi > lo ? (v - lo) / (hi - lo) : 0));
  // How little is known about an hour: the best-known of its intercept and kind columns, against the cold prior.
  const unc = (hs: number[]) => mean(hs.map((h) => Math.min(Math.sqrt(p.inv[h][0]) / U0, ...KC.map((c, j) => Math.sqrt(p.inv[h][c * D + c]) / UK[j]))));
  const sureOf = (hs: number[]) => clamp(1 - unc(hs));
  const wake = range(7, 23);
  const out: Insights = { hours, pairs: [], slip: [], byKind: [], guesses: [] };
  const weekly: { text: string; sure: number }[] = [];
  if (!learned) return out;

  let best = 0;
  for (let from = 0; from < 24; from++) for (let len = 2; len <= 4 && from + len <= 24; len++) {
    const w = range(from, from + len);
    if (w.some((h) => hours[h] < 0.75)) continue;
    const v = mean(w.map((h) => hours[h]));
    if (v >= best) { best = v; out.golden = { from, to: from + len }; }
  }
  if (out.golden) {
    const sure = sureOf(range(out.golden.from, out.golden.to));
    // A handful of moves or ticks already names a range, marked "Đang đoán" below 0.5; the bare prior never does (learned above).
    if (sure < 0.35) out.golden = undefined;
    else {
      out.golden.sure = sure;
      out.guesses.push({ text: `Giờ vàng ${out.golden.from}–${out.golden.to} giờ`, sure });
      weekly.push({ text: `Bạn làm việc hợp nhất lúc ${out.golden.from} đến ${out.golden.to} giờ`, sure });
    }
  }

  // Additive model: only "after {prev}, things go well", never "prev then X".
  out.pairs = KINDS.map((before, j) => ({ before, w: mean(wake.map((h) => p.theta[h][I_AFTER + j])) }))
    .filter((e) => e.w > 0.05).sort((a, b) => b.w - a.w);
  const ps = sureOf(wake);
  for (const e of out.pairs) {
    out.guesses.push({ text: `Sau giờ ${KIND_VI[e.before]}, bạn làm tiếp tốt`, sure: ps });
  }

  KINDS.forEach((kind, j) => {
    const c = 4 + j, score = (h: number) => p.theta[h][0] + p.theta[h][c] + p.theta[h][I_ENERGY] * energy(h + 0.5, peak);
    const avg = mean(wake.map(score));
    let top = -Infinity, from = 7;
    for (let f = 7; f <= 20; f++) { const v = mean(range(f, f + 3).map(score)); if (v > top) { top = v; from = f; } }
    const hs = range(from, from + 3);
    const sure = clamp(1 - mean(hs.map((h) => Math.sqrt(p.inv[h][c * D + c])))); // against the bare ridge, not the prior's mass
    if (top - avg > 0.1 && sure >= 0.5) {
      out.byKind.push({ kind, from, to: from + 3, sure });
      out.guesses.push({ text: `Bạn ${KIND_VI[kind]} hợp nhất lúc ${from}–${from + 3} giờ`, sure });
      weekly.push({ text: `Bạn ${KIND_VI[kind]} hợp nhất lúc ${from} giờ`, sure });
    }
  });

  out.slip = KINDS.filter((k) => m.slip[k].placed >= 3 && slipOf(m, k) >= 0.25)
    .map((kind) => ({ kind, rate: slipOf(m, kind) })).sort((a, b) => b.rate - a.rate);
  for (const e of out.slip) out.guesses.push({ text: `Việc ${KIND_VI[e.kind]} hay bị dời`, sure: clamp(m.slip[e.kind].placed / 10) });

  let worst = -1;
  for (let from = 7; from <= 20; from++) {
    const u = mean(range(from, from + 3).map((h) => Math.sqrt(p.inv[h][0])));
    if (u > worst) { worst = u; out.unsure = { from, to: from + 3 }; }
  }
  out.guesses = out.guesses.filter((g) => g.sure > 0);
  out.guesses.sort((a, b) => b.sure - a.sure);
  out.weekly = weekly.filter((w) => w.sure >= 0.5).sort((a, b) => b.sure - a.sure)[0]?.text;
  return out;
}
