import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet, Text } from "react-native";
import { DropMenu } from "./menu";

jest.mock("expo-blur", () => ({ BlurView: () => null }));
const items = () => [{ label: "Sửa", icon: "pencil" as const, onPress: jest.fn() }, { label: "Xoá", icon: "trash" as const, destructive: true, onPress: jest.fn() }];

describe.each(["ios", "android"] as const)("%s uses the custom dropdown", (os) => {
  beforeEach(() => jest.replaceProperty(Platform, "OS", os));

  it("the trigger opens, an item closes and runs", async () => {
    const xs = items();
    await render(<DropMenu label="Loại" items={xs} />);
    expect(screen.queryByText("Sửa")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Loại" }));
    await fireEvent.press(screen.getByText("Xoá"));
    expect(xs[1].onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Sửa")).toBeNull();
  });

  it("the trigger toggles the menu shut", async () => {
    await render(<DropMenu label="Loại" items={items()} />);
    await fireEvent.press(screen.getByRole("button", { name: "Loại" }));
    await fireEvent.press(screen.getByRole("button", { name: "Loại" }));
    expect(screen.queryByText("Sửa")).toBeNull();
  });

  it("the scrim closes without running anything", async () => {
    const xs = items();
    await render(<DropMenu label="Loại" items={xs} />);
    await fireEvent.press(screen.getByRole("button", { name: "Loại" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    // The scrim has no label: it is the full-bleed pressable (-2000 on every side).
    const scrim = screen.container.queryAll((n) => StyleSheet.flatten(n.props.style)?.top === -2000)[0];
    await fireEvent.press(scrim);
    expect(screen.queryByText("Sửa")).toBeNull();
    expect(xs[0].onPress).not.toHaveBeenCalled();
  });

  it("an icon trigger with no label is announced as menu", async () => {
    await render(<DropMenu icon={<Text>⋯</Text>} items={items()} />);
    expect(screen.getByRole("button", { name: "menu" })).toBeOnTheScreen();
  });
});
