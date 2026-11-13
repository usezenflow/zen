// A series: one task written as several instances, by parts of the day joined with AND and by days joined with AND. Pure.
import { MAX_SESSION_DAYS } from "../shared";
import { fold } from "./fold";
import { findMentions, type Found } from "./mentions";
import { partRuns } from "./parts";

/** Joins between two days that read as AND: a comma, "và", "cùng", "&", "+", or a bare space. */
const DAY_AND = /^(?:\s*,\s*|\s+(?:va|cung|voi|and)\s+|\s*(?:&|\+)\s*|\s+)$/;
/** A repeat cue: the rule of the piece, not a series. */
const REPEAT_CUE = /\b(moi|hang tuan|hang thang|hang ngay|every|hang nam)\b/;

/** Two day mentions of one kind: weekdays, written dates or relative days. */
const sameKind = (a: Found, b: Found) => a.v.k === b.v.k;

/** The raw text with [fs, fe) of the folded text replaced by `word`. */
function replaceFolded(
  raw: string,
  map: number[],
  fs: number,
  fe: number,
  word: string,
): string {
  const rs = map[fs] ?? 0;
  const re = (map[fe - 1] ?? raw.length - 1) + 1;
  return raw.slice(0, rs) + word + raw.slice(re);
}

/** Instances of the first AND run of parts, each with one part word. */
function partInstances(raw: string): string[] | undefined {
  const f = fold(raw);
  const run = partRuns(f.text).find((r) => r.and);
  if (!run) return undefined;
  return run.tokens.flatMap((t) => {
    const word = raw.slice(f.map[t.start], (f.map[t.end - 1] ?? 0) + 1);
    const rest = replaceFolded(raw, f.map, run.start, run.end, word);
    return partInstances(rest) ?? [rest];
  });
}

/** The weekday word of a BYDAY index (0 = Sunday), as the reader reads it: "thứ 4", "chủ nhật". */
const weekdayWord = (d: number) => (d === 0 ? "chu nhat" : `thu ${d + 1}`);

/** Each day a date mention names, as text for one instance: "t2, t4, t6" and "thứ 2 4 6" name three days. */
function dayTexts(raw: string, m: Found): string[] {
  if (m.v.k === "dow" && m.v.more?.length)
    return [m.v.dow, ...m.v.more].map(weekdayWord);
  return [raw.slice(m.start, m.end)];
}

/** Instances of the first run of day mentions joined by AND. Undefined when there is none. */
function dayInstances(raw: string): string[] | undefined {
  const days = findMentions(raw)
    .filter(
      (m) =>
        m.kind === "date" &&
        (m.v.k === "dow" || m.v.k === "date" || m.v.k === "rel"),
    )
    .sort((a, b) => a.start - b.start);
  let group: Found[] = [];
  const groups: Found[][] = [];
  for (const m of days) {
    const prev = group.at(-1);
    const gap = prev ? fold(raw.slice(prev.end, m.start)).text : "";
    // a weekday beside a written date names that date, it is no list
    if (prev && DAY_AND.test(gap) && sameKind(prev, m)) group.push(m);
    else {
      if (group.length) groups.push(group);
      group = [m];
    }
  }
  if (group.length) groups.push(group);
  const g = groups.find(
    (x) =>
      x.length >= 1 &&
      (x.length >= 2 || (x[0].v.k === "dow" && !!x[0].v.more?.length)),
  );
  if (!g) return undefined;
  const first = g[0].start;
  const last = g.at(-1)?.end ?? first;
  const list = g.flatMap((m) => dayTexts(raw, m));
  return list.flatMap((d) => {
    const rest = raw.slice(0, first) + d + raw.slice(last);
    return dayInstances(rest) ?? [rest];
  });
}

/**
 * The instance texts of a series, or undefined when the text is no series. Parts joined by AND always split;
 * days joined by AND split only when `daysSeries` (a flexible task with no repeat cue).
 */
export function seriesTexts(
  raw: string,
  daysSeries: boolean,
): string[] | undefined {
  const parts = partInstances(raw);
  if (parts) {
    const out = parts.flatMap((t) => {
      const more = daysSeries ? seriesTexts(t, true) : undefined;
      return more ?? [t];
    });
    return out.slice(0, MAX_SESSION_DAYS);
  }
  if (!daysSeries || REPEAT_CUE.test(fold(raw).text)) return undefined;
  return dayInstances(raw)?.slice(0, MAX_SESSION_DAYS);
}
