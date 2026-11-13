// Clock ranges and part ranges as one `clocks` list; weekday pairs "thứ 2/4" as OR. Pure.
import { fold } from "./fold";
import { AND_GAP, OR_GAP, PART, PART_ALIAS, PART_ALT } from "./parts";

/** "9h-11h", "9h đến 11h", "9-11h", "19:00-21:00": a range with an h, g or colon on one side. */
const CLOCK_RANGE =
  /(?:(?<![\d/.])|(?<=h\/))(\d{1,2})(?:\s*(?:[:h]|gio|g)\s*(\d{2}))?\s*(?:h|g|gio)?\s*(?:-|den)\s*(\d{1,2})(?:\s*(?:[:h]|gio|g)\s*(\d{2}))?\s*(?:h|g|gio)?(?![\d.])(?!\/(?!\d{1,2}(?:\s*(?:h|g|gio|:)\s*\d{0,2})?\s*(?:-|den)))(?!\s*(?:tieng|phut|ngay|tuan|thang|nam|lan)(?![a-z]))/g;
/** Two part words joined by a dash, each with an optional day word: "sáng - tối", "sáng mai - tối mai". */
const PART_DASH = new RegExp(
  `(?<![a-z])(${PART_ALT})(?:\\s+(nay|mai|mot))?\\s*(?:-|den)\\s*(${PART_ALT})(?:\\s+(?:nay|mai|mot))?(?![a-z])`,
  "g",
);

export type Clock = { from: string; to: string };
const hm = (h: number, mi: number) =>
  `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;

/** The raw span of folded [s, e). */
function rawSpan(
  raw: string,
  map: number[],
  s: number,
  e: number,
): [number, number] {
  return [map[s] ?? 0, (map[e - 1] ?? raw.length - 1) + 1];
}

export type ClockRun =
  | { kind: "or"; clocks: Clock[]; rest: string }
  | { kind: "and"; clocks: Clock[]; texts: string[] }
  | { kind: "dash"; clocks: Clock[]; rest: string };

/**
 * A run of clock ranges joined by OR ("9h-11h hoặc 19h-21h") or AND ("9h-11h và 19h-21h"), or a part range
 * ("sáng - tối"). `rest` is the text without the run. Undefined when the text has none.
 */
export function clockRun(raw: string): ClockRun | undefined {
  const f = fold(raw);
  const ranges = [...f.text.matchAll(CLOCK_RANGE)].filter((m) =>
    /[hg:]/.test(m[0]),
  );
  if (ranges.length >= 2) {
    const gaps = ranges.slice(1).map((m, i) => {
      const prev = ranges[i];
      return f.text.slice((prev.index ?? 0) + prev[0].length, m.index ?? 0);
    });
    const clocks = ranges.map((m) => ({
      from: hm(+m[1], +(m[2] ?? 0)),
      to: hm(+m[3], +(m[4] ?? 0)),
    }));
    if (gaps.every((g) => OR_GAP.test(g))) {
      const [s] = rawSpan(
        raw,
        f.map,
        ranges[0].index ?? 0,
        (ranges[0].index ?? 0) + ranges[0][0].length,
      );
      const last = ranges.at(-1)!;
      const [, e] = rawSpan(
        raw,
        f.map,
        last.index ?? 0,
        (last.index ?? 0) + last[0].length,
      );
      return { kind: "or", clocks, rest: raw.slice(0, s) + raw.slice(e) };
    }
    if (gaps.every((g) => AND_GAP.test(g))) {
      const texts = ranges.map((m, k) => {
        const others = ranges.filter((_, j) => j !== k);
        let out = raw;
        // keep one range: drop the others from the end so the offsets of the earlier ones stay valid
        for (const o of [...others].reverse()) {
          const [s, e] = rawSpan(
            raw,
            f.map,
            o.index ?? 0,
            (o.index ?? 0) + o[0].length,
          );
          out = out.slice(0, s) + out.slice(e);
        }
        return out;
      });
      return { kind: "and", clocks, texts };
    }
    return undefined;
  }
  const part = [...f.text.matchAll(PART_DASH)][0];
  if (part) {
    const from = PART[PART_ALIAS[part[1]] ?? part[1]]?.start;
    const to = PART[PART_ALIAS[part[3]] ?? part[3]]?.due;
    if (!from || !to) return undefined;
    const at = part.index ?? 0;
    const [s, e] = rawSpan(raw, f.map, at, at + part[0].length);
    // a day word of the first part stays: "sáng mai - tối mai" is one range on mai
    const dayAt = part[2] ? at + part[0].indexOf(part[2], part[1].length) : -1;
    const day =
      dayAt >= 0
        ? rawSpan(raw, f.map, dayAt, dayAt + part[2].length)
        : undefined;
    return {
      kind: "dash",
      clocks: [{ from: hm(from[0], from[1]), to: hm(to[0], to[1]) }],
      rest:
        raw.slice(0, s) + (day ? raw.slice(day[0], day[1]) : "") + raw.slice(e),
    };
  }
  return undefined;
}

/** "thứ 2/4" and "th2 hoặc th4" read as the two weekdays, not as 2 April; "th2" is "t2". */
export function normalizeWeekdays(raw: string): string {
  return raw
    .replace(
      /\bth[ứu]\s*([2-7])\s*\/\s*(?:th[ứu]\s*)?([2-7])\b/giu,
      "thứ $1 hoặc thứ $2",
    )
    .replace(/\bth([2-7])\b/giu, "t$1");
}
