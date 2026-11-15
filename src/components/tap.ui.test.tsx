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
