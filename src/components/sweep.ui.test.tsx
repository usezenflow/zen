import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { Sweep, useSweep } from "./sweep";

jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn(async () => "file:///shot.png") }));
const capture = captureRef as jest.Mock;
const measure = (View.prototype as unknown as { measureInWindow: jest.Mock }).measureInWindow;
beforeEach(() => measure.mockImplementation((cb: (x: number, y: number) => void) => cb(0, 0)));
afterEach(() => { measure.mockReset(); capture.mockClear(); });

function Btn({ apply }: { apply: () => void }) {
  const run = useSweep();
  return <Pressable onPress={() => run(10, 20, apply)}><Text>go</Text></Pressable>;
}
/** The snapshot <Image> inside the sweep's Svg: its onLoad is what switches the screen underneath. */
const shot = () => screen.container.queryAll((n) => n.type === "RNSVGImage")[0];
const settle = () => act(async () => { jest.runAllTicks(); await Promise.resolve(); });

it("without a provider, run applies at once", async () => {
  const apply = jest.fn();
  await render(<Btn apply={apply} />);
  await fireEvent.press(screen.getByText("go"));
  expect(apply).toHaveBeenCalledTimes(1);
  expect(capture).not.toHaveBeenCalled();
});

it("captures, paints the snapshot, and applies only once the image has loaded", async () => {
  const apply = jest.fn();
  await render(<Sweep><Btn apply={apply} /></Sweep>);
  await fireEvent.press(screen.getByText("go"));
  await settle();
  expect(capture).toHaveBeenCalledTimes(1);
  expect(apply).not.toHaveBeenCalled();
  const img = shot();
  expect(JSON.stringify(img.props.src)).toContain("file:///shot.png");
  await act(async () => { img.props.onLoad(); });
  expect(apply).toHaveBeenCalledTimes(1);
  await settle(); // the hole has grown: the snapshot goes away
  expect(shot()).toBeUndefined();
});

it("a failed capture still applies, with no sweep", async () => {
  capture.mockRejectedValueOnce(new Error("no view"));
  const apply = jest.fn();
  await render(<Sweep><Btn apply={apply} /></Sweep>);
  await fireEvent.press(screen.getByText("go"));
  await settle();
  expect(apply).toHaveBeenCalledTimes(1);
  expect(shot()).toBeUndefined();
});

it("a second run while a sweep is up applies at once", async () => {
  const first = jest.fn(), second = jest.fn();
  function Two() {
    const run = useSweep();
    return <><Pressable onPress={() => run(10, 20, first)}><Text>one</Text></Pressable><Pressable onPress={() => run(10, 20, second)}><Text>two</Text></Pressable></>;
  }
  await render(<Sweep><Two /></Sweep>);
  await fireEvent.press(screen.getByText("one"));
  await settle();
  await fireEvent.press(screen.getByText("two"));
  expect(second).toHaveBeenCalledTimes(1);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
});
