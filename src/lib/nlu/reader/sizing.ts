// Sizes the reader's items by their class (size.ts): the length, sittings, due and repeat the words did not say.
// A said length, clock, day or due always stays. Pure.
import type { ReaderItem, ReaderSource, ReaderWC } from "../shared";
import { frameOf } from "../frame";
import { sizeOf } from "../size";
import { affinityOf } from "./assemble";
import type { CalDay } from "./daypick";
import { fold } from "./fold";

const DAY = 86_400_000;
/** App time is fixed UTC+7 (see dlu/parse/time.ts). */
const VN = 7 * 3_600_000;
const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (ms: number) => new Date(ms + VN).toISOString().slice(0, 10);
/** Whole VN days since the epoch: a day is the same number at any hour. */
const dayNo = (ms: number) => Math.floor((ms + VN) / DAY);
/** A wall clock "YYYY-MM-DD HH:mm" in UTC+7, as epoch ms. */
const msOf = (s: string) => Date.parse(`${s.replace(" ", "T")}:00Z`) - VN;
const nowOf = (r: ReaderWC) => msOf(`${r.y}-${p2(r.m)}-${p2(r.d)} ${p2(r.h ?? 0)}:${p2(r.mi ?? 0)}`);

export interface SizeOpts {
  ref: ReaderWC;
  source: ReaderSource;
  calendar?: CalDay[];
  affinity?: Map<string, number>;
  /** Per frame class, the learned multiplier of its guesses (context.ts classMults). */
  classMult?: Record<string, number>;
}

/** Words an exam and a course title share no meaning in: "ôn thi giải tích" names "Giải tích". */
const STOP = new Set(["thi", "tap", "kiem", "tra", "hoc", "bai", "ngay", "mid", "final", "quiz", "giua", "cuoi"]);
const words = (s: string) => new Set(fold(s).text.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)));

/** The day of the first synced exam whose course the title names, else undefined. */
function examDay(title: string, cal: CalDay[] | undefined): string | undefined {
  const mine = words(title);
  for (const d of cal ?? []) for (const e of d.exams) for (const w of words(e.title)) if (mine.has(w)) return d.date;
  return undefined;
}

const said = (it: ReaderItem) => it.durationMinutes !== undefined && !it.inferred.includes("durationMinutes");
const mark = (it: ReaderItem, key: string) => {
  if (!it.inferred.includes(key)) it.inferred.push(key);
};

/** Words that make a due a deadline cue ("trước 15/11", "hạn 10h"): one task, not a span's end. */
const DEADLINE_CUE = /\b(?:truoc|han|cham nhat|deadline|trc)\b/;
/** Words that name the end of a range: "tới ngày 20/11", "đến 31/12", "hết tháng này", "trong năm nay". */
// "tuần tới", "tháng tới" mean next, not until
const RANGE_END = /(?<!\p{L})(?:(?<!(?:tuần|tháng|năm|tuan|thang|nam)\s)tới|đến|hết|trong)(?!\p{L})/iu;

/**
 * A practice repeats over a span: a range end ("tới ngày 20/11", "đến 31/12", "trong tháng này") or a span the line carried
 * ("tuần sau", "trong năm nay"), or with no due at all. A day the words name is one task: a clock, a weekday or day, a
 * due today or tomorrow, a day's start and due on one day, or a deadline cue ("trước 15/11", "hạn …").
 */
const namesDay = (it: ReaderItem, now: number) => {
  if (it.startsAt || it.days?.length || it.clocks?.length) return true;
  if (!it.deadline) return false;
  const start = dayNo(msOf(it.notBefore ?? `${ymd(now)} 00:00`));
  const due = dayNo(msOf(it.deadline));
  if (due - dayNo(now) <= 1 || DEADLINE_CUE.test(fold(it.evidence).text)) return true;
  // "tới" and "tối" fold alike: the accented word tells the end of a range from an evening
  if (RANGE_END.test(it.evidence.normalize("NFC")) && !/(?<!\p{L})trong tuần(?!\p{L})/iu.test(it.evidence)) return false;
  // a short span ("tuần sau") is one flexible task in it; a long one ("tháng sau", "năm nay") is a habit through it
  return due - start < 13;
};

/** "code b-tree và lsm": one item per object, each "Code …" with the verb as typed. Undefined when the title does not start with its verb. */
function objectItems(it: ReaderItem, o: SizeOpts): ReaderItem[] | undefined {
  const f = frameOf(it.title);
  if (!f.cls || !f.verb || f.objects.length < 2 || said(it) || it.rrule || it.windows?.length || it.clocks?.length || it.days?.length) return undefined;
  if (sizeOf(f, { now: nowOf(o.ref) }).shape !== "project") return undefined;
  const parts = it.title.split(/\s*(?:,|&|\+)\s*|\s+(?:và|va)\s+/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2 || !fold(parts[0]).text.startsWith(f.verb)) return undefined;
  const vf: string = f.verb;
  const verb = parts[0].split(/\s+/).slice(0, vf.split(" ").length).join(" ");
  const cap = (s: string) => s[0].toLocaleUpperCase("vi") + s.slice(1);
  return parts.map((p, i) => ({
    ...it,
    title: cap(i === 0 || fold(p).text.startsWith(vf) ? p : `${verb} ${p}`),
    inferred: [...it.inferred],
    flags: [...it.flags],
    alternatives: [...it.alternatives],
  }));
}

/** Sizes one flexible item by its class. Returns it (changed in place). */
function sizeOne(it: ReaderItem, o: SizeOpts): ReaderItem {
  const f = frameOf(it.title);
  // an exam's prep keeps the workload length the reader gave it
  if (!f.cls || it.prep) return it;
  it.cls = f.cls;
  const now = nowOf(o.ref);
  // a later start is the day the length and due count from: "ôn bài sau 20/11" is due after 20/11
  const from = it.notBefore ? Math.max(now, msOf(it.notBefore)) : now;
  const exam = f.cls === "exam_review" && !it.deadline ? examDay(it.title, o.calendar) : undefined;
  const ctx = {
    now: from,
    prep: affinityOf(o.affinity, it.title),
    spanEnd: it.deadline ? msOf(it.deadline) : undefined,
    anchorDue: exam ? msOf(`${exam} 00:00`) - 60_000 : undefined,
  };
  const mult = o.classMult?.[f.cls];
  const size = sizeOf(f, { ...ctx, classMult: mult });
  // the length before the learned multiplier: what a done task is measured against
  const plain = mult === undefined ? size.total : sizeOf(f, ctx).total;
  if (size.shape === "practice") {
    if (!it.rrule && !namesDay(it, now)) {
      it.rrule = size.rrule;
      mark(it, "rrule");
      // a repeat's span end is its UNTIL, never a day-end deadline of its own
      if (it.deadline) it.inferred = it.inferred.filter((k) => k !== "deadline");
      it.deadline = undefined;
      if (!it.notBefore) {
        it.notBefore = `${ymd(now)} 00:00`;
        mark(it, "notBefore");
      }
    }
    // a session's length: the rule's sitting, not its whole span
    if (!said(it)) {
      it.durationMinutes = size.perSitting;
      mark(it, "durationMinutes");
      it.sized = true;
      it.guessMin = undefined; // a session's length is per sitting: not measured per class
    }
    return it;
  }
  if (!said(it)) {
    it.durationMinutes = size.total;
    mark(it, "durationMinutes");
    it.sized = true;
    it.guessMin = plain;
    // a project's sittings: a said length is one sitting and never split
    if (size.shape === "project") it.sittingMinutes = size.perSitting;
  }
  // a meeting or appointment has a length only: its due is not a thing it has
  if (size.shape === "event") return it;
  if (!it.deadline && size.due !== undefined) {
    it.deadline = `${ymd(size.due)} 23:59`;
    mark(it, "deadline");
    if (exam) it.anchor = { kind: "exam", at: exam };
  }
  return it;
}

/**
 * Sizes the flexible items of a typed or spoken read. A project with several objects becomes one item per object,
 * unless an item is linked in an order chain (its links hold the item itself) or has a said length.
 */
export function sizeItems(items: ReaderItem[], o: SizeOpts, linked: Set<ReaderItem>): ReaderItem[] {
  if (o.source !== "typed" && o.source !== "voice") return items;
  return items.flatMap((it) => {
    if ((it.type !== "PLAN" && it.type !== "ASSIGNMENT") || it.startsAt || it.prep) return [it];
    const split = linked.has(it) ? undefined : objectItems(it, o);
    return (split ?? [it]).map((x) => sizeOne(x, o));
  });
}
