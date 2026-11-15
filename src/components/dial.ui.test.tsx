import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { DateDrop, TimeDial } from "./dial";

const A = { x: 200, y: 200, w: 60, h: 34 };
const drums = () => screen.container.queryAll((n) => typeof n.props.onMomentumScrollEnd === "function" && n.props.snapToInterval === 36);
const settle = (el: { props: Record<string, unknown> }, row: number) => act(() => { (el.props.onMomentumScrollEnd as (e: object) => void)({ nativeEvent: { contentOffset: { x: 0, y: row * 36 } } }); });
const at = (h: number, m: number) => new Date(2026, 10, 20, h, m);
const draw = (value: Date, due: boolean, onChange = jest.fn()) => render(<View><TimeDial open anchor={A} due={due} value={value} onChange={onChange} onClose={jest.fn()} /></View>);

it("a due at 23 offers :59", async () => {
  await draw(at(23, 59), true);
  expect(screen.getByText("59")).toBeOnTheScreen();
});

it("a plain time at 23 keeps steps of 15", async () => {
  await draw(at(23, 45), false);
  expect(screen.queryByText("59")).toBeNull();
});

it("leaving 23 from :59 lands on :45, and 23:59 can be picked again", async () => {
  const onChange = jest.fn();
  await draw(at(23, 59), true, onChange);
  await settle(drums()[0], 22);
  expect(onChange).toHaveBeenLastCalledWith(at(22, 45));
  expect(screen.queryByText("59")).toBeNull();
  await settle(drums()[0], 23);
  await settle(drums()[1], 4);
  expect(onChange).toHaveBeenLastCalledWith(at(23, 59));
});

beforeEach(() => jest.spyOn(Date, "now").mockReturnValue(new Date(2026, 10, 15, 9).getTime())); // today: Sun 15/11
afterEach(() => jest.restoreAllMocks());

it("days before today can't be picked, today can", async () => {
  const onChange = jest.fn();
  await drawCal(at(12, 0), undefined, onChange);
  await fireEvent.press(screen.getByLabelText("14/11"));
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText("15/11"));
  expect(onChange).toHaveBeenCalledWith(new Date(2026, 10, 15, 12, 0));
});

const drawCal = (value: Date, min?: Date, onChange = jest.fn(), onClose = jest.fn()) =>
  render(<View><DateDrop open anchor={A} value={value} min={min} side="right" onChange={onChange} onClose={onClose} /></View>);

it("the calendar shows the month Monday first; a tap on a day keeps the time and closes", async () => {
  const onChange = jest.fn(), onClose = jest.fn();
  await drawCal(at(17, 30), undefined, onChange, onClose);
  expect(screen.getByText("Tháng 11 2026")).toBeOnTheScreen();
  expect(screen.getByText("T2")).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText("22/11"));
  expect(onChange).toHaveBeenCalledWith(new Date(2026, 10, 22, 17, 30));
  expect(onClose).toHaveBeenCalled();
});

it("days before the start can't be picked; the arrows move the month", async () => {
  const onChange = jest.fn();
  await drawCal(at(12, 0), new Date(2026, 10, 20), onChange);
  await fireEvent.press(screen.getByLabelText("19/11"));
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText("›"));
  expect(screen.getByText("Tháng 12 2026")).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText("31/12"));
  expect(onChange).toHaveBeenCalledWith(new Date(2026, 11, 31, 12, 0));
});

it("time presets pick and close: a due offers 23:59 and 00:00, a start 08:00, 14:00, 17:00, 20:00", async () => {
  const onChange = jest.fn(), onClose = jest.fn();
  await render(<View><TimeDial open anchor={A} due value={at(17, 30)} onChange={onChange} onClose={onClose} /></View>);
  await fireEvent.press(screen.getByLabelText("0:00"));
  expect(onChange).toHaveBeenCalledWith(at(0, 0));
  expect(onClose).toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText("23:59"));
  expect(onChange).toHaveBeenLastCalledWith(at(23, 59));
  await draw(at(9, 0), false, onChange);
  await fireEvent.press(screen.getByLabelText("17:00"));
  expect(onChange).toHaveBeenLastCalledWith(at(17, 0));
  await fireEvent.press(screen.getByLabelText("20:00"));
  expect(onChange).toHaveBeenLastCalledWith(at(20, 0));
  expect(screen.queryByLabelText("23:59")).toBeNull();
});

it("day presets: today, tomorrow, a week on, the time kept; one before `min` is off", async () => {
  const onChange = jest.fn();
  await drawCal(at(17, 30), undefined, onChange);
  await fireEvent.press(screen.getByLabelText("Ngày mai"));
  expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 16, 17, 30));
  await fireEvent.press(screen.getByLabelText("Tuần sau"));
  expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 22, 17, 30));
  onChange.mockClear();
  await drawCal(at(17, 30), new Date(2026, 10, 18), onChange);
  await fireEvent.press(screen.getAllByLabelText("Hôm nay").at(-1)!);
  expect(onChange).not.toHaveBeenCalled();
});

it("on today only now to midnight: no hour gone, the current hour from now, presets gone are off", async () => {
  jest.spyOn(Date, "now").mockReturnValue(at(14, 7).getTime());
  const onChange = jest.fn();
  await draw(at(17, 30), false, onChange);
  expect(screen.queryByText("13")).toBeNull();
  expect(screen.getByText("14")).toBeOnTheScreen();
  await settle(drums()[0], 0); // 14
  expect(onChange).toHaveBeenLastCalledWith(at(14, 30));
  expect(screen.queryByText("00")).toBeNull(); // 14:00 is gone; 14:15 on
  onChange.mockClear();
  await fireEvent.press(screen.getByLabelText("8:00"));
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText("20:00"));
  expect(onChange).toHaveBeenCalledWith(at(20, 0));
});

it("a day picked whose time is already gone takes the next quarter hour", async () => {
  jest.spyOn(Date, "now").mockReturnValue(at(14, 7).getTime());
  const onChange = jest.fn();
  await drawCal(new Date(2026, 10, 21, 9, 0), undefined, onChange);
  await fireEvent.press(screen.getAllByLabelText("Hôm nay").at(-1)!);
  expect(onChange).toHaveBeenLastCalledWith(at(14, 15));
  await fireEvent.press(screen.getByLabelText("Ngày mai"));
  expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 21, 9, 0));
});

it("another day keeps the whole day", async () => {
  jest.spyOn(Date, "now").mockReturnValue(at(14, 7).getTime());
  await draw(new Date(2026, 10, 21, 9, 0), false);
  expect(screen.getByText("08")).toBeOnTheScreen();
});

// An end's dial starts 15 minutes after its start, on the start's day; on another day the whole day is offered.
it("an end offers only times at least 15 minutes after its start", async () => {
  const start = at(17, 0), onChange = jest.fn();
  await render(<View><TimeDial open anchor={A} value={at(18, 0)} min={new Date(start.getTime() + 15 * 60_000)} onChange={onChange} onClose={jest.fn()} /></View>);
  const [hours] = drums();
  expect(screen.queryByText("16")).toBeNull();
  expect(screen.getByText("17")).toBeOnTheScreen();
  await settle(hours, 0); // the first hour offered: 17, its first minute 15
  expect(onChange).toHaveBeenLastCalledWith(at(17, 15));
  expect(screen.getByLabelText("14:00")).toBeDisabled(); // before the floor: off
  expect(screen.getByLabelText("20:00")).toBeEnabled();
});

it("an end on a later day than its start keeps the whole day", async () => {
  await render(<View><TimeDial open anchor={A} value={new Date(2026, 10, 21, 9, 0)} min={new Date(at(17, 0).getTime() + 15 * 60_000)} onChange={jest.fn()} onClose={jest.fn()} /></View>);
  expect(screen.getByText("08")).toBeOnTheScreen();
});
