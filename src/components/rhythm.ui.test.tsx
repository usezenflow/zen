import { render, screen } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Rhythm, rhythmHead } from "./rhythm";
import { t } from "@/lib/i18n";
import type { Rule } from "@/lib/types";
import type { Insights } from "@/planner";
import { NOW } from "../../test/factories";
import { D, KINDS } from "@/planner/linucb";
import { newModel } from "@/planner/model";

const base: Insights = { grid: [], hours: [], pairs: [], slip: [], byKind: [], learned: [], seen: 0, avoid: [], guesses: undefined } as unknown as Insights;
const cold = { ...base, learned: [] } as Insights;
const learned = { ...base, learned: [{ text: "Việc học hợp buổi sáng", hour: 8 }, { text: "Tránh buổi chiều", hour: 15 }, { text: "Nghỉ 20p sau buổi học" }] } as Insights;
const rule = (over: Partial<Rule>): Rule => ({ id: "r1", text: "Tối thứ sáu để trống", days: [5], from: 18 * 60, to: 22 * 60, kinds: [], at: NOW, ...over });

it("with nothing learned: the dim week card and one calm line, no rows", async () => {
  await render(<Rhythm i={cold} rules={[]} onForget={jest.fn()} onForgetWhen={jest.fn()} />);
  expect(screen.getByText(t("learnedCold"))).toBeOnTheScreen();
  expect(screen.getByText(t("learnedLearning"))).toBeOnTheScreen();
  expect(screen.queryByText(t("learnedForget"))).toBeNull();
  expect(rhythmHead(cold, [])).toBe("");
});

it("lists each rule in plain words, with no Bỏ button: a swipe forgets", async () => {
  await render(<GestureHandlerRootView><Rhythm i={learned} rules={[rule({})]} onForget={jest.fn()} onForgetWhen={jest.fn()} /></GestureHandlerRootView>);
  expect(screen.getByText("Việc học hợp buổi sáng")).toBeOnTheScreen();
  expect(screen.getByText("Tối thứ sáu để trống")).toBeOnTheScreen();
  expect(screen.queryByText(t("learnedForget"))).toBeNull();
});

it("the week grid shows once anything was seen, with no row to forget when nothing is learned yet", async () => {
  const seen = { ...base, grid: Array.from({ length: 7 }, () => [0.5, 0, 0, 0]) } as Insights;
  await render(<Rhythm i={seen} rules={[]} onForget={jest.fn()} onForgetWhen={jest.fn()} />);
  expect(screen.getByText("Sáng")).toBeOnTheScreen();
  expect(screen.queryByText(t("learnedForget"))).toBeNull();
});

it("the nap row is plain: nothing in the model forgets it", async () => {
  await render(<GestureHandlerRootView><Rhythm i={{ ...base, learned: [{ text: "Nghỉ 20p sau buổi học" }] } as Insights} rules={[]} onForget={jest.fn()} onForgetWhen={jest.fn()} /></GestureHandlerRootView>);
  expect(screen.getByText("Nghỉ 20p sau buổi học")).toBeOnTheScreen();
});

it("the head counts the rules Zen follows and says no weekday", () => {
  expect(rhythmHead(learned, [rule({})])).toBe(t("learnedN", { n: 4 }));
  const shown = [t("learnedTitle"), rhythmHead(learned, []), "Việc học hợp buổi sáng", "Tránh buổi chiều"].join(" ");
  expect(shown).not.toMatch(/\bT[2-7]\b|\bCN\b|cuối tuần|ngày thường|bạn hay/i);
});

const studyRow = (hour: number, ok: boolean) => { const vec = new Array(D).fill(0); vec[0] = 1; vec[4 + KINDS.indexOf("study")] = 1; return { vec, hour, r: ok ? 0.5 : -0.5, at: 0 }; };
it("the top says what Zen noticed in the outcomes", async () => {
  const m = newModel(0);
  m.hist = [...Array.from({ length: 6 }, () => studyRow(9, true)), ...Array.from({ length: 6 }, () => studyRow(20, false))];
  await render(<GestureHandlerRootView><Rhythm i={cold} m={m} rules={[]} onForget={jest.fn()} onForgetWhen={jest.fn()} /></GestureHandlerRootView>);
  expect(screen.getByText(t("insSection"))).toBeOnTheScreen();
  expect(screen.getByText("Việc học buổi sáng hay xong hơn buổi tối")).toBeOnTheScreen();
});

it("a thin history shows no noticed section", async () => {
  const thin = newModel(0);
  thin.hist = [...Array.from({ length: 4 }, () => studyRow(9, true)), ...Array.from({ length: 4 }, () => studyRow(20, false))];
  await render(<GestureHandlerRootView><Rhythm i={cold} m={thin} rules={[]} onForget={jest.fn()} onForgetWhen={jest.fn()} /></GestureHandlerRootView>);
  expect(screen.queryByText(t("insSection"))).toBeNull();
});
