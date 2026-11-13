import { describe, expect, it } from "vitest";
import { repair } from "./repair";
import { segment } from "./segment";

describe("bulk paste: chat, OCR and PDF repairs", () => {
  it("drops the chat head and the filler words", () => {
    expect(
      repair(
        "[08/11 19:02] Lớp trưởng: Thông báo cả lớp\nMn nhớ nha 😘😘",
        "paste",
      ).text,
    ).toBe("Thông báo cả lớp nhớ ");
    expect(
      repair("ae oi mai 8h hop nhom o thu vien nhe, nho mang laptop.", "paste")
        .text,
    ).toBe("mai 8h hop nhom o thu vien, nho mang laptop.");
  });

  it("reads OCR clocks and room codes that keep their letter", () => {
    expect(
      repair("1 CT101 Cấu trúc dữ liệu 2O/11/2026 07h3O B1.2O1", "ocr").text,
    ).toBe("1 CT101 Cấu trúc dữ liệu 20/11/2026 07h30 B1.201");
  });

  it("joins spaced glyphs and keeps the spaced minute of a deadline", () => {
    expect(
      repair("ti ểu lu ận: 2 0 / 1 1 / 2 0 2 6 – 2 3 g i ờ 5 9.", "paste").text,
    ).toBe("tiểu luận: 20/11/2026-23 giờ 59.");
  });

  it("keeps từ (from) out of the spoken numbers", () => {
    expect(repair("nộp từ ngày 07/12 đến 11/12", "typed").text).toBe(
      "nộp từ ngày 07/12 đến 11/12",
    );
  });

  it("joins a PDF wrap, and keeps a run of short lines apart", () => {
    expect(
      repair("Hạn chót nộp\nbáo cáo là ngày\n12/11/2026.", "paste").text,
    ).toBe("Hạn chót nộp báo cáo là ngày 12/11/2026.");
    expect(
      repair(
        "đi chợ\ngiặt đồ\ndọn phòng chiều mai\nhọp team 3h chiều t4",
        "paste",
      ).text,
    ).toBe("đi chợ\ngiặt đồ\ndọn phòng chiều mai\nhọp team 3h chiều t4");
  });

  it("keeps a greeting and a sign-off on their own lines", () => {
    expect(repair("Kính gửi các em,\nBuổi seminar", "paste").text).toBe(
      "Kính gửi các em,\nBuổi seminar",
    );
  });
});

describe("bulk paste: lists and timetables in segments", () => {
  it("reads numbered lines as items, not sections", () => {
    const clauses = segment("1. Mua quà\n2. Học IELTS\n3. Cắt tóc");
    expect(clauses.map((c) => c.text)).toEqual([
      "Mua quà",
      "Học IELTS",
      "Cắt tóc",
    ]);
    expect(clauses.every((c) => c.section === undefined)).toBe(true);
  });

  it("marks a timetable row", () => {
    const [row] = segment("Thứ 2 7:30-9:30 Toán rời rạc A2.101");
    expect(row.timetable).toBe(true);
  });
});
