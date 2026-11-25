import { fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { DateDrop, TimeDial } from "./dial";

const A = { x: 200, y: 200, w: 60, h: 34 };
const at = (h: number, m: number) => new Date(2026, 10, 20, h, m);
const draw = (value: Date, due: boolean, onChange = jest.fn(), min?: Date) => render(<View><TimeDial open anchor={A} due={due} min={min} value={value} onChange={onChange} onClose={jest.fn()} /></View>);
const close = () => fireEvent.press(screen.getByLabelText("close"));

it("tapping 17 then 35 then closing saves once: 17:35", async () => {
  const onChange = jest.fn();
  await draw(at(9, 0), false, onChange);
  await fireEvent.press(screen.getByLabelText("17")); // the hour: the minutes come up
  await fireEvent.press(screen.getByLabelText("35"));
  expect(onChange).not.toHaveBeenCalled(); // nothing saves while the dial turns
  await close();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(at(17, 35));
});

it("the hour segment of the header goes back to the hours", async () => {
  await draw(at(9, 0), false);
  await fireEvent.press(screen.getByLabelText("17"));
  expect(screen.queryByLabelText("17")).toBeNull(); // the minutes: 00 to 55 only
  expect(screen.getByLabelText("35")).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText("hour"));
  expect(screen.getByLabelText("17")).toBeOnTheScreen();
  expect(screen.queryByLabelText("35")).toBeNull();
});

it("hours before min are disabled and greyed; the minutes before it too", async () => {
  await draw(at(18, 0), false, jest.fn(), at(17, 30));
  expect(screen.getByLabelText("8")).toBeDisabled();
  expect(screen.getByLabelText("16")).toBeDisabled();
  expect(screen.getByLabelText("17")).toBeEnabled();
  await fireEvent.press(screen.getByLabelText("17"));
  expect(screen.getByLabelText("25")).toBeDisabled();
  expect(screen.getByLabelText("30")).toBeEnabled();
});

it("a due 23:59 left untouched stays 23:59: nothing is saved on close", async () => {
  const onChange = jest.fn();
  await draw(at(23, 59), true, onChange);
  expect(screen.getByText("59")).toBeOnTheScreen(); // the header shows the minute the due has
  await close();
  expect(onChange).not.toHaveBeenCalled();
});

it("a due 23:59 keeps its :59 when the hour changes, until the minutes are touched", async () => {
  const onChange = jest.fn();
  await draw(at(23, 59), true, onChange);
  await fireEvent.press(screen.getByLabelText("22")); // the inner ring's 22
  await close();
  expect(onChange).toHaveBeenCalledWith(at(22, 59));
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
  expect(screen.getByLabelText("14")).toBeEnabled();
  expect(screen.getByLabelText("13")).toBeDisabled();
  await fireEvent.press(screen.getByLabelText("14"));
  expect(screen.getByLabelText("00")).toBeDisabled(); // 14:00 is gone; 14:15 on
  await fireEvent.press(screen.getByLabelText("15"));
  await close();
  expect(onChange).toHaveBeenLastCalledWith(at(14, 15));
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
  expect(screen.getByLabelText("8")).toBeEnabled();
});

// An end's dial starts 15 minutes after its start, on the start's day; on another day the whole day is offered.
it("an end offers only times at least 15 minutes after its start", async () => {
  const onChange = jest.fn();
  await draw(at(18, 0), false, onChange, new Date(at(17, 0).getTime() + 15 * 60_000));
  expect(screen.getByLabelText("16")).toBeDisabled();
  expect(screen.getByLabelText("17")).toBeEnabled();
  await fireEvent.press(screen.getByLabelText("17")); // the first hour offered: its first minute 15
  expect(screen.getByLabelText("00")).toBeDisabled();
  expect(screen.getByLabelText("15")).toBeEnabled();
  await close();
  expect(onChange).toHaveBeenLastCalledWith(at(17, 15));
});

it("an end on a later day than its start keeps the whole day", async () => {
  await render(<View><TimeDial open anchor={A} value={new Date(2026, 10, 21, 9, 0)} min={new Date(at(17, 0).getTime() + 15 * 60_000)} onChange={jest.fn()} onClose={jest.fn()} /></View>);
  expect(screen.getByLabelText("8")).toBeEnabled();
});

it("the minutes are 00 to 55 and the hand snaps to the nearest 5p: 17:57 selects 55", async () => {
  await draw(at(17, 57), false);
  await fireEvent.press(screen.getByLabelText("17"));
  expect(screen.getByLabelText("55")).toBeSelected();
  expect(screen.getByLabelText("00")).not.toBeSelected();
});

// The relative chips sit beside the usual times: 15 and 30 minutes on from the value, tonight at 20:00, tomorrow morning at 08:00. Earlier renders stay mounted, so take the last.
it("relative presets: +15p and +30p from the value, tonight 20:00, tomorrow morning 08:00", async () => {
  const onChange = jest.fn();
  const press = (label: string) => fireEvent.press(screen.getAllByLabelText(label).at(-1)!);
  await draw(at(9, 0), false, onChange);
  await press("+15p");
  expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 20, 9, 15));
  await draw(at(9, 0), false, onChange);
  await press("+30p");
  expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 20, 9, 30));
  await draw(at(9, 0), false, onChange);
  await press("Tối nay");
  expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 15, 20, 0));
  await draw(at(9, 0), false, onChange);
  await press("Mai sáng");
  expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 16, 8, 0));
});

it("a relative chip for a time already gone is off", async () => {
  jest.spyOn(Date, "now").mockReturnValue(at(21, 0).getTime());
  const onChange = jest.fn();
  await draw(new Date(2026, 10, 15, 9, 0), false, onChange);
  await fireEvent.press(screen.getAllByLabelText("Tối nay").at(-1)!);
  expect(onChange).not.toHaveBeenCalled();
});
