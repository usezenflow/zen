import { render, screen } from "@testing-library/react-native";
import { processColor } from "react-native";
import { artOf, Logo, TypeArt } from "./art";
import { task } from "../../test/factories";

type J = { type: string; props: Record<string, any>; children: unknown[] | null };
const nodes = (j: unknown): J[] => (!j || typeof j === "string" ? [] : Array.isArray(j) ? j.flatMap(nodes) : [j as J, ...nodes((j as J).children)]);
const of = (type: string) => nodes(screen.toJSON()).filter((n) => n.type === type);
const paint = (c: string) => ({ type: 0, payload: processColor(c) });

describe("Logo", () => {
  it("color is the whole mark in koi orange (ui.js LOGO); mono and white use their own ink for body and tails", async () => {
    for (const [mode, accent] of [["color", "#ff8a5c"], ["mono", "#123456"], ["white", "#fff"]] as const) {
      await render(<Logo mode={mode} color="#123456" />);
      const [body, , up, lo] = of("RNSVGPath");
      expect(body.props.fill).toEqual(paint(mode === "white" ? "#fff" : mode === "color" ? "#ff8a5c" : "#123456"));
      expect(up.props.fill).toEqual(paint(accent));
      expect(lo.props.fill).toEqual(paint(accent));
    }
  });
  it("color and mono carry the dry-brush mask; line is an outline with no mask", async () => {
    await render(<Logo mode="color" />);
    expect(of("RNSVGMask")).toHaveLength(1);
    await render(<Logo mode="line" color="#123456" size={20} />);
    expect(of("RNSVGMask")).toHaveLength(0);
    expect(of("RNSVGPath")[0].props).toMatchObject({ fill: null, strokeWidth: 7 }); // 140 / 20
    await render(<Logo mode="line" size={100} />);
    expect(of("RNSVGPath")[0].props.strokeWidth).toBe(3); // floor
  });
  it("without a state is a plain svg of its size; load and err get the wider animated canvas", async () => {
    await render(<Logo size={40} />);
    expect(of("RNSVGSvgView")[0].props.width).toBe(40);
    for (const state of ["load", "err"] as const) {
      await render(<Logo size={40} state={state} />);
      expect(of("RNSVGSvgView")[0].props.width).toBe(72);
    }
  });
});

describe("artOf", () => {
  it("each type keeps its own palette: exam is not assignment, and each prep has its own", () => {
    expect(artOf(task({ fixed: "exam" }))).toBe("exam");
    expect(artOf(task({ forId: "dlu:portal:exam:9" }))).toBe("exam_prep");
    expect(artOf(task({ forId: "dlu:lms:a1" }))).toBe("assignment_prep");
    expect(artOf(task({ source: "dlu", id: "dlu:lms:a1", deadline: 5 }))).toBe("assignment");
  });
  it("a personal task keeps its kind's palette, with or without a deadline", () => {
    expect(artOf(task({ kind: "work" }))).toBe("night");
    expect(artOf(task({ kind: "work", deadline: 5 }))).toBe("night");
  });
});

describe("TypeArt", () => {
  it("paints a ground and two radial fields, each seen through a stripe mask", async () => {
    await render(<TypeArt type="lecture" w={100} h={100} dir="v" />);
    expect(of("RNSVGLinearGradient")).toHaveLength(1);
    expect(of("RNSVGRadialGradient")).toHaveLength(3);
    expect(of("RNSVGMask")).toHaveLength(2);
    expect(of("RNSVGPattern")).toHaveLength(0);
  });
  it("gives each instance its own gradient id", async () => {
    await render(<><TypeArt type="plan" /><TypeArt type="plan" /></>);
    const ids = of("RNSVGLinearGradient").map((g) => g.props.name);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
