// Relative imports: vitest has no "@/" alias.
import { addDays, hhmm, onDay, short, shown, startOfDay, weekday } from "../components/cal";
import { t } from "../lib/i18n";
import type { Task } from "../lib/types";
import { when } from "../lib/when";
import { typeOf } from "../planner/policy";
import type { ArtType, WidgetData, WRow } from "./data";

const MIN = 60_000, DAY = 86_400_000;
const url = (id: string) => `zen:///task/${id}`;

/** Widget props at time `now`; pure so a timeline can be built from future instants. */
export function widgetData(tasks: Task[], now: number, art: WidgetData["art"], ticked: string[] = []): WidgetData {
  const day = startOfDay(now), d = new Date(now);
  const today = onDay(tasks, day);
  const lec = today.filter((x) => typeOf(x) === "lecture").length;
  const n = today.length - lec;
  const sh = shown(tasks); // same pick as apply.pickNow, without pulling sqlite into tests
  const nx = sh.find((x) => x.start! <= now && now < x.end!) ?? sh.filter((x) => x.start! > now).sort((a, b) => a.start! - b.start!)[0];
  const nextToday = nx && nx.start! < addDays(day, 1) ? nx : undefined;
  let next: WidgetData["next"];
  if (nextToday) {
    const s = nextToday.start!, e = nextToday.end!, going = s <= now;
    const mins = Math.max(1, Math.round((going ? e - now : e - s) / MIN));
    next = {
      id: nextToday.id, title: nextToday.title, type: typeOf(nextToday) as ArtType, label: t("nextUp"),
      big: going ? t("nMin", { n: mins }) : hhmm(s), small: going ? t("until", { time: hhmm(e) }) : t("nMin", { n: mins }),
      mins: `${mins}′`, at: hhmm(s), fill: going ? Math.min(1, (now - s) / (e - s)) : 0,
      rect: going ? `${hhmm(s)}, còn ${t("nMin", { n: mins })}` : `${hhmm(s)}, ${t("nMin", { n: mins })}`, left: going ? `còn ${t("nMin", { n: mins })}` : t("nMin", { n: mins }), url: url(nextToday.id),
    };
  }
  const rows: WRow[] = today.filter((x) => x.id !== nextToday?.id && x.end! > now).slice(0, 6).map((x) => {
    const type = typeOf(x) as ArtType;
    return { id: x.id, title: x.title, type, time: hhmm(x.start!), check: type === "plan" || type === "assignment", done: ticked.includes(x.id), url: url(x.id) };
  });
  const doneN = tasks.filter((x) => x.doneAt && !x.deletedAt && x.start !== undefined && x.start >= day && x.start < addDays(day, 1)).length;
  const tm = onDay(tasks, addDays(day, 1))[0];
  const ex = tasks.filter((x) => typeOf(x) === "exam" && !x.doneAt && !x.deletedAt && x.start !== undefined && x.start > now).sort((a, b) => a.start! - b.start!)[0];
  const exDays = ex && Math.round((startOfDay(ex.start!) - day) / DAY);
  return {
    weekday: weekday(now), date: `${d.getDate()} tháng ${d.getMonth() + 1}`, short: `${short[(d.getDay() + 6) % 7]} ${d.getDate()}`,
    summary: [n || !lec ? t("nTasks", { n }) : "", lec ? t("nLectures", { n: lec }) : ""].filter(Boolean).join(", "),
    count: t("nTasks", { n: today.length }),
    next, rows, doneLabel: doneN ? `Xong (${doneN})` : "",
    tomorrow: tm ? `Mai: ${tm.title} ${hhmm(tm.start!)}` : "",
    exam: ex && {
      id: ex.id, title: ex.title.replace(/^Thi\s+/i, ""), big: exDays! < 1 ? hhmm(ex.start!) : `${exDays} ngày`, small: when(ex.start!, now),
      fill: Math.max(0, Math.min(1, 1 - exDays! / 14)), inline: `${/^thi\s/i.test(ex.title) ? ex.title : `Thi ${ex.title}`} còn ${exDays} ngày`, url: url(ex.id),
    },
    art, ticked, home: "zen:///", listen: "zen:///?listen=1",
  };
}

/** Instants where the widgets change: now, every 5 minutes for 6 hours, each start/end, and midnight. */
export function instants(tasks: Task[], now: number): number[] {
  const end = now + 6 * 3600_000, set = new Set<number>([now, addDays(startOfDay(now), 1)]);
  for (let x = Math.ceil(now / (5 * MIN)) * 5 * MIN; x < end; x += 5 * MIN) set.add(x);
  for (const k of tasks) for (const v of [k.start, k.end]) if (v !== undefined && v > now && v < end) set.add(v);
  return [...set].sort((a, b) => a - b);
}
