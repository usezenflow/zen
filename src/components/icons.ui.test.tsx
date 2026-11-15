import { render, screen } from "@testing-library/react-native";
import { processColor } from "react-native";
import { Icon, type IconName } from "./icons";

type J = { type: string; props: Record<string, any>; children: unknown[] | null };
const nodes = (j: unknown): J[] => (!j || typeof j === "string" ? [] : Array.isArray(j) ? j.flatMap(nodes) : [j as J, ...nodes((j as J).children)]);
// The dictionary is private: read its keys from the source so a new icon is covered without editing this test.
declare const __dirname: string; // jest provides it; the project has no @types/node
const fs: { readFileSync(p: string, e: "utf8"): string } = require("fs");
const src = fs.readFileSync(`${__dirname}/icons.tsx`, "utf8");
const NAMES = [...src.slice(src.indexOf("const I = {"), src.indexOf("};")).matchAll(/^\s+(\w+): '/gm)].map((m) => m[1]) as IconName[];

it("finds the dictionary (guards the source parse below)", () => expect(NAMES.length).toBeGreaterThan(20));

it.each(NAMES)("renders %s as at least one shape", async (name) => {
  await render(<Icon name={name} />);
  expect(nodes(screen.toJSON()).filter((n) => /^RNSVG(Path|Circle|Rect)$/.test(n.type)).length).toBeGreaterThan(0);
});

it("fills currentColor with the icon colour", async () => {
  await render(<Icon name="dots" color="#123456" />);
  const dots = nodes(screen.toJSON()).filter((n) => n.type === "RNSVGCircle");
  expect(dots).toHaveLength(3);
  for (const d of dots) expect(d.props.fill).toEqual({ type: 0, payload: processColor("#123456") });
});

it("throws on a name outside the dictionary (only the IconName type guards it)", async () => {
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  await expect(render(<Icon name={"nope" as IconName} />)).rejects.toThrow();
  err.mockRestore();
});
