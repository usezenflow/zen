// Start and overrun nudges (magic.html 7p, 7q): one calm notification when a block begins, and "Xong chưa?" when it runs past its end
// with nothing ticked. Silence is never read as a miss. Scheduling is kept apart from reminders.ts (its own prefix and categories).
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { plain, t } from "./i18n";
import { laterChoices } from "./parts";
import { GRACE } from "../planner/policy";
import { soundOf } from "./reminders";
import { allTasks } from "./store";
import { apply, moveToDay } from "./apply";
import type { Task } from "./types";

const PREFIX = "nudge:";
const MAX = 20; // iOS keeps 64 pending notifications in all; reminders have most of the rest
const START_CAT = "zen-start", OVER_CAT = "zen-overrun";
export type NudgeAction = "start" | "later" | "done";

export interface Nudge { id: string; at: number; kind: "start" | "over"; title: string }

/** Nudges still ahead for open, timed, flexible tasks: the start at its start time, the overrun at its end. Soonest first. */
export function nudgesOf(tasks: Task[], now: number): Nudge[] {
  return tasks
    .filter((x) => !x.doneAt && !x.deletedAt && !x.fixed && x.start !== undefined && x.end !== undefined)
    .flatMap((x): Nudge[] => [
      ...(x.start! > now ? [{ id: x.id, at: x.start!, kind: "start" as const, title: x.title }] : []),
      ...(x.end! > now ? [{ id: x.id, at: x.end!, kind: "over" as const, title: x.title }] : []),
    ])
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX);
}

/** The two categories: the start offers Bắt đầu (opens the app) or Để sau; the overrun offers Xong or Để sau, without opening the app. */
export async function registerNudgeCategories() {
  if (Platform.OS === "web") return;
  await Notifications.setNotificationCategoryAsync(START_CAT, [
    { identifier: "start", buttonTitle: t("startLab"), options: { opensAppToForeground: true } },
    { identifier: "later", buttonTitle: t("laterAfter"), options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync(OVER_CAT, [
    { identifier: "done", buttonTitle: t("finishDone"), options: { opensAppToForeground: false } },
    { identifier: "later", buttonTitle: t("laterAfter"), options: { opensAppToForeground: false } },
  ]);
}

/** Replaces the nudges from the store (like pushReminders, which is separate): the caller runs it where reminders are pushed. */
export async function pushNudges(now = Date.now()) {
  if (Platform.OS === "web") return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await registerNudgeCategories();
  for (const n of await Notifications.getAllScheduledNotificationsAsync())
    if (n.identifier.startsWith(PREFIX)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  for (const n of nudgesOf(await allTasks(), now)) {
    const over = n.kind === "over";
    await Notifications.scheduleNotificationAsync({
      identifier: `${PREFIX}${n.kind}:${n.id}`,
      content: over
        ? { title: plain(t("overrunSub", { title: n.title })), body: t("overrunQ"), sound: soundOf("reminder"), categoryIdentifier: OVER_CAT, data: { id: n.id } }
        : { title: plain(n.title), body: t("startFirst"), sound: soundOf("reminder"), categoryIdentifier: START_CAT, data: { id: n.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, ...(Platform.OS === "android" ? { channelId: "zen-reminder" } : {}) },
    });
  }
}

/** Today's blocks that ended unticked past the grace, earliest first: what the Android toast asks about when the app opens (iOS has the notification). */
export const overdue = (tasks: Task[], now: number): Task[] => {
  const day = new Date(now).setHours(0, 0, 0, 0);
  return tasks.filter((x) => !x.doneAt && !x.deletedAt && !x.fixed && x.end !== undefined && x.end >= day && x.end + GRACE <= now).sort((a, b) => a.end! - b.end!);
};

/** A button, as the app acts on it: Để sau moves the task to the next part of a day, Xong ticks it. Bắt đầu only opens the app, which starts the block (the now card). */
export function nudgeAction(id: string, action: NudgeAction, now = Date.now()) {
  if (action === "done") return apply([{ op: "done", target: id }], now);
  if (action === "later") {
    const c = laterChoices(now)[0];
    return c ? moveToDay(id, c.day, now, c.part) : Promise.resolve(undefined);
  }
  return Promise.resolve(undefined);
}
