import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";
import { lenW, plain, t } from "./i18n";
import type { Task } from "./types";
import { allTasks, kvGet, kvSet } from "./store";
import { when } from "./when";
import { dueOf } from "../planner/features";

const DEAL = "deal:tomorrow", DEAL_CAT = "zen-deal"; // the night-before note, one slot of the 64

const LEAD = 10 * 60_000;
const LOOK = 15 * 60_000; // a reminder this soon after an open is not needed: the user is already looking
const LEAD_MIN = 5 * 60_000, LEAD_MAX = 30 * 60_000; // a learned lead for a flexible task stays in this range
const LEAD_WINDOW = 60 * 60_000; // an open counts for a start only if it came within this hour before it
const OPENS_KEEP = 60;
const MAX = 39; // iOS keeps at most 64 pending notifications: 20 nudges, 1 night note (DEAL), the rest reminders
const PREFIX = "remind:";
const hm = (ts: number) => new Date(ts + 7 * 3600_000).toISOString().slice(11, 16).replace(/^0/, ""); // shortcut: fixed UTC+7 like when.ts

/** Lead a flexible task's reminder uses: the median gap from the last app open to the start of done tasks, once 5 such gaps exist. */
export function learnedLead(tasks: Task[], opens: number[]): number | undefined {
  const gaps = tasks.flatMap((x) => {
    const s = x.start;
    if (!x.doneAt || x.deletedAt || x.fixed || x.pinned || x.userEdited?.includes("start") || s === undefined) return [];
    const near = opens.filter((o) => o < s && s - o <= LEAD_WINDOW);
    return near.length ? [s - Math.max(...near)] : [];
  }).sort((a, b) => a - b);
  return gaps.length < 5 ? undefined : Math.min(LEAD_MAX, Math.max(LEAD_MIN, gaps[Math.floor(gaps.length / 2)]));
}

/** Tasks worth a reminder: open, timed, not a calendar busy block (the user's own busy block still is), soonest first. Split assignments remind per sitting (the parent has no start).
 *  A task the user set a clock for (fixed, pinned, or userEdited start) keeps 10 min; a flexible one uses the learned lead. `opens`: app opens, newest last. */
export function upcoming(tasks: Task[], now: number, opens: number[] = []): { id: string; at: number; title: string; body: string }[] {
  const learned = learnedLead(tasks, opens);
  const said = (x: Task) => !!(x.fixed || x.pinned || x.userEdited?.includes("start"));
  const leadOf = (x: Task) => (learned !== undefined && !said(x) ? learned : LEAD);
  const looked = (at: number) => opens.some((o) => o <= at && at - o < LOOK);
  // A flexible block is reminded only when its due falls within 12 h of its start (said ones always are).
  const dueNear = (x: Task) => { const d = dueOf(x); return d !== undefined && Math.abs(d - x.start!) <= 12 * 3600_000; };
  return tasks
    .filter((x) => !x.doneAt && !x.deletedAt && (x.fixed !== "busy" || x.source === "user") && x.start !== undefined && (said(x) || dueNear(x)))
    .map((x) => ({ x, at: x.start! - leadOf(x) }))
    .filter(({ x, at }) => at > now && (said(x) || !looked(at))) // a class, exam or said clock always rings
    .sort((a, b) => a.x.start! - b.x.start!)
    .slice(0, MAX)
    .map(({ x, at }) => ({ id: x.id, at, title: x.title, body: t("remindSub", { time: hm(x.start!), room: dueOf(x) !== undefined ? ` · ${t("due", { time: when(dueOf(x)!, x.start!) })}` : x.location ? ` · ${x.location}` : "" }) }));
}

async function opensOf(): Promise<number[]> {
  try {
    const v: unknown = JSON.parse((await kvGet("opens")) ?? "[]");
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : [];
  } catch { return []; }
}

/** Notes that the app was opened now (the last 60 kept), so reminders skip what the user is already looking at. */
export async function recordOpen(now: number) {
  await kvSet("opens", JSON.stringify([...(await opensOf()), now].slice(-OPENS_KEEP)));
}

export type Tone = "default" | "reminder" | "urgent";
/** iOS takes the sound per notification, Android per channel (and a channel's sound can never change, so these ids are new). */
export const soundOf = (tone: Tone) => `zenflow_${tone}.wav`;
const ensureChannels = async () => {
  if (Platform.OS !== "android") return;
  for (const tone of ["default", "reminder", "urgent"] as const)
    await Notifications.setNotificationChannelAsync(`zen-${tone}`, { name: t("remindChannel"), importance: AndroidImportance.HIGH, sound: soundOf(tone) });
};
export { ensureChannels };

/** The night-before note: at the next 21:30 (local), what is planned the day after it. Undefined when that day has nothing. Pure. */
export function dealOf(tasks: Task[], now: number): { at: number; title: string; body?: string } | undefined {
  const at = new Date(now); at.setHours(21, 30, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  const from = new Date(at); from.setDate(from.getDate() + 1); from.setHours(0, 0, 0, 0);
  const to = new Date(from); to.setDate(to.getDate() + 1);
  const day = tasks.filter((x) => !x.doneAt && !x.deletedAt && (x.fixed !== "busy" || x.source === "user") && x.start !== undefined && x.start >= from.getTime() && x.start < to.getTime());
  if (!day.length) return undefined;
  const k = day.filter((x) => { const d = dueOf(x); return d !== undefined && d > now && d - now <= 48 * 3600_000; }).length;
  const effort = day.reduce((n, x) => n + x.effort, 0);
  return { at: at.getTime(), title: t("dealTitle", { n: day.length, len: lenW(effort) }), body: k ? t("dealBody", { k }) : undefined };
}

/** Replaces the night-before note from the store: one notification under its own id, cancelled when tomorrow is empty. */
export async function pushDeal(tasks: Task[], now = Date.now()) {
  if (Platform.OS === "web") return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const d = dealOf(tasks, now);
  if (!d) {
    if ((await Notifications.getAllScheduledNotificationsAsync()).some((n) => n.identifier === DEAL)) await Notifications.cancelScheduledNotificationAsync(DEAL);
    return;
  }
  await ensureChannels();
  await Notifications.setNotificationCategoryAsync(DEAL_CAT, [
    { identifier: "see", buttonTitle: t("dealSee"), options: { opensAppToForeground: true } },
    { identifier: "light", buttonTitle: t("dealLight"), options: { opensAppToForeground: false } },
  ]);
  await Notifications.scheduleNotificationAsync({
    identifier: DEAL,
    content: { title: plain(d.title), body: d.body && plain(d.body), sound: soundOf("default"), categoryIdentifier: DEAL_CAT },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: d.at, ...(Platform.OS === "android" ? { channelId: "zen-default" } : {}) },
  });
}

/** Asks once for permission; Android 13 shows no prompt until a channel exists. */
export async function askReminders() {
  if (Platform.OS === "web") return;
  await ensureChannels();
  if (!(await Notifications.requestPermissionsAsync()).granted) throw new Error("notifications denied"); // the caller skips scheduling what nobody will see
}

let timer: ReturnType<typeof setTimeout> | undefined;
// One run at a time, the latest wins: an older run that outlasts the debounce must not schedule reminders for tasks since done or deleted.
let chain: Promise<unknown> = Promise.resolve(), gen = 0;
/** Replaces every scheduled reminder from the store; debounced so a burst of writes reschedules once. */
export function pushReminders() {
  if (Platform.OS === "web") return;
  clearTimeout(timer);
  timer = setTimeout(() => { const me = ++gen; chain = chain.then(() => push(() => me !== gen)).then(async () => { if (me === gen) { await (await import("./nudges")).pushNudges(); await pushDeal(await allTasks()); } }).catch(() => {}); }, 400);
}

/** `stale`: a newer run is queued, which cancels and reschedules everything itself. */
export async function push(stale: () => boolean = () => false) {
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureChannels();
  const want = upcoming(await allTasks(), Date.now(), await opensOf()), ids = new Set(want.map((r) => PREFIX + r.id));
  // Only what is no longer wanted is cancelled: a same-id schedule replaces in place, so a killed app never sits with none.
  for (const n of await Notifications.getAllScheduledNotificationsAsync())
    if (n.identifier.startsWith(PREFIX) && !ids.has(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  for (const r of want) {
    if (stale()) return;
    await Notifications.scheduleNotificationAsync({
      identifier: PREFIX + r.id,
      content: { title: plain(r.title), body: plain(r.body), sound: soundOf("reminder") }, // bold marks never reach the OS
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, ...(Platform.OS === "android" ? { channelId: "zen-reminder" } : {}) },
    });
  }
}
