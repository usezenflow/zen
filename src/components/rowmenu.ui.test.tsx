import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { MenuPanel, RowMenu, menuTop, sittingItems } from "./rowmenu";
import type { Task } from "@/lib/types";


jest.mock("expo-blur", () => ({ BlurView: () => null }));

it("an item closes the menu first, then runs", async () => {
  const order: string[] = [];
  const items = [{ label: "Sửa", icon: "pencil" as const, onPress: () => order.push("edit") }, { label: "Xoá", icon: "trash" as const, destructive: true, onPress: () => order.push("delete") }];
  await render(<RowMenu items={items} top={120} onClose={() => order.push("close")} />);
  await fireEvent.press(screen.getByText("Xoá"));
  expect(order).toEqual(["close", "delete"]);
});

it("the backdrop closes", async () => {
  const onClose = jest.fn();
  await render(<RowMenu items={[{ label: "Sửa", icon: "pencil" as const, onPress: jest.fn() }]} top={0} onClose={onClose} />);
  await fireEvent.press(screen.getByLabelText("close"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("shows destructive items in red, others in ink, each as a menu item", async () => {
  await render(<MenuPanel items={[{ label: "Sửa", icon: "pencil" as const, onPress: jest.fn() }, { label: "Xoá", icon: "trash" as const, destructive: true, onPress: jest.fn() }]} onPick={jest.fn()} />);
  expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  expect(StyleSheet.flatten(screen.getByText("Xoá").props.style).color).toBe("#ff3b30");
  expect(StyleSheet.flatten(screen.getByText("Sửa").props.style).color).not.toBe("#ff3b30");
});

it("an empty list renders an empty panel", async () => {
  await render(<MenuPanel items={[]} onPick={jest.fn()} />);
  expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
});

// A 844pt screen, 47 inset on top, 34 below, the mic's 90: the menu goes under the row while it fits, else over it, never on it.
it("puts the menu under the row, or over it near the bottom, never on the row", () => {
  expect(menuTop(260, 200, 3, 844, 47, 34)).toBe(264); // room below
  const nearBottom = menuTop(700, 640, 3, 844, 47, 34);
  expect(nearBottom + 151).toBeLessThanOrEqual(640); // its whole height above the row's top
  expect(nearBottom).toBe(640 - 4 - 151);
  expect(menuTop(160, 100, 12, 844, 47, 34)).toBe(164); // no room either way: under, as before
});

// A sitting or split task offers "Cần thêm"; "Bớt" only with two or more open sittings; a plain or done task offers neither.
describe("sitting items", () => {
  const T = (o: Partial<Task>): Task => ({ id: "x", title: "Luyện đề", kind: "study", source: "user", effort: 60, createdAt: 0, ...o });
  const on = { more: jest.fn(), less: jest.fn() };
  const labels = (x: Task, ts: Task[]) => sittingItems(x, ts, on).map((i) => i.label);

  it("a plain task offers more only; a repeat or a done task none", () => {
    expect(labels(T({ id: "p" }), [T({ id: "p" })])).toEqual(["Cần thêm một buổi"]);
    expect(labels(T({ id: "p", rrule: "FREQ=DAILY" }), [])).toEqual([]);
    expect(labels(T({ id: "p", doneAt: 1 }), [])).toEqual([]);
  });
  it("one open sitting: more only", () => {
    const ts = [T({ id: "p" }), T({ id: "p#1", parentId: "p" })];
    expect(labels(ts[1], ts)).toEqual(["Cần thêm một buổi"]);
  });
  it("two open sittings: more and less, and from the parent's row too", () => {
    const ts = [T({ id: "p" }), T({ id: "p#1", parentId: "p" }), T({ id: "p#2", parentId: "p" })];
    expect(labels(ts[2], ts)).toEqual(["Cần thêm một buổi", "Bớt một buổi"]);
    expect(labels(ts[0], ts)).toEqual(["Cần thêm một buổi", "Bớt một buổi"]);
  });
  it("done sittings do not count toward less", () => {
    const ts = [T({ id: "p" }), T({ id: "p#1", parentId: "p", doneAt: 1 }), T({ id: "p#2", parentId: "p" })];
    expect(labels(ts[2], ts)).toEqual(["Cần thêm một buổi"]);
  });
  it("the items act on the parent", () => {
    const ts = [T({ id: "p" }), T({ id: "p#1", parentId: "p" }), T({ id: "p#2", parentId: "p" })];
    const more = jest.fn();
    sittingItems(ts[1], ts, { more, less: jest.fn() })[0].onPress();
    expect(more).toHaveBeenCalledWith(ts[0]);
  });
  it("renders as menu items", async () => {
    const ts = [T({ id: "p" }), T({ id: "p#1", parentId: "p" }), T({ id: "p#2", parentId: "p" })];
    await render(<MenuPanel items={sittingItems(ts[1], ts, on)} onPick={jest.fn()} />);
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByText("Bớt một buổi")).toBeTruthy();
  });
});
