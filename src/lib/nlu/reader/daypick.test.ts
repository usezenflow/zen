import { describe, expect, it } from "vitest";
import type { ReaderItem } from "../shared";
import { applyDayPick, dayPickOf, type CalDay } from "./daypick";
import { read } from "./reader";
import { fold } from "./fold";

// Mon 16 Nov 2026 to Sun 22 Nov 2026. Minutes are local.
const CAL: CalDay[] = [
  {
    date: "2026-11-16",
    classes: [
      { title: "Toán rời rạc", start: 450, end: 570 },
      { title: "Vật lý đại cương", start: 780, end: 870 },
    ],
    exams: [],
  },
  { date: "2026-11-17", classes: [], exams: [] },
  {
    date: "2026-11-18",
    classes: [{ title: "Cấu trúc dữ liệu", start: 480, end: 600 }],
    exams: [],
  },
  { date: "2026-11-19", classes: [], exams: [] },
  {
    date: "2026-11-20",
    classes: [{ title: "Toán rời rạc", start: 450, end: 570 }],
    exams: [],
  },
  {
    date: "2026-11-21",
    classes: [],
    exams: [{ title: "Vật lý đại cương", start: 480 }],
  },
  { date: "2026-11-22", classes: [], exams: [] },
];

function task(extra: Partial<ReaderItem> = {}): ReaderItem {
  return {
    type: "PLAN",
    title: "Chạy bộ",
    durationMinutes: 60,
    confidence: 1,
    inferred: [],
    flags: [],
    alternatives: [],
    evidence: "",
    checked: true,
    ...extra,
  };
}

describe("dayPickOf", () => {
  it("picks the first day with a morning class", () => {
    const plan = dayPickOf("hôm có tiết sáng thì chạy bộ", CAL);
    expect(plan?.perDay).toBe(false);
    expect(plan?.stamps.map((s) => s.date)).toEqual(["2026-11-16"]);
    expect(plan?.meta).toEqual({ day: "morning", count: 3 });
  });

  it("gives every matching day its own item when the phrase is recurring", () => {
    const plan = dayPickOf("mỗi ngày có tiết sáng, chạy bộ", CAL);
    expect(plan?.perDay).toBe(true);
    expect(plan?.stamps.map((s) => s.date)).toEqual([
      "2026-11-16",
      "2026-11-18",
      "2026-11-20",
    ]);
  });

  it("inverts the predicate for days without a morning class", () => {
    const plan = dayPickOf("hôm nào không có tiết sáng, đọc sách", CAL);
    expect(plan?.meta).toEqual({ day: "morning", count: 4, not: true });
    expect(plan?.stamps[0].date).toBe("2026-11-17");
  });

  it("picks free days", () => {
    const plan = dayPickOf("ngày nghỉ, đọc sách", CAL);
    expect(plan?.meta).toEqual({ day: "free", count: 4 });
    expect(plan?.stamps[0].date).toBe("2026-11-17");
  });

  it("sets notBefore to the last class end on each class day", () => {
    const plan = dayPickOf("mỗi ngày có tiết, sau giờ học chạy bộ", CAL);
    expect(plan?.meta.time).toBe("after_class");
    expect(plan?.stamps).toEqual([
      { date: "2026-11-16", notBefore: "2026-11-16 14:30" },
      { date: "2026-11-18", notBefore: "2026-11-18 10:00" },
      { date: "2026-11-20", notBefore: "2026-11-20 09:30" },
    ]);
  });

  it("sets clocks before the first class of the day", () => {
    const plan = dayPickOf("hôm học toán, trước giờ học chạy bộ", CAL);
    expect(plan?.meta).toEqual({
      day: "course",
      course: "Toán rời rạc",
      time: "before_class",
      count: 2,
    });
    expect(plan?.stamps[0]).toEqual({
      date: "2026-11-16",
      clocks: [{ from: "00:00", to: "07:30" }],
    });
  });

  it("sets clocks for gaps of at least 30 minutes between classes", () => {
    const plan = dayPickOf("mỗi ngày có tiết, giữa các tiết chạy bộ", CAL);
    expect(plan?.meta.time).toBe("between");
    expect(plan?.stamps).toEqual([
      { date: "2026-11-16", clocks: [{ from: "09:30", to: "13:00" }] },
    ]);
  });

  it("picks the day before each exam", () => {
    const plan = dayPickOf("trước mỗi ngày thi, ôn bài", CAL);
    expect(plan?.meta).toEqual({ day: "exam_eve", count: 1 });
    expect(plan?.stamps.map((s) => s.date)).toEqual(["2026-11-20"]);
  });

  it("matches a course by a word of its title", () => {
    const plan = dayPickOf("hôm học vật lý, làm bài tập", CAL);
    expect(plan?.meta).toEqual({
      day: "course",
      course: "Vật lý đại cương",
      count: 1,
    });
    expect(plan?.stamps.map((s) => s.date)).toEqual(["2026-11-16"]);
  });

  it("matches a course by the initials of its title", () => {
    const plan = dayPickOf("hôm học ctdl, chạy bộ", CAL);
    expect(plan?.meta).toEqual({
      day: "course",
      course: "Cấu trúc dữ liệu",
      count: 1,
    });
    expect(plan?.stamps.map((s) => s.date)).toEqual(["2026-11-18"]);
  });

  it("picks the lightest day, the first of the tied days", () => {
    const plan = dayPickOf("ngày ít tiết nhất, đọc sách", CAL);
    expect(plan?.meta).toEqual({ day: "lightest", count: 2 });
    expect(plan?.stamps[0].date).toBe("2026-11-18");
  });

  it("picks the busiest day", () => {
    const plan = dayPickOf("ngày nhiều tiết nhất, đọc sách", CAL);
    expect(plan?.meta).toEqual({ day: "busiest", count: 1 });
    expect(plan?.stamps[0].date).toBe("2026-11-16");
  });

  it("returns undefined when no day matches or the calendar is empty", () => {
    expect(dayPickOf("hôm có tiết tối, chạy bộ", CAL)).toBeUndefined();
    expect(dayPickOf("hôm có tiết sáng, chạy bộ", [])).toBeUndefined();
    expect(dayPickOf("chạy bộ", CAL)).toBeUndefined();
  });
});

describe("applyDayPick", () => {
  it("fills the picked day and daypick on a flexible item", () => {
    const [it] = applyDayPick("hôm có tiết sáng, chạy bộ", [task()], CAL);
    expect(it.days).toEqual(["2026-11-16"]);
    expect(it.daypick).toEqual({ day: "morning", count: 3 });
  });

  it("splits a recurring pick into one item per day", () => {
    const out = applyDayPick("mỗi ngày có tiết sáng, chạy bộ", [task()], CAL);
    expect(out.map((i) => i.days)).toEqual([
      ["2026-11-16"],
      ["2026-11-18"],
      ["2026-11-20"],
    ]);
    expect(out.every((i) => i.daypick?.day === "morning")).toBe(true);
  });

  it("leaves fixed items and items with their own days unchanged", () => {
    const exam = task({ type: "EXAM", startsAt: "2026-11-21 08:00" });
    const dated = task({ days: ["2026-11-19"] });
    const out = applyDayPick("hôm có tiết sáng, chạy bộ", [exam, dated], CAL);
    expect(out).toEqual([exam, dated]);
  });

  it("keeps the items when the phrase matches no day", () => {
    const items = [task()];
    expect(applyDayPick("hôm có tiết tối, chạy bộ", items, CAL)).toEqual(items);
    expect(applyDayPick("hôm có tiết sáng, chạy bộ", items, [])).toBe(items);
    expect(applyDayPick("hôm có tiết sáng, chạy bộ", items, undefined)).toBe(
      items,
    );
  });

  it("is applied by the reader through ReadOpts.calendar", () => {
    const res = read("Hôm có tiết sáng thì chạy bộ", {
      ref: { y: 2026, m: 11, d: 16, h: 8, mi: 0 },
      source: "typed",
      calendar: CAL,
    });
    expect(res.items.some((i) => i.daypick?.day === "morning")).toBe(true);
    const plain = read("Hôm có tiết sáng thì chạy bộ", {
      ref: { y: 2026, m: 11, d: 16, h: 8, mi: 0 },
      source: "typed",
    });
    expect(plain.items.some((i) => i.daypick)).toBe(false);
  });

  it("gives every row of one recurring pick the same planKey", () => {
    const out = applyDayPick("mỗi ngày có tiết sáng, chạy bộ", [task()], CAL);
    expect(out).toHaveLength(3);
    const keys = new Set(out.map((i) => i.planKey));
    expect(keys.size).toBe(1);
    expect(out[0].planKey).toMatch(/^series\d+$/);
  });

  it("keys each flexible item of a clause separately", () => {
    const out = applyDayPick(
      "mỗi ngày có tiết sáng, chạy bộ và đọc sách",
      [task(), task({ title: "Đọc sách" })],
      CAL,
    );
    expect(out).toHaveLength(6);
    const run = out.filter((i) => i.title === "Chạy bộ").map((i) => i.planKey);
    const read = out
      .filter((i) => i.title === "Đọc sách")
      .map((i) => i.planKey);
    expect(new Set(run).size).toBe(1);
    expect(new Set(read).size).toBe(1);
    expect(run[0]).not.toBe(read[0]);
  });

  it("drops the days before the search start, and counts only the rest", () => {
    const plan = dayPickOf("hôm có tiết sáng, chạy bộ", CAL, "2026-11-17");
    expect(plan?.meta.count).toBe(2);
    expect(plan?.stamps.map((s) => s.date)).toEqual(["2026-11-18"]);
  });

  it("starts the search at the item's notBefore day, not before", () => {
    const out = applyDayPick(
      "mỗi ngày có tiết sáng thì chạy bộ",
      [task({ notBefore: "2026-11-18 00:00" })],
      CAL,
    );
    expect(out.map((i) => i.days)).toEqual([["2026-11-18"], ["2026-11-20"]]);
    expect(out.every((i) => i.daypick?.count === 2)).toBe(true);
  });

  it("keeps today as the start when the notBefore day is earlier", () => {
    const out = applyDayPick(
      "mỗi ngày có tiết sáng thì chạy bộ",
      [task({ notBefore: "2026-11-01 00:00" })],
      CAL,
    );
    expect(out.map((i) => i.days)).toEqual([
      ["2026-11-16"],
      ["2026-11-18"],
      ["2026-11-20"],
    ]);
  });

  it("gives a single-row pick no planKey", () => {
    const [it] = applyDayPick("hôm có tiết sáng, chạy bộ", [task()], CAL);
    expect(it.planKey).toBeUndefined();
  });

  it("keeps every row of a recurring pick through the reader's dedupe", () => {
    const res = read("Mỗi ngày có tiết sáng thì chạy bộ", {
      ref: { y: 2026, m: 11, d: 16, h: 8, mi: 0 },
      source: "typed",
      calendar: CAL,
    });
    const picked = res.items.filter((i) => i.daypick);
    expect(picked.map((i) => i.days)).toEqual([
      ["2026-11-16"],
      ["2026-11-18"],
      ["2026-11-20"],
    ]);
    expect(new Set(picked.map((i) => i.planKey)).size).toBe(1);
  });
});

describe("day picks through read()", () => {
  const REF = { y: 2026, m: 11, d: 12, h: 9, mi: 0 };
  // today is Thu 12 Nov with a morning class, so a start of next week must drop it
  const WITH_TODAY: CalDay[] = [
    {
      date: "2026-11-12",
      classes: [{ title: "Toán rời rạc", start: 450, end: 570 }],
      exams: [],
    },
    ...CAL,
  ];
  const run = (text: string, source: "typed" | "voice" = "typed", cal = CAL) =>
    read(text, { ref: REF, source, calendar: cal }).items.filter(
      (i) => i.daypick,
    );
  const days = (text: string, source?: "typed" | "voice", cal?: CalDay[]) =>
    run(text, source, cal).map((i) => i.days?.[0]);

  it("applies a pick split from its task by a comma to that task", () => {
    const items = run("mỗi ngày có tiết sáng, chạy bộ");
    expect(items.map((i) => i.days?.[0])).toEqual([
      "2026-11-16",
      "2026-11-18",
      "2026-11-20",
    ]);
    expect(items.every((i) => i.title === "Chạy bộ")).toBe(true);
  });

  it("applies a pick written after its task, across a comma", () => {
    expect(days("chạy bộ, mỗi ngày có tiết sáng")).toEqual([
      "2026-11-16",
      "2026-11-18",
      "2026-11-20",
    ]);
  });

  it.each([
    ["missing accents and no commas", "moi ngay co tiet sang chay bo", "typed"],
    ["a transposed letter in sáng", "mỗi ngày có tiết snag, chạy bộ", "typed"],
    [
      "a voice slip: the spoken comma",
      "mỗi ngày có tiết sáng phẩy chạy bộ",
      "voice",
    ],
    ["a run-on voice line", "mỗi ngày có tiết sang chạy bộ", "voice"],
    [
      "the pick after the task, no commas",
      "chạy bộ mỗi ngày có tiết sáng",
      "typed",
    ],
  ])("reads a messy pick: %s", (_, text, source) => {
    const items = run(text, source as "typed" | "voice");
    expect(items.map((i) => i.days?.[0])).toEqual([
      "2026-11-16",
      "2026-11-18",
      "2026-11-20",
    ]);
    expect(items.every((i) => /chay bo/.test(fold(i.title).text))).toBe(true);
    expect(items.every((i) => !/sang|tiet|moi/i.test(fold(i.title).text))).toBe(
      true,
    );
  });

  it("reads bare parts of the day as windows, not a class pick", () => {
    const out = read("Cafe với Quang, 60 phút, sáng/chiều/tối cn", {
      ref: REF,
      source: "typed",
      calendar: CAL,
    }).items;
    expect(out).toHaveLength(1);
    expect(out[0].daypick).toBeUndefined();
    expect(out[0].evidence).toBe("sáng/chiều/tối cn");
    expect(out[0].windows).toEqual(["MORNING", "AFTERNOON", "NIGHT"]);
  });

  it("takes a self-correction as the new part of day", () => {
    const items = run("chạy bộ mỗi ngày có tiết sáng, à không chiều");
    expect(items.map((i) => i.days?.[0])).toEqual(["2026-11-16"]);
    expect(items[0].daypick).toMatchObject({ day: "afternoon" });
    expect(fold(items[0].title).text).toBe("chay bo");
  });

  it("starts the picks at a from-next-week phrase, before the pick", () => {
    const [it] = run(
      "từ tuần sau hôm có tiết sáng chạy bộ",
      "typed",
      WITH_TODAY,
    );
    expect(it.notBefore).toBe("2026-11-16 00:00");
    expect(it.days).toEqual(["2026-11-16"]);
  });

  it("starts a recurring pick at a from-next-week phrase across a comma", () => {
    const items = run(
      "từ tuần sau, mỗi ngày có tiết sáng, chạy bộ",
      "typed",
      WITH_TODAY,
    );
    expect(items.map((i) => i.days?.[0])).toEqual([
      "2026-11-16",
      "2026-11-18",
      "2026-11-20",
    ]);
    expect(items.every((i) => i.notBefore === "2026-11-16 00:00")).toBe(true);
  });

  it("keeps the task alone when the comma phrase names no day", () => {
    const res = read("ngày mai, chạy bộ", {
      ref: REF,
      source: "typed",
      calendar: CAL,
    });
    expect(res.items.some((i) => i.daypick)).toBe(false);
    expect(res.items.length).toBeGreaterThan(0);
  });
});
