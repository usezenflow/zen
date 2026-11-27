import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SittingList } from "./sittings";
import { t } from "@/lib/i18n";
import { day } from "@/lib/when";
import { at, DAY, TODAY, task } from "../../test/factories";

type J = { type: string; props: Record<string, unknown>; children: unknown[] | null };
const nodes = (j: unknown): J[] => (!j || typeof j === "string" ? [] : Array.isArray(j) ? j.flatMap(nodes) : [j as J, ...nodes((j as J).children)]);
const styleOf = (n: { props: { style?: unknown } }) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>;

describe("SittingList", () => {
  it("shows all future sittings directly when opened, with vertical spacing between them", async () => {
    const sits = [1, 2, 3].map((i) => task({ id: `p#${i}`, parentId: "p", start: at(9, 0, TODAY + i * DAY), end: at(10, 0, TODAY + i * DAY) }));
    await render(<SittingList sits={sits} canDrop canAdd onTime={jest.fn()} onDrop={jest.fn()} onAdd={jest.fn()} onSettle={jest.fn()} />);

    await fireEvent.press(screen.getByLabelText(t("sitSum", { done: 0, total: 3, left: 3 })));

    for (const k of sits) expect(screen.getByLabelText(day(k.start!, 0))).toBeTruthy();
    expect(screen.queryByText(/buổi sau/i)).toBeNull();

    const list = nodes(screen.toJSON()).find((n) => n.type === "View" && (styleOf(n).gap as number) >= 8 && (n.children ?? []).length === 3);
    expect(list).toBeTruthy();
  });
});
