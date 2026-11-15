import { StyleSheet } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Month } from "./month";
import { short } from "./cal";
import { ff } from "@/lib/theme";
import { at, lecture, NOW, task, TODAY, DAY } from "../../test/factories";

// The pan is driven by calling its config: the gesture hook needs native code (and `isSharedValue` the reanimated mock lacks).
const pans: { onDeactivate: (e: { translationX: number; velocityX: number }) => void }[] = [];
jest.mock("react-native-gesture-handler", () => ({
  ...jest.requireActual("react-native-gesture-handler"),
  usePanGesture: (c: (typeof pans)[number]) => { pans.push(c); return c; },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
const show = (over: Partial<Parameters<typeof Month>[0]> = {}) => {
  const p = { tasks: [], hols: new Map(), selected: TODAY, now: NOW, onSelect: jest.fn(), onStep: jest.fn(), ...over };
  return render(<Month {...p} />).then(() => p);
};
const flat = (x: { props: object }) => StyleSheet.flatten((x.props as { style?: unknown }).style as never) as Record<string, unknown>;
/** Day-number texts in grid order (weekday headers excluded). */
const cells = () => screen.getAllByText(/^\d{1,2}$/);
const circle = (n: string, i = 0) => screen.getAllByText(n)[i].parent!;
const cell = (n: string, i = 0) => circle(n, i).parent!;
type El = { type: unknown; props: { style: unknown }; children: (El | string)[] };
const all = (e: El, ok: (x: El) => boolean): El[] => [...(ok(e) ? [e] : []), ...e.children.flatMap((c) => (typeof c === "string" ? [] : all(c, ok)))];
const find = (n: string, ok: (x: El) => boolean, i = 0) => all(cell(n, i) as unknown as El, ok);
/** Type dots under a cell: 5×5 views. */
const dots = (n: string, i = 0) => find(n, (x) => flat(x)?.width === 5 && flat(x)?.height === 5, i);
const stripes = (n: string) => find(n, (x) => String(x.type).includes("Pattern"));

it("shows weekday headers and tapping a day selects its local midnight", async () => {
  const p = await show();
  short.forEach((d) => expect(screen.getByText(d)).toBeTruthy());
  await fireEvent.press(screen.getAllByText("20")[0]);
  expect(p.onSelect).toHaveBeenCalledWith(local(2026, 11, 20));
});

it("passes a swipe through as a step", async () => {
  const p = await show();
  pans.at(-1)!.onDeactivate({ translationX: -120, velocityX: 0 });
  await waitFor(() => expect(p.onStep).toHaveBeenCalledWith(1));
});

it.each([
  ["Feb 2027 (starts Monday, 28 days)", local(2027, 2, 10), 4],
  ["Oct 2026", local(2026, 10, 10), 5],
  ["Aug 2026 (starts Saturday, 31 days)", local(2026, 8, 10), 6],
  ["Nov 2026 (starts Sunday)", TODAY, 6],
])("%s has %i rows", async (_n, selected, rows) => {
  await show({ selected });
  expect(cells()).toHaveLength(rows * 7);
});

it("days outside the month are muted; the grid starts on the Monday before the 1st", async () => {
  await show();
  expect(cells()[0].props.children).toBe(26); // Mon 26 Oct
  expect(flat(screen.getAllByText("26")[0]).opacity).toBe(0.45);
  expect(flat(screen.getAllByText("26")[1]).opacity).toBe(1); // 26 Nov
});

it("today is filled and bold; another selected day gets a ring, today does not", async () => {
  await show({ selected: local(2026, 11, 20) });
  expect(flat(circle("17")).backgroundColor).toBeTruthy();
  expect(flat(screen.getByText("17")).fontFamily).toBe(ff("800"));
  expect(flat(circle("17")).borderWidth).toBeUndefined();
  expect(flat(circle("20")).borderWidth).toBe(1.5);
  await show({ selected: TODAY });
  expect(flat(circle("17")).borderWidth).toBeUndefined(); // selected == today: fill only
});

it("a holiday cell shows its first label line and stripes, no dots", async () => {
  const hol = local(2026, 11, 20);
  await show({ hols: new Map([[hol, "Ngày Nhà giáo Việt Nam"]]), tasks: [task({ start: hol + 9 * 3600_000, end: hol + 10 * 3600_000 })] });
  expect(screen.getByText("Lễ")).toBeTruthy();
  expect(dots("20")).toHaveLength(0);
  expect(stripes("20").length).toBe(1);
});

it("today never stripes, even on a holiday", async () => {
  await show({ hols: new Map([[TODAY, "Tết"]]) });
  expect(stripes("17")).toHaveLength(0);
  expect(screen.getByText("Tết")).toBeTruthy();
});

it("at most three type dots, one per type", async () => {
  const d = local(2026, 11, 19);
  const on = (h: number) => ({ start: d + h * 3600_000, end: d + (h + 1) * 3600_000 });
  await show({ tasks: [task(on(8)), task(on(9)), lecture(on(10)), task({ ...on(11), fixed: "exam" }), task({ ...on(12), deadline: d + DAY })] });
  expect(dots("19")).toHaveLength(3); // plan, lecture, exam, assignment → first three
  await show({ tasks: [task(on(8)), task(on(9))] });
  expect(dots("19")).toHaveLength(1);
});

it("done, deleted and unplaced tasks draw no dot", async () => {
  await show({ tasks: [task({ start: at(9), end: at(10), doneAt: NOW }), task({ start: at(11), end: at(12), deletedAt: NOW }), task({ start: undefined, end: undefined })] });
  expect(dots("17")).toHaveLength(0);
});
