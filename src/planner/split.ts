// Effort over 120 min (or maxSitting) becomes sittings of whole half hours, as even as they go (150 in two: 90 and 60), never 45s.
export function split(effort: number, maxSitting = 120, weights?: number[]): number[] {
  const halves = Math.max(1, Math.ceil(effort / 30));
  const n = Math.min(halves, Math.max(1, Math.ceil(effort / maxSitting)));
  const even = Array.from({ length: n }, (_, i) => (Math.floor(halves / n) + (i < halves % n ? 1 : 0)) * 30);
  if (!weights || weights.length !== n || n < 2 || weights.every((w) => w === weights[0])) return even;
  // Same count and total, shares by weight (a day's free time): a light day up to twice the sitting (at most 2 h), a heavy one down to 30.
  const hi = Math.max(1, Math.min(4, Math.floor((2 * maxSitting) / 30))), sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (sum <= 0) return even;
  const out = weights.map((w) => Math.min(hi, Math.max(1, Math.round((Math.max(0, w) / sum) * halves))));
  // settle the rounding on the grid: add to the lightest-loaded (highest weight) first, take from the lowest weight first
  const order = weights.map((w, i) => [w, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  for (let left = halves - out.reduce((a, x) => a + x, 0), k = 0; left !== 0 && k < 4 * n * hi; k++) {
    const i = left > 0 ? order[k % n] : order[n - 1 - (k % n)];
    if (left > 0 && out[i] < hi) { out[i]++; left--; } else if (left < 0 && out[i] > 1) { out[i]--; left++; }
  }
  return out.reduce((a, x) => a + x, 0) === halves ? out.map((x) => x * 30) : even;
}

// Shortest sitting worth doing when no length was said: an errand fits 15 min, deep work never under 1h30.
const FLOOR: Record<string, number> = {
  fix: 15, review_code: 15, clean: 15, laundry: 15, cook: 15, shop: 15, bill: 15, paperwork: 15, call: 15, email: 15,
  language: 15, workout_run: 15, workout_yoga: 15, habit_read: 15, habit_meditate: 15, habit_journal: 15,
  skill: 30, workout_gym: 30, workout_swim: 30, read: 30, budget: 30,
  homework: 60, slides: 60, exam_review: 60,
  code: 90, write_doc: 90, essay: 90, project: 90, thesis: 90, tax: 90,
};
const BY_KIND: Record<string, number> = { study: 90, exercise: 30, chores: 15, social: 30, other: 30 };
export const minSitting = (t: { cls?: string; kind: string }) => (t.cls && FLOOR[t.cls]) || BY_KIND[t.kind] || 30;
