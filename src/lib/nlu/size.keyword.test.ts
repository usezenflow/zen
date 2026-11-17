// Each keyword row the old workload rules gave a length to, for a plan and an assignment with no class word: the length before the one table.
import { describe, expect, it } from "vitest";
import { defaultMinutes } from "./size";

/** Title, and the minutes the old workloadMinutes gave it (plan and assignment alike). */
const ROWS: [string, string, number][] = [
  ["thi cuối kỳ", "Ôn cho thi cuối kỳ Giải tích", 1200],
  ["thi giữa kỳ", "Thi giữa kỳ Toán", 600],
  ["vấn đáp", "Vấn đáp môn Triết", 360],
  ["bảo vệ", "Bảo vệ môn Triết", 360],
  ["nhóm", "Họp nhóm bài Mạng", 600],
  ["hành chính (nộp form)", "Nộp form đăng ký môn", 30],
  ["báo cáo", "Báo cáo tuần", 270],
  ["word / bản thảo", "Bản thảo chương mở đầu", 270],
  ["khóa luận", "Khóa luận tốt nghiệp", 1800],
  ["tiểu luận", "Tiểu luận Triết học", 1200],
  ["thực hành", "Thực hành mạng máy tính", 240],
  ["slide", "Làm slide chương 3", 90],
  ["đồ án", "Đồ án mạng", 240],
  ["nộp bài", "Nộp bài", 120],
  ["làm bài tập", "Làm bài tập", 120],
  ["no keyword (assignment default)", "Chuẩn bị gì đó", 270],
];

describe("keyword rows keep the old workload lengths", () => {
  for (const [kw, title, mins] of ROWS) {
    for (const type of ["PLAN", "ASSIGNMENT"] as const) {
      if (type === "PLAN" && kw.startsWith("no keyword")) continue;
      it(`${kw} as ${type}: "${title}" is ${mins} minutes`, () => {
        expect(defaultMinutes(type, title)).toBe(mins);
      });
    }
  }
});
