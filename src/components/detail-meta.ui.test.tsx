import { createRef } from "react";
import { Text, View } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { EdLine, Gly, Meta, type Glyph } from "./detail-meta";

const GLYPHS: (Glyph | "right")[] = ["trash", "pin", "person", "book", "link", "clock", "hourglass", "repeat", "dots", "right"];

it.each(GLYPHS)("Gly %s draws its paths", async (name) => {
  await render(<Gly name={name} size={20} color="#123456" />);
  const svg = screen.toJSON() as { props: Record<string, unknown> };
  expect(svg.props).toMatchObject({ stroke: "#123456", width: 20 });
});

describe("Meta", () => {
  it("a pressable line calls onPress", async () => {
    const onPress = jest.fn();
    await render(<Meta icon="clock" text="14:00 – 15:00" onPress={onPress} />);
    await fireEvent.press(screen.getByText("14:00 – 15:00"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("without onPress it is disabled", async () => {
    await render(<Meta icon="pin" text="A27.101" />);
    expect(screen.getByText("A27.101")).toBeDisabled();
  });

  it.each([["link", 1], ["red", 0], [undefined, 0]] as const)("tone %s: %i chevron", async (tone, n) => {
    await render(<Meta icon="link" text="LMS" tone={tone} />);
    expect(JSON.stringify(screen.toJSON()).split('"d":"M9 6l6 6-6 6"').length - 1).toBe(n);
  });

  it("long text stays on one line", async () => {
    const long = "Phòng học ".repeat(40).trim();
    await render(<Meta icon="pin" text={long} />);
    expect(screen.getByText(long).props.numberOfLines).toBe(1);
  });

  const TH = jest.requireActual("@/lib/theme").useTheme as () => { seal: string; ink: string; muted: string };
  it.each([["red", "seal", "600"], ["link", "ink", "600"], [undefined, "muted", "500"]] as const)("tone %s: %s color, weight %s", async (tone, key, weight) => {
    let th = {} as ReturnType<typeof TH>;
    function Probe() { th = TH(); return null; }
    await render(<><Probe /><Meta icon="clock" text="x" tone={tone} /></>);
    const st = Object.assign({}, ...[screen.getByText("x").props.style].flat(Infinity));
    expect(st.color).toBe(th[key]);
    expect(st.fontFamily).toBe(jest.requireActual("@/lib/theme").ff(weight));
  });
});

describe("EdLine", () => {
  it("forwards its ref to a non-collapsable view and renders children", async () => {
    const ref = createRef<View>();
    await render(<EdLine icon="clock" ref={ref as never}><Text>picker</Text></EdLine>);
    expect(ref.current).toBeTruthy();
    expect(screen.getByText("picker")).toBeTruthy();
  });
});
