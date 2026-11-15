import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { MenuPanel, RowMenu } from "./rowmenu";

jest.mock("expo-blur", () => ({ BlurView: () => null }));

it("an item closes the menu first, then runs", async () => {
  const order: string[] = [];
  const items = [{ label: "Sửa", onPress: () => order.push("edit") }, { label: "Xoá", destructive: true, onPress: () => order.push("delete") }];
  await render(<RowMenu items={items} top={120} onClose={() => order.push("close")} />);
  await fireEvent.press(screen.getByText("Xoá"));
  expect(order).toEqual(["close", "delete"]);
});

it("the backdrop closes", async () => {
  const onClose = jest.fn();
  await render(<RowMenu items={[{ label: "Sửa", onPress: jest.fn() }]} top={0} onClose={onClose} />);
  await fireEvent.press(screen.getByLabelText("close"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("shows destructive items in red, others in ink, each as a menu item", async () => {
  await render(<MenuPanel items={[{ label: "Sửa", onPress: jest.fn() }, { label: "Xoá", destructive: true, onPress: jest.fn() }]} onPick={jest.fn()} />);
  expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  expect(StyleSheet.flatten(screen.getByText("Xoá").props.style).color).toBe("#ff3b30");
  expect(StyleSheet.flatten(screen.getByText("Sửa").props.style).color).not.toBe("#ff3b30");
});

it("an empty list renders an empty panel", async () => {
  await render(<MenuPanel items={[]} onPick={jest.fn()} />);
  expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
});
