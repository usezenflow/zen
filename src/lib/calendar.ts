import * as Calendar from "expo-calendar";
import { Platform } from "react-native";
import type { Busy } from "../planner";
import type { Task } from "./types";

const NAME = "Zen";
let own: Promise<Calendar.ExpoCalendar | undefined> | undefined;

async function granted(): Promise<boolean> {
  try {
    return (await Calendar.requestCalendarPermissions()).granted;
  } catch {
    return false;
  }
}

async function ownCalendar() {
  return (own ??= (async () => {
    if (!(await granted())) return undefined;
    const all = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const found = all.find((c) => c.title === NAME);
    if (found) return found;
    const src = Platform.OS === "ios" ? Calendar.getDefaultCalendarSync().source : { isLocalAccount: true, name: NAME, type: Calendar.SourceType.LOCAL };
    return Calendar.createCalendar({ title: NAME, color: "#F59E0B", source: src as any, name: NAME, ownerAccount: "zen", accessLevel: Calendar.CalendarAccessLevel.OWNER });
  })().catch(() => {
    own = undefined;
    return undefined;
  }));
}

/** Timed events of every device calendar except Zen's own. Empty when access is denied. */
export async function readBusy(from: number, to: number): Promise<Busy[]> {
  try {
    if (!(await granted())) return [];
    const mine = await ownCalendar();
    const cals = (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).filter((c) => c.id !== mine?.id);
    if (!cals.length) return [];
    const evs = await Calendar.listEvents(cals, new Date(from), new Date(to));
    return evs.filter((e) => !e.allDay).map((e) => ({ start: new Date(e.startDate).getTime(), end: new Date(e.endDate).getTime() }));
  } catch {
    return [];
  }
}

/** Mirrors placed tasks into the Zen calendar. Returns changed calendarEventId by task id (null = removed). */
export async function syncCalendar(tasks: Task[]): Promise<Record<string, string | null>> {
  const cal = await ownCalendar();
  if (!cal) return {};
  const out: Record<string, string | null> = {};
  for (const t of tasks) {
    const live = !t.doneAt && !t.deletedAt && t.start !== undefined && t.end !== undefined;
    const children = tasks.some((c) => c.parentId === t.id);
    try {
      if (t.calendarEventId && (!live || children)) {
        await Calendar.ExpoCalendarEvent.get(t.calendarEventId).then((e) => e.delete());
        out[t.id] = null;
      } else if (live && !children) {
        const details = { title: t.title, startDate: new Date(t.start!), endDate: new Date(t.end!), alarms: [{ relativeOffset: -30 }] };
        if (t.calendarEventId) {
          const e = await Calendar.ExpoCalendarEvent.get(t.calendarEventId).catch(() => undefined);
          if (e) {
            if (new Date(e.startDate).getTime() !== t.start || new Date(e.endDate).getTime() !== t.end || e.title !== t.title) await e.update(details);
            continue;
          }
        }
        out[t.id] = (await cal.createEvent(details)).id;
      }
    } catch {
      // one bad event must not stop the rest
    }
  }
  return out;
}
