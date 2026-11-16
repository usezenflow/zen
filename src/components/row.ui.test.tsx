import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { createGestureController } from "react-native-gesture-handler/jest-utils";
import { feedTaps } from "./outside";
import { Row, SwipeDelete, subOf } from "./row";
import { hhmm } from "./cal";
import { t } from "@/lib/i18n";
import { parse } from "@/lib/find";
import { when } from "@/lib/when";
import { useTheme } from "@/lib/theme";
import { at, DAY, HOUR, lecture, NOW, task } from "../../test/factories";

// Gesture events take RNGH's JS path: the Reanimated mock has no native event bridge.
jest.mock("react-native-gesture-handler/lib/module/handlers/gestures/reanimatedWrapper", () => ({ Reanimated: undefined, Worklets: undefined }));

const root = { wrapper: GestureHandlerRootView };
const measure = (View.prototype as unknown as { measureInWindow: jest.Mock }).measureInWindow;
beforeEach(() => { jest.clearAllMocks(); }); // haptics calls from an earlier test must not count in the next
beforeEach(() => measure.mockImplementation((cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 200, 390, 60)));
afterEach(() => measure.mockReset());

let seal = "";
const keep = (v: string) => { seal = v; };
function Seal({ on }: { on: (v: string) => void }) { on(useTheme().seal); return null; } // hands the theme out, not a write to test state

const cbs = () => ({ onToggle: jest.fn(), onTitle: jest.fn(), onTime: jest.fn(), onOpen: jest.fn() });
type Props = Partial<Parameters<typeof Row>[0]>;
const draw = async (p: Props = {}) => {
  const fns = { ...cbs(), ...p };
  await render(<><Seal on={keep} /><Row task={task()} now={NOW} {...fns} /></>, root);
  return fns as ReturnType<typeof cbs> & Props;
};
/** The row's own Tap: the outermost pressable host. */
const rowEl = () => screen.container.queryAll((n) => typeof n.props.onResponderRelease === "function")[0];
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) ?? {};
const tapAt = (x: number, y: number) => { feedTaps.onTouchStart({ nativeEvent: { pageX: x, pageY: y } } as never); feedTaps.onTouchEnd({ nativeEvent: { pageX: x, pageY: y } } as never); };

describe("subOf", () => {
  it("an exam prep: its place among its sittings, then the course", () => {
    const sibs = [1, 2, 3].map((k) => task({ id: `p${k}`, forId: "ex", parentId: "split", course: "Mẫu thiết kế", start: at(8 + k) }));
    expect(subOf(sibs[1], "plan", NOW, sibs)).toMatch(/^Buổi 2\/3 · Mẫu thiết kế$/);
    expect(subOf(sibs[1], "plan", NOW, [sibs[1]])).toBe("Mẫu thiết kế"); // one sitting: no pace
    expect(subOf(task({ forId: "ex" }), "plan", NOW)).toBeUndefined();
    expect(subOf(sibs[2], "plan", NOW, [...sibs, { ...sibs[0], id: "gone", deletedAt: NOW }])).toMatch(/^Buổi 3\/3/); // deleted ones do not count
  });
  it("a day-end due shows its day with no clock; a said clock still shows", () => {
    const nov23 = new Date(2026, 10, 23, 23, 59).getTime();
    expect(subOf(task({ deadline: nov23 }), "plan", NOW)).toBe("Hạn T2 23/11");
    expect(subOf(task({ deadline: new Date(2026, 10, 24).getTime() }), "plan", NOW)).toBe("Hạn T2 23/11"); // exact midnight after it
    expect(subOf(task({ deadline: at(23, 59) }), "plan", NOW)).toBe("Hạn hôm nay");
    expect(subOf(task({ deadline: at(17) }), "plan", NOW)).toBe("Hạn 17:00"); // same day, its clock
    expect(subOf(task({ deadline: new Date(2026, 10, 20, 14).getTime() }), "plan", NOW)).toBe("Hạn T6 14:00"); // another day in the week: day and clock
    const later = at(14) + 2 * DAY;
    expect(subOf(task({ deadline: later }), "plan", NOW)).toBe(t("due", { time: when(later, NOW) }));
  });
  it("any sitting of a split task shows its place, then its due", () => {
    const dl = new Date(2026, 10, 23, 23, 59).getTime();
    const sits = [1, 2, 3].map((k) => task({ id: `s${k}`, parentId: "split", start: at(8 + k), deadline: dl }));
    expect(subOf(sits[1], "plan", NOW, sits)).toBe("Buổi 2/3 · Hạn T2 23/11");
    expect(subOf(sits[1], "plan", NOW, [sits[1]])).toBe("Hạn T2 23/11"); // one sitting: no place
    expect(subOf(sits[2], "plan", NOW, [...sits, { ...sits[0], id: "gone", deletedAt: NOW }])).toBe("Buổi 3/3 · Hạn T2 23/11");
  });
  it("a repeat with no part of the day shows its cadence and end", () => {
    expect(subOf(task({ rrule: "FREQ=DAILY;UNTIL=20261231T235959" }), "plan", NOW)).toBe("Mỗi ngày · đến 31/12");
    expect(subOf(task({ rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261231T235959" }), "plan", NOW)).toBe("5 buổi/tuần · đến 31/12");
    expect(subOf(task({ rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" }), "plan", NOW)).toBe("3 buổi/tuần");
    expect(subOf(task({ rrule: "FREQ=WEEKLY" }), "plan", NOW)).toBe("Mỗi tuần");
    expect(subOf(task({ rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO" }), "plan", NOW)).toBeUndefined(); // no cadence here: the row's old sub
  });
  it("a repeat with a part of the day keeps its part", () => {
    const occ = task({ rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261231T235959", tods: [[300, 660]], deadline: new Date(2026, 10, 18).getTime() });
    expect(subOf(occ, "plan", NOW)).toBe("Buổi sáng");
  });
  it("lectures and exams show only the room", () => {
    expect(subOf(lecture({ deadline: at(23) }), "lecture", NOW)).toBe("A27.101");
    expect(subOf(task({ location: "A27.201" }), "exam", NOW)).toBe("A27.201");
  });
  it("an assignment shows its course then the due", () => {
    expect(subOf(task({ course: "Trí tuệ nhân tạo", deadline: at(23, 59) }), "assignment", NOW)).toBe(`Trí tuệ nhân tạo, Hạn hôm nay`);
  });
  it("falls back to the place, then the note's first line", () => {
    expect(subOf(task({ location: "Thư viện", note: "a\nb" }), "plan", NOW)).toBe("Thư viện");
    expect(subOf(task({ note: "mang laptop\nvà sạc" }), "plan", NOW)).toBe("mang laptop");
    expect(subOf(task(), "plan", NOW)).toBeUndefined();
  });
});

describe("Row", () => {
  it("pressing the row opens it", async () => {
    const f = await draw({ task: lecture() });
    await fireEvent.press(rowEl());
    expect(f.onOpen).toHaveBeenCalledTimes(1);
  });

  it("the checkbox ticks with a success haptic", async () => {
    const f = await draw();
    await fireEvent.press(screen.container.queryAll((n) => n.props.hitSlop === 8 && typeof n.props.onResponderRelease === "function")[0]);
    expect(f.onToggle).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it("an already-done checkbox does not untick", async () => {
    const f = await draw({ done: true });
    await fireEvent.press(screen.container.queryAll((n) => n.props.hitSlop === 8 && typeof n.props.onResponderRelease === "function")[0]);
    expect(f.onToggle).not.toHaveBeenCalled();
    expect(flat(screen.getByText("Ôn tập")).textDecorationLine).toBe("line-through");
  });

  it("one tap on the title opens it after a beat", async () => {
    const f = await draw();
    await fireEvent.press(screen.getByLabelText("Ôn tập"));
    expect(f.onOpen).not.toHaveBeenCalled();
    await act(() => { jest.advanceTimersByTime(300); });
    expect(f.onOpen).toHaveBeenCalledTimes(1);
  });

  it("a double tap edits the title instead; submit saves it trimmed", async () => {
    const f = await draw();
    await fireEvent.press(screen.getByLabelText("Ôn tập"));
    await fireEvent.press(screen.getByLabelText("Ôn tập"));
    await act(() => { jest.advanceTimersByTime(400); });
    expect(f.onOpen).not.toHaveBeenCalled();
    const input = screen.getByDisplayValue("Ôn tập");
    await fireEvent.changeText(input, "  Ôn tập chương 3 ");
    await fireEvent(input, "submitEditing");
    expect(f.onTitle).toHaveBeenCalledWith("Ôn tập chương 3");
    expect(screen.queryByDisplayValue(/Ôn tập/)).toBeNull();
  });

  it("losing focus saves too", async () => {
    const f = await draw();
    await fireEvent.press(screen.getByLabelText("Ôn tập"));
    await fireEvent.press(screen.getByLabelText("Ôn tập"));
    const input = screen.getByDisplayValue("Ôn tập"); // held: once typed in, it no longer shows "Ôn tập"
    await fireEvent.changeText(input, "Đọc sách");
    await fireEvent(input, "blur");
    expect(f.onTitle).toHaveBeenCalledWith("Đọc sách");
  });

  it.each([["   "], ["Ôn tập"]])("an empty or unchanged title (%j) is not saved", async (typed) => {
    const f = await draw();
    await fireEvent.press(screen.getByLabelText("Ôn tập"));
    await fireEvent.press(screen.getByLabelText("Ôn tập"));
    const input = screen.getByDisplayValue("Ôn tập");
    await fireEvent.changeText(input, typed);
    await fireEvent(input, "submitEditing");
    expect(f.onTitle).not.toHaveBeenCalled();
  });

  it("long-press hands over the row's bottom edge with a medium haptic", async () => {
    const onHold = jest.fn();
    await draw({ onHold });
    await fireEvent(rowEl(), "longPress");
    expect(onHold).toHaveBeenCalledWith(260, 200);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it("long-press on the title text opens the menu too", async () => {
    const onHold = jest.fn(), f = await draw({ onHold });
    await fireEvent(screen.getByLabelText("Ôn tập"), "longPress");
    expect(onHold).toHaveBeenCalledWith(260, 200);
    expect(f.onOpen).not.toHaveBeenCalled();
  });

  it("without onHold there is no long-press", async () => {
    await draw();
    expect(rowEl().props.onLongPress).toBeUndefined();
    await fireEvent(rowEl(), "longPress");
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  // The dial's drums: [hours, minutes], each a snapping scroll of 36px rows.
  const drums = () => screen.container.queryAll((n) => typeof n.props.onMomentumScrollEnd === "function" && n.props.snapToInterval === 36);
  const settle = (el: { props: Record<string, unknown> }, row: number) => act(() => { (el.props.onMomentumScrollEnd as (e: object) => void)({ nativeEvent: { contentOffset: { x: 0, y: row * 36 } } }); });

  it("the time drops the dial; each settled drum saves at once, minutes in steps of 15", async () => {
    const f = await draw();
    await fireEvent.press(screen.getByText("14:00"));
    const [h, m] = drums();
    expect(["00", "15", "30", "45"].every((x) => screen.getAllByText(x).length > 0)).toBe(true);
    const h0 = new Date(NOW).getHours(); // today: the hours drum starts at now, the hours gone are not on it
    expect(screen.queryByText(String(h0 - 1).padStart(2, "0"), { exact: true })).toBeNull();
    expect(screen.queryByText(String(h0).padStart(2, "0"), { exact: true })).toBeOnTheScreen();
    await settle(h, 15 - h0);
    expect(f.onTime).toHaveBeenLastCalledWith(new Date(at(15, 0)));
    await settle(m, 2);
    expect(f.onTime).toHaveBeenLastCalledWith(new Date(at(15, 30)));
    await settle(m, 2); // the same row again: nothing new to save
    expect(f.onTime).toHaveBeenCalledTimes(2);
  });

  it("a tap outside the dial closes it and saves nothing more", async () => {
    const f = await draw();
    await fireEvent.press(screen.getByText("14:00"));
    await fireEvent.press(screen.getByLabelText("close"));
    expect(drums()).toHaveLength(0);
    expect(f.onTime).not.toHaveBeenCalled();
  });

  it("campus lectures do not drop the dial", async () => {
    await draw({ task: lecture() });
    const tm = screen.queryByText(/\d\d:\d\d/);
    if (tm) await fireEvent.press(tm);
    expect(drums()).toHaveLength(0);
  });

  it("all-day and untimed rows do not open the picker", async () => {
    await draw({ allDay: true });
    await fireEvent.press(screen.getByText(t("allDay")));
    expect(drums()).toHaveLength(0);
    expect(screen.getByText(t("noPlan"))).toBeOnTheScreen();
  });

  it("an untimed row shows no time and opens no picker", async () => {
    await draw({ task: task({ start: undefined, end: undefined }) });
    expect(drums()).toHaveLength(0);
    expect(screen.queryByText(/\d\d:\d\d/)).toBeNull();
  });

  it("a missed task turns its time vermilion", async () => {
    await draw({ task: task({ start: NOW - 2 * HOUR, end: NOW - HOUR }) });
    expect(flat(screen.getByText(hhmm(NOW - 2 * HOUR))).color).toBe(seal);
  });

  it("a done or future task is not missed", async () => {
    await draw({ task: task({ start: NOW - 2 * HOUR, end: NOW - HOUR }), done: true });
    expect(flat(screen.getByText(hhmm(NOW - 2 * HOUR))).color).not.toBe(seal);
  });

  it("a ghost has a dashed circle and no checkbox", async () => {
    await draw({ ghost: true });
    expect(screen.container.queryAll((n) => flat(n).borderStyle === "dashed")).toHaveLength(1);
    expect(screen.container.queryAll((n) => n.props.hitSlop === 8 && typeof n.props.onResponderRelease === "function" && n !== rowEl())).toHaveLength(1); // only the time
  });

  it("a search query tints the matched words", async () => {
    await draw({ task: task({ title: "Ôn tập Toán rời rạc" }), hl: parse("toán", NOW) });
    const mark = screen.getByText("Toán");
    expect(flat(mark).backgroundColor).toBe("rgba(217,67,43,0.18)");
  });

  it("a trail replaces the sub line", async () => {
    await draw({ task: task({ location: "Thư viện" }), trail: "Dời từ 09:00" });
    expect(screen.getByText("Dời từ 09:00")).toBeOnTheScreen();
    expect(screen.queryByText("Thư viện")).toBeNull();
  });

  it("tm overrides the clock", async () => {
    await draw({ tm: "T5" });
    expect(screen.getByText("T5")).toBeOnTheScreen();
  });
});

describe("SwipeDelete", () => {
  // scheduleOnRN lands in queueMicrotask (worklets mock), which the fake timers hold: run the ticks.
  const swipe = async (translationX: number) => {
    const g = createGestureController("swipe-delete");
    await act(async () => { g.begin(); g.activate(); g.update({ translationX }); g.end({ translationX }); jest.runAllTicks(); });
  };

  it("past the threshold the row deletes, with a light tick", async () => {
    const onDelete = jest.fn();
    await render(<SwipeDelete onDelete={onDelete}><View /></SwipeDelete>, root);
    await swipe(-120);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it("short of it the row springs back", async () => {
    const onDelete = jest.fn();
    await render(<SwipeDelete onDelete={onDelete}><View /></SwipeDelete>, root);
    await swipe(-60);
    expect(onDelete).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it("with onSpring it hands over the bottom edge instead of deleting", async () => {
    const onDelete = jest.fn(), onSpring = jest.fn();
    await render(<SwipeDelete onDelete={onDelete} onSpring={onSpring}><View /></SwipeDelete>, root);
    await swipe(-120);
    expect(onSpring).toHaveBeenCalledWith(260, 200);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("disabled does nothing", async () => {
    const onDelete = jest.fn();
    await render(<SwipeDelete enabled={false} onDelete={onDelete}><View /></SwipeDelete>, root);
    await swipe(-200);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("a series row asks where its menu goes; a plain one deletes", async () => {
    const onSeries = jest.fn(), onDelete = jest.fn();
    const r = await render(<Row task={task({ rrule: "FREQ=WEEKLY" })} now={NOW} {...cbs()} onDelete={onDelete} onSeries={onSeries} />, root);
    await swipe(-120);
    expect(onSeries).toHaveBeenCalledWith(260, 200);
    expect(onDelete).not.toHaveBeenCalled();
    await r.rerender(<Row task={task()} now={NOW} {...cbs()} onDelete={onDelete} onSeries={onSeries} />);
    await swipe(-120);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("all-day rows cannot be swiped away", async () => {
    const onDelete = jest.fn();
    await render(<Row task={task()} now={NOW} {...cbs()} allDay onDelete={onDelete} />, root);
    await swipe(-200);
    expect(onDelete).not.toHaveBeenCalled();
  });
});

// "Tập thể dục mỗi sáng": an occurrence's midnight end is no due; the row says its part of the day. A said due on a repeat still shows.
it("a repeat's row shows its part of the day, not the day's end as a due", () => {
  const d = new Date(2026, 10, 16), day = d.getTime(), next = new Date(2026, 10, 17).getTime();
  const base = { id: "r", title: "Tập thể dục", kind: "exercise", source: "user", effort: 60, createdAt: day, rrule: "FREQ=DAILY", start: day + 8 * 3600_000, deadline: next } as const;
  expect(subOf({ ...base, tods: [[300, 660]] }, "plan", day)).toBe("Buổi sáng");
  expect(subOf({ ...base, tods: [[300, 660], [1080, 1320]] }, "plan", day)).toBe("Buổi sáng hoặc tối");
  expect(subOf({ ...base }, "plan", day)).toBe("Mỗi ngày"); // no part said: its cadence
  expect(subOf({ ...base, deadline: day + 17 * 3600_000 }, "plan", day)).toBe("Hạn 17:00");
});
