import { describe, expect, it } from "vitest";
import { foldRepeats, foldSittings } from "./fold";
import { at, DAY, NOW, TODAY, task } from "../../test/factories";

// A daily flexible repeat: one stored occurrence per day from today, 30 days.
const daily = (n = 30, over: Partial<Parameters<typeof task>[0]> = {}) =>
  Array.from({ length: n }, (_, i) => task({ title: "Học tiếng Anh", rrule: "FREQ=DAILY", seriesId: "eng", start: at(19, 0, TODAY + i * DAY), end: at(20, 0, TODAY + i * DAY), ...over }));

describe("foldRepeats", () => {
  it("a daily repeat keeps its next 14 days and folds the rest into one row on the first day past them", () => {
    const xs = daily();
    const { hidden, folds } = foldRepeats(xs, NOW);
    expect(hidden.size).toBe(16);
    expect(folds).toHaveLength(1);
    expect(folds[0].xs).toHaveLength(16);
    expect(folds[0].first).toBe(TODAY + 14 * DAY); // 1/12, the first day past the window
    expect(folds[0].last).toBe(at(19, 0, TODAY + 29 * DAY)); // 16/12, its 19:00 sitting
    expect(xs.slice(0, 14).some((x) => hidden.has(x.id))).toBe(false); // the 14 days stay rows
  });

  it("a weekly repeat, a fixed block and a campus item are not folded", () => {
    const weekly = daily(30, { rrule: "FREQ=WEEKLY;BYDAY=MO", seriesId: "wk" });
    const fixed = daily(30, { fixed: "busy", seriesId: "busy" });
    const campus = daily(30, { source: "dlu", seriesId: "dlu" });
    expect(foldRepeats([...weekly, ...fixed, ...campus], NOW).hidden.size).toBe(0);
  });

  it("a single task is not folded, and a done occurrence beyond the window is not counted", () => {
    expect(foldRepeats([task({ start: at(9) })], NOW).hidden.size).toBe(0);
    const xs = daily(30);
    xs[20].doneAt = NOW - DAY;
    expect(foldRepeats(xs, NOW).folds[0].xs).toHaveLength(15);
  });
});

// A split task's sittings: one per day from today, 9:00.
const sits = (n = 4, over: Partial<Parameters<typeof task>[0]> = {}) =>
  Array.from({ length: n }, (_, i) => task({ id: `p#${i + 1}`, parentId: "p", start: at(9, 0, TODAY + i * DAY), end: at(10, 0, TODAY + i * DAY), ...over }));

describe("foldSittings", () => {
  it("sittings from tomorrow on fold into one row; today's and earlier ones stay rows", () => {
    const { shown, folded } = foldSittings(sits(4), NOW);
    expect(shown.map((x) => x.id)).toEqual(["p#1"]);
    expect(folded.map((x) => x.id)).toEqual(["p#2", "p#3", "p#4"]);
  });
  it("a done sitting and an unplaced one are never folded", () => {
    const xs = [...sits(3), task({ id: "p#9", parentId: "p" })];
    xs[1].doneAt = NOW - 1;
    const { shown, folded } = foldSittings(xs, NOW);
    expect(folded.map((x) => x.id)).toEqual(["p#3"]);
    expect(shown.map((x) => x.id)).toEqual(["p#1", "p#2", "p#9"]);
  });
});
