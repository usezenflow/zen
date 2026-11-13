const FIXED_GRANULARITY = 15;

/**
 * DLU teaching periods ("tiết") → wall-clock minutes from midnight.
 *
 * The portal timetable never returns times: a row says `PeriodID: 1,
 * NumberOfPeriods: 4` and the student is expected to know that means
 * 07:30–11:10. The mapping is fixed by the university and captured in
 * `INTEGRATION_DOCS.md`. Periods are 50 minutes. Breaks are 20 minutes at
 * 09:10 and 10 minutes at 14:40, and most boundaries are off the 15-minute
 * grid, so spans are snapped outward by `snapToGrid`:
 *
 * ```
 *   periods  1– 4   07:30 – 11:10   50/50 · 20-min break · 50/50
 *   periods  7–10   13:00 – 16:30   50/50 · 10-min break · 50/50
 *   periods 11–14   16:40 – 20:00   50/50/50/50, no break
 * ```
 *
 * **Periods 5 and 6 are undocumented** — they sit in the 11:10–13:00 lunch gap
 * and we have never seen a row use them. Rather than invent times, anything
 * touching them (or any other unknown period) maps to `null`; the caller skips
 * the row and records the reason on the job item. Guessing here would silently
 * put a class on the calendar at the wrong hour, which is strictly worse than
 * not putting it there at all.
 *
 * Pure: a lookup table and integer arithmetic.
 */

/** Wall-clock span of a lecture, minutes from local midnight, half-open. */
export interface PeriodSpan {
  startMin: number;
  /** Exclusive; the raw (un-snapped) end — see `snapToGrid`. */
  endMin: number;
}

const hm = (hours: number, minutes: number) => hours * 60 + minutes;

/**
 * Start/end of each individual period. The morning break lives *between*
 * entries, which is why a span cannot simply be `end - start`: periods 1–4
 * cover 220 minutes of wall clock for 200 minutes of teaching.
 */
const PERIODS: ReadonlyMap<number, PeriodSpan> = new Map([
  // Morning block — 20-minute break between periods 2 and 3.
  [1, { startMin: hm(7, 30), endMin: hm(8, 20) }],
  [2, { startMin: hm(8, 20), endMin: hm(9, 10) }],
  [3, { startMin: hm(9, 30), endMin: hm(10, 20) }],
  [4, { startMin: hm(10, 20), endMin: hm(11, 10) }],
  // Afternoon block — 10-minute break between periods 8 and 9.
  [7, { startMin: hm(13, 0), endMin: hm(13, 50) }],
  [8, { startMin: hm(13, 50), endMin: hm(14, 40) }],
  [9, { startMin: hm(14, 50), endMin: hm(15, 40) }],
  [10, { startMin: hm(15, 40), endMin: hm(16, 30) }],
  // Evening block — no break.
  [11, { startMin: hm(16, 40), endMin: hm(17, 30) }],
  [12, { startMin: hm(17, 30), endMin: hm(18, 20) }],
  [13, { startMin: hm(18, 20), endMin: hm(19, 10) }],
  [14, { startMin: hm(19, 10), endMin: hm(20, 0) }],
]);

/**
 * Wall-clock span covered by `numberOfPeriods` consecutive periods starting at
 * `periodId`, or `null` if any period in the span is not in the table.
 *
 * Partial spans work (`periodId: 3, numberOfPeriods: 2` ⇒ 09:30–11:10), and so
 * do spans that straddle two blocks (10 → 11 crosses the 16:30–16:40 gap),
 * because the span is `[first.startMin, last.endMin)` and any intervening
 * break is simply included. A span that reaches across the undocumented
 * periods 5–6 (e.g. 4 → 7) is `null` by construction, which is the intent.
 *
 * The returned span is **raw** — this function does no grid-snapping. Most
 * boundaries are off the 15-minute grid, so callers must run the span through
 * {@link snapToGrid} before it becomes a session.
 */
export function periodsToWallClock(
  periodId: number,
  numberOfPeriods: number,
): PeriodSpan | null {
  if (!Number.isInteger(periodId) || !Number.isInteger(numberOfPeriods)) {
    return null;
  }
  if (numberOfPeriods < 1) return null;

  const first = PERIODS.get(periodId);
  const last = PERIODS.get(periodId + numberOfPeriods - 1);
  if (!first || !last) return null;

  // Every period in between must be known too, or the span silently swallows
  // an undocumented one (4 + 4 would otherwise "work" as 10:30 → 13:45).
  for (let p = periodId + 1; p < periodId + numberOfPeriods - 1; p++) {
    if (!PERIODS.has(p)) return null;
  }

  return { startMin: first.startMin, endMin: last.endMin };
}

/**
 * 15-minute grid snapping for ingested items. Imports keep their real clock on
 * `FIXED_GRANULARITY`; the 30-minute `TIME_GRANULARITY` is for placement.
 *
 * Invariant #3 — every `Session.durationMinutes` is a **positive multiple of
 * 15** and every `scheduledStartTime` sits on a 15-minute boundary — is not
 * something DLU respects. Real upstream times are routinely off-grid:
 *
 *  - a 4-period lecture (periods 1–4) runs 07:30–11:10, i.e. **220 minutes**;
 *  - the evening block (periods 11–14) *starts* at **16:40**;
 *  - a Moodle assignment is due at 07:39 or 23:59.
 *
 * So every parser funnels its raw span through {@link snapToGrid}, which
 * widens outward — start **down**, end **up** — never inward. Widening is the
 * safe direction: the block still covers the whole real commitment, so the
 * scheduler never places a task inside time the student is actually busy.
 *
 * Pure: plain integer arithmetic, no clock, no I/O.
 */

/** Grid step in minutes (15). Re-exported so callers need one import. */
export const GRID_MINUTES = FIXED_GRANULARITY;

const MS_PER_MINUTE = 60_000;

/** Largest multiple of 15 that is `<= minutes`. */
export function floorToGrid(minutes: number): number {
  return Math.floor(minutes / GRID_MINUTES) * GRID_MINUTES;
}

/** Smallest multiple of 15 that is `>= minutes`. */
export function ceilToGrid(minutes: number): number {
  return Math.ceil(minutes / GRID_MINUTES) * GRID_MINUTES;
}

/** A snapped half-open span `[startMin, endMin)`, both on the grid. */
export interface GridBlock {
  startMin: number;
  endMin: number;
  /** `endMin - startMin`; always a positive multiple of 15. */
  durationMinutes: number;
}

/**
 * Snap a raw `[startMin, endMin)` span outward onto the 15-minute grid.
 *
 * Both bounds are minute counts on the same axis — minutes-from-midnight for
 * portal wall-clock times, epoch minutes for LMS instants; the function is
 * agnostic. A degenerate or inverted span collapses to a single 15-minute
 * slot at the snapped start, so the result is never zero-width (which would
 * violate invariant #3 and produce an unplaceable session).
 *
 * Worked examples from the real payloads:
 *  - periods 1–4, `07:30–11:10` (450→670) ⇒ `450–675`, **225 min**;
 *  - periods 11–14, `16:40–20:00` (1000→1200) ⇒ `990–1200`, **210 min**.
 */
export function snapToGrid(startMin: number, endMin: number): GridBlock {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    throw new Error(
      `snapToGrid expects finite minute bounds, got (${startMin}, ${endMin})`,
    );
  }
  const start = floorToGrid(startMin);
  const end = Math.max(ceilToGrid(endMin), start + GRID_MINUTES);
  return { startMin: start, endMin: end, durationMinutes: end - start };
}

/**
 * {@link snapToGrid} over absolute instants, for the LMS parser (Moodle hands
 * us epoch seconds, not wall-clock minutes).
 *
 * Snapping in *epoch* minutes lands on the same boundaries as snapping in
 * local wall-clock minutes because every IANA zone in use offsets UTC by a
 * whole number of quarter-hours — Vietnam's `Asia/Ho_Chi_Minh` is a flat
 * UTC+07:00 with no DST — so a UTC quarter-hour is a local quarter-hour.
 * That keeps the LMS path free of any timezone reasoning at all.
 */
export function snapInstantsToGrid(
  start: Date,
  end: Date,
): { scheduledStartTime: Date; durationMinutes: number } {
  const block = snapToGrid(
    Math.floor(start.getTime() / MS_PER_MINUTE),
    Math.ceil(end.getTime() / MS_PER_MINUTE),
  );
  return {
    scheduledStartTime: new Date(block.startMin * MS_PER_MINUTE),
    durationMinutes: block.durationMinutes,
  };
}
