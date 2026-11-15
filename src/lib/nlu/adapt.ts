import type { Action, Fixed, Kind } from "../types";
import { kindOf as kindOfTitle } from "./kind";
import { read, readBest } from "./reader/reader";
import { t, type Key } from "../i18n";
import type { ReadOpts } from "./reader/reader";
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
// Where a said part of the day ends (the reader's own bounds in reader/parts.ts); a task of that part stays inside it.
/** Where a part of the day opens for the planner, as people say the hours: 1-10 giờ sáng, 11-12 giờ trưa, 1-5 giờ chiều, 6-9 giờ tối, 10-12 giờ đêm. */
const FROM: Record<ReaderWindow, string> = {
  EARLY_MORNING: "05:00", DAWN: "04:00", MORNING: "05:00", NOON: "11:00",
  AFTERNOON: "13:00", EVENING: "18:00", NIGHT: "18:00", MIDNIGHT: "22:00",
};
const END: Record<ReaderWindow, string> = {
  EARLY_MORNING: "08:00", DAWN: "08:00", MORNING: "11:00", NOON: "13:00",
  AFTERNOON: "18:00", EVENING: "22:00", NIGHT: "22:00", MIDNIGHT: "23:59",
};
const KIND: Partial<Record<ReaderItemType, Kind>> = { EXAM: "study", ASSIGNMENT: "study", LECTURE: "study" };
/** The kind of a task from its type, else from the words of its title. */
export const kindOf = (type: ReaderItemType, title: string): Kind | undefined => KIND[type] ?? kindOfTitle(title);
const FIXED: Partial<Record<ReaderItemType, Fixed>> = { EXAM: "exam", LECTURE: "lecture", BUSY: "busy" };
const mins = (c: string) => +c.slice(0, 2) * 60 + +c.slice(3);

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
  // The reader gives an exact start as BUSY/EXAM/LECTURE with `startsAt`; a lone day plus one clock is the same thing said another way.
  const c = it.clocks?.length === 1 && it.days?.length === 1 && !it.windows?.length && it.type !== "ASSIGNMENT" ? it.clocks[0] : undefined;
  const fixed = FIXED[it.type] ?? (it.startsAt || c ? "busy" : undefined);
  // One day (the reader sets notBefore..deadline to that day, or to a part of it): flexible, kept inside the window.
  const one = it.notBefore && it.deadline?.slice(0, 10) === it.notBefore.slice(0, 10) && !fixed ? it.notBefore.slice(0, 10) : undefined;
  const day = it.days?.[0] ?? one;
  const w = it.windows?.[0] as ReaderWindow | undefined;
  // "mai từ 5h chiều": a said start of the day's window opens it, where the default would plan the morning
  const from = one && it.notBefore!.slice(11, 16) !== "00:00" ? it.notBefore!.slice(11, 16) : undefined;
  const at = it.startsAt ? iso(it.startsAt) : day && `${day}T${it.clocks?.[0]?.from ?? (w && START[w]) ?? from ?? "09:00"}:00`;
  if (at) a.when = at;
  if (fixed && at) a.fixed = fixed;
  // "sáng hoặc tối mai": the day's window runs to the last part's end; `tods` keeps the task inside one of the parts
  const last = it.windows?.at(-1) as ReaderWindow | undefined;
  if (!(fixed && at) && day && !it.clocks?.length) a.notAfter = `${day}T${(last && END[last]) ?? "23:59"}:00`;
  // That same-day pair is the said window, not a due time: as a deadline it would make the plan an assignment ("Hạn 22:00").
  // A repeat keeps its start ("mỗi sáng" from today) but its window is no deadline either ("Hạn 12:00").
  const win = !!one && !!a.notAfter;
  if (it.deadline && !win) a.deadline = iso(it.deadline);
  // A guessed size uses coursework norms ("demo" is 6 h); spoken, unsized, it is one sitting of at most 2 h. Said minutes stand.
  if (it.durationMinutes) a.effortMinutes = it.inferred?.includes("durationMinutes") ? Math.min(it.durationMinutes, GUESS_CAP) : it.durationMinutes;
  if (a.fixed && c && (!it.durationMinutes || it.inferred?.includes("durationMinutes")) && mins(c.to) > mins(c.from)) a.effortMinutes = mins(c.to) - mins(c.from);
  if (it.rrule) a.repeat = it.rrule;
  if (it.notBefore && (!win || it.rrule)) a.notBefore = iso(it.notBefore);
  if (it.location) a.location = it.location;
  // the task note is plain text: the reader's paragraphs become lines
  const note = it.note?.replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
  if (note) a.note = note;
  if (it.days?.length) a.days = it.days;
  if (it.clocks?.length) a.clocks = it.clocks;
  if (it.windows?.length) a.windows = it.windows;
  if (!a.fixed && !it.clocks?.length && it.windows?.length)
    a.tods = (it.windows as ReaderWindow[]).filter((x) => FROM[x]).map((x): [number, number] => [mins(FROM[x]), mins(END[x])]);
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

/**
 * What to light up on a scanned photo or PDF page (capture.html .shot mark): the reader's mentions plus each item's title and place where
 * the text says them. A title the reader built ("Thi Xác suất", "Nộp … qua LMS") lights its longest run of two or more words in the text.
 * A place lights wherever it stands as a word of its own: a link is no mention (the reader masks links so their digits are never a date),
 * and a room read from a table column has no cue word.
 */
export function marksOf(text: string, r: ReaderResult): { start: number; end: number }[] {
  const low = text.toLowerCase(), out: { start: number; end: number }[] = r.mentions.map(({ start, end }) => ({ start, end }));
  for (const it of r.items) {
    const words = it.title.toLowerCase().replace(/[:,.;]/g, " ").split(/\s+/).filter(Boolean);
    let best: { start: number; end: number } | undefined;
    for (let a = 0; a < words.length; a++) for (let b = words.length; b - a >= Math.min(2, words.length) && (!best || best.end - best.start < words.slice(a, b).join(" ").length); b--) {
      const q = words.slice(a, b).join(" "), at = low.indexOf(q);
      if (at >= 0) { best = { start: at, end: at + q.length }; break; }
    }
    if (best) out.push(best);
  }
  const edge = (i: number) => i < 0 || i >= low.length || !/[\p{L}\d]/u.test(low[i]);
  for (const loc of new Set(r.items.map((it) => it.location?.toLowerCase()).filter((x): x is string => !!x)))
    for (let at = low.indexOf(loc); at >= 0; at = low.indexOf(loc, at + loc.length))
      if (edge(at - 1) && edge(at + loc.length)) out.push({ start: at, end: at + loc.length });
  return out.sort((a, b) => a.start - b.start);
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
