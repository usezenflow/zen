import * as Notifications from "expo-notifications";
import { CampusLoginError, fetchAll, fetchMarks, loadCreds, materialize, registerBackgroundSync } from "./dlu";
import { ingest, keepSweep, replan, type Result } from "./apply";
import { t } from "./i18n";
import type { ParsedMarks } from "./dlu/parse/student";
import { weak } from "./dlu/parse/student";
import * as stats from "./stats";
import * as store from "./store";

const HOUR = 3600_000;
const MARKS_EVERY = 5 * HOUR;
const kvStorage: stats.Storage = { get: store.kvGet, set: store.kvSet };
const STATS_URL = process.env.EXPO_PUBLIC_STATS_URL ?? "https://zen-sink.alphazero25811.workers.dev";
let running: Promise<Result | undefined> | undefined;

const notify = (body: string) =>
  Notifications.scheduleNotificationAsync({ content: { body }, trigger: null }).catch(() => {});

/** Marks last fetched, or null before the first fetch. */
export async function getMarks(): Promise<ParsedMarks | null> {
  const raw = await store.kvGet("marks");
  try { return raw ? (JSON.parse(raw) as ParsedMarks) : null; } catch { return null; }
}

/** Epoch ms of the last good sync and whether the campus login was rejected. */
export async function syncStatus(): Promise<{ last: number | null; loginError: boolean }> {
  const last = await store.kvGet("sync.last");
  return { last: last ? Number(last) : null, loginError: await loginError() };
}

/** Refetch marks after 5 h; a failure keeps the stored marks. */
async function refreshMarks(creds: Parameters<typeof fetchMarks>[0], now: number) {
  if (now - Number((await store.kvGet("marks.at")) ?? 0) < MARKS_EVERY) return;
  try {
    await store.kvSet("marks", JSON.stringify(await fetchMarks(creds)));
    await store.kvSet("marks.at", String(now));
  } catch (e) {
    if (e instanceof CampusLoginError) throw e;
  }
}

/** fetch, materialize, plan, calendar. Keeps last data on failure. */
export function sync(opts: { notify?: boolean; now?: number } = {}): Promise<Result | undefined> {
  return (running ??= (async () => {
    const now = opts.now ?? Date.now();
    const creds = await loadCreds();
    if (!creds) return undefined;
    try {
      const items = await fetchAll(creds, now);
      await store.kvSet("sync.last", String(now));
      await store.kvSet("sync.loginError", "0");
      await refreshMarks(creds, now);
      const { upserts, deletes } = materialize(items, await store.allTasks(), now, weak(await getMarks()));
      if (!upserts.length && !deletes.length) return undefined;
      const r = await ingest(upserts, deletes, now);
      if (opts.notify && r.changed) await notify(r.toast);
      return r;
    } catch (e) {
      if (e instanceof CampusLoginError) await store.kvSet("sync.loginError", "1");
      return undefined;
    } finally {
      running = undefined;
    }
  })());
}

export async function loginError() {
  return (await store.kvGet("sync.loginError")) === "1";
}

/** Foreground hook: sync after an hour, replan on the first foreground of a day, flush stats. */
export async function onForeground(now = Date.now()): Promise<Result | undefined> {
  let out: Result | undefined;
  const day = new Date(now).toDateString();
  if ((await store.kvGet("morning.day")) !== day) {
    await store.kvSet("morning.day", day);
    await keepSweep(now);
    const r = await replan(now, (d) => (d.displaced.length ? t("morning") : undefined));
    if (r.changed) out = r;
  }
  if (now - Number((await store.kvGet("sync.last")) ?? 0) > HOUR) out = (await sync({ now })) ?? out;
  if (STATS_URL) await stats.flush(kvStorage, STATS_URL, now).catch(() => 0);
  return out;
}

export const setupBackground = () => registerBackgroundSync(async () => void (await sync({ notify: true }))).catch(() => {});
export { kvStorage };
