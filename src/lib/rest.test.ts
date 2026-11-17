import { describe, expect, it } from "vitest";
import { REST_BASE, gapPick, restLine, worked } from "./rest";
import type { Task } from "./types";

const at = (d: string) => new Date(`2026-11-16T${d}:00`).getTime(), M = 60_000, H = 60 * M;
const DAY0 = new Date("2026-11-16T00:00:00").getTime();
let n = 0;
const tk = (o: Partial<Task>): Task => ({ id: `t${n++}`, title: "x", kind: "chores", source: "user", effort: 30, createdAt: 0, ...o });
const lecture = (s: string, e: string, day = "2026-11-16") => tk({ fixed: "lecture", source: "dlu", start: new Date(`${day}T${s}:00`).getTime(), end: new Date(`${day}T${e}:00`).getTime() });

describe("worked", () => {
  it("a full DLU lecture day counts half: 7h10 is 3h35", () => {
    expect(worked([lecture("07:30", "11:10"), lecture("13:00", "16:30")], DAY0, at("17:00"))).toBe(215 * M);
  });
  it("a lecture not yet over does not count", () => {
    expect(worked([lecture("13:00", "16:30")], DAY0, at("15:00"))).toBe(0);
  });
  it("own work counts start to tick; a late tick counts only its block; an early tick its length", () => {
    const xs = [
      tk({ start: at("08:00"), end: at("09:00"), doneAt: at("08:40") }), // 40
      tk({ start: at("10:00"), end: at("11:00"), doneAt: at("20:00") }), // late: 60
      tk({ start: at("23:00"), end: at("23:30"), effort: 30, doneAt: at("12:00") }), // early: 30
    ];
    expect(worked(xs, DAY0, at("21:00"))).toBe(130 * M);
  });
  it("overlapping ticks count once, and a parent of sittings never adds itself", () => {
    const p = tk({ effort: 120 });
    const xs = [p, tk({ parentId: p.id, start: at("08:00"), end: at("09:00"), doneAt: at("09:00") }), tk({ start: at("08:30"), end: at("09:30"), doneAt: at("09:30") })];
    expect(worked(xs, DAY0, at("21:00"))).toBe(90 * M);
  });
});

describe("restLine", () => {
  it("is 6h until five working days are seen, then follows them", () => {
    expect(restLine([], at("12:00"))).toBe(REST_BASE);
    const heavy = [1, 2, 3, 4, 5].map((d) => { const s = DAY0 - d * 86400_000 + 8 * H; return tk({ start: s, end: s + 8 * H, doneAt: s + 8 * H }); });
    expect(restLine(heavy, at("12:00"))).toBe(8 * H);
    expect(restLine(heavy, at("12:00"), 30 * M)).toBe(8 * H + 30 * M); // a swipe moves it later
  });
});

describe("gapPick", () => {
  const tomorrow = (h: string) => new Date(`2026-11-17T${h}:00`).getTime();
  it("offers tomorrow's task that fits, due soonest first", () => {
    const a = tk({ title: "Giặt đồ", start: tomorrow("09:00"), end: tomorrow("09:30") });
    const b = tk({ title: "Viết luận", start: tomorrow("10:00"), end: tomorrow("10:30"), deadline: tomorrow("23:59") });
    expect(gapPick([a, b], at("14:30"), at("15:00"))?.task.title).toBe("Viết luận");
  });
  it("skips what does not fit, repeats, said windows, hand-placed and today's own work", () => {
    const xs = [
      tk({ start: tomorrow("09:00"), end: tomorrow("10:00") }), // 60 > 30 free
      tk({ start: tomorrow("09:00"), end: tomorrow("09:30"), rrule: "FREQ=DAILY" }),
      tk({ start: tomorrow("09:00"), end: tomorrow("09:30"), notBefore: tomorrow("09:00") }),
      tk({ start: tomorrow("09:00"), end: tomorrow("09:30"), userEdited: ["start"] }),
      tk({ start: at("16:00"), end: at("16:30") }),
    ];
    expect(gapPick(xs, at("14:30"), at("15:00"))).toBeUndefined();
  });
  it("nothing runs past 22:00", () => {
    expect(gapPick([tk({ start: tomorrow("09:00"), end: tomorrow("09:30") })], at("21:50"))).toBeUndefined();
  });
});
