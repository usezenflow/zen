import { describe, expect, it } from "vitest";
import { resize } from "./split";

const days = (n: number, h = 3) => Array.from({ length: n }, () => h);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("resize", () => {
  it("tight: fewer, longer sittings, one a day, flags what cannot fit", () => {
    const r = resize({ left: 500, free: days(3) });
    expect(r.sizes.length).toBe(3);
    expect(Math.max(...r.sizes)).toBeLessThanOrEqual(180);
    expect(resize({ left: 900, free: days(2) }).short).toBe(true);
    expect(r.short).toBe(false);
  });
  it("wide: keeps the usual count, never thinner", () => {
    expect(resize({ left: 600, free: days(14) }).sizes.length).toBe(resize({ left: 600, free: days(8) }).sizes.length);
    expect(resize({ left: 600, free: days(14) }).sizes.length).toBeGreaterThanOrEqual(5);
  });
  it("buffer: pads by at most 30 a sitting, none on the last day", () => {
    const r = resize({ left: 600, free: days(10), slip: 0.5 });
    expect(r.buffer).toBeGreaterThan(0);
    expect(r.buffer).toBeLessThanOrEqual(30 * r.sizes.length);
    expect(resize({ left: 120, free: days(1) }).buffer).toBe(0);
  });
  it("covers the work", () => expect(sum(resize({ left: 450, free: days(6) }).sizes)).toBeGreaterThanOrEqual(450));
});
