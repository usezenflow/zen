import { embed } from "../nlu/embed";
import type { Gone, Notice, Task } from "../types";
import { t } from "../i18n";
import { when } from "../when";
import type { ParsedMarks } from "./parse/student";
import { sanitizeNoteHtml } from "../nlu/shared/note-html";
import type { Fetched } from "./client";
import { PREP_SITTING, preps, workOf } from "../../planner/prep";
import { lmsCoverageEnd, resolveTerm } from "./season";

const UNSIZED = 45; // minutes every assignment got before it was sized by its work and the marks
const OLD_SITTING = 45; // preps and assignments were split in 45 min sittings before half hours

const idOf = (key: string) => `dlu:${key}`;
const sourceOf = (key: string) => (key.startsWith("lms:") ? "lms" : "portal");

function fromItem(i: Fetched[number], now: number, mult: (title: string) => number): Task {
  const start = i.scheduledStartTime.getTime();
  const content = sanitizeNoteHtml(i.description);
  const base = {
    id: idOf(i.externalKey), title: i.title, vec: embed(i.title), ...(i.location ? { location: i.location } : {}),
    ...(i.type === "LECTURE" && i.scheduleStudyUnitId ? { section: i.scheduleStudyUnitId } : {}),
    ...(i.teacher ? { teacher: i.teacher } : {}), ...(i.lmsCourse ? { course: i.lmsCourse.fullName } : {}),
    ...(i.url ? { url: i.url } : {}), ...(content ? { content } : {}), kind: "study" as const, source: "dlu" as const, upstreamKey: i.externalKey, createdAt: now };
  if (i.type === "PLAN") {
    // Sized like an exam prep: by what the title and content ask for, and by the marks of the course.
    const { effort } = workOf(`${i.title} ${(i.description ?? "").replace(/<[^>]*>/g, " ")}`, mult(`${i.lmsCourse?.fullName ?? ""} ${i.title}`));
    return { ...base, effort, maxSitting: PREP_SITTING, deadline: start, ...(i.submitted ? { doneAt: now } : {}) };
  }
  const end = start + i.durationMinutes * 60_000;
  return { ...base, effort: i.durationMinutes, fixed: i.type === "EXAM" ? "exam" : "lecture", start, end, ...(i.type === "EXAM" ? { deadline: start, ...(i.examFormat ? { format: i.examFormat } : {}), ...(i.examCredits ? { credits: i.examCredits } : {}), ...(i.examRetake ? { retake: true } : {}) } : {}) };
}

/** Upstream-owned fields; a field in `userEdited` is never overwritten. Planner-owned `start`/`effort` of a flexible task are untouched. */
function merge(old: Task, next: Task): Task {
  if (old.deletedAt && old.userEdited?.includes("deleted")) return old; // the user removed it; upstream never revives
  const edited = new Set(old.userEdited);
  const out: Task = { ...old };
  const set = <K extends keyof Task>(k: K, v: Task[K]) => {
    if (!edited.has(k)) out[k] = v;
  };
  set("title", next.title);
  set("deadline", next.deadline);
  set("location", next.location);
  set("note", undefined); // note is the user's own; this clears old upstream "GV: …" / HTML (a user edit is in `edited`)
  set("section", next.section);
  set("teacher", next.teacher);
  set("course", next.course);
  set("url", next.url);
  set("content", next.content);
  if (old.source === "dlu") out.rrule = undefined; // lectures are not repeats
  if (next.format) set("format", next.format);
  if (next.fixed === "exam") { set("credits", next.credits); set("retake", next.retake); } // the portal's values; a cleared one clears
  if (next.fixed) {
    set("fixed", next.fixed);
    set("start", next.start);
    set("end", next.end);
    set("effort", next.effort);
  }
  if (!next.fixed && old.effort === UNSIZED) set("effort", next.effort); // stored before sizing: still one sitting, so nothing to resplit
  if (next.doneAt && !old.doneAt) set("doneAt", next.doneAt);
  if (old.deletedAt && !old.userEdited?.includes("deleted")) out.deletedAt = undefined; // back upstream; only the student's own delete sticks
  return out;
}

const KID_FIELDS = ["title", "deadline", "location", "teacher", "course", "url", "content", "format", "doneAt"] as const;
/** Sittings of a split assignment carry copies of the parent's upstream fields; refresh the open ones that drifted. */
function syncKids(parent: Task, tasks: Task[]): Task[] {
  return tasks.filter((k) => k.parentId === parent.id && !k.doneAt && !k.deletedAt).flatMap((k) => {
    const out: Task = { ...k };
    for (const f of KID_FIELDS) if (!k.userEdited?.includes(f)) Object.assign(out, { [f]: parent[f] });
    return same(k, out) ? [] : [out];
  });
}

const same = (a: Task, b: Task) => JSON.stringify(a) === JSON.stringify(b);

/** What a sync changed that the student cares about. `timetable`: a new semester's lecture count and first start.
 *  `moved`: an exam's time moved; `due`: an open assignment's due date changed; `makeup`: a new single lecture after the timetable;
 *  `cancelled`: a future upstream item that is gone from the campus. */
export interface Digest { exams: Task[]; assignments: Task[]; rooms: Task[]; moved: Task[]; due: Task[]; makeup: Task[]; cancelled: Task[]; timetable?: { n: number; first: number }; lectures?: number[] }

/** One notice per kind of change; marks come from `marksNotice`. */
export function digestNotices(d: Digest, now: number): Notice[] {
  const out: Notice[] = [];
  if (d.timetable) out.push({ title: t("noticeTimetable", { n: +resolveTerm(now).semester.slice(2) }), sub: t("noticeTimetableSub", { n: d.timetable.n }), route: `day:${d.timetable.first}` });
  // Three or more item changes are one notice (views.html "Campus, many changes"), so a busy sync never floods the lock screen.
  const many = [...new Map([...d.exams, ...d.assignments, ...d.rooms, ...d.moved, ...d.due, ...d.makeup, ...d.cancelled].map((x) => [x.id, x])).values()];
  if (many.length >= 3) {
    out.push({ title: t("noticeMany", { n: many.length }), sub: `${many.slice(0, 2).map((x) => x.title).join(", ")} +${many.length - 2}` });
    return out;
  }
  for (const x of d.exams) out.push({ title: t("noticeExam", { title: x.title }), sub: when(x.start!, now), route: `/task/${x.id}`, urgent: true });
  for (const x of d.assignments) out.push({ title: t("noticeAssignment", { title: x.title }), sub: t("due", { time: when(x.deadline!, now) }), route: `/task/${x.id}` });
  for (const x of d.rooms) out.push({ title: t("noticeRoom", { title: x.title }), sub: t("noticeRoomSub", { room: x.location! }), route: `/task/${x.id}` });
  for (const x of d.moved) out.push({ title: t("noticeExamMoved", { title: x.title }), sub: when(x.start!, now), route: `/task/${x.id}`, urgent: true });
  for (const x of d.due) out.push({ title: t("noticeDue", { title: x.title }), sub: t("due", { time: when(x.deadline!, now) }), route: `/task/${x.id}` });
  for (const x of d.makeup) out.push({ title: t("noticeMakeup", { title: x.title }), sub: when(x.start!, now), route: `/task/${x.id}` });
  for (const x of d.cancelled) out.push({ title: t("noticeCancelled", { title: x.title }), sub: when(x.start ?? x.deadline!, now) });
  return out;
}

/** "Điểm vừa cập nhật" with the first course whose score is new or changed, if any. */
export function marksNotice(prev: ParsedMarks | null, next: ParsedMarks | null): Notice {
  const old = new Map((prev?.marks ?? []).map((m) => [m.scheduleStudyUnitId, m.score10]));
  const m = next?.marks.find((k) => k.score10 !== null && old.get(k.scheduleStudyUnitId) !== k.score10);
  return { title: t("noticeMarks"), ...(m ? { sub: `${m.curriculumName}: ${String(m.score10).replace(".", ",")}` } : {}), route: "/marks" };
}

/**
 * Diff fetched items against stored tasks by upstreamKey. Upserts are new or changed tasks;
 * deletes are ids of future upstream tasks that disappeared from a source that fetched cleanly
 * (caller soft-deletes them).
 */
export function materialize(items: Fetched, tasks: Task[], now = Date.now(), mult: (title: string) => number = () => 1, gone: Gone = { sections: {}, series: {} }, pace: Record<string, number> = {}): { upserts: Task[]; deletes: string[]; digest: Digest } {
  // Sittings copy their parent's upstreamKey; only the parent stands for the upstream item.
  const byKey = new Map(tasks.filter((t) => t.upstreamKey && !t.parentId).map((t) => [t.upstreamKey!, t]));
  const seen = new Set<string>();
  const upserts: Task[] = [];
  const digest: Digest = { exams: [], assignments: [], rooms: [], moved: [], due: [], makeup: [], cancelled: [] };
  const hadTimetable = tasks.some((x) => x.source === "dlu" && x.fixed === "lecture" && !x.deletedAt && x.start! > now);
  const lectures: number[] = [];

  // A class whose period changed has a new key (the period is in it): the same section on the same day, no longer fed, is the same class.
  // It keeps its id, note and pin instead of being cancelled and re-added.
  const keys = new Set(items.map((i) => i.externalKey)), taken = new Set<string>();
  const dayOf = (ms: number) => new Date(ms).toDateString();
  const orphanOf = (next: Task) => next.fixed !== "lecture" || next.section === undefined ? undefined : tasks.find((o) => o.source === "dlu" && o.fixed === "lecture" && o.section === next.section && !o.parentId && !o.deletedAt && !o.doneAt
    && o.upstreamKey !== undefined && !keys.has(o.upstreamKey) && !taken.has(o.id) && o.start !== undefined && o.start > now && dayOf(o.start) === dayOf(next.start!));
  for (const i of items) {
    seen.add(i.externalKey);
    const next = fromItem(i, now, mult);
    let old = byKey.get(i.externalKey);
    if (!old) {
      const o = orphanOf(next);
      if (o) { taken.add(o.id); seen.add(o.upstreamKey!); const m = { ...merge(o, next), upstreamKey: next.upstreamKey }; if (!same(o, m)) upserts.push(m, ...syncKids(m, tasks)); old = o; }
    }
    if (old && old.upstreamKey !== i.externalKey) continue; // handled above
    if (!old) {
      const cut = next.section !== undefined ? gone.sections[next.section] : undefined;
      if (cut !== undefined && next.start! >= cut) continue; // the student deleted this section (or its tail)
      upserts.push(next);
      if (next.fixed === "exam" && next.start! > now) digest.exams.push(next);
      else if (!next.fixed && !next.doneAt && next.deadline! > now) digest.assignments.push(next);
      else if (next.fixed === "lecture") {
        lectures.push(next.start!);
        if (hadTimetable && next.start! > now) digest.makeup.push(next); // the drain keeps this only when the timetable was there before it
      }
    } else {
      const merged = merge(old, next);
      if (!same(old, merged)) {
        upserts.push(merged, ...syncKids(merged, tasks));
        if (merged.location && merged.location !== old.location && !merged.deletedAt && (merged.start ?? 0) > now && old.fixed) digest.rooms.push(merged);
        if (merged.fixed === "exam" && !merged.deletedAt && merged.start !== old.start && (merged.start ?? 0) > now) digest.moved.push(merged);
        if (!merged.fixed && !merged.doneAt && !merged.deletedAt && merged.deadline !== old.deadline && (merged.deadline ?? 0) > now) digest.due.push(merged);
      }
    }
  }

  const failed = new Set(items.failed);
  const skipped = (key: string) => (items.skipped ?? []).some((p) => key.startsWith(`${p}:`));
  const outside = (key: string, at: number) => !!items.window && key.startsWith("portal:lecture:") && (at < items.window[0] || at >= items.window[1]);
  const lmsEnd = lmsCoverageEnd(now);
  const removed = tasks
    .filter((t) => {
      const key = t.upstreamKey;
      if (!key || t.source !== "dlu" || t.deletedAt || t.doneAt || seen.has(key) || failed.has(sourceOf(key)) || skipped(key)) return false;
      if (items.only && !items.only.includes(key)) return false;
      const at = t.start ?? t.deadline;
      // Past items drop out of the feed by design; LMS covers the months in LMS_MONTHS.
      return at !== undefined && at > now && !outside(key, at) && (sourceOf(key) !== "lms" || at < lmsEnd);
    });
  const deletes = removed.map((t) => t.id);
  digest.cancelled = removed.filter((t) => !t.parentId); // sittings go with their parent; the parent is the item the student knows

  digest.lectures = lectures; // the queue sums them across one term's week jobs
  if (!hadTimetable && lectures.length >= 3) digest.timetable = { n: lectures.length, first: Math.min(...lectures) };

  // Preps follow their exam: added when it appears, resized when it moves, dropped when it goes.
  const dropped = new Set(deletes);
  const exams = new Map(tasks.filter((t) => t.fixed === "exam" && t.source === "dlu").map((t) => [t.id, t]));
  for (const u of upserts) if (u.fixed === "exam") exams.set(u.id, u);
  const prepOf = new Map(tasks.filter((t) => t.id.startsWith("prep:")).map((t) => [t.id, t]));
  const kids = (id: string) => tasks.filter((t) => t.parentId === id && !t.deletedAt && !t.doneAt).map((t) => t.id);
  for (const e of exams.values()) {
    const old = prepOf.get(`prep:${e.id}`);
    const live = !e.deletedAt && !dropped.has(e.id) && e.start! > now;
    const [want] = live ? preps(e, mult(e.title), pace) : [];
    if (old?.deletedAt && old.userEdited?.includes("deleted")) continue; // "Không cần ôn": the student dropped this prep, a sync never brings it back
    if (want && !old) upserts.push(want);
    else if (want && old && !old.deletedAt && !old.doneAt) {
      const title = old.userEdited?.includes("title") ? old.title : want.title; // a name the student gave stays
      if (old.deadline === want.deadline && old.effort === want.effort && old.maxSitting === want.maxSitting && old.forId === want.forId && old.course === want.course && old.title === title && old.guessMin === want.guessMin) continue;
      const next = { ...old, deadline: want.deadline, effort: want.effort, maxSitting: want.maxSitting, title, vec: embed(title), forId: want.forId, course: want.course, cls: want.cls, guessMin: want.guessMin };
      upserts.push(next);
      if (old.deadline !== want.deadline || old.effort !== want.effort || old.maxSitting !== want.maxSitting) deletes.push(...kids(old.id)); // resplit at the new size
      else upserts.push(...syncKids(next, tasks)); // renamed only: open sittings follow
    } else if (!want && old && !old.deletedAt && !old.doneAt && (e.deletedAt || dropped.has(e.id))) {
      deletes.push(old.id, ...kids(old.id));
    }
  }
  // Assignments still due, stored in 45 min sittings: whole half hours, sittings up to an hour; their open sittings go and the planner splits the rest again.
  const at = new Map(upserts.map((u, i) => [u.id, i]));
  for (const t0 of tasks) {
    if (t0.maxSitting !== OLD_SITTING || t0.parentId || t0.doneAt || t0.deletedAt || t0.id.startsWith("prep:") || dropped.has(t0.id)) continue;
    if (t0.deadline === undefined || t0.deadline <= now) continue; // only work still ahead: a past one keeps the sittings it had
    const i = at.get(t0.id), t = i === undefined ? t0 : upserts[i];
    const next = { ...t, maxSitting: PREP_SITTING, effort: t.userEdited?.includes("effort") ? t.effort : Math.max(1, Math.round(t.effort / 30)) * 30 };
    if (i === undefined) upserts.push(next); else upserts[i] = next;
    deletes.push(...kids(t0.id));
  }
  return { upserts, deletes, digest };
}
