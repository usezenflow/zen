import * as Notifications from "expo-notifications";
import { checkLogin, clearCreds, fetchAll, fetchMarks, forget, hasLms, hasPortal, loadCreds, materialize, registerBackgroundSync, saveCreds, type Check, type Creds } from "./dlu";
import { stopBackgroundSync } from "./dlu/background";
import { digestNotices, marksNotice } from "./dlu/materialize";
import { ingest, keepSweep, loadGone, replan, topUp, type Result } from "./apply";
import { t } from "./i18n";
import type { Notice } from "./types";
import type { ParsedMarks } from "./dlu/parse/student";
import { weak } from "./dlu/parse/student";
import * as stats from "./stats";
import * as store from "./store";

const HOUR = 3600_000;
const MARKS_EVERY = 5 * HOUR;
const kvStorage: stats.Storage = { get: store.kvGet, set: store.kvSet };
const STATS_URL = process.env.EXPO_PUBLIC_STATS_URL ?? "https://zen-sink.alphazero25811.workers.dev";
export type Synced = Result & { notices: Notice[] };
let running: Promise<Synced | undefined> | undefined;

const notify = (n: Notice) =>
  Notifications.scheduleNotificationAsync({ content: { title: n.title, ...(n.sub ? { body: n.sub } : {}) }, trigger: null }).catch(() => {});

/** Marks last fetched, or null before the first fetch. */
export async function getMarks(): Promise<ParsedMarks | null> {
  const raw = await store.kvGet("marks");
  try { return raw ? (JSON.parse(raw) as ParsedMarks) : null; } catch { return null; }
}

export type Login = "portal" | "lms" | "both";

/** Which account the campus rejected on the last sync, or null. */
export async function loginError(): Promise<Login | null> {
  const v = await store.kvGet("sync.loginError");
  return v === "portal" || v === "lms" || v === "both" ? v : v === "1" ? "both" : null; // "1" is the pre-split flag
}

/** Epoch ms of the last good sync, whether a login was rejected, and whether the campus was slow. */
export async function syncStatus(): Promise<{ last: number | null; loginError: boolean; slow: boolean }> {
  const last = await store.kvGet("sync.last");
  return { last: last ? Number(last) : null, loginError: !!(await loginError()), slow: (await store.kvGet("sync.slow")) === "1" };
}

/** Refetch marks after 5 h; a failure keeps the stored marks. A notice when they changed since a previous fetch. */
async function refreshMarks(creds: Creds, now: number): Promise<Notice | undefined> {
  if (!hasPortal(creds) || now - Number((await store.kvGet("marks.at")) ?? 0) < MARKS_EVERY) return undefined;
  try {
    const prev = await store.kvGet("marks");
    const fresh = await fetchMarks(creds);
    const next = JSON.stringify(fresh);
    await store.kvSet("marks", next);
    await store.kvSet("marks.at", String(now));
    return prev !== null && prev !== next ? marksNotice(JSON.parse(prev), fresh) : undefined;
  } catch {
    return undefined; // a refused or slow portal is already reported by fetchAll
  }
}

/** Forgets one account's password (or both) and stops syncing that side; imported items stay. Background sync stops once both are gone. */
export async function disconnect(which: "lms" | "portal" | "both"): Promise<void> {
  const c = await loadCreds();
  const left = c && which !== "both" ? forget(c, which) : null;
  if (left && (hasPortal(left) || hasLms(left))) await saveCreds(left);
  else {
    await clearCreds();
    await stopBackgroundSync().catch(() => {});
  }
  await store.kvSet("sync.loginError", "");
  await store.kvSet("sync.slow", "0");
}

/** Validates each account and saves the ones that did not say "wrong"; with both wrong nothing is saved, so existing creds survive. */
export async function connect(c: Creds): Promise<{ portal: Check; lms: Check }> {
  const r = await checkLogin(c);
  if (r.portal !== "ok" && r.portal !== "slow" && r.lms !== "ok" && r.lms !== "slow") return r; // nothing usable: keep what was saved
  let next = c;
  if (r.portal === "wrong") next = forget(next, "portal");
  if (r.lms === "wrong") next = forget(next, "lms");
  await saveCreds(next);
  await store.kvSet("sync.loginError", "");
  await store.kvSet("sync.slow", r.portal === "slow" || r.lms === "slow" ? "1" : "0");
  return r;
}

/** fetch, materialize, plan, calendar. Keeps last data on failure. */
export function sync(opts: { notify?: boolean; now?: number } = {}): Promise<Synced | undefined> {
  return (running ??= (async () => {
    const now = opts.now ?? Date.now();
    const creds = await loadCreds();
    if (!creds) return undefined;
    try {
      const items = await fetchAll(creds, now);
      const bad = items.rejected ?? [];
      await store.kvSet("sync.loginError", bad.length === 2 ? "both" : bad[0] ?? "");
      await store.kvSet("sync.slow", items.slow?.length ? "1" : "0");
      if (items.failed?.length === 2) return undefined; // nothing fetched: not a good sync
      await store.kvSet("sync.last", String(now));
      const marks = await refreshMarks(creds, now);
      const { upserts, deletes, digest } = materialize(items, await store.allTasks(), now, weak(await getMarks()), await loadGone());
      const notices = digestNotices(digest, now);
      if (marks) notices.push(marks);
      if (!upserts.length && !deletes.length) {
        if (opts.notify) for (const n of notices) await notify(n);
        return notices.length ? { toast: "", changed: false, undo: async () => {}, notices } : undefined; // marks-only change
      }
      const r = await ingest(upserts, deletes, now, notices);
      if (opts.notify && r.changed) for (const n of notices.length ? notices : [{ title: r.toast, sub: r.sub }]) await notify(n);
      return { ...r, notices };
    } catch {
      return undefined;
    } finally {
      running = undefined;
    }
  })());
}

/** Foreground hook: sync after an hour, replan on the first foreground of a day, flush stats. */
export async function onForeground(now = Date.now()): Promise<Synced | undefined> {
  let out: Synced | undefined;
  const wrap = (r: Result): Synced => ({ ...r, notices: [] });
  const day = new Date(now).toDateString();
  if ((await store.kvGet("morning.day")) !== day) {
    await store.kvSet("morning.day", day);
    await keepSweep(now);
    const r = await replan(now, (d) => (d.displaced.length ? t("morning") : undefined));
    if (r.changed) out = wrap(r);
  }
  // A task that ended after the last plan was missed: roll it forward once (plannedAt moves on after the replan).
  const planned = Number((await store.kvGet("plannedAt")) ?? now);
  if (!out && (await store.allTasks()).some((x) => !x.doneAt && !x.deletedAt && !x.fixed && x.end !== undefined && x.end <= now && x.end > planned)) {
    const r = await replan(now);
    if (r.changed) out = wrap(r);
  }
  const up = await topUp(now);
  if (up) out = wrap(up);
  if (now - Number((await store.kvGet("sync.last")) ?? 0) > HOUR) out = (await sync({ now })) ?? out;
  if (STATS_URL) await stats.flush(kvStorage, STATS_URL, now).catch(() => 0);
  return out;
}

export const setupBackground = () => registerBackgroundSync(async () => void (await sync({ notify: true }))).catch(() => {});
export { kvStorage };
