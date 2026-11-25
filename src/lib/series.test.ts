import { describe, expect, it } from "vitest";
import type { Task } from "./types";
import { seriesOffer } from "./series";

const now = new Date(2026, 10, 16, 12).getTime(); // Monday noon
// a done sitting `weeksAgo` weeks back on `weekday` (0 Sunday .. 6 Saturday), counted from this Monday
const done = (weeksAgo: number, weekday = 1, title = "Chạy bộ"): Task => {
  const at = new Date(2026, 10, 16 - 7 * weeksAgo + (weekday - 1), 7).getTime();
  return { id: `${title}${weeksAgo}${weekday}`, title, kind: "exercise", source: "user", effort: 30, createdAt: at, doneAt: at };
};

describe("seriesOffer", () => {
  it("offers a weekly repeat after the same title on the same weekday three weeks running", () => {
    expect(seriesOffer([done(0), done(1), done(2)], now, [])).toMatchObject({ title: "Chạy bộ", weekday: 1, rrule: "FREQ=WEEKLY;BYDAY=MO", effort: 30 });
  });

  it("not after two weeks", () => {
    expect(seriesOffer([done(0), done(1)], now, [])).toBeUndefined();
  });

  it("not when the weekday differs", () => {
    expect(seriesOffer([done(0, 1), done(1, 1), done(2, 2)], now, [])).toBeUndefined();
  });

  it("not when the last one is more than a week old", () => {
    expect(seriesOffer([done(2), done(3), done(4)], now, [])).toBeUndefined();
  });

  it("not when declined, or when the title already repeats", () => {
    const offer = seriesOffer([done(0), done(1), done(2)], now, [])!;
    expect(seriesOffer([done(0), done(1), done(2)], now, [offer.key])).toBeUndefined();
    expect(seriesOffer([done(0), done(1), done(2), { ...done(0, 3, "x"), rrule: "FREQ=WEEKLY", title: "chạy bộ" }], now, [])).toBeUndefined();
  });
});
