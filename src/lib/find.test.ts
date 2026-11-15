import { describe, expect, it } from "vitest";
import { startOfDay } from "../components/cal";
import { courseName, found, hits, parse, remember, suggest } from "./find";
import type { Task } from "./types";

// Mon 16 Nov 2026, 14:20 local.
const NOW = new Date(2026, 10, 16, 14, 20).getTime(), T0 = startOfDay(NOW), H = 3600_000, D = 24 * H;
const at = (day: number, h: number, m = 0) => T0 + day * D + h * H + m * 60_000;
const task = (id: string, title: string, start: number, x: Partial<Task> = {}): Task => ({ id, title, kind: "study", source: "user", effort: 60, start, end: start + H, createdAt: 0, ...x });
const ids = (xs: Task[], q: string) => found(xs, parse(q, NOW), NOW).flatMap((g) => g.xs.map((x) => x.id));
const tint = (title: string, q: string) => hits(title, parse(q, NOW)).map(([a, b]) => title.slice(a, b));

describe("words", () => {
  it("match without accents, in any order, and tint whole words", () => {
    expect(tint("Ôn Giải tích, giải tích 2", "giai tich")).toEqual(["Giải tích", "giải tích"]);
    expect(tint("Nộp báo cáo website nhóm", "web bao cao")).toEqual(["báo cáo website"]);
    expect(tint("Báo cáo cuối kỳ môn Web", "bao cao mon web")).toEqual(["Báo cáo", "Web"]);
  });
  it("read acronyms, the reader's abbreviations, joined words and one typo", () => {
    expect(tint("Báo cáo cuối kỳ môn Web", "bc web")).toEqual(["Báo cáo", "Web"]);
    expect(tint("Ôn Cơ sở dữ liệu", "csdl")).toEqual(["Cơ sở dữ liệu"]);
    expect(tint("Bài tập Lập trình hướng đối tượng", "oop")).toEqual(["Lập trình hướng đối tượng"]);
    expect(tint("Ôn Giải tích", "giaitich")).toEqual(["Giải tích"]);
    expect(tint("Báo cáo nhóm", "bao coa")).toEqual(["Báo cáo"]);
    expect(tint("Đi gym", "  ")).toEqual([]);
  });
});

describe("understood", () => {
  const xs = [
    task("exam1", "Thi Xác suất", at(8, 13, 30), { fixed: "exam" }),
    task("prep1", "Ôn lý thuyết, luyện đề", at(8, 16), { forId: "exam1", parentId: "pp", course: "Xác suất" }),
    task("exam2", "Thi Giải tích 2", at(11, 8), { fixed: "exam", location: "A2.301" }),
    task("examOld", "Thi giữa kỳ Triết", at(-3, 8), { fixed: "exam" }),
    task("lec", "Giải tích 2", at(1, 7), { fixed: "lecture", section: "S1", location: "A2.301" }),
    task("bc", "Báo cáo nhóm", at(0, 16), { deadline: at(4, 23, 59) }),
    task("bt", "Bài tập Giải tích chương 3", at(2, 16), { deadline: at(4, 23, 59) }),
    task("btDone", "Bài tập Triết", at(1, 9), { deadline: at(4, 23, 59), doneAt: 1 }),
    task("meet", "Họp nhóm đồ án", at(1, 19), { fixed: "busy" }),
    task("read1", "Đọc sách mỗi tối", at(1, 20), { rrule: "FREQ=DAILY" }),
    task("read2", "Đọc sách mỗi tối", at(2, 20), { rrule: "FREQ=DAILY" }),
    task("late", "Đọc chương 2", at(0, 9)),
  ];
  it("a type word and the reader's week", () => {
    expect(ids(xs, "thi tuần sau")).toEqual(["exam1", "prep1", "exam2"]);
    expect(ids(xs, "lịch thi tuần trước")).toEqual(["examOld"]);
  });
  it("a type word also matches as text, a room as words", () => {
    expect(ids(xs, "lich hoc giai tich")).toEqual(["lec"]);
    expect(ids(xs, "a2.301")).toEqual(["lec", "exam2"]);
  });
  it("deadline and status", () => {
    expect(ids(xs, "bài tập hạn t6 chưa xong")).toEqual(["bc", "bt"]); // a deadline makes it an assignment
    expect(ids(xs, "bai tap giai tich")).toEqual(["bt"]);
    expect(ids(xs, "hạn t6")).toEqual(["bc", "btDone", "bt"]);
    expect(ids(xs, "han t6 da xong")).toEqual(["btDone"]);
    expect(ids(xs, "tre")).toEqual(["late"]);
  });
  it("part of day, tonight and a clock", () => {
    expect(ids(xs, "tối mai")).toEqual(["meet", "read1"]);
    expect(ids(xs, "mai")).toEqual(["lec", "btDone", "meet", "read1"]); // done rows stay, struck
    expect(ids(xs, "8h")).toEqual(["exam2", "examOld"]);
  });
  it("a series collapses to its next time in range", () => {
    expect(ids(xs, "doc sach")).toEqual(["read1"]);
    expect(ids(xs, "doc sach t4")).toEqual(["read2"]);
    expect(ids(xs, "mỗi ngày")).toEqual(["lec", "read1"]); // any series
  });
  it("only stop words list nothing", () => {
    expect(ids(xs, "của mình")).toEqual([]);
  });
});

describe("suggestions", () => {
  const xs = [
    task("exam", "Thi Giải tích 2", at(11, 8), { fixed: "exam", location: "A2.301" }),
    task("gl", "Giải tích 2", at(3, 9), { fixed: "lecture", section: "S9", location: "A2.301" }),
    task("gb", "Bài tập chương 3", at(1, 10), { deadline: at(5, 23, 59), course: "Giải tích 2" }),
    task("l1", "Cấu trúc dữ liệu", at(2, 7), { fixed: "lecture", section: "S2" }),
    task("l2", "Cấu trúc dữ liệu", at(9, 7), { fixed: "lecture", section: "S2" }),
    task("bt", "Báo cáo nhóm", at(1, 16), { deadline: at(4, 23, 59) }),
    task("meet", "Họp nhóm đồ án", at(1, 19), { fixed: "busy" }),
    task("gym", "Đi gym", at(2, 18), { fixed: "busy", rrule: "FREQ=WEEKLY;BYDAY=WE" }),
    task("late", "Đọc chương 2", at(0, 9)),
  ];
  const qs = (ys: Task[]) => suggest(ys, NOW).map((c) => c.q);
  const size = (ys: Task[], q: string) => found(ys, parse(q, NOW), NOW).reduce((a, g) => a + g.xs.length, 0);
  it("draws five that each gather a handful, a single find only to fill", () => {
    const got = qs(xs);
    expect(got).toHaveLength(5);
    expect(got.map((q) => size(xs, q)).every((k) => k >= 1)).toBe(true);
    expect(size(xs, got[0])).toBeGreaterThan(1);
    expect(got[0]).toBe("giải tích 2");
  });
  it("names courses whole from the timetable, long ones by their initials, never from LMS text", () => {
    const ys = [
      task("m1", "Mẫu thiết kế", at(1, 7), { fixed: "lecture", section: "M" }),
      task("m2", "Thi Mẫu thiết kế", at(9, 8), { fixed: "exam" }),
      task("p1", "Phát triển ứng dụng di động", at(2, 7), { fixed: "lecture", section: "P" }),
      task("p2", "Báo cáo giữa kỳ", at(3, 9), { deadline: at(4, 23), course: "Phát triến ứng dụng di động" }),
      task("p3", "Thi Phát triển ứng dụng di động", at(10, 8), { fixed: "exam" }),
    ];
    const got = suggest(ys, NOW);
    expect(got.map((c) => c.q)).toContain("mẫu thiết kế");
    expect(got.find((c) => c.q === "ptuddd")?.name).toBe("Phát triển ứng dụng di động");
    expect(got.some((c) => /triến|mẫu thiết$/.test(c.q))).toBe(false);
  });
  it("reads a course name past exam words, not past Học", () => {
    expect(courseName("Thi Mẫu thiết kế")).toBe("Mẫu thiết kế");
    expect(courseName("Kiểm tra giữa kỳ Triết học")).toBe("Triết học");
    expect(courseName("Học máy")).toBe("Học máy");
  });
  it("offers nothing to a new user", () => expect(suggest([], NOW)).toEqual([]));
  it("remembers newest first, accent variants as one, five at most", () => {
    expect(remember(["giải tích", "gym"], "giai tich")).toEqual(["giai tich", "gym"]);
    expect(remember(["a", "b", "c", "d", "e"], "f")).toEqual(["f", "a", "b", "c", "d"]);
    expect(remember(["a"], "  ")).toEqual(["a"]);
  });
});

describe("whole type words, wider parts of day", () => {
  const xs = [
    task("design", "Mẫu thiết kế", at(1, 7), { fixed: "lecture", source: "dlu" }),
    task("exam", "Thi Giải tích", at(2, 7), { fixed: "exam", source: "dlu" }),
    task("early", "Lớp sớm", at(1, 6, 45), { fixed: "lecture", source: "dlu" }),
    task("late", "Đọc sách", at(2, 0, 30)),
    task("tonight", "Gọi mẹ", at(1, 0, 30)),
  ];
  it("thi finds exams, not thiết kế", () => {
    expect(ids(xs, "thi")).toEqual(["exam"]);
    expect(tint("Mẫu thiết kế", "thi")).toEqual([]);
  });
  it("sáng reaches a 06:45 class; đêm mai runs past midnight into the day after", () => {
    expect(ids(xs, "sáng mai")).toContain("early");
    expect(ids(xs, "đêm mai")).toEqual(["late"]);
  });
});
