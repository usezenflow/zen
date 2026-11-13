import * as Calendar from "expo-calendar";
import type { Busy } from "../planner";
import { allDayBusy } from "./busy";

const DAY = 86400_000;

const NAME = "Zen"; // the calendar older builds mirrored tasks into; never read back as busy

async function granted(): Promise<boolean> {
  try {
    return (await Calendar.requestCalendarPermissions()).granted;
  } catch {
    return false;
  }
}

const others = async () => (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).filter((c) => c.title !== NAME);

/** Once: deletes the Zen calendar older builds wrote to, so stale task copies don't linger. Never prompts. */
export async function dropOldCalendar(): Promise<boolean> {
  try {
    if (!(await Calendar.getCalendarPermissions()).granted) return false;
    for (const c of await Calendar.getCalendars(Calendar.EntityTypes.EVENT)) if (c.title === NAME && c.allowsModifications) await c.delete();
    return true;
  } catch {
    return false;
  }
}

/** Events (all-day ones block the whole local day) of every device calendar except the old Zen one. Empty when access is denied. */
export async function readBusy(from: number, to: number): Promise<Busy[]> {
  try {
    if (!(await granted())) return [];
    const cals = await others();
    if (!cals.length) return [];
    const evs = await Calendar.listEvents(cals, new Date(from), new Date(to));
    return evs.map((e) => {
      const [start, end] = [new Date(e.startDate).getTime(), new Date(e.endDate).getTime()];
      return e.allDay ? allDayBusy(start, end) : { start, end };
    });
  } catch {
    return [];
  }
}

/** Phone-calendar all-day events (holidays such as Tết included) per local UTC+7 day start; none without permission. */
export async function allDay(from: number, to: number): Promise<{ day: number; title: string }[]> {
  try {
    if (!(await granted())) return [];
    const cals = await others();
    if (!cals.length) return [];
    const out: { day: number; title: string }[] = [];
    for (const e of await Calendar.listEvents(cals, new Date(from), new Date(to))) {
      if (!e.allDay) continue;
      const b = allDayBusy(new Date(e.startDate).getTime(), new Date(e.endDate).getTime());
      for (let d = b.start; d < b.end; d += DAY) if (d >= from - DAY && d < to) out.push({ day: d, title: e.title });
    }
    return out;
  } catch {
    return [];
  }
}
