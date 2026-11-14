import { expect, it } from "vitest";
import type { Task } from "../types";
import { readFull } from "./adapt";
import { affinityOf, calendarOf, committedRows, vocab } from "./context";

const at = (iso: string) => new Date(iso).getTime();
const task = (x: Partial<Task>): Task => ({ id: "t", title: "T", kind: "study", source: "dlu", effort: 0, createdAt: 0, ...x });
// 2026-11-14 is a Saturday; 03:00Z is 10:00 in UTC+7.
const NOW = at("2026-11-14T03:00:00Z");

it("builds the user's days from synced lectures and exams (1.10)", () => {
  const cal = calendarOf([
    task({ title: "Toán rời rạc", fixed: "lecture", start: at("2026-11-16T00:30:00Z"), end: at("2026-11-16T02:30:00Z") }), // 07:30-09:30 local
    task({ title: "Vật lý", fixed: "exam", start: at("2026-11-21T01:00:00Z") }),
    task({ title: "Đã xong", fixed: "lecture", start: at("2026-11-16T06:00:00Z"), doneAt: 1 }),
    task({ title: "Việc tự do", source: "user", start: at("2026-11-16T06:00:00Z") }),
  ], NOW);
  expect(cal).toHaveLength(14);
  expect(cal[0].date).toBe("2026-11-14");
  expect(cal.find((d) => d.date === "2026-11-16")).toEqual({ date: "2026-11-16", classes: [{ title: "Toán rời rạc", start: 450, end: 570 }], exams: [] });
  expect(cal.find((d) => d.date === "2026-11-21")?.exams).toEqual([{ title: "Vật lý", start: 480 }]);
});

it("reaches the reader: a daypick phrase picks the class days through readFull (1.10)", () => {
  const cal = calendarOf([
    task({ title: "Toán", fixed: "lecture", start: at("2026-11-16T00:30:00Z"), end: at("2026-11-16T02:30:00Z") }),
    task({ title: "Toán", fixed: "lecture", start: at("2026-11-18T00:30:00Z"), end: at("2026-11-18T02:30:00Z") }),
  ], NOW);
  const said = "mỗi ngày có tiết sáng thì chạy bộ";
  const withCal = readFull(said, new Date(NOW), "typed", { calendar: cal }).items;
  expect(withCal.map((i) => i.days)).toEqual([["2026-11-16"], ["2026-11-18"]]);
  expect(withCal.every((i) => i.daypick?.day === "morning")).toBe(true);
  expect(readFull(said, new Date(NOW)).items.every((i) => !i.daypick)).toBe(true);
});

it("weights prep by the marks: low and failed read above 1, high below, unknown absent (1.10)", () => {
  const m = affinityOf([
    { curriculumName: "Giải tích", score10: 4, passed: false },
    { curriculumName: "Vật lý", score10: 6, passed: true },
    { curriculumName: "Lập trình", score10: 9, passed: true },
    { curriculumName: "Triết", score10: 7.5, passed: true },
  ]);
  expect([...m]).toEqual([["giai tich", 1.6], ["vat ly", 1.25], ["lap trinh", 0.75]]);
});

it("keeps committed rows newest first, capped, for the prior (1.10)", () => {
  const item = { title: "Chạy bộ", type: "PLAN", durationMinutes: 45, windows: ["MORNING"] } as never;
  const rows = committedRows([item], Array.from({ length: 400 }, () => ({ title: "x", type: "PLAN" as const })));
  expect(rows).toHaveLength(300);
  expect(rows[0]).toEqual({ title: "Chạy bộ", type: "PLAN", durationMinutes: 45, window: "MORNING" });
});

it("biases the recognizer toward live titles, courses and English terms, without repeats or finished work (1.3)", () => {
  const v = vocab([
    task({ title: "Nộp báo cáo", course: "Cơ sở dữ liệu", location: "A2.304" }),
    task({ title: "Nộp báo cáo" }),
    task({ title: "Đã xong", doneAt: 1 }),
    task({ title: "Một buổi", parentId: "p" }),
  ]);
  expect(v.slice(0, 3)).toEqual(["Nộp báo cáo", "Cơ sở dữ liệu", "A2.304"]);
  expect(v).toContain("deadline");
  expect(v).not.toContain("Đã xong");
  expect(new Set(v).size).toBe(v.length);
});
