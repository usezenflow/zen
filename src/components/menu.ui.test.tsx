import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet, Text } from "react-native";
import { DropMenu, HoldMenu } from "./menu";

jest.mock("expo-blur", () => ({ BlurView: () => null }));
// SwiftUI pieces as plain views that keep the props a test reads.
jest.mock("@expo/ui/swift-ui", () => {
  const R = require("react"), { View, Text: T } = require("react-native");
  const box = (name: string) => (p: { children?: unknown }) => R.createElement(View, { testID: name }, p.children);
  return {
    Host: box("Host"), HStack: box("HStack"), Image: box("Image"),
    Text: (p: { children?: unknown }) => R.createElement(T, null, p.children),
    Menu: (p: { label: unknown; systemImage?: string; modifiers: unknown[]; children?: unknown }) =>
      R.createElement(View, { testID: "Menu", label: p.label, systemImage: p.systemImage, modifiers: p.modifiers }, typeof p.label === "string" ? null : p.label, p.children),
    Button: (p: { label: string; role: string; onPress: () => void }) => R.createElement(T, { onPress: p.onPress, testID: `btn:${p.role}` }, p.label),
    ContextMenu: Object.assign(box("ContextMenu"), { Items: box("Items"), Trigger: box("Trigger") }),
  };
});
jest.mock("@expo/ui", () => ({ RNHostView: (p: { children: unknown }) => p.children }));
jest.mock("@expo/ui/swift-ui/modifiers", () => ({ font: (o: object) => ({ font: o }), labelStyle: (s: string) => ({ labelStyle: s }), tint: (c: string) => ({ tint: c }) }));

const items = () => [{ label: "Sửa", icon: "pencil" as const, onPress: jest.fn() }, { label: "Xoá", icon: "trash" as const, destructive: true, onPress: jest.fn() }];

describe("Android", () => {
  beforeEach(() => jest.replaceProperty(Platform, "OS", "android"));

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

  it("HoldMenu hands back its children unchanged", async () => {
    await render(<HoldMenu items={items()}><Text>row</Text></HoldMenu>);
    expect(screen.getByText("row")).toBeOnTheScreen();
    expect(screen.queryByTestId("ContextMenu")).toBeNull();
  });
});

describe("iOS", () => {
  beforeEach(() => jest.replaceProperty(Platform, "OS", "ios"));

  it("renders a native menu whose buttons run their item, destructive ones with that role", async () => {
    const xs = items();
    await render(<DropMenu label="Loại" sf="ellipsis" items={xs} color="#d9432b" size={15} />);
    const menu = screen.getByTestId("Menu");
    expect(menu.props.label).toBe("Loại");
    expect(menu.props.systemImage).toBe("ellipsis");
    expect(menu.props.modifiers).toEqual([{ tint: "#d9432b" }, { font: { size: 15, weight: "medium" } }]);
    expect(screen.getByTestId("btn:destructive")).toHaveTextContent("Xoá");
    expect(screen.getByTestId("btn:default")).toHaveTextContent("Sửa");
    await fireEvent.press(screen.getByText("Sửa"));
    expect(xs[0].onPress).toHaveBeenCalledTimes(1);
  });

  it("no label: icon only; chevron: label plus chevron and no symbol", async () => {
    const r = await render(<DropMenu sf="ellipsis" items={items()} />);
    expect(screen.getByTestId("Menu").props.modifiers).toEqual([{ labelStyle: "iconOnly" }]);
    await r.rerender(<DropMenu label="Tuần" chevron items={items()} />);
    expect(screen.getByTestId("Menu").props.systemImage).toBeUndefined();
    expect(screen.getByTestId("HStack")).toBeOnTheScreen();
    expect(screen.getByText("Tuần")).toBeOnTheScreen();
  });

  it("HoldMenu wraps its children in a context menu", async () => {
    await render(<HoldMenu items={items()}><Text>row</Text></HoldMenu>);
    expect(screen.getByTestId("ContextMenu")).toBeOnTheScreen();
    expect(screen.getByText("row")).toBeOnTheScreen();
  });
});
