import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Live, MovesPill, NowCard, Steps, Story, Weekly } from "./nowcard";
import { plain, t } from "@/lib/i18n";
import { kvGet, kvSet } from "@/lib/store";
import { when } from "@/lib/when";
import type { Move } from "@/lib/types";
import { MICRO_MIN } from "../planner/policy";
import { at, MIN, NOW, task } from "../../test/factories";

// The meter's fill animates from 0, which the inert Reanimated mock computes once: expose the target instead.
jest.mock("@/components/meter", () => ({ Fill: ({ p }: { p: number }) => require("react").createElement(require("react-native").View, { testID: "fill", accessibilityValue: { now: p } }) }));

type J = { type: string; props: Record<string, any>; children: unknown[] | null };
const nodes = (j: unknown): J[] => (!j || typeof j === "string" ? [] : Array.isArray(j) ? j.flatMap(nodes) : [j as J, ...nodes((j as J).children)]);
const styleOf = (n: { props: { style?: unknown } }) => (StyleSheet.flatten(n.props.style as object) ?? {}) as Record<string, unknown>;
const fill = () => screen.getByTestId("fill").props.accessibilityValue.now;

describe("NowCard", () => {
  it("going: minutes left, until the end, and the meter part-full", async () => {
    await render(<NowCard card={{ task: task({ title: "Ôn tập" }), start: at(9, 30), end: at(10, 30) }} onDone={jest.fn()} />);
    expect(screen.getByLabelText(t("nMin", { n: 30 }))).toBeOnTheScreen();
    expect(screen.getByText(t("until", { time: "10:30" }))).toBeOnTheScreen();
    expect(fill()).toBeCloseTo(0.5);
  });
  it("upcoming: its start time and length, meter empty", async () => {
    await render(<NowCard card={{ task: task(), start: at(14), end: at(15, 30) }} onDone={jest.fn()} />);
    expect(screen.getByLabelText("14:00")).toBeOnTheScreen();
    expect(screen.getByText(t("nMin", { n: 90 }))).toBeOnTheScreen();
    expect(fill()).toBe(0);
  });
  it("time's up says Hết giờ; Thêm 15p and Chuyển việc act, and the caption names the next task", async () => {
    const onExtend = jest.fn(), onLater = jest.fn();
    await render(<NowCard card={{ task: task({ title: "LeetCode" }), start: at(13), end: at(14) }} onDone={jest.fn()} onLater={onLater} onExtend={onExtend} over={{ next: task({ title: "Ôn CSDL" }) }} />);
    expect(screen.getByText(t("overLab", { time: "14:00" }))).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(t("overExtend")));
    await fireEvent.press(screen.getByLabelText(t("overMove")));
    expect(onExtend).toHaveBeenCalledTimes(1);
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(screen.getByText(t("overNext", { next: "Ôn CSDL", title: "LeetCode" }))).toBeOnTheScreen();
  });
  it("a zero-length card still says 1 minute", async () => {
    await render(<NowCard card={{ task: task(), start: at(14), end: at(14) }} onDone={jest.fn()} />);
    expect(screen.getByText(t("nMin", { n: 1 }))).toBeOnTheScreen();
  });
  it("running says Đang làm and offers no Bắt đầu; the next block says Tiếp theo and Bắt đầu starts it", async () => {
    const onStart = jest.fn();
    const r = await render(<NowCard card={{ task: task(), start: at(9, 30), end: at(10, 30) }} onDone={jest.fn()} onStart={onStart} />);
    expect(screen.getByText(t("doingNow"))).toBeOnTheScreen();
    expect(screen.queryByLabelText(t("startLab"))).toBeNull();
    await r.unmount();
    await render(<NowCard card={{ task: task(), start: at(14), end: at(15) }} onDone={jest.fn()} onStart={onStart} onLater={jest.fn()} />);
    expect(screen.getByText(t("nextUp"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(t("startLab")));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
  it("a class or an exam next has no Bắt đầu", async () => {
    await render(<NowCard card={{ task: task({ fixed: "lecture" }), start: at(14), end: at(15) }} onDone={jest.fn()} onStart={jest.fn()} />);
    expect(screen.queryByLabelText(t("startLab"))).toBeNull();
  });
  it.each(["lecture", "exam", "busy"] as const)("a %s has no Xong check", async (fixed) => {
    await render(<NowCard card={{ task: task({ fixed }), start: at(14), end: at(15) }} onDone={jest.fn()} />);
    expect(screen.queryByLabelText(t("markDone"))).toBeNull();
  });
  it("ticks every 3 s and stops ticking once unmounted", async () => {
    const r = await render(<NowCard card={{ task: task(), start: at(9, 30), end: at(10, 30) }} onDone={jest.fn()} />);
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(screen.getByLabelText(t("nMin", { n: 29 }))).toBeOnTheScreen();
    const clear = jest.spyOn(globalThis, "clearInterval");
    await r.unmount();
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
  it("the check marks it done", async () => {
    const onDone = jest.fn();
    await render(<NowCard card={{ task: task(), start: at(14), end: at(15) }} onDone={onDone} />);
    await fireEvent.press(screen.getByLabelText(t("markDone")));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("NowCard Thử 10p", () => {
  const micro = async () => JSON.parse((await kvGet("now.micro")) ?? "null");
  it("a block of 45 minutes or more offers it beside Để sau; tapping stores the ten minutes and shows them", async () => {
    const tk = task();
    await render(<NowCard card={{ task: tk, start: at(14), end: at(15, 30) }} onDone={jest.fn()} onStart={jest.fn()} onLater={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText(t("microBtn", { n: MICRO_MIN })));
    expect(await micro()).toEqual({ id: tk.id, startedAt: NOW, endsAt: NOW + MICRO_MIN * MIN });
    expect(screen.getByText(t("doingNow"))).toBeOnTheScreen();
    expect(screen.getByLabelText(t("nMin", { n: MICRO_MIN }))).toBeOnTheScreen();
    expect(screen.queryByLabelText(t("microBtn", { n: MICRO_MIN }))).toBeNull();
  });
  it("a shorter block has no ramp unless it was put off before", async () => {
    await render(<NowCard card={{ task: task(), start: at(14), end: at(14, 30) }} onDone={jest.fn()} onLater={jest.fn()} />);
    expect(screen.queryByLabelText(t("microBtn", { n: MICRO_MIN }))).toBeNull();
    await render(<NowCard card={{ task: task({ misses: 1 }), start: at(14), end: at(14, 30) }} onDone={jest.fn()} onLater={jest.fn()} />);
    expect(screen.getByLabelText(t("microBtn", { n: MICRO_MIN }))).toBeOnTheScreen();
  });
  it("never on a fixed class, a block already running, or a gap offer", async () => {
    await render(<NowCard card={{ task: task({ fixed: "lecture" }), start: at(14), end: at(16) }} onDone={jest.fn()} onLater={jest.fn()} />);
    expect(screen.queryByLabelText(t("microBtn", { n: MICRO_MIN }))).toBeNull();
    await render(<NowCard card={{ task: task(), start: at(9, 30), end: at(11, 30), gap: undefined }} onDone={jest.fn()} onLater={jest.fn()} />);
    expect(screen.queryByLabelText(t("microBtn", { n: MICRO_MIN }))).toBeNull();
    await render(<NowCard card={{ task: task(), start: at(14), end: at(16), gap: "30p" }} onDone={jest.fn()} onLater={jest.fn()} />);
    expect(screen.queryByLabelText(t("microBtn", { n: MICRO_MIN }))).toBeNull();
  });
  it("at ten minutes: stopping credits ten minutes and clears the try", async () => {
    const onMicroRest = jest.fn();
    await render(<NowCard card={{ task: task(), start: at(14), end: at(15, 30) }} onDone={jest.fn()} onStart={jest.fn()} onLater={jest.fn()} onMicroRest={onMicroRest} />);
    await fireEvent.press(screen.getByLabelText(t("microBtn", { n: MICRO_MIN })));
    await act(async () => { jest.advanceTimersByTime(MICRO_MIN * MIN); });
    expect(screen.getByLabelText(t("microFull", { n: MICRO_MIN }))).toBeOnTheScreen();
    expect(screen.getByLabelText(t("microRest"))).toBeOnTheScreen();
    expect(screen.getByLabelText(t("microGo"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(t("microRest")));
    expect(onMicroRest).toHaveBeenCalledWith(MICRO_MIN);
    expect(await micro()).toBeNull();
  });
  it("at ten minutes: Làm tiếp cho xong takes the block through onStart and clears the try", async () => {
    const onStart = jest.fn();
    await render(<NowCard card={{ task: task(), start: at(14), end: at(15, 30) }} onDone={jest.fn()} onStart={onStart} onLater={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText(t("microBtn", { n: MICRO_MIN })));
    await act(async () => { jest.advanceTimersByTime(MICRO_MIN * MIN); });
    await fireEvent.press(screen.getByLabelText(t("microGo")));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(await micro()).toBeNull();
  });
  it("a try started earlier comes back from kv with its minutes left", async () => {
    const tk = task();
    await kvSet("now.micro", JSON.stringify({ id: tk.id, startedAt: NOW - 3 * MIN, endsAt: NOW + 7 * MIN }));
    await render(<NowCard card={{ task: tk, start: at(14), end: at(15, 30) }} onDone={jest.fn()} onLater={jest.fn()} />);
    expect(screen.getByLabelText(t("nMin", { n: 7 }))).toBeOnTheScreen();
    expect(screen.queryByLabelText(t("microBtn", { n: MICRO_MIN }))).toBeNull();
  });
});

describe("Live", () => {
  const words = () => nodes(screen.toJSON()).filter((n) => n.type === "Text").map((n) => ({ w: (n.children ?? []).join("").trim(), o: styleOf(n).opacity }));
  it("dims the word still being heard while listening", async () => {
    await render(<Live state="listening" words="học nhóm chiều" />);
    expect(words()).toEqual([{ w: "học", o: undefined }, { w: "nhóm", o: undefined }, { w: "chiều", o: 0.35 }]);
  });
  it("thinking settles every word", async () => {
    await render(<Live state="thinking" words="học nhóm" />);
    expect(words().map((x) => x.o)).toEqual([undefined, undefined]);
  });
  it("past four lines the top fades", async () => {
    await render(<Live state="listening" words="a b c" />);
    const fades = () => nodes(screen.toJSON()).filter((n) => String(styleOf(n).backgroundImage ?? "").startsWith("linear-gradient"));
    expect(fades()).toHaveLength(0);
    await fireEvent(screen.getByLabelText("a b c"), "layout", { nativeEvent: { layout: { height: 200 } } });
    expect(fades()).toHaveLength(1);
    await fireEvent(screen.getByLabelText("a b c"), "layout", { nativeEvent: { layout: { height: 124 } } }); // exactly four lines
    expect(fades()).toHaveLength(0);
  });
});

const root = { wrapper: GestureHandlerRootView }; // the brief swipes away
const mv = (over: Partial<Move>): Move => ({ id: "m", title: "Ôn tập", from: at(14), to: at(16), at: NOW, ...over });

describe("MovesPill picks the move it names", () => {
  it("one move: its title and new time", async () => {
    await render(<MovesPill moves={[mv({})]} now={NOW} onOpen={jest.fn()} />, root);
    expect(screen.getByText(plain(t("briefN", { n: 1 })))).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(plain(t("briefMove", { title: "Ôn tập", when: when(at(16), NOW) }))))).toBeOnTheScreen();
  });
  it("names a real cause over a bigger knock-on", async () => {
    const moves = [mv({ id: "a", title: "Giặt đồ", to: at(15), cause: "Có tiết bù" }), mv({ id: "b", title: "Đi chợ", to: at(20), cause: t("causeKnock") })];
    await render(<MovesPill moves={moves} now={NOW} onOpen={jest.fn()} />, root);
    expect(screen.getByText(new RegExp(`Giặt đồ sang`))).toBeOnTheScreen();
  });
  it("without a real cause the biggest move wins", async () => {
    await render(<MovesPill moves={[mv({ id: "a", title: "Giặt đồ", to: at(15) }), mv({ id: "b", title: "Đi chợ", to: at(20) })]} now={NOW} onOpen={jest.fn()} />, root);
    expect(screen.getByText(/Đi chợ sang/)).toBeOnTheScreen();
  });
  it("renders nothing when nothing moved", async () => {
    await render(<MovesPill moves={[]} now={NOW} onOpen={jest.fn()} />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe("MovesPill", () => {
  it("renders under a running card: the count, the move, and Xem", async () => {
    const card = { task: task({ title: "Ôn tập" }), start: at(9, 30), end: at(10, 30) };
    await render(<><NowCard card={card} onDone={jest.fn()} /><MovesPill moves={[mv({ id: "a" }), mv({ id: "b", title: "Đi chợ" })]} now={NOW} onOpen={jest.fn()} /></>, root);
    expect(screen.getByLabelText(t("nMin", { n: 30 }))).toBeOnTheScreen(); // the running card stays
    expect(screen.getByText(new RegExp(t("briefN", { n: 2 })))).toBeOnTheScreen();
    expect(screen.getByText(t("briefSee"))).toBeOnTheScreen();
  });
  it("tap opens the story; a screen reader can dismiss it, as the swipe does", async () => {
    const onOpen = jest.fn(), onDismiss = jest.fn();
    await render(<MovesPill moves={[mv({})]} now={NOW} onOpen={onOpen} onDismiss={onDismiss} />, root);
    await fireEvent.press(screen.getByLabelText(t("briefOpen")));
    await fireEvent(screen.getByLabelText(t("briefOpen")), "accessibilityAction", { nativeEvent: { actionName: "dismiss" } });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
  it("renders nothing when nothing is unbriefed", async () => {
    await render(<MovesPill moves={[]} now={NOW} onOpen={jest.fn()} />, root);
    expect(screen.queryByLabelText(t("briefOpen"))).toBeNull();
  });
});

describe("Story", () => {
  it("groups by cause: real causes first, then knock-ons, then the unexplained with no header", async () => {
    const moves = [
      mv({ id: "c", title: "Tự do", at: NOW - 3 * MIN }),
      mv({ id: "k", title: "Đi chợ", cause: t("causeKnock") }),
      mv({ id: "r", title: "Giặt đồ", cause: "Có tiết bù", at: NOW + MIN }),
    ];
    await render(<Story moves={moves} now={NOW} onClose={jest.fn()} />);
    const text = nodes(screen.toJSON()).filter((n) => n.type === "Text").map((n) => (n.children ?? []).join(""));
    const order = ["Có tiết bù", "Giặt đồ", t("causeKnock"), "Đi chợ", "Tự do"].map((x) => text.indexOf(x));
    expect(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1]))).toBe(true);
    expect(text.filter((x) => x === "")).toHaveLength(0); // the no-cause group has no blank header
    expect(screen.getAllByText(when(at(14), NOW))).toHaveLength(3); // each old time, struck through
  });
  it("closes", async () => {
    const onClose = jest.fn();
    await render(<Story moves={[mv({})]} now={NOW} onClose={onClose} />);
    await fireEvent.press(screen.getByLabelText(t("briefClose")));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("offers Undo only where the change was made", async () => {
    const onUndo = jest.fn();
    const r = await render(<Story moves={[mv({})]} now={NOW} onClose={jest.fn()} />);
    expect(screen.queryByLabelText(t("undo"))).toBeNull();
    await r.rerender(<Story moves={[mv({})]} now={NOW} onClose={jest.fn()} onUndo={onUndo} />);
    await fireEvent.press(screen.getByLabelText(t("undo")));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

it("Weekly opens on press", async () => {
  const onPress = jest.fn();
  await render(<Weekly title="Bạn học tốt nhất buổi sáng" sub="Xem nhịp" onPress={onPress} />);
  await fireEvent.press(screen.getByLabelText("Bạn học tốt nhất buổi sáng"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

describe("Steps", () => {
  it("the newest line is in ink with a spinner; earlier ones are muted with a check", async () => {
    await render(<Steps lines={["Đọc lịch", "Xếp việc"]} />);
    const [old, cur] = [screen.getByText("Đọc lịch"), screen.getByText("Xếp việc")];
    expect(styleOf(old).color).not.toBe(styleOf(cur).color);
    const rows = nodes(screen.toJSON()).filter((n) => n.children?.some((c) => (c as J).type === "Text"));
    expect((rows[0].children![0] as J).type).toBe("RNSVGSvgView"); // the check icon
    expect((rows[1].children![0] as J).type).toBe("View"); // the spinner ring
  });
  it("no lines, no rows", async () => {
    await render(<Steps lines={[]} />);
    expect((screen.toJSON() as J).children ?? []).toHaveLength(0);
  });
});
