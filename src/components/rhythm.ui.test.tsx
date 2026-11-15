import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Rhythm } from "./rhythm";
import { t } from "@/lib/i18n";
import { KIND_VI } from "@/lib/reasons";
import type { Rule } from "@/lib/types";
import type { Insights } from "@/planner";
import { NOW } from "../../test/factories";

// The swipe itself belongs to row.tsx's tests; here a press stands in for a completed swipe.
jest.mock("@/components/row", () => {
  const { createElement } = require("react"), { Pressable } = require("react-native");
  return { SwipeDelete: ({ onDelete, children }: { onDelete: () => void; children: unknown }) => createElement(Pressable, { accessibilityLabel: "swipe", onPress: onDelete }, children) };
});

const hours = Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 11 ? 0.9 : 0.3));
const empty: Insights = { hours, pairs: [], slip: [], byKind: [], guesses: [] };
const full: Insights = {
  hours, golden: { from: 8, to: 11 }, pairs: [{ before: "exercise", w: 1 }], slip: [{ kind: "chores", rate: 0.62 }],
  byKind: [{ kind: "study", from: 8, to: 11, sure: 0.8 }], unsure: { from: 20, to: 22 },
  guesses: [{ text: "Bạn học tốt buổi sáng", sure: 0.8 }, { text: "Tối hay mệt", sure: 0.6 }, { text: "Cuối tuần rảnh", sure: 0.2 }],
};
const rule = (over: Partial<Rule>): Rule => ({ id: "r1", text: "Tối thứ sáu để trống", days: [5], from: 18 * 60, to: 22 * 60, kinds: [], at: NOW, ...over });
type Bar = { props: { style: unknown } };
const opacities = (label: string) => (screen.getByLabelText(label).children as unknown as Bar[]).map((b) => (StyleSheet.flatten(b.props.style as object) as { opacity?: number }).opacity);
const bars = () => opacities(t("goldenRange", { a: 8, b: 11 }));

it("a golden range titles the strip, lights its hours, and shows each card", async () => {
  await render(<Rhythm i={full} rules={[]} onForget={jest.fn()} />);
  expect(screen.getAllByText(t("goldenRange", { a: 8, b: 11 })).length).toBeGreaterThan(0);
  expect(bars().map((o, h) => (o === 1 ? h : -1)).filter((h) => h >= 0)).toEqual([8, 9, 10]); // to is exclusive
  expect(screen.queryByText(t("learningT"))).toBeNull();
  expect(screen.getByText(t("pairTitle", { k: KIND_VI.exercise }))).toBeOnTheScreen();
  expect(screen.getByText(t("kindTitle", { k: KIND_VI.study, a: 8, b: 11 }))).toBeOnTheScreen();
  expect(screen.getByText(t("slipTitle", { k: KIND_VI.chores }))).toBeOnTheScreen();
  expect(screen.getByText(t("slipSub", { n: 6 }))).toBeOnTheScreen(); // 0.62 of 10, rounded
  expect(screen.getByText(t("unsureTitle", { a: 20, b: 22 }))).toBeOnTheScreen();
});

it("without evidence: still learning, the learning card, every bar dim, no other cards", async () => {
  await render(<Rhythm i={empty} rules={[]} onForget={jest.fn()} />);
  expect(screen.getAllByText(t("stillLearning")).length).toBeGreaterThan(0);
  expect(screen.getByText(t("learningT"))).toBeOnTheScreen();
  const dim = opacities(t("stillLearning"));
  expect(dim.every((o) => o === 0.45)).toBe(true);
  expect(screen.getByText(t("noGuessesT"))).toBeOnTheScreen();
});

it("a forgotten rule is passed back whole", async () => {
  const onForget = jest.fn(), r2 = rule({ id: "r2", text: "Sáng CN ngủ" });
  await render(<Rhythm i={full} rules={[rule({}), r2]} onForget={onForget} />);
  await fireEvent.press(screen.getAllByLabelText("swipe")[1]);
  expect(onForget).toHaveBeenCalledWith(r2);
  expect(screen.getByText(t("swipeForget"))).toBeOnTheScreen();
});

it("no rules: the placeholder and no swipe hint", async () => {
  await render(<Rhythm i={full} rules={[]} onForget={jest.fn()} />);
  expect(screen.getByText(t("noRulesT"))).toBeOnTheScreen();
  expect(screen.getByText(t("noRules"))).toBeOnTheScreen();
  expect(screen.queryByText(t("swipeForget"))).toBeNull();
});

it("guesses say how sure, at 0.75 and 0.5", async () => {
  const at = (sure: number) => ({ ...empty, guesses: [{ text: "g", sure }] });
  for (const [sure, key] of [[0.75, "sureHigh"], [0.74, "sureMid"], [0.5, "sureMid"], [0.49, "sureLow"]] as const) {
    await render(<Rhythm i={at(sure)} rules={[]} onForget={jest.fn()} />);
    expect(screen.getByText(t(key))).toBeOnTheScreen();
  }
});

it.each([
  [{ days: [0, 1, 3] }, "T2, T4, CN · 18:00–22:00"], // Sunday sorts last
  [{ days: [] }, `${t("everyDay")} · 18:00–22:00`],
  [{ days: [6], from: 21 * 60, to: 1440 }, `T7 · ${t("fromTime", { t: "21:00" })}`],
  [{ days: [6], from: 0, to: 1440 }, "T7"], // the whole day: days only
])("describes rule %j as %s", async (over, sub) => {
  await render(<Rhythm i={empty} rules={[rule(over)]} onForget={jest.fn()} />);
  expect(screen.getByText(sub)).toBeOnTheScreen();
});
