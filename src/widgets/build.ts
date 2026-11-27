// Relative imports: vitest has no "@/" alias.
import { addDays, hhmm, mondayOf, short, shown, startOfDay, weekday } from "../components/cal";
import { artOf } from "../lib/art";
import { t } from "../lib/i18n";
import type { Task } from "../lib/types";
import { when } from "../lib/when";
import { typeOf } from "../planner/policy";
import { pickNow } from "../lib/now";
import type { ArtType, WidgetData, WidgetName, WRow } from "./data";
// The widget art files exist for the base types only: a prep shows the art of the exam or assignment it prepares for.
// shortcut: exam_prep and assignment_prep reuse exam and assignment art, add their own files (zen_art_*) to lose this, when the widget art set grows.
const widgetArt = (t: Parameters<typeof artOf>[0]): ArtType => { const a = artOf(t); return a === "exam_prep" ? "exam" : a === "assignment_prep" ? "assignment" : a as ArtType; };

const MIN = 60_000, DAY = 86_400_000, ROWS = 3;
const url = (id: string) => `zen:///task/${encodeURIComponent(id)}`; // a sitting id holds "#", a fragment if left bare

// A timeline calls widgetData ~150 times on one task list; shown() and its sort ran ~10 times per call over every row (seconds on Hermes).
const memo = new WeakMap<Task[], Task[]>();
const sorted = (tasks: Task[]) => { let s = memo.get(tasks); if (!s) memo.set(tasks, (s = shown(tasks).sort((a, b) => a.start! - b.start!))); return s; };
// onDay over the sorted shown list: same rows, same order.
const onDay = (sh: Task[], day: number) => { const e = addDays(day, 1); return sh.filter((x) => x.start! < e && x.end! > day); };

/** Widget props at time `now`; pure so a timeline can be built from future instants. */
export function widgetData(tasks: Task[], now: number, art: WidgetData["art"] = "", ticked: string[] = []): WidgetData {
  const day = startOfDay(now), d = new Date(now);
  const sh = sorted(tasks);
  const today = onDay(sh, day);
  const nx = pickNow(tasks, now); // the card's pick (apply.ts re-exports it); unscheduled picks have no clock to show
  const nextToday = nx && nx.start !== undefined && nx.start < addDays(day, 1) ? nx : undefined;
  let next: WidgetData["next"];
  if (nextToday) {
    // widgets.html at 14:20, next at 14:30: "10p / đến 14:30". Running, it counts to the end; upcoming, to the start.
    const s = nextToday.start!, e = nextToday.end!, going = s <= now, to = going ? e : s;
    const mins = Math.max(1, Math.round((to - now) / MIN)), left = t("nMin", { n: mins });
    next = {
      id: nextToday.id, title: nextToday.title, type: widgetArt(nextToday), label: t("nextUp"),
      big: left, small: t("until", { time: hhmm(to) }), mins: `${mins}′`, at: hhmm(s),
      // Running: the share done. Upcoming: the last half hour drains to the start (10 min left ≈ the mockup's 35%).
      fill: going ? Math.min(1, (now - s) / (e - s)) : Math.min(1, (s - now) / (30 * MIN)),
      rect: `${hhmm(s)}, còn ${left}`, left: `còn ${left}`, url: url(nextToday.id),
    };
  }
  const toRow = (x: Task): WRow => {
    const kind = typeOf(x);
    return { id: x.id, title: x.title, type: widgetArt(x), time: hhmm(x.start!), check: ["plan", "assignment", "exam_prep", "assignment_prep"].includes(kind), done: ticked.includes(x.id), url: url(x.id) };
  };
  // Every layout lists three rows at most; a day of daily series once sent twelve per entry and the timeline outgrew the widget (skeletons).
  const rows = today.filter((x) => x.id !== nextToday?.id && x.end! > now).slice(0, ROWS).map(toRow);
  let aheadDay = 0, ahead: Task[] = [];
  for (let i = 1; i <= 7 && !ahead.length; i++) { aheadDay = addDays(day, i); ahead = onDay(sh, aheadDay); }
  // A quiet week: reach to the first day past it that has anything, so the widget never shows a blank half.
  const far = ahead.length ? undefined : sh.find((x) => x.start! >= addDays(day, 8));
  if (far) { aheadDay = startOfDay(far.start!); ahead = onDay(sh, aheadDay); }
  const tm = ahead[0];
  // Next-up to top the medium list up to three: what starts after the day it shows (today while rows remain, else the ahead day).
  const after = addDays(rows.length ? day : aheadDay || day, 1);
  const listed = rows.length || Math.min(ROWS, ahead.length); // the layout lists today's rows, else the ahead day's
  const more = sh.filter((x) => x.start! >= after).slice(0, ROWS - listed)
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
 *  now, every 15 min to 6h, every 30 to midnight, hourly through tomorrow, each start/end, and both midnights (~55 entries). */
export function instants(tasks: Task[], now: number): number[] {
  const six = now + 6 * 3600_000, mid = addDays(startOfDay(now), 1), end = addDays(mid, 1), set = new Set<number>([now, mid, end]);
  for (let x = Math.ceil(now / (15 * MIN)) * 15 * MIN; x < end; x += (x < six ? 15 : x < mid ? 30 : 60) * MIN) set.add(x);
  // Only what the widgets can show: deleted/done rows (every reschedule leaves some) once added hundreds of entries and the widget went to skeleton.
  for (const k of sorted(tasks)) for (const v of [k.start, k.end]) if (v !== undefined && v > now && v <= end) set.add(v);
  return [...set].sort((a, b) => a - b);
}

// The fields each widget layout reads. Bundled asset catalogs / drawables serve art directly, so `art` paths no longer ride on entries.
export const USES: Record<WidgetName, (keyof WidgetData)[]> = {
  ZenTalk: ["listen"],
  ZenScan: [],
  ZenExam: ["exam", "home", "short"],
  ZenLock: ["exam", "home", "next", "short", "tomorrow"],
  ZenNext: ["home", "next", "short", "tomorrow"],
  ZenToday: ["ahead", "aheadCount", "aheadHead", "count", "dayName", "doneCount", "exam", "home", "listen", "more", "next", "rows", "ticked"],
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
