import { expect, it } from "vitest";
import { totalBytes } from "./models";

const h = (m: Record<string, string>) => (k: string) => m[k] ?? null;

it("reads total size for full and resumed responses", () => {
  expect(totalBytes(200, h({ "content-length": "100" }), 0)).toBe(100);
  expect(totalBytes(206, h({ "content-length": "40" }), 60)).toBe(100);
  expect(totalBytes(206, h({ "content-range": "bytes 60-99/100", "content-length": "40" }), 60)).toBe(100);
  expect(totalBytes(200, h({}), 0)).toBeUndefined();
});
