import { render } from "@testing-library/react-native";
import { useRef } from "react";
import { View, type GestureResponderEvent } from "react-native";
import { feedTaps, useTapOutside, type Box } from "./outside";

// The box sits at (100,100), 200×100, in window coordinates. measureInWindow is one jest.fn shared by every mocked View.
const measure = (View.prototype as unknown as { measureInWindow: jest.Mock }).measureInWindow;
beforeEach(() => measure.mockImplementation((cb: (x: number, y: number, w: number, h: number) => void) => cb(100, 100, 200, 100)));
afterEach(() => measure.mockReset());

const ev = (pageX: number, pageY: number) => ({ nativeEvent: { pageX, pageY } }) as GestureResponderEvent;
const tap = (x: number, y: number, endX = x, endY = y) => { feedTaps.onTouchStart(ev(x, y)); feedTaps.onTouchEnd(ev(endX, endY)); };

function Host({ on, close, noBox }: { on: boolean; close: () => void; noBox?: boolean }) {
  const box = useRef<Box>(null);
  useTapOutside(box, on, close);
  return noBox ? null : <View ref={box} />;
}

it("a tap outside the box closes", async () => {
  const close = jest.fn();
  await render(<Host on close={close} />);
  tap(20, 20);
  expect(close).toHaveBeenCalledTimes(1);
});

it.each([[150, 150], [100, 100], [300, 200]])("a tap inside or on the edge (%i, %i) does not", async (x, y) => {
  const close = jest.fn();
  await render(<Host on close={close} />);
  tap(x, y);
  expect(close).not.toHaveBeenCalled();
});

it("a drag of 10 px or more is not a tap", async () => {
  const close = jest.fn();
  await render(<Host on close={close} />);
  tap(20, 20, 30, 20);
  expect(close).not.toHaveBeenCalled();
  tap(20, 20, 26, 26); // hypot 8.5: still a tap
  expect(close).toHaveBeenCalledTimes(1);
});

it("off: no subscription, and turning off unsubscribes", async () => {
  const close = jest.fn();
  const r = await render(<Host on={false} close={close} />);
  tap(20, 20);
  await r.rerender(<Host on close={close} />);
  tap(20, 20);
  await r.rerender(<Host on={false} close={close} />);
  tap(20, 20);
  expect(close).toHaveBeenCalledTimes(1);
});

it("unmounting unsubscribes", async () => {
  const close = jest.fn();
  const r = await render(<Host on close={close} />);
  await r.unmount();
  tap(20, 20);
  expect(close).not.toHaveBeenCalled();
});

it("a missing box does nothing", async () => {
  const close = jest.fn();
  await render(<Host on noBox close={close} />);
  expect(() => tap(20, 20)).not.toThrow();
  expect(close).not.toHaveBeenCalled();
});

it("calls the latest close without resubscribing", async () => {
  const first = jest.fn(), second = jest.fn();
  const r = await render(<Host on close={first} />);
  await r.rerender(<Host on close={second} />);
  tap(20, 20);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});
