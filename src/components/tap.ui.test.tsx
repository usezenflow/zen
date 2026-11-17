import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Tap } from "./tap";

it("forwards press in and out to the caller", async () => {
  const onPressIn = jest.fn(), onPressOut = jest.fn(), onPress = jest.fn();
  await render(<Tap onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} accessibilityLabel="go"><Text>Go</Text></Tap>);
  await fireEvent(screen.getByLabelText("go"), "pressIn");
  await fireEvent(screen.getByLabelText("go"), "pressOut");
  await fireEvent.press(screen.getByLabelText("go"));
  expect(onPressIn).toHaveBeenCalled();
  expect(onPressOut).toHaveBeenCalled();
  expect(onPress).toHaveBeenCalledTimes(1);
});

it.each(["pop", "row", "fade"] as const)("renders the %s variant", async (variant) => {
  await render(<Tap variant={variant}><Text>{variant}</Text></Tap>);
  expect(screen.getByText(variant)).toBeOnTheScreen();
});

it("passes other Pressable props through: disabled blocks the press", async () => {
  const onPress = jest.fn();
  await render(<Tap onPress={onPress} disabled accessibilityLabel="off" accessibilityRole="button"><Text>Off</Text></Tap>);
  const b = screen.getByRole("button", { name: "off" });
  await fireEvent.press(b);
  expect(onPress).not.toHaveBeenCalled();
  expect(b).toBeDisabled();
});

it("pads a small control to a 48pt touch target, keeps a bigger slop it was given, and leaves a big one alone", async () => {
  const lay = (width: number, height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  await render(<><Tap accessibilityLabel="tiny"><Text>+</Text></Tap><Tap accessibilityLabel="wide" hitSlop={{ top: 20 }}><Text>Thêm buổi</Text></Tap><Tap accessibilityLabel="big"><Text>Row</Text></Tap></>);
  await fireEvent(screen.getByLabelText("tiny"), "layout", lay(20, 24));
  expect(screen.getByLabelText("tiny").props.hitSlop).toEqual({ top: 12, bottom: 12, left: 14, right: 14 });
  await fireEvent(screen.getByLabelText("wide"), "layout", lay(300, 40));
  expect(screen.getByLabelText("wide").props.hitSlop).toEqual({ top: 20, bottom: 4, left: 0, right: 0 });
  await fireEvent(screen.getByLabelText("big"), "layout", lay(320, 56));
  expect(screen.getByLabelText("big").props.hitSlop).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
});
