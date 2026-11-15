import { render, screen } from "@testing-library/react-native";
import { processColor } from "react-native";
import { Logo, TypeArt } from "./art";

type J = { type: string; props: Record<string, any>; children: unknown[] | null };
const nodes = (j: unknown): J[] => (!j || typeof j === "string" ? [] : Array.isArray(j) ? j.flatMap(nodes) : [j as J, ...nodes((j as J).children)]);
const of = (type: string) => nodes(screen.toJSON()).filter((n) => n.type === type);
const paint = (c: string) => ({ type: 0, payload: processColor(c) });

describe("Logo", () => {
  it("paints the sun vermilion in color and line modes, ink otherwise", async () => {
    for (const [mode, sun] of [["color", "#d9432b"], ["line", "#d9432b"], ["mono", "#123456"], ["white", "#fff"]] as const) {
      await render(<Logo mode={mode} color="#123456" />);
      expect(of("RNSVGCircle")[0].props.fill).toEqual(paint(sun));
    }
  });
  it("white forces white ink on the leaf; line draws an outline that thickens when small", async () => {
    await render(<Logo mode="white" color="#123456" />);
    expect(of("RNSVGPath")[0].props.fill).toEqual(paint("#fff"));
    await render(<Logo mode="line" color="#123456" size={20} />);
    expect(of("RNSVGPath")[0].props).toMatchObject({ fill: null, strokeWidth: 7 }); // 140 / 20
    await render(<Logo mode="line" size={100} />);
    expect(of("RNSVGPath")[0].props.strokeWidth).toBe(3); // floor
  });
  it("uses the bigger sun below 24px", async () => {
    await render(<Logo size={20} />);
    expect(of("RNSVGCircle")[0].props.r).toBe(13);
    await render(<Logo size={24} />);
    expect(of("RNSVGCircle")[0].props.r).toBe(11);
  });
  it("without a state is a plain svg of its size; load and err get the wider animated canvas", async () => {
    await render(<Logo size={40} />);
    expect(of("RNSVGSvgView")[0].props.width).toBe(40);
    expect(of("RNSVGGroup")).toHaveLength(1); // the svg's own root group only
    for (const state of ["load", "err"] as const) {
      await render(<Logo size={40} state={state} />);
      expect(of("RNSVGSvgView")[0].props.width).toBe(72);
      expect(of("RNSVGGroup").length).toBeGreaterThan(1); // leaf and sun each in their own animated group
    }
  });
});

describe("TypeArt", () => {
  it("draws rings by default and rake lines with dir v", async () => {
    await render(<TypeArt type="lecture" w={100} h={100} />);
    expect(of("RNSVGCircle").length).toBeGreaterThan(2);
    expect(of("RNSVGPath")).toHaveLength(0);
    await render(<TypeArt type="lecture" w={100} h={100} dir="v" />);
    expect(of("RNSVGPath").length).toBeGreaterThan(2);
    expect(of("RNSVGCircle")).toHaveLength(1); // just the stone
  });
  it("gives each instance its own gradient id", async () => {
    await render(<><TypeArt type="plan" /><TypeArt type="plan" /></>);
    const ids = of("RNSVGLinearGradient").map((g) => g.props.name);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => /^a\w+$/.test(id))).toBe(true); // useId's colons stripped
  });
});
