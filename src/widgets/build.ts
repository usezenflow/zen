// Relative imports: vitest has no "@/" alias.
import { addDays, hhmm, mondayOf, onDay, short, shown, startOfDay, weekday } from "../components/cal";
import { t } from "../lib/i18n";
import type { Task } from "../lib/types";
import { when } from "../lib/when";
import { typeOf } from "../planner/policy";
import type { ArtType, WidgetData, WidgetName, WRow } from "./data";

const MIN = 60_000, DAY = 86_400_000, ROWS = 3;
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
    // widgets.html at 14:20, next at 14:30: "10p / đến 14:30". Running, it counts to the end; upcoming, to the start.
    const s = nextToday.start!, e = nextToday.end!, going = s <= now, to = going ? e : s;
    const mins = Math.max(1, Math.round((to - now) / MIN)), left = t("nMin", { n: mins });
    next = {
      id: nextToday.id, title: nextToday.title, type: typeOf(nextToday) as ArtType, label: t("nextUp"),
      big: left, small: t("until", { time: hhmm(to) }), mins: `${mins}′`, at: hhmm(s),
      // Running: the share done. Upcoming: the last half hour drains to the start (10 min left ≈ the mockup's 35%).
      fill: going ? Math.min(1, (now - s) / (e - s)) : Math.min(1, (s - now) / (30 * MIN)),
      rect: `${hhmm(s)}, còn ${left}`, left: `còn ${left}`, url: url(nextToday.id),
    };
  }
  const toRow = (x: Task): WRow => {
    const type = typeOf(x) as ArtType;
    return { id: x.id, title: x.title, type, time: hhmm(x.start!), check: type === "plan" || type === "assignment", done: ticked.includes(x.id), url: url(x.id) };
  };
  // Every layout lists three rows at most; a day of daily series once sent twelve per entry and the timeline outgrew the widget (skeletons).
  const rows = today.filter((x) => x.id !== nextToday?.id && x.end! > now).slice(0, ROWS).map(toRow);
  let aheadDay = 0, ahead: Task[] = [];
  for (let i = 1; i <= 7 && !ahead.length; i++) { aheadDay = addDays(day, i); ahead = onDay(tasks, aheadDay); }
  // A quiet week: reach to the first day past it that has anything, so the widget never shows a blank half.
  const far = ahead.length ? undefined : shown(tasks).filter((x) => x.start! >= addDays(day, 8)).sort((a, b) => a.start! - b.start!)[0];
  if (far) { aheadDay = startOfDay(far.start!); ahead = onDay(tasks, aheadDay); }
  const tm = ahead[0];
  // Next-up to top the medium list up to three: what starts after the day it shows (today while rows remain, else the ahead day).
  const after = addDays(rows.length ? day : aheadDay || day, 1);
  const listed = rows.length || Math.min(ROWS, ahead.length); // the layout lists today's rows, else the ahead day's
  const more = sh.filter((x) => x.start! >= after).sort((a, b) => a.start! - b.start!).slice(0, ROWS - listed)
    .map((x) => ({ ...toRow(x), time: upTag(x.start!, now) }));
  const doneN = tasks.filter((x) => x.doneAt && !x.deletedAt && x.start !== undefined && x.start >= day && x.start < addDays(day, 1)).length;
  const ex = tasks.filter((x) => typeOf(x) === "exam" && !x.doneAt && !x.deletedAt && x.start !== undefined && x.start > now).sort((a, b) => a.start! - b.start!)[0];
  const exDays = ex && Math.round((startOfDay(ex.start!) - day) / DAY);
  return {
    weekday: weekday(now), date: `${d.getDate()}/${d.getMonth() + 1}`, short: `${short[(d.getDay() + 6) % 7]} ${d.getDate()}`,
    summary: summary(today),
    count: brief(today), // medium "5 việc" next to large "5 việc, 1 tiết học"
    next, rows, doneLabel: doneN ? `Xong (${doneN})` : "",
    tomorrow: tm ? `${dayTag(tm.start!, now)}: ${tm.title} ${hhmm(tm.start!)}` : "",
    ahead: rows.length ? [] : ahead.slice(0, ROWS).map(toRow), // shown only once today is empty
    more,
    // The medium head fits ~21 characters: past this week the short date ("T4 2/12"), and one figure for the count.
    aheadHead: !ahead.length ? "" : aheadDay === addDays(day, 1) ? "Mai" : far ? dayTag(aheadDay, now) : weekday(aheadDay),
    aheadCount: ahead.length ? brief(ahead) : "",
    doneCount: doneN ? `${t("nTasks", { n: doneN })} xong` : "",
    dayName: `${weekday(now)} ${d.getDate()}`,
    exam: ex && {
      id: ex.id, title: ex.title.replace(/^Thi\s+/i, ""), big: exDays! < 1 ? hhmm(ex.start!) : `${exDays} ngày`, small: when(ex.start!, now),
      // Four weeks out is empty: 11 days reads as the mockup's 60%.
      fill: Math.max(0, Math.min(1, 1 - exDays! / 28)),
      n: exDays! < 1 ? hhmm(ex.start!) : `${exDays}`, unit: exDays! < 1 ? "hôm nay" : "ngày nữa", inline: `Thi ${abbr(ex.title.replace(/^Thi\s+/i, ""))} còn ${exDays} ngày`, url: url(ex.id),
    },
    art, ticked, home: "zen:///", listen: "zen:///?listen=1",
  };
}

/** "Mai" tomorrow, "T6" later this Monday-started week, "T6 27/11" past it. */
function dayTag(ms: number, now: number): string {
  const d = new Date(ms), tag = short[(d.getDay() + 6) % 7];
  if (startOfDay(ms) === addDays(startOfDay(now), 1)) return "Mai";
  return mondayOf(ms) === mondayOf(now) ? tag : `${tag} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** "2 việc, 1 tiết học": classes counted apart; "0 việc" only for a day with neither. */
function summary(day: Task[]): string {
  const lec = day.filter((x) => typeOf(x) === "lecture").length, n = day.length - lec;
  return [n || !lec ? t("nTasks", { n }) : "", lec ? t("nLectures", { n: lec }) : ""].filter(Boolean).join(", ");
}

/** A next-up row's time column, narrow enough for the medium list: "Mai 07:00", "T4 22:00" this week, just "27/11" past it. */
function upTag(ms: number, now: number): string {
  const d = new Date(ms), tag = dayTag(ms, now);
  return tag.includes("/") ? `${d.getDate()}/${d.getMonth() + 1}` : `${tag} ${hhmm(ms)}`;
}

/** One figure for the medium head however packed the day: "12 việc", or "3 tiết học" on a classes-only day. */
function brief(day: Task[]): string {
  const lec = day.filter((x) => typeOf(x) === "lecture").length, n = day.length - lec;
  return n || !lec ? t("nTasks", { n }) : t("nLectures", { n: lec });
}

/** Student short form for the lock line: "Giải tích 2" → "GT2", "Cơ sở dữ liệu" → "CSDL"; one word stays whole. */
export function abbr(title: string): string {
  const w = title.trim().split(/\s+/).filter(Boolean);
  return w.length < 2 ? title.trim() : w.map((x) => (/^\d+$/.test(x) ? x : x[0].toUpperCase())).join("");
}

/** Instants where the widgets change, through the end of tomorrow so an unopened app never leaves yesterday on screen:
 *  now, every 5 minutes for 6 hours, every 30 to midnight, hourly through tomorrow, each start/end, and both midnights (about 140 entries). */
export function instants(tasks: Task[], now: number): number[] {
  const near = now + 6 * 3600_000, mid = addDays(startOfDay(now), 1), end = addDays(mid, 1), set = new Set<number>([now, mid, end]);
  for (let x = Math.ceil(now / (5 * MIN)) * 5 * MIN; x < end; x += (x < near ? 5 : x < mid ? 30 : 60) * MIN) set.add(x);
  for (const k of tasks) for (const v of [k.start, k.end]) if (v !== undefined && v > now && v <= end) set.add(v);
  return [...set].sort((a, b) => a - b);
}

// The fields each iOS layout reads. Six full copies of a ~140-entry timeline came near the 4 MB app-group defaults limit and the
// widget extension's memory cap; past either the widget shows only its placeholder skeleton.
export const USES: Record<WidgetName, (keyof WidgetData)[]> = {
  ZenTalk: ["listen"],
  ZenScan: [],
  ZenExam: ["art", "exam", "home", "short"],
  ZenLock: ["exam", "home", "next", "short", "tomorrow"],
  ZenNext: ["art", "home", "next", "short", "tomorrow"],
  ZenToday: ["ahead", "aheadCount", "aheadHead", "art", "count", "dayName", "doneCount", "exam", "home", "listen", "more", "next", "rows", "ticked"],
};
/** A widget's own timeline: only its fields, and an entry only where they change (Talk and Scan keep one). */
export function slim(tl: { date: Date; props: WidgetData }[], keys: (keyof WidgetData)[]) {
  let last = "";
  return tl.flatMap(({ date, props }) => {
    const p = Object.fromEntries(keys.map((k) => [k, props[k]])), s = JSON.stringify(p);
    if (s === last) return [];
    last = s;
    return [{ date, props: p as unknown as WidgetData }];
  });
}
