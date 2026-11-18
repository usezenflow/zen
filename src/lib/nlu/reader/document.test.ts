// Official documents as the app reads them (a PDF's text layer, or a scan through on-device OCR): the items a student acts on,
// with their times and the titles beside them, and nothing from the staff-only sections. `pnpm vitest run document` runs it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { read } from "./reader";

const doc = (name: string) => readFileSync(new URL(`./eval/docs/${name}`, import.meta.url), "utf8");
const pick = (xs: object[], keys: string[]) => xs.map((x) => Object.fromEntries(keys.map((k) => [k, (x as Record<string, unknown>)[k]])));

describe("TB 1894: course registration, a scan", () => {
  const r = read(doc("dang-ky-hoc-phan-1894.txt"), { source: "ocr", ref: { y: 2026, m: 11, d: 6, h: 9, mi: 0 } });
  it("is one task in the registration window, from 8h00 16/11 to 17h00 20/11, at the registration site", () => {
    expect(pick(r.items, ["type", "title", "notBefore", "deadline", "location"])).toEqual([
      { type: "PLAN", title: "Đăng ký học phần học kỳ 2", notBefore: "2026-11-16 08:00", deadline: "2026-11-20 17:00", location: "https://dkhp.dlu.edu.vn/" },
    ]);
  });
});

describe("KH 1578: the camp plan and its program, a scan", () => {
  const r = read(doc("hoi-trai-1578.txt"), { source: "ocr", ref: { y: 2026, m: 10, d: 20, h: 9, mi: 0 } });
  it("is one block per program row, on its day, titled by its activity", () => {
    expect(pick(r.items, ["type", "title", "startsAt", "durationMinutes"])).toEqual([
      { type: "BUSY", title: "Dựng trại, trang trí và hoàn thiện không gian trại của các Tiểu trại", startsAt: "2026-10-23 13:00", durationMinutes: 210 },
      { type: "BUSY", title: "Ban Giám khảo chấm chấm điểm các Tiểu trại", startsAt: "2026-10-23 16:30", durationMinutes: 60 },
      { type: "BUSY", title: "Sinh hoạt tại các tiểu Trại", startsAt: "2026-10-23 17:30", durationMinutes: 90 },
      { type: "BUSY", title: "Đem nhạc họi trại - \"50 năm - một hành trình, một niềm tự hào", startsAt: "2026-10-23 19:00", durationMinutes: 90 },
      { type: "BUSY", title: "Giao lưu, sinh hoạt tại các tiểu trại", startsAt: "2026-10-23 20:30", durationMinutes: 150 },
      { type: "BUSY", title: "Khởi động ngày mới - Gắn kết đồng đội", startsAt: "2026-10-24 08:00", durationMinutes: 210 },
      { type: "BUSY", title: "Sinh hoạt tại các tiểu Trại", startsAt: "2026-10-24 11:30", durationMinutes: 390 },
      { type: "BUSY", title: "Đêm hội thanh niên - Sắc màu 50 năm", startsAt: "2026-10-24 18:00", durationMinutes: 180 },
      { type: "BUSY", title: "Lưa trại - kết nói và truyên lưa", startsAt: "2026-10-24 22:00", durationMinutes: 60 },
      { type: "BUSY", title: "Thu dọn tiểu trại", startsAt: "2026-10-25 07:00", durationMinutes: 120 },
      { type: "BUSY", title: "Chung tay vì khuôn viên DLU xanh - sạch - đẹp", startsAt: "2026-10-25 09:00", durationMinutes: 120 },
    ]);
  });
});

describe("TB CSDL: the course's assessment dates, a PDF with a text layer", () => {
  const r = read(doc("csdl-qua-trinh.txt"), { source: "paste", ref: { y: 2025, m: 3, d: 19, h: 9, mi: 0 } });
  it("is one item per numbered row, with its time and room; the report's 2024 is the notice's 2025", () => {
    expect(pick(r.items, ["type", "title", "startsAt", "deadline", "durationMinutes", "location"])).toEqual([
      { type: "ASSIGNMENT", title: "Hoàn thành 06 bài Lab", startsAt: undefined, deadline: "2025-04-01 13:00", durationMinutes: undefined, location: undefined },
      { type: "EXAM", title: "Kiểm tra thực hành", startsAt: "2025-04-08 13:00", deadline: undefined, durationMinutes: 120, location: "A24.1 + A24Lau" },
      { type: "EXAM", title: "Kiểm tra trắc nghiệm", startsAt: "2025-04-22 14:00", deadline: undefined, durationMinutes: 120, location: "online" },
      { type: "BUSY", title: "Báo cáo Bài tập nhóm", startsAt: "2025-04-22 15:00", deadline: undefined, durationMinutes: 60, location: "Phòng 3, Nhà A24" },
    ]);
  });
});
