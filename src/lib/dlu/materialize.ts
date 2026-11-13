import { titleVec } from "../nlu/vec";
import type { Gone, Notice, Task } from "../types";
import { t } from "../i18n";
import { when } from "../when";
import type { ParsedMarks } from "./parse/student";
import { sanitizeNoteHtml } from "../nlu/shared/note-html";
import type { Fetched } from "./client";
import { preps } from "../../planner/prep";
import { lmsCoverageEnd } from "./season";

const ASSIGN_EFFORT = 45; // minutes; the planner resizes
const ASSIGN_SITTING = 45;

const idOf = (key: string) => `dlu:${key}`;
const sourceOf = (key: string) => (key.startsWith("lms:") ? "lms" : "portal");

function fromItem(i: Fetched[number], now: number): Task {
  const start = i.scheduledStartTime.getTime();
  const content = sanitizeNoteHtml(i.description);
  const base = {
    id: idOf(i.externalKey), title: i.title, vec: titleVec(i.title), ...(i.location ? { location: i.location } : {}),
    ...(i.type === "LECTURE" && i.scheduleStudyUnitId ? { section: i.scheduleStudyUnitId } : {}),
    ...(i.teacher ? { teacher: i.teacher } : {}), ...(i.lmsCourse ? { course: i.lmsCourse.fullName } : {}),
    ...(i.url ? { url: i.url } : {}), ...(content ? { content } : {}), kind: "study" as const, source: "dlu" as const, upstreamKey: i.externalKey, createdAt: now };
  if (i.type === "PLAN") {
    return { ...base, effort: ASSIGN_EFFORT, maxSitting: ASSIGN_SITTING, deadline: start, ...(i.submitted ? { doneAt: now } : {}) };
  }
  const end = start + i.durationMinutes * 60_000;
  return { ...base, effort: i.durationMinutes, fixed: i.type === "EXAM" ? "exam" : "lecture", start, end, ...(i.type === "EXAM" ? { deadline: start, ...(i.examFormat ? { format: i.examFormat } : {}) } : {}) };
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
  if (next.fixed) {
    set("fixed", next.fixed);
    set("start", next.start);
    set("end", next.end);
    set("effort", next.effort);
  }
  if (next.doneAt && !old.doneAt) set("doneAt", next.doneAt);
  if (old.deletedAt && !old.userEdited?.length) out.deletedAt = undefined;
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

/** What a sync changed that the student cares about. `timetable`: a new semester's lecture count and first start. */
export interface Digest { exams: Task[]; assignments: Task[]; rooms: Task[]; timetable?: { n: number; first: number } }

/** One notice per kind of change; marks come from `marksNotice`. */
export function digestNotices(d: Digest, now: number): Notice[] {
  const out: Notice[] = [];
  if (d.timetable) out.push({ title: t("noticeTimetable"), sub: t("noticeTimetableSub", { n: d.timetable.n }), route: `day:${d.timetable.first}` });
  for (const x of d.exams) out.push({ title: t("noticeExam", { title: x.title }), sub: when(x.start!, now), route: `/task/${x.id}` });
  for (const x of d.assignments) out.push({ title: t("noticeAssignment", { title: x.title }), sub: t("due", { time: when(x.deadline!, now) }), route: `/task/${x.id}` });
  for (const x of d.rooms) out.push({ title: t("noticeRoom", { title: x.title }), sub: t("noticeRoomSub", { room: x.location! }), route: `/task/${x.id}` });
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
export function materialize(items: Fetched, tasks: Task[], now = Date.now(), weak = 0.5, gone: Gone = { sections: {}, series: {} }): { upserts: Task[]; deletes: string[]; digest: Digest } {
  // Sittings copy their parent's upstreamKey; only the parent stands for the upstream item.
  const byKey = new Map(tasks.filter((t) => t.upstreamKey && !t.parentId).map((t) => [t.upstreamKey!, t]));
  const seen = new Set<string>();
  const upserts: Task[] = [];
  const digest: Digest = { exams: [], assignments: [], rooms: [] };
  const hadTimetable = tasks.some((x) => x.source === "dlu" && x.fixed === "lecture" && !x.deletedAt && x.start! > now);
  const lectures: number[] = [];

  for (const i of items) {
    seen.add(i.externalKey);
    const next = fromItem(i, now);
    const old = byKey.get(i.externalKey);
    if (!old) {
      const cut = next.section !== undefined ? gone.sections[next.section] : undefined;
      if (cut !== undefined && next.start! >= cut) continue; // the student deleted this section (or its tail)
      upserts.push(next);
      if (next.fixed === "exam" && next.start! > now) digest.exams.push(next);
      else if (!next.fixed && !next.doneAt && next.deadline! > now) digest.assignments.push(next);
      else if (next.fixed === "lecture") lectures.push(next.start!);
    } else {
      const merged = merge(old, next);
      if (!same(old, merged)) {
        upserts.push(merged, ...syncKids(merged, tasks));
        if (merged.location && merged.location !== old.location && !merged.deletedAt && (merged.start ?? 0) > now && old.fixed) digest.rooms.push(merged);
      }
    }
  }

  const failed = new Set(items.failed);
  const lmsEnd = lmsCoverageEnd(now);
  const deletes = tasks
    .filter((t) => {
      const key = t.upstreamKey;
      if (!key || t.source !== "dlu" || t.deletedAt || t.doneAt || seen.has(key) || failed.has(sourceOf(key))) return false;
      const at = t.start ?? t.deadline;
      // Past items drop out of the feed by design; LMS only covers this and next month.
      return at !== undefined && at > now && (sourceOf(key) !== "lms" || at < lmsEnd);
    })
    .map((t) => t.id);

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
    const [want] = live ? preps(e, weak) : [];
    if (want && !old) upserts.push(want);
    else if (want && old && !old.deletedAt && !old.doneAt && (old.deadline !== want.deadline || old.effort !== want.effort || old.forId !== want.forId)) {
      upserts.push({ ...old, deadline: want.deadline, effort: want.effort, title: want.title, vec: titleVec(want.title), forId: want.forId });
      if (old.deadline !== want.deadline || old.effort !== want.effort) deletes.push(...kids(old.id)); // resplit at the new size
    } else if (!want && old && !old.deletedAt && !old.doneAt && (e.deletedAt || dropped.has(e.id))) {
      deletes.push(old.id, ...kids(old.id));
    }
  }
  return { upserts, deletes, digest };
}
