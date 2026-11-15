import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { DONE, type ArtType, type WidgetData } from "@/widgets/data";
import { instants, widgetData } from "@/widgets/build";
import { swipeDone } from "./apply";
import { allTasks } from "./store";

// A binary built before expo-widgets was added has no native module; importing it would crash the app, so load lazily.
const has = Platform.OS !== "web" && !!requireOptionalNativeModule("ExpoWidgets");
const W: typeof import("expo-widgets") | undefined = has ? require("expo-widgets") : undefined; // eslint-disable-line @typescript-eslint/no-require-imports
const widgets: typeof import("@/widgets").widgets = has ? require("@/widgets").widgets : {}; // eslint-disable-line @typescript-eslint/no-require-imports

const ART: Record<ArtType, { square: number; wide: number }> = {
  plan: { square: require("../../assets/widgets/plan-square.png"), wide: require("../../assets/widgets/plan-wide.png") },
  lecture: { square: require("../../assets/widgets/lecture-square.png"), wide: require("../../assets/widgets/lecture-wide.png") },
  exam: { square: require("../../assets/widgets/exam-square.png"), wide: require("../../assets/widgets/exam-wide.png") },
  assignment: { square: require("../../assets/widgets/assignment-square.png"), wide: require("../../assets/widgets/assignment-wide.png") },
  busy: { square: require("../../assets/widgets/busy-square.png"), wide: require("../../assets/widgets/busy-wide.png") },
};

let art: Promise<WidgetData["art"]> | undefined;
// Widgets can't read the app bundle, so the sand PNGs are copied once into the shared directory.
const copyArt = () =>
  (art ??= (async () => {
    const out = {} as WidgetData["art"];
    for (const [type, shapes] of Object.entries(ART) as [ArtType, { square: number; wide: number }][]) {
      const pair = {} as { square: string; wide: string };
      for (const shape of ["square", "wide"] as const) {
        const dest = new File(W!.widgetsDirectory, `${type}-${shape}.png`);
        if (!dest.exists) {
          const a = await Asset.fromModule(shapes[shape]).downloadAsync();
          new File(a.localUri!).copy(dest);
        }
        pair[shape] = dest.uri;
      }
      out[type] = pair;
    }
    return out;
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
  if (await drain().catch(() => false)) onTicked?.();
  const [tasks, a] = await Promise.all([allTasks(), copyArt()]);
  const now = Date.now();
  const at = instants(tasks, now);
  if (Platform.OS === "ios") { // iOS redraws on its own clock from a timeline
    const tl = at.map((t) => ({ date: new Date(t), props: widgetData(tasks, t, a) })); // the same for every widget: built once
    for (const w of Object.values(widgets)) w.updateTimeline(tl);
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
    if (e.target.startsWith(DONE)) void swipeDone(e.target.slice(DONE.length)).then(onTick);
  });
  void serial(async () => { if (await drain()) onTick(); });
  return () => { sub.remove(); if (onTicked === onTick) onTicked = undefined; };
}
