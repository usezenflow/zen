import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";
import { t } from "./i18n";
import type { Task } from "./types";
import { allTasks } from "./store";
import { when } from "./when";

const LEAD = 10 * 60_000;
const MAX = 40; // iOS keeps at most 64 pending notifications; leave room for others
const PREFIX = "remind:";
const hm = (ts: number) => new Date(ts + 7 * 3600_000).toISOString().slice(11, 16); // shortcut: fixed UTC+7 like when.ts

/** Tasks worth a reminder: open, timed, not a calendar busy block (the user's own busy block still is), soonest first. Split assignments remind per sitting (the parent has no start). */
export function upcoming(tasks: Task[], now: number): { id: string; at: number; title: string; body: string }[] {
  return tasks
    .filter((x) => !x.doneAt && !x.deletedAt && (x.fixed !== "busy" || x.source === "user") && x.start !== undefined && x.start - LEAD > now)
    .sort((a, b) => a.start! - b.start!)
    .slice(0, MAX)
    .map((x) => ({ id: x.id, at: x.start! - LEAD, title: x.title, body: t("remindSub", { time: hm(x.start!), room: x.deadline !== undefined ? ` · ${t("due", { time: when(x.deadline, x.start!) })}` : x.location ? ` · ${x.location}` : "" }) }));
}

/** Asks once for permission; Android 13 shows no prompt until a channel exists. */
export async function askReminders() {
  if (Platform.OS === "web") return;
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: t("remindChannel"), importance: AndroidImportance.HIGH });
  await Notifications.requestPermissionsAsync();
}

let timer: ReturnType<typeof setTimeout> | undefined;
// One run at a time, the latest wins: an older run that outlasts the debounce must not schedule reminders for tasks since done or deleted.
let chain: Promise<unknown> = Promise.resolve(), gen = 0;
/** Replaces every scheduled reminder from the store; debounced so a burst of writes reschedules once. */
export function pushReminders() {
  if (Platform.OS === "web") return;
  clearTimeout(timer);
  timer = setTimeout(() => { const me = ++gen; chain = chain.then(() => push(() => me !== gen)).catch(() => {}); }, 400);
}

/** `stale`: a newer run is queued, which cancels and reschedules everything itself. */
export async function push(stale: () => boolean = () => false) {
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  for (const n of await Notifications.getAllScheduledNotificationsAsync())
    if (n.identifier.startsWith(PREFIX)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  for (const r of upcoming(await allTasks(), Date.now())) {
    if (stale()) return;
    await Notifications.scheduleNotificationAsync({
      identifier: PREFIX + r.id,
      content: { title: r.title, body: r.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, ...(Platform.OS === "android" ? { channelId: "default" } : {}) },
    });
  }
}
