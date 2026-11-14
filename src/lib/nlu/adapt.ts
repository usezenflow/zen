import type { Action, Kind } from "../types";
import { read, readBest } from "./reader/reader";
import { t, type Key } from "../i18n";
import type { ReadOpts } from "./reader/reader";
import { fold } from "./reader/fold";
import type { ReaderItem, ReaderItemType, ReaderResult, ReaderSource, ReaderWC, ReaderWindow } from "./shared";

// App time is fixed UTC+7 (see dlu/parse/time.ts); the reader works in wall clock.
const wallClock = (now: Date): ReaderWC => {
  const t = new Date(now.getTime() + 7 * 3600_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
};

const iso = (s: string) => `${s.replace(" ", "T")}${s.length === 16 ? ":00" : ""}`;
const START: Record<ReaderWindow, string> = {
  EARLY_MORNING: "05:00", DAWN: "05:00", MORNING: "08:00", NOON: "11:30",
  AFTERNOON: "14:00", EVENING: "18:00", NIGHT: "20:00", MIDNIGHT: "23:00",
};
const KIND: Partial<Record<ReaderItemType, Kind>> = { EXAM: "study", ASSIGNMENT: "study", LECTURE: "study" };
// A free task is "study" only when the type says so; otherwise its words do. Folded keywords from the reader's ACTIVITIES and the standing-rule KINDS.
const WORD_KIND: [RegExp, Kind][] = [
  [/\b(gym|chay bo|boi|da bong|yoga|the duc|tap the|workout|cardio|dap xe|cau long)\b/, "exercise"],
  [/\b(viec nha|don nha|giat do|giat|nau an|nau com|di cho|rua bat|clean|laundry)\b/, "chores"],
  [/\b(cafe|ca phe|cf|coffee|hen|gap|di choi|goi dien|call)\b/, "social"],
];
/** The kind of a task from its type, else from the words of its title. */
export const kindOf = (type: ReaderItemType, title: string): Kind | undefined => {
  if (KIND[type]) return KIND[type];
  const f = fold(title).text;
  return WORD_KIND.find(([re]) => re.test(f))?.[1];
};

const GUESS_CAP = 120;

// "mỗi/hằng/hàng" + unit anywhere, or a bare "mỗi/hằng" left at an edge ("hàng" alone is a word: "mua hàng").
const UNIT = "ngày|tuần|tháng|năm|sáng|trưa|chiều|tối|đêm|khuya";
const RECUR_LEFT = new RegExp(`(?<![\\p{L}])(?:mỗi|hằng|hàng)\\s+(?:${UNIT})(?![\\p{L}])|^(?:mỗi|hằng)(?![\\p{L}])|(?<![\\p{L}])(?:mỗi|hằng)$`, "giu");
/** The title without the repeat words the reader left in; the repeat lives in the rrule. Never empties a title. */
export const cleanTitle = (title: string) => {
  const v = title.replace(RECUR_LEFT, " ").replace(/\s+/g, " ").trim();
  return !v || v === title ? title : v[0].toLocaleUpperCase("vi") + v.slice(1); // recapitalize only what was cut
};

export function itemAction(it: ReaderItem): Action {
  const a: Action = { op: "create", title: cleanTitle(it.title) };
  const kind = kindOf(it.type, it.title);
  if (kind) a.kind = kind;
  // Fixed items carry a start; flexible ones may carry a day plus a clock or part of day.
  const day = it.days?.[0];
  const at = it.startsAt ? iso(it.startsAt) : day && `${day}T${it.clocks?.[0]?.from ?? START[it.windows?.[0] as ReaderWindow] ?? "09:00"}:00`;
  if (at) a.when = at;
  if (it.deadline) a.deadline = iso(it.deadline);
  // A guessed size uses coursework norms ("demo" is 6 h); spoken, unsized, it is one sitting of at most 2 h. Said minutes stand.
  if (it.durationMinutes) a.effortMinutes = it.inferred?.includes("durationMinutes") ? Math.min(it.durationMinutes, GUESS_CAP) : it.durationMinutes;
  if (it.rrule) a.repeat = it.rrule;
  if (it.notBefore) a.notBefore = iso(it.notBefore);
  if (it.location) a.location = it.location;
  if (it.days?.length) a.days = it.days;
  if (it.clocks?.length) a.clocks = it.clocks;
  if (it.windows?.length) a.windows = it.windows;
  if (it.ref) a.ref = it.ref;
  if (it.after) a.after = it.after;
  if (it.flags.length) a.flags = it.flags;
  if (it.alternatives.length) a.alternatives = it.alternatives;
  a.confidence = it.confidence;
  a.checked = it.checked;
  return a;
}

/** What the app knows that the reader cannot: the user's timetable, habits per title, marks, and typos they refused. */
/** `alternatives` are other transcripts of the same voice take; the best-read one wins. */
export type ReadExtra = Partial<Pick<ReadOpts, "calendar" | "prior" | "affinity" | "rejected" | "hint">> & { alternatives?: string[] };

/** The last few reader crashes (message only, never the user's text), for a bug report. */
export const readErrors: string[] = [];

/** The reader's full result for one utterance; empty when it finds nothing. Never throws; a crash is kept in `readErrors`. */
export function readFull(text: string, now: Date, source: ReaderSource = "typed", extra: ReadExtra = {}): ReaderResult {
  try {
    const { alternatives, ...o } = extra;
    const opts = { ref: wallClock(now), source, ...o };
    return alternatives?.length ? readBest([text, ...alternatives], opts) : read(text, opts);
  } catch (e) {
    readErrors.push(e instanceof Error ? e.message : String(e));
    if (readErrors.length > 20) readErrors.shift();
    return { items: [], dropped: [], mentions: [], repairs: [] };
  }
}

/** Rule-based reading of one utterance; empty when the reader finds nothing. Never throws. */
export const readActions = (text: string, now: Date, source: ReaderSource = "typed", extra: ReadExtra = {}): Action[] =>
  readFull(text, now, source, extra).items.map(itemAction);

const FLAGS = ["weekday_mismatch", "date_past", "menu"];

/**
 * What to tell the user about a read, beyond the tasks: a chip for the first guessed reading ("3 giờ" is 15:00 or 03:00)
 * that re-reads `text` with the other choice, and a sub line for the repairs, dropped clauses and flags.
 */
export function readNotes(text: string, r: ReaderResult): { sub?: string; alt?: { label: string; text: string } } {
  const ask = r.hints?.find((h) => h.kind === "ask" && h.options.length > 1);
  const o = ask?.options[1];
  const parts = [
    ...r.repairs.slice(0, 2).map((x) => `“${text.slice(x.start, x.end)}” → ${x.to}`),
    ...r.dropped.slice(0, 2).map((d) => t("dropNote", { quote: d.quote, why: t(`drop${d.reason[0].toUpperCase()}${d.reason.slice(1)}` as Key) })),
    ...[...new Set(r.items.flatMap((i) => i.flags))].filter((f) => FLAGS.includes(f)).map((f) => t(`flag${f[0].toUpperCase()}${f.slice(1)}` as Key)),
  ];
  return {
    sub: parts.join(" · ") || undefined,
    alt: ask && o ? { label: o.label, text: text.slice(0, ask.start) + o.to + text.slice(ask.end) } : undefined,
  };
}
