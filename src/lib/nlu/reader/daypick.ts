// Timetable day picks: "hôm có tiết sáng" picks the student's own class and exam days. Pure.
import type {
  Clock,
  ReaderDayPick,
  ReaderDayPickDay,
  ReaderDayPickTime,
  ReaderItem,
} from "../shared";
import { hashText } from "./assemble";
import { fold } from "./fold";
import { afterCorrection, CORRECTION, findMentions } from "./mentions";
import { hasTaskWord } from "./order";
import type { Clause } from "./segment";

const isFlexible = (it: ReaderItem) =>
  it.type === "PLAN" || it.type === "ASSIGNMENT";

/** One local day of the window: its classes and exams, in minutes of the day. */
export interface CalDay {
  /** Local `YYYY-MM-DD`. */
  date: string;
  classes: { title: string; start: number; end: number }[];
  exams: { title: string; start: number }[];
}

type Part = "morning" | "afternoon" | "evening";
const PART_RANGE: Record<Part, [number, number]> = {
  morning: [0, 720],
  afternoon: [720, 1080],
  evening: [1080, 1440],
};

const EXAM_EVE =
  /\b(truoc (moi |tung )?ngay thi|truoc moi ky thi|(day )?before (each |every )?exam)\b/;
const EXAM = /\b(ngay thi|hom thi|exam days?)\b/;
const LIGHT = /\b(it tiet nhat|lightest)\b/;
const BUSY = /\b(nhieu tiet nhat|busiest)\b/;
const PART_CUE: [RegExp, Part][] = [
  // a bare part ("sáng/chiều/tối", "buổi chiều") is a time of day, not a class
  [/\bmorning\b|\b(tiet|lop|hoc) sang\b|\bsang co\b/, "morning"],
  [
    /\bafternoon\b|\b(tiet|lop|hoc) chieu\b|\bchieu co\b|\b(tiet|lop)\b.*\bchieu\b/,
    "afternoon",
  ],
  [/\bevening\b|\b(tiet|lop|hoc) toi\b/, "evening"],
];
const BARE_PART: [RegExp, Part][] = [
  [/\bsang\b/, "morning"],
  [/\bchieu\b/, "afternoon"],
  [/\btoi\b/, "evening"],
];
const NOT = /\b(khong|without|not|ko)\b/;
const COURSE_CUE =
  /\b(days? with|days? of|hom hoc|ngay hoc|ngay co mon|hom co mon|hom co|ngay co)\b/;
const FREE =
  /\b(ngay nghi|days? off|free days?|ngay ranh|days? without class(es)?|hom khong co tiet|ngay khong co tiet)\b/;
const CLASS =
  /\b(days? i have class(es)?|days? with class(es)?|class days?|hom di hoc|ngay di hoc|ngay co lich hoc|hom co lich hoc|ngay co tiet|hom co tiet|ngay co lop|hom co lop)\b/;
const AFTER = /\b(after|sau)\b/;
const AFTER_CLASS =
  /\b(after class(es)?|sau gio hoc|tan hoc|sau tiet hoc|sau khi hoc)\b/;
const BEFORE_CLASS =
  /\b(before class(es)?|truoc gio hoc|truoc tiet hoc|truoc khi hoc)\b/;
const BETWEEN =
  /\b(between (classes|lessons)|giua cac tiet|giua tiet|gio trong giua|giua gio hoc)\b/;
const WEEK = /\b(this week|tuan nay)\b/;
/** Every matching day gets its own item: "mỗi", "các", "every", or a plural "days". */
const RECUR =
  /\b(every|each|moi (ngay|hom|buoi|tuan)|cac (ngay|hom|buoi)|hang tuan|days)\b/;
/** Words that name the person or the task, never a course. */
const STOP = new Set([
  "hom",
  "ngay",
  "co",
  "hoc",
  "mon",
  "lich",
  "tiet",
  "di",
  "lop",
  "va",
  "cac",
  "khong",
  "the",
  "days",
  "day",
  "with",
  "have",
  "class",
  "classes",
  "of",
  "and",
  "sau",
  "truoc",
  "moi",
  "lam",
  "bai",
  "tap",
  "chay",
  "bo",
  "roi",
  "xong",
  "thi",
  "toi",
  "sang",
  "chieu",
  "buoi",
  "nhat",
  "nhieu",
  "it",
  "after",
  "before",
  "khi",
  "gio",
  "tuan",
  "nay",
  "next",
]);

/** The day predicate and the time of one timetable phrase. */
interface Sel {
  day: ReaderDayPickDay;
  not?: boolean;
  course?: string;
}

/** The picked days and their own time stamps; `perDay` gives each day its own item. */
export interface DayPickPlan {
  meta: ReaderDayPick;
  stamps: { date: string; notBefore?: string; clocks?: Clock[] }[];
  perDay: boolean;
}

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** `date` shifted by `n` days, `YYYY-MM-DD`. */
function shift(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const load = (d: CalDay) => d.classes.reduce((s, c) => s + c.end - c.start, 0);

function partOf(f: string): Part | undefined {
  return PART_CUE.find(([re]) => re.test(f))?.[1];
}

/** The distinct class titles of the window, in calendar order. */
function titlesOf(cal: CalDay[]): string[] {
  return [...new Set(cal.flatMap((d) => d.classes.map((c) => c.title)))];
}

/** The first class title that one of the clause's words names: a word of the title, or its initials. */
function courseOf(f: string, cal: CalDay[]): string | undefined {
  const toks = new Set(
    f.split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w)),
  );
  return titlesOf(cal).find((title) => {
    const words = fold(title)
      .text.split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 2);
    const initials = words.map((w) => w[0]).join("");
    return words.some((w) => toks.has(w)) || toks.has(initials);
  });
}

function selectorOf(f: string, cal: CalDay[]): Sel | undefined {
  if (EXAM_EVE.test(f)) return { day: "exam_eve" };
  if (EXAM.test(f)) return { day: "exam" };
  if (LIGHT.test(f)) return { day: "lightest" };
  if (BUSY.test(f)) return { day: "busiest" };
  const part = partOf(f);
  if (part) return { day: part, not: NOT.test(f) || undefined };
  if (COURSE_CUE.test(f)) {
    const course = courseOf(f, cal);
    if (course) return { day: "course", course, not: NOT.test(f) || undefined };
  }
  if (FREE.test(f)) return { day: "free" };
  if (CLASS.test(f)) return { day: "class" };
  return undefined;
}

/** Whether the day satisfies the selector before any `not`. */
function holdsOf(sel: Sel, cal: CalDay[]): (d: CalDay) => boolean {
  const { day } = sel;
  if (day === "class") return (d) => d.classes.length > 0;
  if (day === "free") return (d) => d.classes.length === 0;
  if (day === "exam") return (d) => d.exams.length > 0;
  if (day === "course")
    return (d) => d.classes.some((c) => c.title === sel.course);
  if (day === "exam_eve") {
    const exams = new Set(cal.filter((d) => d.exams.length).map((d) => d.date));
    return (d) => exams.has(shift(d.date, 1));
  }
  if (day === "lightest" || day === "busiest") {
    const loads = cal.filter((d) => d.classes.length).map(load);
    const target = day === "lightest" ? Math.min(...loads) : Math.max(...loads);
    return (d) => d.classes.length > 0 && load(d) === target;
  }
  const [lo, hi] = PART_RANGE[day];
  return (d) => d.classes.some((c) => c.start >= lo && c.start < hi);
}

/** The time phrase: the course it names, and which time it sets. */
function timeOf(
  f: string,
  cal: CalDay[],
  selCourse?: string,
): { time?: ReaderDayPickTime; course?: string } {
  const course = AFTER.test(f) ? courseOf(f, cal) : undefined;
  if (course && course !== selCourse) return { time: "after_course", course };
  if (AFTER_CLASS.test(f)) return { time: "after_class" };
  if (BEFORE_CLASS.test(f)) return { time: "before_class" };
  if (BETWEEN.test(f)) return { time: "between" };
  return {};
}

/** The time on one day, or undefined when the day has no such time. */
function stampOf(
  d: CalDay,
  time: ReaderDayPickTime,
  course?: string,
): Pick<DayPickPlan["stamps"][number], "notBefore" | "clocks"> | undefined {
  const classes = d.classes.slice().sort((a, b) => a.start - b.start);
  if (time === "after_class" || time === "after_course") {
    const ends = classes
      .filter((c) => time === "after_class" || c.title === course)
      .map((c) => c.end);
    const end = Math.max(-1, ...ends);
    return end < 0 || end >= 1440
      ? undefined
      : { notBefore: `${d.date} ${hhmm(end)}` };
  }
  if (time === "before_class") {
    const first = classes[0]?.start ?? 0;
    return first < 30
      ? undefined
      : { clocks: [{ from: "00:00", to: hhmm(first) }] };
  }
  // shortcut: gaps shorter than 30 min are dropped, the placer grid is 30 min
  const clocks: Clock[] = [];
  for (let i = 1; i < classes.length; i++) {
    const from = classes[i - 1].end;
    const to = classes[i].start;
    if (to - from >= 30) clocks.push({ from: hhmm(from), to: hhmm(to) });
  }
  return clocks.length ? { clocks } : undefined;
}

/**
 * The timetable phrase of a clause: the picked days and their time, or undefined when no day matches.
 * `cal` starts at today and is in date order.
 */
export function dayPickOf(
  text: string,
  all: CalDay[],
  from?: string,
): DayPickPlan | undefined {
  // the window: days from `from` on, so a later item start drops the days before it
  const cal = from ? all.filter((d) => d.date >= from) : all;
  if (!cal.length) return undefined;
  const f = fold(text).text;
  // a correction names the new part of day: "có tiết sáng, à không chiều" picks the afternoon
  const tail = afterCorrection(f);
  const cue = tail !== f;
  const whole = selectorOf(f, cal);
  // a bare part after the cue swaps the part of a class pick
  const bare =
    cue && whole && whole.day in PART_RANGE
      ? BARE_PART.find(([re]) => re.test(tail))?.[1]
      : undefined;
  const sel =
    (bare ? { day: bare } : undefined) ??
    (cue ? selectorOf(tail, cal) : undefined) ??
    whole;
  if (!sel) return undefined;
  const holds = holdsOf(sel, cal);
  const fixed = cue ? timeOf(tail, cal, sel.course) : {};
  const { time, course: timeCourse } = fixed.time
    ? fixed
    : timeOf(f, cal, sel.course);
  const course = timeCourse ?? sel.course;
  const stamps: DayPickPlan["stamps"] = [];
  for (const d of cal) {
    if (holds(d) === !!sel.not) continue;
    if (!time) {
      stamps.push({ date: d.date });
      continue;
    }
    const s = stampOf(d, time, course);
    if (s) stamps.push({ date: d.date, ...s });
  }
  if (!stamps.length) return undefined;

  const week = WEEK.test(f)
    ? shift(
        cal[0].date,
        (7 - new Date(`${cal[0].date}T00:00:00Z`).getUTCDay()) % 7,
      )
    : undefined;
  const recur = RECUR.test(f);
  const scope = week
    ? stamps.filter((s) => s.date <= week)
    : recur
      ? stamps
      : stamps.slice(0, 1);
  const meta: ReaderDayPick = { day: sel.day, count: stamps.length };
  if (sel.not) meta.not = true;
  if (course) meta.course = course;
  if (time) meta.time = time;
  // shortcut: a recurring pick is one item per date, not one RRULE, upgrade when PLAN rows take a BYDAY set
  return { meta, stamps: scope, perDay: recur || !!time };
}

/** The timetable words of a phrase, folded: they are cues, never the title. */
const PICK_WORDS = new RegExp(
  [
    EXAM_EVE,
    EXAM,
    LIGHT,
    BUSY,
    ...PART_CUE.map(([re]) => re),
    COURSE_CUE,
    FREE,
    CLASS,
    AFTER_CLASS,
    BEFORE_CLASS,
    BETWEEN,
    WEEK,
    RECUR,
    // "có" before a class word is part of the phrase: "có tiết", "có lịch học"
    /\bco (?=(?:tiet|lop|lich hoc|mon|hoc)\b)/,
  ]
    .map((re) => `(?:${re.source})`)
    .join("|"),
  "g",
);

/** A start phrase: a title drops it, and the reader keeps it as the item's notBefore. */
const START_WORDS = /\b(?:tu|from) (?:tuan|thang) sau\b|\b(?:tuan|thang) sau\b/;

/** Raw spans of the timetable words in `text`, the phrase the day pick reads. */
export function pickSpans(
  text: string,
  re: RegExp = PICK_WORDS,
): [number, number][] {
  const f = fold(text);
  return [...f.text.matchAll(re)].map((m) => [
    f.map[m.index ?? 0],
    f.map[(m.index ?? 0) + m[0].length - 1] + 1,
  ]);
}

/** Whether a clause names a timetable phrase at all, with or without a calendar. */
export const isPickPhrase = (text: string) =>
  selectorOf(fold(text).text, []) !== undefined;

/** The title without its timetable words: "hôm có tiết sáng thì chạy bộ" is "chạy bộ". */
export function withoutPickWords(title: string): string {
  const spans = pickSpans(
    title,
    new RegExp(
      `${PICK_WORDS.source}|${START_WORDS.source}|(?:${CORRECTION.source})(?:\\s*(?:sang|chieu|toi)\\b)?`,
      "g",
    ),
  );
  if (!spans.length) return title;
  let out = "";
  let at = 0;
  for (const [s, e] of spans) {
    out += title.slice(at, s);
    at = e;
  }
  out = (out + title.slice(at))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;])/g, "$1")
    .replace(/^[\s,;]+|[\s,;]+$/g, "");
  // a joining word left at the start: "thì", "và"
  if (/^(thi|va)\s/i.test(fold(out).text)) out = out.replace(/^\S+\s+/, "");
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : title;
}

const FROM_START = /^(tu|from)\b/;
/**
 * Joins the clauses that only set a timetable or start phrase ("từ tuần sau", "mỗi ngày có tiết sáng")
 * to the task clause beside them, so the phrase applies to that task. Clauses of one section only.
 */
export function joinFragments(
  clauses: Clause[],
  cal: CalDay[] | undefined,
): Clause[] {
  const isFragment = (c: Clause) => {
    if (c.label || c.hint || hasTaskWord(c.text)) return false;
    if (cal?.length && dayPickOf(c.text, cal)) return true;
    return (
      FROM_START.test(fold(c.text).text.trim()) &&
      findMentions(c.text).some((m) => m.kind === "date" || m.kind === "time")
    );
  };
  const out: Clause[] = [];
  let pending: Clause | undefined;
  for (const c of clauses) {
    if (isFragment(c) && (!pending || pending.section === c.section)) {
      pending = pending ? { ...pending, text: `${pending.text} ${c.text}` } : c;
      continue;
    }
    const target = pending && pending.section === c.section ? c : undefined;
    if (pending && target && hasTaskWord(c.text)) {
      out.push({
        ...c,
        text: `${pending.text} ${c.text}`,
        start: pending.start,
      });
    } else {
      if (pending) out.push(pending);
      out.push(c);
    }
    pending = undefined;
  }
  if (pending) {
    const last = out.at(-1);
    if (
      last &&
      last.section === pending.section &&
      !last.label &&
      hasTaskWord(last.text)
    )
      out[out.length - 1] = { ...last, text: `${last.text} ${pending.text}` };
    else out.push(pending);
  }
  return out;
}

/**
 * Items of one clause with the timetable phrase applied: flexible items get the picked days, time and
 * `daypick`; fixed items and items with their own days pass through unchanged.
 */
/**
 * The clause text with its timetable words blanked to spaces, so the mention rules do not read "hôm" as today
 * and lose "từ tuần sau" beside it. Only a phrase the calendar answers is blanked: otherwise it is text.
 */
export function hidePick(text: string, cal: CalDay[] | undefined): string {
  if (!cal?.length || !dayPickOf(text, cal)) return text;
  let out = text;
  for (const [s, e] of pickSpans(text))
    out = out.slice(0, s) + " ".repeat(e - s) + out.slice(e);
  return out;
}

export function applyDayPick(
  text: string,
  items0: ReaderItem[],
  cal: CalDay[] | undefined,
): ReaderItem[] {
  const pick = !!cal?.length && !!dayPickOf(text, cal);
  const items = pick
    ? items0.map((it) => ({ ...it, title: withoutPickWords(it.title) }))
    : items0;
  if (!cal?.length) return items;
  const eligible = items.filter((it) => isFlexible(it) && !it.days?.length);
  return items.flatMap((it) => {
    if (!eligible.includes(it)) return [it];
    // the search starts at today or the item's notBefore day, whichever is later
    const from = it.notBefore?.slice(0, 10);
    const plan = dayPickOf(
      text,
      cal,
      from && from > cal[0].date ? from : undefined,
    );
    if (!plan) return [it];
    const { meta, stamps, perDay } = plan;
    const title = withoutPickWords(it.title);
    if (!perDay)
      return [{ ...it, title, days: stamps.map((s) => s.date), daypick: meta }];
    // one plan per item, keyed like the reader's series: the clause hash, plus the item index when several
    const key = `series${hashText(text)}${eligible.length > 1 ? `-${eligible.indexOf(it)}` : ""}`;
    return stamps.map((s) => ({
      ...it,
      title,
      days: [s.date],
      daypick: meta,
      planKey: it.planKey ?? key,
      ...(s.notBefore && it.notBefore === undefined
        ? { notBefore: s.notBefore }
        : {}),
      ...(s.clocks && !it.clocks ? { clocks: s.clocks } : {}),
    }));
  });
}
