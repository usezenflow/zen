import { StyleSheet } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { Week } from "./week";
import { mondayOf, short } from "./cal";
import { at, DAY, HOUR, lecture, MIN, NOW, task, TODAY } from "../../test/factories";
import { plain, t } from "@/lib/i18n";
import { when } from "@/lib/when";
import type { Move, Rule } from "@/lib/types";

// The pan is driven by calling its config: the gesture hook needs native code (and `isSharedValue` the reanimated mock lacks).
type Pan = { onDeactivate: (e: { translationX: number; velocityX: number }) => void };
const pans: Pan[] = [];
jest.mock("react-native-gesture-handler", () => ({
  ...jest.requireActual("react-native-gesture-handler"),
  usePanGesture: (c: Pan) => { pans.push(c); return c; },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

const MON = mondayOf(NOW); // Mon 16 Nov 2026
const rule = (over: Partial<Rule> = {}): Rule => ({ id: "r1", text: "Tối để trống", days: [], from: 19 * 60, to: 21 * 60, kinds: [], at: NOW, ...over });
type El = { type: unknown; props: Record<string, unknown> & { style?: unknown }; children: (El | string)[] };
const flat = (x: El) => (StyleSheet.flatten(x.props.style as never) ?? {}) as Record<string, unknown>;
const all = (e: El, ok: (x: El) => boolean): El[] => [...(ok(e) ? [e] : []), ...e.children.flatMap((c) => (typeof c === "string" ? [] : all(c, ok)))];
const root = () => screen.root as unknown as El;

const show = async (over: Partial<Parameters<typeof Week>[0]> = {}, width = 350) => {
  const p = { tasks: [], hols: new Map(), monday: MON, selected: TODAY, now: NOW, onSelect: jest.fn(), onStep: jest.fn(), ...over };
  await render(<Week {...p} />);
  if (width) await fireEvent(screen.getByTestId("wkGrid"), "layout", { nativeEvent: { layout: { width } } });
  return p;
};
/** Positioned blocks in the overlay (tasks and rule windows), by column left. */
const blocks = () => all(root(), (x) => flat(x).position === "absolute" && flat(x).borderRadius === 8 && flat(x).overflow === "hidden"); // the +n chip is not clipped
const pill = (n: string) => screen.getByText(n).parent as unknown as El;
const dashed = () => all(root(), (x) => flat(x).borderStyle === "dashed");

it("renders 7 day pills Monday first; today is filled, the selected day ringed", async () => {
  await show({ selected: TODAY + DAY });
  short.forEach((d) => expect(screen.getByText(d)).toBeTruthy());
  ["16", "17", "18", "19", "20", "21", "22"].forEach((n) => expect(screen.getByText(n)).toBeTruthy());
  expect(flat(pill("17")).backgroundColor).toBeTruthy();
  expect(flat(pill("18")).borderColor).toBe(flat(pill("17")).borderColor); // ring in ink, like today's fill
  expect(flat(pill("19")).borderColor).not.toBe(flat(pill("18")).borderColor);
});

it("pressing a day selects it", async () => {
  const p = await show();
  await fireEvent.press(screen.getByText("20"));
  expect(p.onSelect).toHaveBeenCalledWith(MON + 4 * DAY);
});

describe("swipe", () => {
  it.each([[-80, 0, 1], [80, 0, -1], [-10, -900, 1], [10, 900, -1]])("dx %i, vx %i steps %i with a tick", async (translationX, velocityX, d) => {
    const p = await show();
    pans.at(-1)!.onDeactivate({ translationX, velocityX });
    await waitFor(() => expect(p.onStep).toHaveBeenCalledWith(d));
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it.each([[-50, 0], [40, 600]])("dx %i, vx %i springs back without a step", async (translationX, velocityX) => {
    const p = await show();
    pans.at(-1)!.onDeactivate({ translationX, velocityX });
    await new Promise((r) => setTimeout(r, 0));
    expect(p.onStep).not.toHaveBeenCalled();
  });
});

it("unbriefed moves: the pill sits above the grid, and the moved block carries the seal dot", async () => {
  const onMoves = jest.fn();
  const moved: Move = { id: "t1", title: "Ôn Giải tích", from: at(9), to: at(14), at: NOW };
  await show({ tasks: [task({ id: "t1" })], moves: ["t1"], brief: [moved], onMoves });
  expect(screen.getByText(new RegExp(plain(t("briefMove", { title: "Ôn Giải tích", when: when(at(14), NOW) }))))).toBeTruthy();
  expect(all(root(), (x) => flat(x).width === 7 && flat(x).height === 7)).toHaveLength(1); // the dot, 7px
  await fireEvent.press(screen.getByLabelText(t("briefOpen")));
  expect(onMoves).toHaveBeenCalledTimes(1);
});

it("no unbriefed moves: no pill; a block not in the unseen set has no dot", async () => {
  await show({ tasks: [task({ id: "t1" })], moves: [], brief: [] });
  expect(screen.queryByLabelText(t("briefOpen"))).toBeNull();
  expect(all(root(), (x) => flat(x).width === 7 && flat(x).height === 7)).toHaveLength(0);
});

it("a whole empty week shows a dashed slot per day and no blocks", async () => {
  await show();
  expect(dashed()).toHaveLength(7);
  expect(blocks()).toHaveLength(0);
});

it("the overlay waits for the grid's layout", async () => {
  await show({ tasks: [task()] }, 0);
  expect(blocks()).toHaveLength(0);
  await fireEvent(screen.getByTestId("wkGrid"), "layout", { nativeEvent: { layout: { width: 350 } } });
  expect(blocks()).toHaveLength(1);
});

it("a holiday column is striped with its label and draws no blocks", async () => {
  const hol = MON + 4 * DAY;
  await show({ hols: new Map([[hol, "Tết mùng 3"]]), tasks: [task({ start: hol + 9 * HOUR, end: hol + 10 * HOUR }), task()] });
  expect(screen.getByText("Tết")).toBeTruthy();
  expect(screen.getByText("mùng 3")).toBeTruthy();
  expect(blocks()).toHaveLength(1); // only today's task
  expect(dashed()).toHaveLength(0); // the week is not empty
});

it.each([[10, 24], [60, 27], [180, 52]])("a %i-minute task is %ipx tall (clamped 24–52)", async (mins, h) => {
  await show({ tasks: [task({ start: TODAY + 9 * HOUR, end: TODAY + 9 * HOUR + mins * MIN })] });
  expect(flat(blocks()[0]).height).toBe(h);
});

it("more than eight blocks in a day keep seven and a +n chip", async () => {
  const tasks = Array.from({ length: 9 }, (_, i) => task({ start: TODAY + (8 + i) * HOUR, end: TODAY + (9 + i) * HOUR }));
  await show({ tasks });
  expect(screen.getByText("+2")).toBeTruthy();
  expect(blocks()).toHaveLength(7);
});

it("eight blocks fit without a chip, compressed into the column", async () => {
  const tasks = Array.from({ length: 8 }, (_, i) => task({ start: TODAY + (8 + i) * HOUR, end: TODAY + (9 + i) * HOUR }));
  await show({ tasks });
  expect(screen.queryByText(/^\+\d/)).toBeNull();
  expect(blocks().every((b) => (flat(b).height as number) >= 16)).toBe(true);
});

it("a kept-free rule window is a striped block labelled with the rule, in time order with the tasks", async () => {
  await show({ tasks: [lecture()], rules: [rule({ days: [2] })] }); // Tuesday only
  const labelled = all(root(), (x) => x.props.accessibilityLabel === "Tối để trống");
  expect(labelled).toHaveLength(1);
  const today = blocks().filter((b) => flat(b).left === flat(blocks()[0]).left);
  expect(today.map((b) => b.props.accessibilityLabel)).toEqual([undefined, "Tối để trống"]); // 07:00 lecture, then 19:00 window
});

it("a kept rule in an otherwise empty week is still drawn, not the dashed empty week", async () => {
  await show({ tasks: [], rules: [rule({ days: [2] })] });
  expect(all(root(), (x) => x.props.accessibilityLabel === "Tối để trống")).toHaveLength(1);
});

it("kind-only and overnight rules draw no window", async () => {
  await show({ tasks: [task()], rules: [rule({ kinds: ["exercise"] }), rule({ id: "r2", from: 22 * 60, to: 2 * 60 })] });
  expect(all(root(), (x) => typeof x.props.accessibilityLabel === "string" && x.props.accessibilityLabel.startsWith("Tối"))).toHaveLength(0);
});

it("tasks without a time, done or deleted are not drawn (no NaN heights)", async () => {
  await show({ tasks: [task(), task({ start: undefined, end: undefined }), task({ doneAt: NOW }), task({ deletedAt: NOW })] });
  expect(blocks()).toHaveLength(1);
  expect(blocks().every((b) => Number.isFinite(flat(b).height as number) && Number.isFinite(flat(b).top as number))).toBe(true);
});
