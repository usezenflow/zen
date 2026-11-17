import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { checkLogin, clearCreds, fetchExams, fetchFees, fetchLms, fetchMarks, fetchWeek, forget, hasLms, hasPortal, loadCreds, materialize, owed, payUrl, registerBackgroundSync, saveCreds, type Check, type Creds, type PortalFeeRow, type Sessions } from "./dlu";
import { stopBackgroundSync } from "./dlu/background";
import { CampusLoginError, type Fetched, type Source } from "./dlu/client";
import { examMonth, feeMonth, marksOpen, resolveTerm, termMondays, vnMidnight } from "./dlu/season";
import { plain, t } from "./i18n";
import { digestNotices, marksNotice, type Digest } from "./dlu/materialize";
import { pushWidgetsNow } from "./widgets";
import { ingest, keepSweep, loadClassMult, loadGone, replan, topUp, waiting, type Result } from "./apply";
import type { Notice, Task } from "./types";
import type { ParsedMarks } from "./dlu/parse/student";
import * as queue from "./queue";
import * as stats from "./stats";
import * as store from "./store";
import { prepMult } from "./nlu/context";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
// Every campus fetch is a job in ./queue. On a schedule (background or app open) each part is queued at most daily and only in its season:
// the LMS daily; the timetable (one job per week) once per term; exams in exam months; marks while they are landing; fees once per fee month.
// A tap queues just that part. Nothing calls the campus outside the queue, so it is never asked twice at once.
const older = async (key: string, now: number) => now - Number((await store.kvGet(key)) || 0) >= DAY;
const kvStorage: stats.Storage = { get: store.kvGet, set: store.kvSet };
const STATS_URL = process.env.EXPO_PUBLIC_STATS_URL ?? "https://zen-sink.alphazero25811.workers.dev";
export type Synced = Result & { notices: Notice[] };

const notify = (n: Notice) =>
  Notifications.scheduleNotificationAsync({ content: { title: plain(n.title), ...(n.sub ? { body: plain(n.sub) } : {}), ...(n.route ? { data: { route: n.route } } : {}) }, trigger: null }).catch(() => {});

/** Marks last fetched, or null before the first fetch. */
export async function getMarks(): Promise<ParsedMarks | null> {
  const raw = await store.kvGet("marks");
  try { return raw ? (JSON.parse(raw) as ParsedMarks) : null; } catch { return null; }
}

/** Fee lines last fetched, or null before the first fetch. */
export async function getFeeRows(): Promise<PortalFeeRow[] | null> {
  const raw = await store.kvGet("fees.rows");
  try { return raw ? (JSON.parse(raw) as PortalFeeRow[]) : null; } catch { return null; }
}
export const vnd = (n: number) => `${n.toLocaleString("vi-VN").replace(/,/g, ".")} đ`;

export type Login = "portal" | "lms" | "both";

/** Which account the campus rejected, or null. */
export async function loginError(): Promise<Login | null> {
  const v = await store.kvGet("sync.loginError");
  return v === "portal" || v === "lms" || v === "both" ? v : v === "1" ? "both" : null; // "1" is the pre-split flag
}
async function setBad(src: Source, on: boolean) {
  const cur = new Set((await loginError()) === "both" ? ["portal", "lms"] : [(await loginError()) ?? ""]);
  if (on) cur.add(src); else cur.delete(src);
  cur.delete("");
  await store.kvSet("sync.loginError", cur.size === 2 ? "both" : [...cur][0] ?? "");
}

/** Epoch ms of the last good fetch and whether a login was rejected. */
export async function syncStatus(): Promise<{ last: number | null; loginError: boolean }> {
  const last = await store.kvGet("sync.last");
  return { last: last ? Number(last) : null, loginError: !!(await loginError()) };
}

export type Part = "tt" | "ex" | "marks" | "fees" | "lms";
const SRC: Record<Part, Source> = { tt: "portal", ex: "portal", marks: "portal", fees: "portal", lms: "lms" };
const AT: Record<Part, string> = { tt: "sync.tt.at", ex: "sync.exam.at", marks: "marks.at", fees: "fees.at", lms: "sync.last.lms" };
/** When each part last came from the campus. */
export async function partTimes(): Promise<Record<Part, number | null>> {
  const out = {} as Record<Part, number | null>;
  for (const p of Object.keys(AT) as Part[]) { const v = await store.kvGet(AT[p]); out[p] = v ? Number(v) : null; }
  return out;
}

/** A part as the rows show it: running (with week progress for the timetable), waiting its turn, or waiting to retry at a time. */
export type PartState = { st: "" | "run" | "wait" | "retry"; at?: number; done?: number; total?: number };
let ttTotal = 0; // weeks in the last timetable batch, for "5/22"; lost on restart, then no count
export async function partStates(now = Date.now()): Promise<Record<Part, PartState>> {
  const { jobs, current } = await queue.snapshot();
  const out = {} as Record<Part, PartState>;
  for (const p of Object.keys(SRC) as Part[]) {
    const mine = jobs.filter((j) => j.kind === p);
    const run = mine.some((j) => j.key === current), due = mine.some((j) => j.next <= now);
    const count = p === "tt" && ttTotal >= mine.length ? { done: ttTotal - mine.length + 1, total: ttTotal } : {};
    out[p] = run ? { st: "run", ...count } : due ? { st: "wait", ...count } : mine.length ? { st: "retry", at: Math.min(...mine.map((j) => j.next)) } : { st: "" };
  }
  return out;
}
export const onQueue = queue.onQueue;

/** The jobs one part needs. The timetable is one job per week of the term, this week first. */
function jobsFor(p: Part, now: number, auto = false): Omit<queue.Job, "tries" | "next">[] {
  if (p !== "tt") return [{ key: p, kind: p, auto }];
  const term = resolveTerm(now);
  const weeks = termMondays(now, term);
  ttTotal = weeks.length;
  return weeks.map((m) => ({ key: `tt:${m}`, kind: "tt", arg: `${term.academicYear}|${term.semester}|${m}|${term.start}`, auto }));
}

/** Queues one part by hand and starts the queue. A part already queued is not queued twice. */
export async function ask(p: Part): Promise<void> {
  await queue.enqueue(jobsFor(p, Date.now()));
  void drain();
}

/** Queues what is due on its own (see the top of this file). A refused account is not asked until its password is typed again. */
export async function schedule(now = Date.now()): Promise<void> {
  const c = await loadCreds();
  if (!c) return;
  const bad = await loginError();
  const ok = (src: Source) => bad !== src && bad !== "both";
  const parts: Part[] = [];
  if (hasLms(c) && ok("lms") && (await older("sync.last.lms", now))) parts.push("lms");
  if (hasPortal(c) && ok("portal")) {
    const term = resolveTerm(now);
    if ((await store.kvGet("sync.tt")) !== `${term.academicYear}${term.semester}` && (await older("sync.tt.try", now))) {
      parts.push("tt");
      await store.kvSet("sync.tt.try", String(now));
    }
    if (examMonth(now) && (await older("sync.exam.at", now))) parts.push("ex");
    const exams = (await store.allTasks()).filter((x) => x.source === "dlu" && x.fixed === "exam" && !x.deletedAt && x.end !== undefined);
    if (marksOpen(now, exams.map((x) => x.end!)) && (await older("marks.at", now))) parts.push("marks");
    const month = feeMonth(now);
    if (month && (await store.kvGet("fees.month")) !== month) parts.push("fees");
  }
  await queue.enqueue(parts.flatMap((p) => jobsFor(p, now, true)), now);
}

/** What one drain gathered: one digest across all its jobs, so a busy drain still ends in a few grouped notices. */
type Acc = { digest: Digest; extra: Notice[]; changed: boolean; hadTimetable: boolean };

/** Runs one job: fetch, keep what came, and fold the changes into `acc`. Throws to be retried; a refused login drops that account's jobs. */
async function run(j: queue.Job, acc: Acc): Promise<void> {
  const c = await loadCreds();
  const p = j.kind as Part, src = SRC[p];
  if (!c || !(src === "portal" ? hasPortal : hasLms)(c)) return; // disconnected meanwhile: nothing to do
  const now = Date.now(), out: Sessions = {};
  let fetched: Fetched | undefined;
  try {
    if (p === "tt") {
      const [academicYear, semester, monday, start] = (j.arg ?? "").split("|");
      fetched = await fetchWeek(c, { academicYear, semester: semester as "HK01" }, monday, now, out);
      // Done for the term once lectures came, or a week into it (a term with no classes is not asked daily).
      if (fetched.some((i) => i.type === "LECTURE") || now >= vnMidnight(start) + 7 * DAY) await store.kvSet("sync.tt", `${academicYear}${semester}`);
    } else if (p === "ex") fetched = await fetchExams(c, now, out);
    else if (p === "lms") fetched = await fetchLms(c, now, out);
    else if (p === "marks") {
      const prev = await store.kvGet("marks"), fresh = await fetchMarks(c, out), next = JSON.stringify(fresh);
      await store.kvSet("marks", next);
      if (prev !== null && prev !== next) acc.extra.push(marksNotice(JSON.parse(prev), fresh));
    } else {
      const rows = await fetchFees(c, out);
      await store.kvSet("fees.rows", JSON.stringify(rows));
      const month = feeMonth(now);
      if (month) await store.kvSet("fees.month", month);
      const n = owed(rows);
      if (j.auto && n > 0) acc.extra.push({ title: t("feesOwed"), sub: t("feesOwedSub", { amount: vnd(n) }), route: payUrl(c.studentId) }); // only the seasonal check speaks up
    }
  } catch (e) {
    if (!(e instanceof CampusLoginError)) throw e;
    const before = await loginError();
    if (before !== src && before !== "both") acc.extra.push({ title: t(src === "portal" ? "noticeLoginPortal" : "noticeLoginLms"), sub: t("noticeLoginSub"), route: "/settings" }); // once: a refusal while the flag is set is silent
    await setBad(src, true);
    await queue.dropWhere((x) => SRC[x.kind as Part] === src);
    return;
  } finally {
    if (out.portalToken || out.lmsSession) { const cur = await loadCreds(); if (cur) await saveCreds({ ...cur, ...out }); } // kept for the next job
  }
  await setBad(src, false);
  for (const k of [AT[p], "sync.last", `sync.last.${src}`]) await store.kvSet(k, String(now));
  if (!fetched) return;
  const { upserts, deletes, digest } = materialize(fetched, await store.allTasks(), now, prepMult(await getMarks()), await loadGone(), await loadClassMult().catch(() => ({})));
  acc.digest.exams.push(...digest.exams); acc.digest.assignments.push(...digest.assignments); acc.digest.rooms.push(...digest.rooms);
  acc.digest.lectures!.push(...(digest.lectures ?? []));
  acc.digest.moved.push(...digest.moved); acc.digest.due.push(...digest.due); acc.digest.makeup.push(...digest.makeup); acc.digest.cancelled.push(...digest.cancelled);
  // Stored now, planned once when the drain ends: a term's ~26 weekly jobs would otherwise each run the whole planner.
  if (upserts.length || deletes.length) acc.changed = (await ingest(upserts, deletes, now, [], false)).changed || acc.changed;
}

let draining: Promise<Synced | undefined> | undefined;
const synced = new Set<(r: Synced) => void>();
/** Hears every drain that changed something or has notices (the day view lands them as toasts). */
export function onSynced(cb: (r: Synced) => void): () => void { synced.add(cb); return () => { synced.delete(cb); }; }
let wake: ReturnType<typeof setTimeout> | undefined;

/** Works the queue until nothing is due (or `budget` ms passed). In the background the notices become notifications;
 *  in the foreground they go to `onSynced`. A job waiting to retry wakes the queue again when it is due. */
export function drain(opts: { budget?: number } = {}): Promise<Synced | undefined> {
  return (draining ??= (async () => {
    const tasks = await store.allTasks(), now = Date.now();
    const acc: Acc = { digest: { exams: [], assignments: [], rooms: [], moved: [], due: [], makeup: [], cancelled: [], lectures: [] }, extra: [], changed: false,
      hadTimetable: tasks.some((x) => x.source === "dlu" && x.fixed === "lecture" && !x.deletedAt && x.start! > now) };
    await queue.work((j) => run(j, acc), opts.budget);
    if (acc.changed) await replan(Date.now());
    const ls = acc.digest.lectures!;
    acc.digest.timetable = !acc.hadTimetable && ls.length >= 3 ? { n: ls.length, first: Math.min(...ls) } : undefined;
    if (!acc.hadTimetable) acc.digest.makeup = []; // lectures of a timetable that came in this drain are not makeups
    const notices = [...digestNotices(acc.digest, now), ...acc.extra];
    const next = await queue.nextDue();
    if (wake) clearTimeout(wake);
    if (next !== null) wake = setTimeout(() => void drain(), Math.max(1000, next - Date.now()));
    if (!acc.changed && !notices.length) return undefined;
    const r: Synced = { toast: notices.length ? "" : t("syncedNew"), changed: acc.changed, undo: async () => {}, notices };
    if (AppState.currentState !== "active") for (const n of notices) await notify(n);
    else synced.forEach((f) => f(r));
    return r;
  })().finally(() => { draining = undefined; }));
}

/** Connecting: queue everything for the account(s) (exams, assignments and this week first) and wait a few seconds,
 *  enough for the first answers behind the loading leaf; the rest goes on behind. */
export async function syncNow(only?: Source): Promise<void> {
  const now = Date.now();
  const parts: Part[] = only === "lms" ? ["lms"] : only === "portal" ? ["ex", "tt", "marks", "fees"] : ["ex", "lms", "tt", "marks", "fees"];
  await queue.enqueue(parts.flatMap((p) => jobsFor(p, now)), now);
  await drain({ budget: 8_000 });
  void drain();
}

/** Forgets one account's password (or both) and its queued jobs. Once both are gone, everything the campus gave (items, prep for them, marks, fees) is wiped too. */
export async function disconnect(which: "lms" | "portal" | "both"): Promise<void> {
  const c = await loadCreds();
  const left = c && which !== "both" ? forget(c, which) : null;
  await queue.dropWhere((j) => which === "both" || SRC[j.kind as Part] === which);
  if (left && (hasPortal(left) || hasLms(left))) await saveCreds(left);
  else {
    await clearCreds();
    await stopBackgroundSync().catch(() => {});
    const all = await store.allTasks();
    const gone = new Set(all.filter((x) => x.source === "dlu").map((x) => x.id));
    await store.removeTasks(all.filter((x) => gone.has(x.id) || (x.forId && gone.has(x.forId))).map((x) => x.id));
    for (const k of ["marks", "fees.rows", "sync.last", "sync.last.portal", "sync.last.lms", "sync.tt", "sync.tt.at", "sync.tt.try", "sync.exam.at", "marks.at", "fees.at", "fees.month"]) await store.kvSet(k, "");
  }
  if (which !== "both") await store.kvSet(`sync.last.${which}`, "");
  await store.kvSet("sync.loginError", "");
}

/** Validates each account and saves the ones that did not say "wrong"; with both wrong nothing is saved, so existing creds survive. */
export async function connect(typed: Creds): Promise<{ portal: Check; lms: Check }> {
  // A blank field next to an account already connected means "leave it", so adding the LMS later does not drop the portal.
  const old = await loadCreds();
  const c: Creds = { ...typed, portalToken: old?.portalToken, lmsSession: old?.lmsSession, password: typed.password || (old && hasPortal(old) ? old.password : ""), lmsPassword: typed.lmsPassword || (old && hasLms(old) ? old.lmsPassword : undefined) };
  // Only what was typed is checked: an account left blank keeps its saved password and is not logged in to again.
  const r = await checkLogin({ ...c, password: typed.password ? c.password : "", lmsPassword: typed.lmsPassword ? c.lmsPassword : undefined });
  if (r.portal !== "ok" && r.portal !== "slow" && r.lms !== "ok" && r.lms !== "slow") return r; // nothing usable: keep what was saved
  let next: Creds = c.lmsPassword ? c : { ...c, lmsOff: true }; // blank LMS password: the user does not want it connected
  next = { ...next, ...r.sessions }; // the jobs that follow reuse these instead of logging in again
  if (r.portal === "wrong") next = forget(next, "portal");
  if (r.lms === "wrong") next = forget(next, "lms");
  await saveCreds(next);
  await store.kvSet("sync.loginError", "");
  return r;
}

/** Preps follow the exams already stored and need no campus: made, resized or renamed without a fetch, so a new prep rule reaches old exams at once. */
/** Bumped when prep sizing or spreading changes: the first launch after it splits every prep still ahead again. */
const PREP_REV = "2"; // 26.0.9: sized by exam stakes, one sitting a day, done by the evening before
/** Open sittings of preps still ahead, for the planner to split again. A prep with a sitting running, pinned or set by hand is left
 * whole: the planner splits again only when no open sitting is left, so dropping only some would lose their minutes. */
export const stalePrepSits = (tasks: Task[], now: number): string[] => {
  const kept = (c: Task) => c.pinned || c.userEdited?.includes("start") || (c.start !== undefined && c.end !== undefined && c.start <= now && now < c.end);
  return tasks.filter((t) => t.id.startsWith("prep:") && !t.parentId && !t.doneAt && !t.deletedAt && (t.deadline ?? 0) > now).flatMap((p) => {
    const open = tasks.filter((c) => c.parentId === p.id && !c.doneAt && !c.deletedAt);
    return open.some(kept) ? [] : open.map((c) => c.id);
  });
};

async function backfill(now: number): Promise<Result | undefined> {
  const none: Fetched = Object.assign([], { failed: ["portal", "lms"] as Source[] }); // both "failed": no stored campus item is touched
  const all = await store.allTasks();
  const { upserts, deletes } = materialize(none, all, now, prepMult(await getMarks()), await loadGone(), await loadClassMult().catch(() => ({})));
  const rev = (await store.kvGet("prepRev")) !== PREP_REV;
  if (rev) deletes.push(...stalePrepSits(all, now).filter((id) => !deletes.includes(id))); // the planner splits what is left again, with new ids
  const r = upserts.length || deletes.length ? await ingest(upserts, deletes, now) : undefined;
  if (rev) await store.kvSet("prepRev", PREP_REV);
  return r;
}

let foreground: Promise<Synced | undefined> | undefined;
/** Foreground hook: keep sweep once a day, missed check, top-up, queue what is due and start it, flush stats. No daily replan.
 *  App focus and resume both call it at launch: a call while one runs waits for it and lands nothing of its own. */
export function onForeground(now = Date.now()): Promise<Synced | undefined> {
  if (foreground) return foreground.then(() => undefined, () => undefined);
  return (foreground = foregroundNow(now).finally(() => { foreground = undefined; }));
}
async function foregroundNow(now: number): Promise<Synced | undefined> {
  let out: Synced | undefined;
  const wrap = (r: Result): Synced => ({ ...r, notices: [] });
  const day = new Date(now).toDateString();
  if ((await store.kvGet("morning.day")) !== day) {
    await store.kvSet("morning.day", day);
    await keepSweep(now);
  }
  // A task that ended after the last plan was missed: roll it forward once (plannedAt moves on after the replan).
  const planned = Number((await store.kvGet("plannedAt")) ?? now);
  // A time the user set by hand (pinned, or userEdited start) is not missed: it stays where the user put it.
  // ...and a task still waiting for a time gets any time freed since (a class gone, a block ended): placing it moves nothing placed.
  const all = await store.allTasks();
  if (!out && (waiting(all) || all.some((x) => !x.doneAt && !x.deletedAt && !x.fixed && !x.pinned && !x.userEdited?.includes("start") && x.end !== undefined && x.end <= now && x.end > planned))) {
    const r = await replan(now);
    if (r.changed) out = wrap(r);
  }
  const up = await topUp(now);
  if (up) out = wrap(up);
  const made = await backfill(now); // before the sync, which an auto refresh may skip
  if (made?.changed) out = wrap(made);
  await schedule(now);
  void drain(); // its result reaches the day view through onSynced
  if (STATS_URL) await stats.flush(kvStorage, STATS_URL, now).catch(() => 0);
  return out;
}

// iOS gives a background task about 30 s: stop picking new jobs after 25; the rest waits for the next run or app open.
// Each run also re-pushes the widgets, so their timeline (through the end of tomorrow) keeps rolling without the app opened.
export const setupBackground = () => registerBackgroundSync(async () => { await schedule(); await drain({ budget: 25_000 }); await pushWidgetsNow(); }).catch(() => {});
export { kvStorage };
