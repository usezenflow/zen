import { describe, expect, it } from "vitest";
import { DAY, energy, energyAt } from "./features";

const now = new Date(2026, 10, 16, 12).getTime();
const at = (hour: number, daysAgo = 1) => ({ hour, at: now - daysAgo * DAY });

describe("energyAt: the bimodal energy of done hours", () => {
  it("fewer than 5 recent done hours: the scalar energy at the peak, as before", () => {
    const done = [at(9), at(9.5), at(10), at(11)];
    for (const h of [8, 9.5, 15, 20]) expect(energyAt(done, h, now, 15)).toBeCloseTo(energy(h, 15), 12);
  });

  it("done hours older than 14 days do not count toward the 5", () => {
    const done = [...Array.from({ length: 10 }, () => at(21, 20)), at(9), at(9.5), at(10), at(10.5)];
    for (const h of [9, 15, 21]) expect(energyAt(done, h, now, 15)).toBeCloseTo(energy(h, 15), 12);
  });

  it("two good stretches (09:30 and 21:30) are both at 1; 15:30 is not, where the scalar peak put it", () => {
    const done = [...Array.from({ length: 8 }, () => at(9.5)), ...Array.from({ length: 8 }, () => at(21.5))];
    expect(energyAt(done, 9.5, now)).toBeCloseTo(1, 6);
    expect(energyAt(done, 21.5, now)).toBeCloseTo(1, 6);
    expect(energyAt(done, 15.5, now)).toBeLessThan(0.05);
  });

  it("is circular: 23:30 counts for 00:30", () => {
    const done = Array.from({ length: 6 }, () => at(23.5));
    expect(energyAt(done, 0.5, now)).toBeGreaterThan(0.5);
    expect(energyAt(done, 12, now)).toBeLessThan(0.01);
  });
});
