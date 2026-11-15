import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { Fill, Meter } from "./meter";

// test/mocks/reanimated makes a new shared value per render and a style computed once, which React Compiler then caches:
// here the value persists and the style is read live (reported as an infra fix).
jest.mock("react-native-reanimated", () => {
  const m = jest.requireActual("../../test/mocks/reanimated");
  const { useRef } = jest.requireActual("react");
  const live = (f: () => Record<string, unknown>) => new Proxy({}, {
    get: (_t, k) => f()[k as string], ownKeys: () => Reflect.ownKeys(f()),
    getOwnPropertyDescriptor: (_t, k) => ({ enumerable: true, configurable: true, value: f()[k as string] }),
  });
  return { __esModule: true, ...m, useSharedValue: (v: unknown) => { const r = useRef(null); return (r.current ??= m.useSharedValue(v)); }, useAnimatedStyle: live };
});

const style = (n: ReactTestRendererJSON) => StyleSheet.flatten(n.props.style);
const tree = () => screen.toJSON() as ReactTestRendererJSON;
const fill = () => style((tree().children as ReactTestRendererJSON[])[0]);

it.each([[0.5, "50%"], [0, "0%"], [1, "100%"], [-1, "0%"], [2, "100%"], [0.333, "33%"], [NaN, "0%"]])("Meter v=%p fills %s", async (v, w) => {
  await render(<Meter v={v} />);
  expect(fill().width).toBe(w);
});

it("a guess is a dashed, muted track; a sure value is solid", async () => {
  await render(<Meter v={0.4} guess />);
  expect(style(tree())).toMatchObject({ borderStyle: "dashed" });
  const guessFill = fill().backgroundColor;
  await render(<Meter v={0.4} />);
  expect(style(tree()).borderStyle).toBeUndefined();
  expect(fill().backgroundColor).not.toBe(guessFill);
});

it("a fixed width turns flex off", async () => {
  await render(<Meter v={0.4} width={80} />);
  expect(style(tree())).toMatchObject({ width: 80, flex: undefined });
});

it.each([[0.5, 23], [1, 46], [1.5, 69]])("Fill lands at p=%p → %ppx (p is not clamped)", async (p, h) => {
  await render(<Fill p={p} />); // the mount effect animates 0 → p; the mock lands at once
  expect(style(tree()).height).toBe(h);
});
