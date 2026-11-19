import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Rhythm } from "./rhythm";
import { t } from "@/lib/i18n";
import { KIND_VI, kindW } from "@/lib/reasons";
import type { Rule } from "@/lib/types";
import type { Insights } from "@/planner";
import { NOW } from "../../test/factories";

// The swipe itself belongs to row.tsx's tests; here a press stands in for a completed swipe.
jest.mock("@/components/row", () => {
  const { createElement } = require("react"), { Pressable } = require("react-native");
  return { SwipeDelete: ({ onDelete, children }: { onDelete: () => void; children: unknown }) => createElement(Pressable, { accessibilityLabel: "swipe", onPress: onDelete }, children) };
});

const hours = Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 11 ? 0.9 : 0.3));
const grid = Array.from({ length: 7 }, () => [0.9, 0.2, 0.4, 0.3]);
const empty: Insights = { grid: grid.map((r) => r.map(() => 0)), hours, pairs: [], slip: [], byKind: [], guesses: [], seen: 0, avoid: [] };
const full: Insights = {
  grid, hours, seen: 40, avoid: [{ hour: 7, n: 3 }], golden: { from: 8, to: 11 }, pairs: [{ before: "exercise", w: 1 }], slip: [{ kind: "chores", rate: 0.62 }],
  byKind: [{ kind: "study", from: 8, to: 11, sure: 0.8 }], unsure: { from: 20, to: 22 },
  guesses: [{ text: "Bạn học tốt buổi sáng", sure: 0.8 }, { text: "Tối hay mệt", sure: 0.6 }, { text: "Cuối tuần rảnh", sure: 0.2 }],
};
const rule = (over: Partial<Rule>): Rule => ({ id: "r1", text: "Tối thứ sáu để trống", days: [5], from: 18 * 60, to: 22 * 60, kinds: [], at: NOW, ...over });
type Node = { props: { style: unknown }; children: Node[] };
const flat = (n: Node) => StyleSheet.flatten(n.props.style as object) as { opacity?: number; borderWidth?: number };
// the matrix: a header row, then a row per part of the day, each with its label and seven day cells (T2 first)
const cells = (label: string) => (screen.getByLabelText(label).children as unknown as Node[]).slice(1).map((row) => row.children.slice(1).map(flat));
const lit = (label: string) => cells(label).flatMap((row, p) => row.map((c, d) => (c.borderWidth ? [p, d] : null))).filter(Boolean);

it("the week is a matrix: weekday by part, and the days that are yours are outlined", async () => {
  const i = { ...full, when: { part: 0, wds: [1, 2, 3, 4, 5], n: 9, sure: 0.7 } };
  await render(<Rhythm i={i} rules={[]} onForgetHour={() => {}} onForget={jest.fn()} />);
  const head = t("whenHead", { w: "Sáng ngày thường" });
  expect(screen.getAllByText(head).length).toBeGreaterThan(0);
  expect(lit(head)).toEqual([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]); // sáng, T2 to T6; not the weekend
  expect(cells(head)[0][0].opacity).toBeCloseTo(0.92);
  expect(screen.getByText(t("whenTitle", { w: "sáng ngày thường" }))).toBeOnTheScreen();
});

it("a golden range titles the matrix, outlines its part, and shows each card", async () => {
  await render(<Rhythm i={full} rules={[]} onForgetHour={() => {}} onForget={jest.fn()} />);
  expect(screen.getAllByText(t("goldenRange", { a: 8, b: 11 })).length).toBeGreaterThan(0);
  expect(lit(t("goldenRange", { a: 8, b: 11 })).map((c) => (c as number[])[0])).toEqual(Array(7).fill(0)); // no days known: the whole sáng row
  expect(screen.queryByText(t("learningT"))).toBeNull();
  expect(screen.getByText(t("pairTitle", { k: KIND_VI.exercise }))).toBeOnTheScreen();
  expect(screen.getByText(t("kindTitle", { k: kindW("study", true), p: "sáng" }))).toBeOnTheScreen();
  expect(screen.getByText(t("slipTitle", { k: kindW("chores", true) }))).toBeOnTheScreen();
  expect(screen.getByText(t("slipSub", { n: 6 }))).toBeOnTheScreen(); // 0.62 of 10, rounded
  expect(screen.getByText(t("unsureTitle", { p: "tối" }))).toBeOnTheScreen();
  expect(screen.getByText(t("avoidRow", { p: "Sáng", a: 7, b: 8 }))).toBeOnTheScreen();
  expect(screen.getByText(t("avoidSub", { n: 3 }))).toBeOnTheScreen();
});

it("without evidence: still learning, the learning card, every cell dim, no other cards", async () => {
  await render(<Rhythm i={empty} rules={[]} onForgetHour={() => {}} onForget={jest.fn()} />);
  expect(screen.getAllByText(t("stillLearning")).length).toBeGreaterThan(0);
  expect(screen.getByText(t("learningT"))).toBeOnTheScreen();
  expect(cells(t("stillLearning")).flat().every((c) => c.opacity === 0.2)).toBe(true);
  expect(screen.getByText(t("noGuessesT"))).toBeOnTheScreen();
});

it("first ticks: how many it has seen and how many more it needs", async () => {
  await render(<Rhythm i={{ ...empty, seen: 2 }} rules={[]} onForgetHour={() => {}} onForget={jest.fn()} />);
  expect(screen.getByText(t("seenN", { n: 2 }))).toBeOnTheScreen();
  expect(screen.getByText(t("moreN", { n: 1 }))).toBeOnTheScreen();
  expect(screen.queryByText(t("learningT"))).toBeNull();
});

it("an early guess titles the matrix and outlines its part", async () => {
  await render(<Rhythm i={{ ...empty, seen: 4, early: { from: 20, to: 22, n: 4 } }} rules={[]} onForgetHour={() => {}} onForget={jest.fn()} />);
  expect(screen.getByText(t("earlyTitle", { a: 20, b: 22 }))).toBeOnTheScreen();
  expect(screen.getByText("Mấy hôm nay bạn hay xong việc giờ này. Xong thêm 1 việc giờ này nữa là mình chắc.")).toBeOnTheScreen(); // 4 in the stretch, 5 names it
  expect(lit(t("earlyRange", { a: 20, b: 22 })).map((c) => (c as number[])[0])).toEqual(Array(7).fill(3)); // tối
});

it("a forgotten rule is passed back whole", async () => {
  const onForget = jest.fn(), r2 = rule({ id: "r2", text: "Sáng CN ngủ" });
  await render(<Rhythm i={full} rules={[rule({}), r2]} onForgetHour={() => {}} onForget={onForget} />);
  await fireEvent.press(screen.getAllByLabelText("swipe")[1]);
  expect(onForget).toHaveBeenCalledWith(r2);
  expect(screen.getByText(t("swipeForget"))).toBeOnTheScreen();
});

it("no rules: the placeholder and no swipe hint", async () => {
  await render(<Rhythm i={full} rules={[]} onForgetHour={() => {}} onForget={jest.fn()} />);
  expect(screen.getByText(t("noRulesT"))).toBeOnTheScreen();
  expect(screen.getByText(t("noRules"))).toBeOnTheScreen();
  expect(screen.queryByText(t("swipeForget"))).toBeNull();
});

it("guesses say how sure, at 0.75 and 0.5", async () => {
  const at = (sure: number) => ({ ...empty, guesses: [{ text: "g", sure }] });
  for (const [sure, key] of [[0.75, "sureHigh"], [0.74, "sureMid"], [0.5, "sureMid"], [0.49, "sureLow"]] as const) {
    await render(<Rhythm i={at(sure)} rules={[]} onForgetHour={() => {}} onForget={jest.fn()} />);
    expect(screen.getByText(t(key))).toBeOnTheScreen();
  }
});

it.each([
  [{ days: [0, 1, 3] }, "T2, T4, CN · 18:00 - 22:00"], // Sunday sorts last
  [{ days: [] }, `${t("everyDay")} · 18:00 - 22:00`],
  [{ days: [6], from: 21 * 60, to: 1440 }, `T7 · ${t("fromTime", { t: "21:00" })}`],
  [{ days: [6], from: 0, to: 1440 }, "T7"], // the whole day: days only
])("describes rule %j as %s", async (over, sub) => {
  await render(<Rhythm i={empty} rules={[rule(over)]} onForgetHour={() => {}} onForget={jest.fn()} />);
  expect(screen.getByText(sub)).toBeOnTheScreen();
});
