import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Rhythm, rhythmHead } from "./rhythm";
import { t } from "@/lib/i18n";
import type { Rule } from "@/lib/types";
import type { Insights } from "@/planner";
import { NOW } from "../../test/factories";

const base: Insights = { grid: [], hours: [], pairs: [], slip: [], byKind: [], learned: [], seen: 0, avoid: [], guesses: undefined } as unknown as Insights;
const cold = { ...base, learned: [] } as Insights;
const learned = { ...base, learned: [{ text: "Việc học hợp buổi sáng", hour: 8 }, { text: "Tránh buổi chiều", hour: 15 }, { text: "Nghỉ 20p sau buổi học" }] } as Insights;
const rule = (over: Partial<Rule>): Rule => ({ id: "r1", text: "Tối thứ sáu để trống", days: [5], from: 18 * 60, to: 22 * 60, kinds: [], at: NOW, ...over });

it("with nothing learned: one calm line, and no Bỏ", async () => {
  await render(<Rhythm i={cold} rules={[]} onForget={jest.fn()} onForgetHour={jest.fn()} />);
  expect(screen.getByText(t("learnedCold"))).toBeOnTheScreen();
  expect(screen.queryByText(t("learnedForget"))).toBeNull();
  expect(rhythmHead(cold, [])).toBe("");
});

it("lists each rule in plain words, with a Bỏ at least 44px tall", async () => {
  await render(<Rhythm i={learned} rules={[rule({})]} onForget={jest.fn()} onForgetHour={jest.fn()} />);
  expect(screen.getByText("Việc học hợp buổi sáng")).toBeOnTheScreen();
  expect(screen.getByText("Tối thứ sáu để trống")).toBeOnTheScreen();
  expect(screen.getAllByText(t("learnedForget"))).toHaveLength(3); // the rest: rule, two hours
  const bo = StyleSheet.flatten(screen.getByLabelText(`${t("learnedForget")} Tránh buổi chiều`).props.style);
  expect(bo.minHeight).toBeGreaterThanOrEqual(44);
  expect(bo.minWidth).toBeGreaterThanOrEqual(44);
});

it("Bỏ on a learned hour forgets that hour; on a said rule, that rule", async () => {
  const onForgetHour = jest.fn(), onForget = jest.fn(), r = rule({});
  await render(<Rhythm i={learned} rules={[r]} onForget={onForget} onForgetHour={onForgetHour} />);
  fireEvent.press(screen.getByLabelText(`${t("learnedForget")} Tránh buổi chiều`));
  expect(onForgetHour).toHaveBeenCalledWith(15);
  fireEvent.press(screen.getByLabelText(`${t("learnedForget")} Tối thứ sáu để trống`));
  expect(onForget).toHaveBeenCalledWith(r);
});

it("the nap row has no Bỏ: nothing in the model forgets it", async () => {
  await render(<Rhythm i={{ ...base, learned: [{ text: "Nghỉ 20p sau buổi học" }] } as Insights} rules={[]} onForget={jest.fn()} onForgetHour={jest.fn()} />);
  expect(screen.getByText("Nghỉ 20p sau buổi học")).toBeOnTheScreen();
  expect(screen.queryByText(t("learnedForget"))).toBeNull();
});

it("the head counts the rules Zen follows and says no weekday", () => {
  expect(rhythmHead(learned, [rule({})])).toBe(t("learnedN", { n: 4 }));
  const shown = [t("learnedTitle"), rhythmHead(learned, []), "Việc học hợp buổi sáng", "Tránh buổi chiều"].join(" ");
  expect(shown).not.toMatch(/\bT[2-7]\b|\bCN\b|cuối tuần|ngày thường|bạn hay/i);
});
