import { describe, expect, it } from "vitest";
import type { ReaderItem, ReaderWC } from "../shared";
import { nextClock, prepMinutes } from "./assemble";
import { activityPm, applyImplied } from "./implied";
import { read } from "./reader";

const ref: ReaderWC = { y: 2026, m: 11, d: 5, h: 9, mi: 0 };

const task = (over: Partial<ReaderItem> = {}): ReaderItem => ({
  type: "PLAN",
  title: "chay bo",
  note: null,
  durationMinutes: 45,
  confidence: 0.8,
  inferred: ["durationMinutes"],
  flags: [],
  alternatives: [],
  evidence: "chạy bộ",
  checked: false,
  ...over,
});

describe("parts of the day of an activity", () => {
  it("marks only the dinner as a PM activity", () => {
    expect(activityPm("an toi")).toBe(true);
    expect(activityPm("an sang")).toBe(false);
  });
});

describe("bare clock of an evening activity", () => {
  it("reads 10h as 22:00 for dinner, where nextClock alone reads 10:00", () => {
    expect(nextClock(10, 0, ref, false, true)).toEqual({
      h: 22,
      mi: 0,
      part: "toi",
      off: 0,
    });
    expect(nextClock(10, 0, ref, false)).toMatchObject({ h: 10 });
  });
});

describe("applyImplied", () => {
  it("leaves the length to size.ts, whatever the activity", () => {
    const it = task();
    applyImplied(it, ref);
    expect(it.durationMinutes).toBe(45);
    expect(it.inferred).toEqual(["durationMinutes"]);
  });

  it("keeps a length the text typed", () => {
    const it = task({ inferred: [] });
    applyImplied(it, ref);
    expect(it.durationMinutes).toBe(45);
  });

  it("gives breakfast the morning and lunch an after-lunch start", () => {
    const breakfast = task({ title: "an sang", evidence: "ăn sáng" });
    applyImplied(breakfast, ref);
    expect(breakfast.windows).toEqual(["MORNING"]);

    const reading = task({
      title: "doc sach",
      evidence: "sau bữa trưa đọc sách",
      durationMinutes: 45,
    });
    applyImplied(reading, ref);
    expect(reading.notBefore).toBe("2026-11-05 13:00");
    expect(reading.inferred).toContain("notBefore");
  });

  it("puts a task before bed in the night, and one on waking first", () => {
    const bed = task({ title: "doc sach", evidence: "trước khi ngủ đọc sách" });
    applyImplied(bed, ref);
    expect(bed.windows).toEqual(["NIGHT"]);

    const first = task({ title: "chay bo", evidence: "việc đầu tiên chạy bộ" });
    applyImplied(first, ref);
    expect(first.windows).toEqual(["EARLY_MORNING"]);
  });

  it("leaves a fixed item, a dated task and a meeting alone", () => {
    const fixed = task({
      type: "BUSY",
      startsAt: "2026-11-05 10:00",
      evidence: "sau bữa trưa họp",
      title: "hop",
    });
    applyImplied(fixed, ref);
    expect(fixed.notBefore).toBeUndefined();
    expect(fixed.durationMinutes).toBe(45);

    const dated = task({ startsAt: "2026-11-05 10:00", windows: undefined });
    applyImplied(dated, ref);
    expect(dated.windows).toBeUndefined();
  });
});

describe("prep length with course affinity", () => {
  it("scales the prep by the multiplier", () => {
    const due: ReaderWC = { y: 2026, m: 11, d: 8, h: 0, mi: 0 };
    // 120 * 3/7 days left, rounded to the grid: 60 at 1.0, 90 at 1.5
    expect(prepMinutes(120, 7, due, ref)).toBe(60);
    expect(prepMinutes(120, 7, due, ref, 1.5)).toBe(90);
  });
});

describe("read", () => {
  it("sizes a typed activity from the reader", () => {
    // the class sizes it: a run is 30 a session (the sizer wins over the activity default)
    const [it] = read("chạy bộ", { ref, source: "typed" }).items;
    expect(it.durationMinutes).toBe(30);
  });

  it("keeps a typed length over the activity", () => {
    const [it] = read("chạy bộ 20 phút", { ref, source: "typed" }).items;
    expect(it.durationMinutes).toBe(15); // said: the 15 minute grid
  });
});

describe("a task on a named day", () => {
  // Thu 12 Nov 2026
  const now: ReaderWC = { y: 2026, m: 11, d: 12, h: 9, mi: 0 };
  const one = (s: string) => read(s, { ref: now, source: "typed" }).items[0];

  it("clamps to that day and takes the activity's parts", () => {
    const it = one("Cafe vs Quang cn này");
    expect(it.notBefore).toBe("2026-11-15 00:00");
    expect(it.deadline).toBe("2026-11-15 23:59");
    expect(it.windows).toEqual(["MORNING", "AFTERNOON", "EVENING"]);
  });

  it("keeps a due cue as a deadline only", () => {
    for (const s of ["nộp form trước cn", "hạn chót cn này gửi mail"]) {
      const it = one(s);
      expect(it.deadline).toBe("2026-11-15 23:59");
      expect(it.notBefore).toBeUndefined();
    }
  });

  it("gives no part of the day to a task with no habit or clock", () => {
    const [it] = read("đọc code zf 2 tiếng hôm nay", {
      ref: now,
      source: "typed",
    }).items;
    expect(it.durationMinutes).toBe(120);
    expect(it.windows).toBeUndefined();
  });

  it("narrows the day start to an anchor", () => {
    expect(one("đọc sách cn này sau bữa trưa").notBefore).toBe(
      "2026-11-15 13:00",
    );
  });
});
