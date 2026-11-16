import { describe, expect, it } from "vitest";
import { addClassLog, classMult, classMults } from "./context";
import { readFull } from "./adapt";

const NOW = new Date("2026-11-13T10:00:00").getTime();
const codeMinutes = (classMult?: Record<string, number>) =>
  readFull("code x", new Date(NOW), "typed", { classMult }).items[0]?.durationMinutes;

describe("class multiplier", () => {
  it("no samples: 1, and the reader's guess stands", () => {
    expect(classMult([])).toBe(1);
    expect(codeMinutes()).toBe(180);
    expect(codeMinutes(classMults({}))).toBe(180);
  });

  it("three done code tasks at half their guess: the next guess is smaller, at least 30 and a multiple of 30", () => {
    let logs = {};
    for (let i = 0; i < 3; i++) logs = addClassLog(logs, "code", 0.5);
    const d = codeMinutes(classMults(logs))!;
    expect(d).toBeLessThan(180);
    expect(d).toBeGreaterThanOrEqual(30);
    expect(d % 30).toBe(0);
  });

  it("clamped to 0.5..2 and shrunk toward 1 with few samples", () => {
    expect(classMult([Math.log(0.01)])).toBe(0.5);
    expect(classMult([Math.log(100)])).toBe(2);
    expect(classMult([Math.log(0.5)])).toBeCloseTo(Math.exp(0.25 * Math.log(0.5)), 10);
  });
});
