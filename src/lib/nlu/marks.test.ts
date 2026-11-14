import { expect, it } from "vitest";
import { marksOf, readFull } from "./adapt";

it("lights titles as well as times on a scanned notice", () => {
  const text = "THÔNG BÁO\nMôn Xác suất thống kê thi vào 8g00 thứ Sáu 27/11, phòng B1.201.\nNộp báo cáo thực hành trước 23g59 25/11 qua LMS.";
  const r = readFull(text, new Date(2026, 10, 14, 9), "ocr");
  const lit = marksOf(text, r).map((m) => text.slice(m.start, m.end).toLowerCase());
  expect(lit.some((s) => s.includes("xác suất"))).toBe(true);
  expect(lit.some((s) => s.includes("báo cáo"))).toBe(true);
  expect(lit.some((s) => /8g00|27\/11/.test(s))).toBe(true);
});

it("lights the place an item got, a link included and whole", () => {
  const lit = (text: string) => { const r = readFull(text, new Date(2026, 10, 14, 9), "paste"); return { loc: r.items[0]?.location, lit: marksOf(text, r).map((m) => text.slice(m.start, m.end)) }; };
  const lms = "https://lms.dlu.edu.vn/mod/assign/view.php?id=123";
  expect(lit(`Nộp bài tập lớn trước 23:00 ngày 16/11 tại ${lms}.`)).toMatchObject({ loc: lms, lit: expect.arrayContaining([lms]) });
  const meet = "https://meet.google.com/abc-defg-hij";
  expect(lit(`Họp online 20h tối mai qua ${meet}`).lit).toContain(meet);
  expect(lit("Thi Mạng máy tính: 07g30 02/12, phòng A2.301, tự luận").lit).toContain("A2.301");
});
