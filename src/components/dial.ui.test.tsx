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
