import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { DONE, type WidgetData, type WidgetName } from "@/widgets/data";
import { USES, instants, slim, widgetData } from "@/widgets/build";
import { swipeDone } from "./apply";
import { allTasks } from "./store";

// A binary built before expo-widgets was added has no native module; importing it would crash the app, so load lazily.
const has = Platform.OS !== "web" && !!requireOptionalNativeModule("ExpoWidgets");
const W: typeof import("expo-widgets") | undefined = has ? require("expo-widgets") : undefined; // eslint-disable-line @typescript-eslint/no-require-imports
const widgets: typeof import("@/widgets").widgets = has ? require("@/widgets").widgets : {}; // eslint-disable-line @typescript-eslint/no-require-imports

let timer: ReturnType<typeof setTimeout> | undefined, onTicked: (() => void) | undefined;
// Pushes and tick reads run one at a time: two at once would both apply the same tick, or one push would wipe what the other read.
let chain: Promise<unknown> = Promise.resolve();
const serial = (fn: () => Promise<unknown>) => (chain = chain.then(fn).catch(() => {}));
// Skip redundant reloadTimelines/updateSnapshot calls: each iOS reload invalidates the widget and burns extension budget.
const sent = new Map<string, string>();

/** Rebuilds every widget now (the background task, which can't wait on a debounce). */
export const pushWidgetsNow = () => (W ? serial(push) : Promise.resolve());

/** Rebuilds every widget from the store; debounced so a burst of writes pushes once. */
export function pushWidgets() {
  if (!W) return;
  clearTimeout(timer);
  timer = setTimeout(() => void serial(push), 1500);
}

/** Applies ticks made on the widget that the app has not seen; true when any was new. A push writes `ticked: []`, so it reads these first.
 *  shortcut: iOS only. Android keeps them in native prefs with no JS getter (live taps still arrive as events); a native getter in the expo-widgets patch would close it. */
async function drain(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  let tl: Awaited<ReturnType<NonNullable<typeof widgets.ZenToday>["getTimeline"]>> | undefined;
  try { tl = await widgets.ZenToday?.getTimeline(); } catch { return false; }
  const ids = new Set(tl?.flatMap((x) => x.props?.ticked ?? []) ?? []);
  if (!ids.size) return false;
  const live = new Set((await allTasks()).filter((x) => !x.doneAt && !x.deletedAt).map((x) => x.id));
  let any = false;
  for (const id of ids) if (live.has(id)) { await swipeDone(id); any = true; }
  return any;
}

// The task set the last full push was built from: an unchanged one (and no tick) repeats the timeline already sent.
let lastTasks = "";
async function push() {
  let any = false;
  try { any = await drain(); } catch { return; } // swipeDone failed: keep unapplied ticks in the timeline for the next try
  if (any) { sent.delete("ZenToday"); onTicked?.(); }
  const tasks = await allTasks();
  const now = Date.now();
  const tasksSig = JSON.stringify([new Date(now).toDateString(), tasks.map(({ vec: _v, ...x }) => x)]);
  if (!any && tasksSig === lastTasks) return;
  const at = instants(tasks, now);
  const full = at.map((t) => ({ date: new Date(t), props: widgetData(tasks, t, "") })); // built once
  if (Platform.OS === "ios") { // iOS redraws on its own clock from a timeline
    for (const [name, w] of Object.entries(widgets) as [WidgetName, NonNullable<(typeof widgets)[WidgetName]>][]) {
      const sub = slim(full, USES[name]);
      // Ignore sub-minute jitter on entry 0's date when entry 0's props and all future entries are unchanged.
      const sig = JSON.stringify(sub.map((e, i) => (i ? [e.date.getTime(), e.props] : e.props)));
      if (sent.get(name) === sig) continue;
      w.updateTimeline(sub);
      sent.set(name, sig);
    }
    lastTasks = tasksSig;
    return;
  }
  // Android shows one snapshot: slimmed per widget so static/simple widgets never store or bridge a 75-entry timeline.
  for (const [name, w] of Object.entries(widgets) as [WidgetName, NonNullable<(typeof widgets)[WidgetName]>][]) {
    const sub = slim(full, USES[name]);
    const tl = sub.length > 1 ? sub.map(({ date, props }) => { const { ticked: _t, ...p } = props; return { at: date.getTime(), p }; }) : undefined;
    const snap = { ...(sub[0]?.props ?? ({} as WidgetData)), ticked: [], ...(tl ? { tl } : {}) } as WidgetData;
    const sig = JSON.stringify(sub.map((e, i) => (i ? [e.date.getTime(), e.props] : e.props)));
    if (sent.get(name) === sig) continue;
    w.updateSnapshot(snap);
    sent.set(name, sig);
  }
  lastTasks = tasksSig;
}

/** Applies ticks made on the widget: live taps now, and on iOS the ones made while the app was closed. */
export function listenWidgets(onTick: () => void) {
  if (!W) return () => {};
  onTicked = onTick;
  const sub = W.addUserInteractionListener((e) => {
    if (e.target.startsWith(DONE)) void swipeDone(e.target.slice(DONE.length)).then(onTick).catch(() => {});
  });
  void serial(async () => { if (await drain()) onTick(); });
  return () => { sub.remove(); if (onTicked === onTick) onTicked = undefined; };
}
