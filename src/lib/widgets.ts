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

let timer: ReturnType<typeof setTimeout> | undefined;
/** Rebuilds every widget from the store; debounced so a burst of writes pushes once. */
export function pushWidgets() {
  if (!W?.widgetsDirectory) return;
  clearTimeout(timer);
  timer = setTimeout(() => void push().catch(() => {}), 400);
}

async function push() {
  const [tasks, a] = await Promise.all([allTasks(), copyArt()]);
  const now = Date.now();
  for (const w of Object.values(widgets)) {
    // iOS redraws on its own clock from a timeline; Android only shows the last snapshot.
    if (Platform.OS === "ios") w.updateTimeline(instants(tasks, now).map((t) => ({ date: new Date(t), props: widgetData(tasks, t, a) })));
    else w.updateSnapshot(widgetData(tasks, now, a));
  }
}

/** Applies ticks made on the widget: live taps now, and on iOS the ones made while the app was closed. */
export function listenWidgets(onTick: () => void) {
  if (!W) return () => {};
  const sub = W.addUserInteractionListener((e) => {
    if (e.target.startsWith(DONE)) void swipeDone(e.target.slice(DONE.length)).then(onTick);
  });
  void (async () => {
    const tl = Platform.OS === "ios" ? await widgets.ZenToday?.getTimeline() : undefined;
    const ids = new Set(tl?.flatMap((x) => x.props.ticked) ?? []);
    if (!ids.size) return;
    const live = new Set((await allTasks()).filter((x) => !x.doneAt).map((x) => x.id));
    for (const id of ids) if (live.has(id)) await swipeDone(id);
    onTick();
  })().catch(() => {});
  return () => sub.remove();
}
