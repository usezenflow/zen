import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { createGestureController } from "react-native-gesture-handler/jest-utils";
import { Toast } from "./toast";
import { t } from "@/lib/i18n";

// Gesture events take RNGH's JS path: our Reanimated mock has no native event bridge.
jest.mock("react-native-gesture-handler/lib/module/handlers/gestures/reanimatedWrapper", () => ({ Reanimated: undefined, Worklets: undefined }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 54, bottom: 0, left: 0, right: 0 }) }));
const root = { wrapper: GestureHandlerRootView };

it("a plain toast is not an alert", async () => {
  await render(<Toast text="Đã thêm" />, root);
  expect(roleOf(screen.getByText("Đã thêm") as never)).toBeUndefined();
});

it("shows the text and the sub line", async () => {
  await render(<Toast text="Đã thêm" sub="Ôn tập · 14:00" />, root);
  expect(screen.getByText("Đã thêm")).toBeOnTheScreen();
  expect(screen.getByText("Ôn tập · 14:00")).toBeOnTheScreen();
});

it("the action defaults to undo", async () => {
  const onAction = jest.fn();
  await render(<Toast text="Đã thêm" onAction={onAction} />, root);
  await fireEvent.press(screen.getByText(t("undo")));
  expect(onAction).toHaveBeenCalledTimes(1);
});

it("uses a given action label", async () => {
  await render(<Toast text="x" onAction={jest.fn()} actionLabel="Mở" />, root);
  expect(screen.getByText("Mở")).toBeOnTheScreen();
  expect(screen.queryByText(t("undo"))).toBeNull();
});

it("the alternative pill calls onAlt", async () => {
  const onAlt = jest.fn();
  await render(<Toast text="x" onAlt={onAlt} altLabel="T7 09:00" />, root);
  await fireEvent.press(screen.getByText(t("orWhen", { when: "T7 09:00" })));
  expect(onAlt).toHaveBeenCalledTimes(1);
});

it("no action and no alternative: no action row", async () => {
  await render(<Toast text="x" sub="" onAlt={jest.fn()} />, root); // onAlt without a label does not count
  expect(screen.queryByText(t("undo"))).toBeNull();
  expect(screen.queryByText(/hoặc/)).toBeNull();
  expect(screen.queryByText("")).toBeNull(); // empty sub is not rendered
});

/** The nearest host ancestor carrying `accessibilityRole` (the alert View is not itself accessible, so role queries skip it). */
const roleOf = (el: { parent: unknown; props: Record<string, unknown> } | null): unknown => (!el ? undefined : el.props.accessibilityRole ?? roleOf(el.parent as never));

it("an error is an alert, vermilion with white text", async () => {
  await render(<Toast text="Không nghe được" error />, root);
  expect(roleOf(screen.getByText("Không nghe được") as never)).toBe("alert");
  expect(StyleSheet.flatten(screen.getByText("Không nghe được").props.style).color).toBe("#fff");
});

describe("swipe to dismiss", () => {
  // scheduleOnRN lands in queueMicrotask (worklets mock), which the fake timers hold: run the ticks.
  const swipe = async (translationX: number, translationY: number) => {
    const g = createGestureController("toast");
    await act(async () => { g.begin(); g.activate(); g.update({ translationX, translationY }); g.end({ translationX, translationY }); jest.runAllTicks(); });
  };
  it.each([[120, 0], [-120, 0], [0, -60]])("flies off past the threshold (%i, %i)", async (dx, dy) => {
    const onDismiss = jest.fn();
    await render(<Toast text="x" onDismiss={onDismiss} />, root);
    await swipe(dx, dy);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
  it("a short swipe springs back", async () => {
    const onDismiss = jest.fn();
    await render(<Toast text="x" onDismiss={onDismiss} />, root);
    await swipe(40, -20);
    expect(onDismiss).not.toHaveBeenCalled();
  });
  it("without onDismiss the pan is disabled", async () => {
    await render(<Toast text="x" />, root);
    await expect(swipe(200, 0)).resolves.toBeUndefined(); // a disabled pan ignores the swipe
  });
});
