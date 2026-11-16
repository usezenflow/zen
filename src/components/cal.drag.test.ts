import { describe, expect, it } from "vitest";
import { addDays, dayAt, monthGrid } from "./cal";

describe("drag hit test", () => {
  const mon = new Date(2026, 10, 16).getTime(), r = { x: 16, y: 200, w: 350, h: 210 };
  it("finds the column of a week and the cell of a month, nothing off the grid", () => {
    expect(dayAt(r, mon, 1, 16, 250)).toBe(mon);
    expect(dayAt(r, mon, 1, 365, 250)).toBe(addDays(mon, 6));
    expect(dayAt(r, mon, 1, 16 + 50 * 3 + 1, 190)).toBe(addDays(mon, 3)); // a little above: still the column
    expect(dayAt(r, mon, 1, 100, 100)).toBeUndefined();
    expect(dayAt(r, mon, 1, 10, 250)).toBeUndefined();
    const g = monthGrid(new Date(2026, 10, 20).getTime()); // November 2026 starts on a Sunday: 6 rows from Mon 26/10
    expect([g.start, g.rows]).toEqual([new Date(2026, 9, 26).getTime(), 6]);
    expect(dayAt(r, g.start, g.rows, 16, 200 + 35 * 5 + 1)).toBe(new Date(2026, 10, 30).getTime());
  });
});
