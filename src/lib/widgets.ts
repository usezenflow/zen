import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { DONE, type ArtType, type WidgetName } from "@/widgets/data";
import { USES, instants, slim, widgetData } from "@/widgets/build";
import { swipeDone } from "./apply";
import { allTasks } from "./store";

// A binary built before expo-widgets was added has no native module; importing it would crash the app, so load lazily.
const has = Platform.OS !== "web" && !!requireOptionalNativeModule("ExpoWidgets");
const W: typeof import("expo-widgets") | undefined = has ? require("expo-widgets") : undefined; // eslint-disable-line @typescript-eslint/no-require-imports
const widgets: typeof import("@/widgets").widgets = has ? require("@/widgets").widgets : {}; // eslint-disable-line @typescript-eslint/no-require-imports

// Only the square art is drawn; `wide` never rode to a layout.
const ART: Record<ArtType, number> = {
  plan: require("../../assets/widgets/plan-square.png"),
  lecture: require("../../assets/widgets/lecture-square.png"),
  exam: require("../../assets/widgets/exam-square.png"),
  assignment: require("../../assets/widgets/assignment-square.png"),
  busy: require("../../assets/widgets/busy-square.png"),
};

let art: Promise<string> | undefined;
// Widgets can't read the app bundle, so the sand PNGs are copied once into the shared directory as `<type>.png`;
// the widgets get only that directory, not five full paths per timeline entry.
const copyArt = () =>
  (art ??= (async () => {
    let dir = "";
    for (const [type, mod] of Object.entries(ART) as [ArtType, number][]) {
      const dest = new File(W!.widgetsDirectory, `${type}.png`);
      if (!dest.exists) {
        const a = await Asset.fromModule(mod).downloadAsync();
        new File(a.localUri!).copy(dest);
      }
      dir = dest.uri.slice(0, dest.uri.lastIndexOf("/") + 1);
    }
    return dir;
  })());

let timer: ReturnType<typeof setTimeout> | undefined, onTicked: (() => void) | undefined;
// Pushes and tick reads run one at a time: two at once would both apply the same tick, or one push would wipe what the other read.
let chain: Promise<unknown> = Promise.resolve();
const serial = (fn: () => Promise<unknown>) => (chain = chain.then(fn).catch(() => {}));

/** Rebuilds every widget now (the background task, which can't wait on a debounce). */
export const pushWidgetsNow = () => (W?.widgetsDirectory ? serial(push) : Promise.resolve());

/** Rebuilds every widget from the store; debounced so a burst of writes pushes once. */
export function pushWidgets() {
  if (!W?.widgetsDirectory) return;
  clearTimeout(timer);
  timer = setTimeout(() => void serial(push), 400);
}

/** Applies ticks made on the widget that the app has not seen; true when any was new. A push writes `ticked: []`, so it reads these first.
 *  shortcut: iOS only. Android keeps them in native prefs with no JS getter (live taps still arrive as events); a native getter in the expo-widgets patch would close it. */
async function drain(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  const tl = await widgets.ZenToday?.getTimeline();
  const ids = new Set(tl?.flatMap((x) => x.props.ticked ?? []) ?? []);
  if (!ids.size) return false;
  const live = new Set((await allTasks()).filter((x) => !x.doneAt && !x.deletedAt).map((x) => x.id));
  let any = false;
  for (const id of ids) if (live.has(id)) { await swipeDone(id); any = true; }
  return any;
}

async function push() {
  let any = false;
  try { any = await drain(); } catch { return; } // the unapplied ticks stay in the timeline for the next try; a push now would wipe them
  if (any) onTicked?.();
  const [tasks, a] = await Promise.all([allTasks(), copyArt()]);
  const now = Date.now();
  const at = instants(tasks, now);
  if (Platform.OS === "ios") { // iOS redraws on its own clock from a timeline
    const tl = at.map((t) => ({ date: new Date(t), props: widgetData(tasks, t, a) })); // built once
    for (const [name, w] of Object.entries(widgets) as [WidgetName, NonNullable<(typeof widgets)[WidgetName]>][]) w.updateTimeline(slim(tl, USES[name]));
    return;
  }
  // Android shows one snapshot: it carries the timeline, the layout picks the entry due now and the patched provider redraws at the next.
  const tl = at.map((t) => { const { art: _a, ticked: _t, ...p } = widgetData(tasks, t, a); return { at: t, p }; });
  const snap = { ...widgetData(tasks, now, a), tl };
  for (const w of Object.values(widgets)) w.updateSnapshot(snap);
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
