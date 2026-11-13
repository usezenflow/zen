import { describe, expect, it } from "vitest";
import { readActions } from "./adapt";

// 2026-11-13 is a Friday; 10:00Z is 17:00 in UTC+7.
const now = new Date("2026-11-13T10:00:00Z");

describe("readActions", () => {
  it("maps a dated task to create with a deadline or start", () => {
    const a = readActions("nop bao cao mon toan 20/11 23h", now);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((x) => x.op === "create" && x.title)).toBe(true);
    expect(a.some((x) => x.deadline?.startsWith("2026-11-20") || x.when?.startsWith("2026-11-20"))).toBe(true);
  });
  it("returns nothing for empty text", () => {
    expect(readActions("", now)).toEqual([]);
  });
});
