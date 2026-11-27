import type { Action, Fixed, Kind, Task } from "../types";
import { kindOf as kindOfTitle } from "./kind";
import { learnedKindOf, type NluLearned } from "./learn";
import { read, readBest } from "./reader/reader";
import { t, type Key } from "../i18n";
import { WINDOW_END, WINDOW_FROM } from "../parts";
import { day } from "../when";
import type { ReadOpts } from "./reader/reader";
import { anchorAction, anchorsOf } from "./reader/anchor";
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
const FROM = WINDOW_FROM, END = WINDOW_END;
const KIND: Partial<Record<ReaderItemType, Kind>> = { EXAM: "study", ASSIGNMENT: "study", LECTURE: "study" };
/** The kind of a task from its type, else from the words of its title. */
export const kindOf = (type: ReaderItemType, title: string): Kind | undefined => KIND[type] ?? kindOfTitle(title);
const FIXED: Partial<Record<ReaderItemType, Fixed>> = { EXAM: "exam", LECTURE: "lecture", BUSY: "busy" };
const mins = (c: string) => +c.slice(0, 2) * 60 + +c.slice(3);

/** An unsized guess longer than this is split into sittings of this size (maxSitting), never capped. */
const GUESS_SITTING = 90;

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
  // A flexible task's said part opens where the part does ("tối nay": 18:00, not 20:00), so three evening tasks have the whole evening.
  const at = it.startsAt ? iso(it.startsAt) : day && `${day}T${it.clocks?.[0]?.from ?? (w && (fixed ? START[w] : FROM[w])) ?? from ?? "09:00"}:00`;
  if (at) a.when = at;
  if (fixed && at) a.fixed = fixed;
  // "sáng hoặc tối mai": the day's window runs to the last part's end; `tods` keeps the task inside one of the parts
  const last = it.windows?.at(-1) as ReaderWindow | undefined;
  if (!(fixed && at) && day && !it.clocks?.length) a.notAfter = `${day}T${(last && END[last]) ?? "23:59"}:00`;
  // That same-day pair is the said window, not a due time: as a deadline it would make the plan an assignment ("Hạn 22:00").
  // A repeat keeps its start ("mỗi sáng" from today) but its window is no deadline either ("Hạn 12:00").
  const win = !!one && !!a.notAfter;
  if (it.deadline && !win) {
    a.deadline = iso(it.deadline);
    if (it.learnedDue) a.deadlineGuessed = true;
  }
  // Said minutes stand. A guessed one keeps its whole length; one with no class is split into sittings of at most GUESS_SITTING.
  if (it.durationMinutes) {
    const guessed = it.inferred?.includes("durationMinutes");
    a.effortMinutes = it.durationMinutes;
    if (guessed) a.effortGuessed = true;
    if (guessed && !it.sized) a.maxSitting = GUESS_SITTING;
    if (guessed && it.cls) { a.cls = it.cls; if (it.guessMin) a.guessMin = it.guessMin; }
  }
  if (it.sittingMinutes) a.maxSitting = it.sittingMinutes;
  if (it.anchor) a.anchor = it.anchor.at;
  if (a.fixed && c && (!it.durationMinutes || it.inferred?.includes("durationMinutes")) && mins(c.to) > mins(c.from)) a.effortMinutes = mins(c.to) - mins(c.from);
  if (it.rrule) a.repeat = it.rrule;
  if (it.notBefore && (!win || it.rrule)) a.notBefore = iso(it.notBefore);
  if (it.location) {
    a.location = it.location;
    if (it.inferred?.includes("location")) a.locationGuessed = true;
  }
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
export type ReadExtra = Partial<Pick<ReadOpts, "calendar" | "prior" | "affinity" | "rejected" | "hint" | "classMult" | "learned">> & { alternatives?: string[]; tasks?: Task[] };

/** The last few reader crashes (message only, never the user's text), for a bug report. */
export const readErrors: string[] = [];

/** The reader's full result for one utterance; empty when it finds nothing. Never throws; a crash is kept in `readErrors`. */
export function readFull(text: string, now: Date, source: ReaderSource = "typed", extra: ReadExtra = {}): ReaderResult {
  try {
    const { alternatives, tasks, ...o } = extra;
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
export function readActions(text: string, now: Date, source: ReaderSource = "typed", extra: ReadExtra = {}): Action[] {
  const full = readFull(text, now, source, extra);
  const items = full.items;
  const reps = full.repairs.map((r) => ({ was: text.slice(r.start, r.end), to: r.to }));
  const anchors = extra.tasks ? anchorsOf(text, items.map((it) => it.title), extra.tasks, now.getTime()) : new Map();
  return items.map((it, i) => {
    const base = itemAction(it);
    if (it.type === "PLAN" && extra.learned) {
      const lk = learnedKindOf(it.title, it.note, extra.learned, now.getTime());
      if (lk) base.kind = lk;
    }
    if (reps.length) base.repairs = reps;
    return anchors.has(i) ? anchorAction(base, anchors.get(i)) : base;
  });
}

const FLAGS = ["weekday_mismatch", "date_past", "menu"];

/** "23/11" from "YYYY-MM-DD…" or "YYYYMMDD", no padding. */
const dmOf = (s: string) => { const m = /^(\d{4})-?(\d\d)-?(\d\d)/.exec(s); return m ? `${+m[3]}/${+m[2]}` : s; };

/**
 * The capture toast's sub for the tasks a line made, when the sizer named them: one task before its exam ("Trước buổi thi 4/12");
 * several sharing a repeat's end ("đến 31/12"), a span ("23 - 29/11") or a due with their sittings ("4 buổi · Hạn T2 23/11").
 */
export function sizedSub(acts: Action[], now: number): string | undefined {
  // an anchor is an exam's date from the sizer, or an exam task's id from an anchored read (then its deadline is the day)
  if (acts.length === 1) return acts[0].anchor ? t("beforeExam", { d: dmOf(/^\d{4}-/.test(acts[0].anchor) ? acts[0].anchor : acts[0].deadline ?? "") }) : undefined;
  const until = acts.map((a) => /UNTIL=(\d{8})/.exec(a.repeat ?? "")?.[1]);
  if (until[0] && until.every((u) => u === until[0])) return t("untilDate", { d: dmOf(until[0]) });
  // a span: every task has a start and an end of its own and no repeat, and they are the same two days
  const from = acts.map((a) => (a.notBefore && a.deadline && !a.repeat ? a.notBefore.slice(0, 10) : undefined));
  const to = acts.map((a) => (a.notBefore && a.deadline && !a.repeat ? a.deadline.slice(0, 10) : undefined));
  if (from[0] && from.every((x) => x === from[0]) && to.every((x) => x === to[0])) {
    const same = from[0].slice(0, 7) === to[0]!.slice(0, 7);
    return `${same ? +from[0].slice(8) : dmOf(from[0])} - ${dmOf(to[0]!)}`;
  }
  const due = acts.map((a) => a.deadline);
  if (acts.every((a) => a.maxSitting) && due[0] && due.every((d) => d === due[0])) {
    const k = acts.reduce((n, a) => n + Math.ceil((a.effortMinutes ?? 0) / a.maxSitting!), 0);
    return [t("sittingCount", { n: k }), t("due", { time: day(new Date(due[0]).getTime(), now) })].join(" · ");
  }
  return undefined;
}

/**
 * What to tell the user about a read, beyond the tasks: a chip for the first guessed reading ("3 giờ" is 15:00 or 03:00)
 * that re-reads `text` with the other choice, and a sub line for the repairs, dropped clauses and flags.
 */
export function readNotes(text: string, r: ReaderResult): { sub?: string; alt?: { label: string; text: string } } {
  const ask = r.hints?.find((h) => h.kind === "ask" && h.options.length > 1);
  const o = ask?.options[1];
  const parts = [
    ...r.repairs.slice(0, 2).map((x) => t("repairTo", { quote: text.slice(x.start, x.end), to: x.to })),
    ...r.dropped.slice(0, 2).map((d) => t("dropNote", { quote: d.quote, why: t(`drop${d.reason[0].toUpperCase()}${d.reason.slice(1)}` as Key) })),
    ...[...new Set(r.items.flatMap((i) => i.flags))].filter((f) => FLAGS.includes(f)).map((f) => t(`flag${f[0].toUpperCase()}${f.slice(1)}` as Key)),
  ];
  return {
    sub: parts.join(" · ") || undefined,
    alt: ask && o ? { label: o.label, text: text.slice(0, ask.start) + o.to + text.slice(ask.end) } : undefined,
  };
}
