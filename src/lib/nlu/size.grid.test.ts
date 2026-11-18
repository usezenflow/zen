import { describe, expect, it } from "vitest";
import { frameOf, type TaskClass } from "./frame";
import { sizeOf, T, type Size } from "./size";

const DAY = 86_400_000;
// 16 Nov 2026, 10:00 in Vietnam (UTC+7).
const NOW = Date.UTC(2026, 10, 16, 3);
// 31 Dec 2026, 00:00 in Vietnam: the end of a span.
const SPAN_END = Date.UTC(2026, 11, 31) - 7 * 3_600_000;

const size = (title: string, o: { prep?: number; classMult?: number; spanEnd?: number; anchorDue?: number } = {}): Size =>
  sizeOf(frameOf(title), { now: NOW, ...o });

describe("sizeOf projects", () => {
  it("code b-tree và lsm: two objects, 90 a sitting, due in a week", () => {
    expect(size("code b-tree và lsm")).toEqual({
      shape: "project", total: 360, perSitting: 90, sittings: 4, dueInDays: 7, due: NOW + 7 * DAY,
    });
  });
  it("ôn thi cuối kì giải tích: exam prep for a final, 90 a sitting, due in 10 days", () => {
    expect(size("ôn thi cuối kì giải tích")).toEqual({
      shape: "project", total: 600, perSitting: 90, sittings: 7, dueInDays: 10, due: NOW + 10 * DAY,
    });
  });
  it("ôn thi giữa kì: 360 minutes", () => {
    expect(size("ôn thi giữa kì giải tích")).toMatchObject({ total: 360, sittings: 4 });
  });
  it("ôn thi with no stake: 180 minutes", () => {
    expect(size("ôn thi giải tích")).toMatchObject({ total: 180, sittings: 2 });
  });
  it("ôn thi with a quiz: 120 minutes", () => {
    expect(size("ôn thi quiz Toán")).toMatchObject({ total: 120, sittings: 2 });
  });
  it("viết báo cáo mạng máy tính: 270 minutes, 3 sittings", () => {
    expect(size("viết báo cáo mạng máy tính")).toMatchObject({ total: 270, perSitting: 90, sittings: 3, dueInDays: 7 });
  });
  it("viết báo cáo 10 trang: 270 + 10 × 40 = 670, rounded to 660, 8 sittings", () => {
    expect(size("viết báo cáo 10 trang")).toMatchObject({ total: 660, sittings: 8 });
  });
  it("tiểu luận Triết học: 1200 minutes, 14 sittings, due in 14 days", () => {
    expect(size("tiểu luận Triết học")).toEqual({
      shape: "project", total: 1200, perSitting: 90, sittings: 14, dueInDays: 14, due: NOW + 14 * DAY,
    });
  });
  it("slide chương 3: 90 minutes, due in 5 days", () => {
    expect(size("slide chương 3")).toMatchObject({ total: 90, sittings: 1, dueInDays: 5 });
  });
  it("làm 10 slide: 90 + 10 × 5 = 140, rounded to 150", () => {
    expect(size("làm 10 slide")).toMatchObject({ total: 150, sittings: 2 });
  });
  it("khóa luận tốt nghiệp: 6000 minutes at 120 a sitting, due in 60 days", () => {
    expect(size("khóa luận tốt nghiệp")).toEqual({
      shape: "project", total: 6000, perSitting: 120, sittings: 50, dueInDays: 60, due: NOW + 60 * DAY,
    });
  });
  it("làm bài tập Đại số: 90 minutes, due in 3 days", () => {
    expect(size("làm bài tập Đại số")).toMatchObject({ total: 90, sittings: 1, dueInDays: 3 });
  });
  it("làm 5 bài: 90 + 5 × 15 = 165", () => {
    expect(size("làm 5 bài")).toMatchObject({ total: 180, sittings: 2 });
  });
  it("đọc 3 chương giáo trình: 180 minutes in 90-minute sittings", () => {
    expect(size("đọc 3 chương giáo trình")).toMatchObject({ total: 180, perSitting: 90, sittings: 2, dueInDays: 7 });
  });
  it("đọc giáo trình OS: one chapter of 45 minutes", () => {
    expect(size("đọc giáo trình OS")).toMatchObject({ total: 60, sittings: 1, dueInDays: 7 });
  });
  it("code with a group: 360 × 0.6 + 60 = 276, rounded to 270", () => {
    expect(size("code b-tree và lsm nhóm")).toMatchObject({ total: 270, sittings: 3 });
  });
  it("hard: 180 × 1.5 = 270", () => {
    expect(size("code b-tree khó")).toMatchObject({ total: 270, sittings: 3 });
  });
  it("code b-tree in a study domain is scaled by the prep multiplier", () => {
    expect(size("code b-tree", { prep: 1.25 })).toMatchObject({ total: 240, sittings: 3 });
  });
  it("classMult scales the total", () => {
    expect(size("code b-tree", { classMult: 0.5 })).toMatchObject({ total: 90, sittings: 1 });
  });
  it("an anchor due wins over the default", () => {
    expect(size("code b-tree", { anchorDue: NOW + 3 * DAY }).due).toBe(NOW + 3 * DAY);
  });
  it("a span end is the due of a project with no rate", () => {
    expect(size("tiểu luận Triết học", { spanEnd: SPAN_END }).due).toBe(SPAN_END);
  });
});

describe("sizeOf errands and events", () => {
  it("đóng tiền điện: 30 minutes, due at the end of the month", () => {
    expect(size("đóng tiền điện")).toEqual({
      shape: "errand", total: 30, perSitting: 30, sittings: 1, dueInDays: 14, due: NOW + 14 * DAY,
    });
  });
  it("đóng tiền điện on the last day: due in 1 day, the minimum", () => {
    const f = frameOf("đóng tiền điện");
    expect(sizeOf(f, { now: Date.UTC(2026, 10, 30, 3) }).dueInDays).toBe(1);
  });
  it("fix bug đăng nhập: 60 minutes, due in 2 days", () => {
    expect(size("fix bug đăng nhập")).toMatchObject({ shape: "errand", total: 60, dueInDays: 2 });
  });
  it("review PR #12: 30 minutes, due in 2 days", () => {
    expect(size("review PR #12")).toMatchObject({ total: 30, dueInDays: 2 });
  });
  it("giặt đồ: 60 minutes, due in 3 days", () => {
    expect(size("giặt đồ")).toMatchObject({ total: 60, sittings: 1, dueInDays: 3 });
  });
  it("nấu ăn tối: 60 minutes, due in a day", () => {
    expect(size("nấu ăn tối")).toMatchObject({ total: 60, dueInDays: 1 });
  });
  it("đi chợ: 60 minutes, due in 3 days", () => {
    expect(size("đi chợ")).toMatchObject({ total: 60, dueInDays: 3 });
  });
  it("khai thuế TNCN: 180 minutes at 60 a sitting, due in 7 days", () => {
    expect(size("khai thuế TNCN")).toMatchObject({ total: 180, perSitting: 60, sittings: 3, dueInDays: 7 });
  });
  it("lập ngân sách: 120 minutes in 60s, due in 7 days", () => {
    expect(size("lập ngân sách")).toMatchObject({ total: 120, perSitting: 60, sittings: 2, dueInDays: 7 });
  });
  it("gọi điện cho mẹ: 30 minutes, due in a day", () => {
    expect(size("gọi điện cho mẹ")).toMatchObject({ total: 30, dueInDays: 1 });
  });
  it("gửi mail cho GV: 30 minutes, due in a day", () => {
    expect(size("gửi mail cho GV")).toMatchObject({ total: 30, dueInDays: 1 });
  });
  it("họp nhóm đồ án: 60 × 0.6 + 60 = 96, rounded to 90, an event with no due", () => {
    expect(size("họp nhóm đồ án")).toEqual({ shape: "event", total: 90, perSitting: 90, sittings: 1 });
  });
  it("khám răng: 120 minutes, an event with no due", () => {
    expect(size("khám răng")).toEqual({ shape: "event", total: 120, perSitting: 120, sittings: 1 });
  });
  it("a class-less title: 60 minutes, no due", () => {
    expect(size("Giải tích")).toEqual({ shape: "errand", total: 60, perSitting: 60, sittings: 1 });
  });
});

describe("sizeOf practice", () => {
  it("tập gym: 60 minutes on Mon, Wed, Fri, no due", () => {
    expect(size("tập gym")).toEqual({
      shape: "practice", total: 60, perSitting: 60, sittings: 1, rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    });
  });
  it("chạy bộ: 30 minutes on Mon, Wed, Fri", () => {
    expect(size("chạy bộ")).toMatchObject({ total: 30, rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
  });
  it("tập bơi: 60 minutes on Tue and Fri", () => {
    expect(size("tập bơi")).toMatchObject({ total: 60, rrule: "FREQ=WEEKLY;BYDAY=TU,FR" });
  });
  it("tập yoga with a span: the weekdays until the span end", () => {
    expect(size("tập yoga", { spanEnd: SPAN_END })).toMatchObject({
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261231",
    });
  });
  it("học tiếng Anh giao tiếp: 30 minutes, five days a week", () => {
    expect(size("học tiếng Anh giao tiếp")).toMatchObject({
      total: 30, rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    });
  });
  it("học đàn guitar: 60 minutes, three days a week", () => {
    expect(size("học đàn guitar")).toMatchObject({ total: 60, rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
  });
  it("đọc sách: a daily 30 minute habit", () => {
    expect(size("đọc sách")).toMatchObject({ total: 30, rrule: "FREQ=DAILY" });
  });
  it("thiền buổi sáng: a daily habit, minimum 30 minutes", () => {
    expect(size("thiền buổi sáng")).toMatchObject({ total: 30, rrule: "FREQ=DAILY" });
  });
  it("the prep multiplier does not touch practice in a health domain", () => {
    expect(size("tập gym", { prep: 2 })).toMatchObject({ total: 60 });
  });
  it("đọc 10 cuốn sách until 31 Dec: 3600 minutes over 45 days, 80 a day, 1h30p as a half-hour guess, not tight", () => {
    expect(size("đọc 10 cuốn sách", { spanEnd: SPAN_END })).toEqual({
      shape: "practice",
      total: 3600,
      perSitting: 90,
      sittings: 45,
      rrule: "FREQ=DAILY;UNTIL=20261231",
      tight: false,
    });
  });
  it("a rate over the day cap is capped at 90 and tight", () => {
    expect(size("đọc 20 cuốn sách", { spanEnd: SPAN_END })).toMatchObject({ perSitting: 90, tight: true });
  });
});

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
// Each new class: a phrasing, and a 1-letter typo of it. Sized the same with accents, without them, and as typed.
const NEW_CLASSES: [string, string, string][] = [
  ["content", "làm reel cho fanpage", "reeel cho fanpage"],
  ["design", "thiết kế banner", "desing banner"],
  ["sales", "bán hàng cho khách", "bán hàng cho khahc"],
  ["report", "báo cáo tuần", "reprot tuần"],
  ["plan", "kế hoạch quý 1", "ke hoach quý 1"],
  ["interview", "phỏng vấn ứng viên", "intervew ứng viên"],
  ["deploy", "deploy bản mới", "deplyo bản mới"],
  ["research", "nghiên cứu thị trường", "reserach thị trường"],
  ["spec", "viết spec tính năng", "viết spec tính năng"],
  ["presentation", "pitch startup", "pitch startupp"],
  ["admin_work", "chấm công tháng 11", "cham cong tháng 11"],
  ["pet", "cho gà ăn", "cho ga an"],
  ["plants", "tưới cây", "tươi cây"],
  ["trash", "đổ rác", "dổ rác"],
  ["meds", "uống thuốc", "uống thuốc"],
  ["pickup", "đón con đi học", "đón con đi hcọ"],
  ["repair", "sửa xe máy", "sưa xe máy"],
  ["selfcare", "cắt tóc", "cắt tóc"],
];
describe("sizeOf new classes, all phrasings", () => {
  for (const [cls, title, typo] of NEW_CLASSES) {
    it(`${cls}: ${title} sizes the same as plain and typo`, () => {
      const s = size(title);
      expect(size(plain(title))).toEqual(s);
      expect(size(typo)).toEqual(s);
    });
  }
  for (const title of ["cho gà ăn", "cho ăn gà", "tưới cây", "đổ rác", "uống thuốc", "cho cá ăn", "đổ rác"]) {
    it(`micro chore ${title}: 15 minutes, one sitting`, () => {
      expect(size(title)).toMatchObject({ shape: "errand", total: 15, sittings: 1 });
    });
  }
  it("a real work task is 30-minute steps: report 180 minutes in 90s", () => {
    expect(size("báo cáo tuần")).toMatchObject({ total: 180, sittings: 2, dueInDays: 3 });
  });
});

// Classes added to the title keywords: each reads as its class with and without accents, and sizes to its sittings.
const NEW_ROWS: [TaskClass, string, number][] = [
  ["apply_job", "ứng tuyển vị trí Backend", 3],
  ["learn_tool", "học Excel", 1],
  ["move_house", "chuyển nhà", 5],
  ["trip", "lên kế hoạch du lịch Đà Lạt", 3],
  ["event_plan", "tổ chức sinh nhật mẹ", 4],
  ["declutter", "dọn tủ quần áo", 3],
  ["invest_research", "tìm hiểu chứng khoán", 2],
  ["finance_paper", "làm hồ sơ vay", 2],
];
describe("sizeOf new keyword classes", () => {
  for (const [cls, title, sittings] of NEW_ROWS) {
    it(`${cls}: ${title} is ${sittings} sittings, with and without accents`, () => {
      for (const t of [title, plain(title)]) {
        expect(frameOf(t).cls).toBe(cls);
        expect(size(t).sittings).toBe(sittings);
      }
    });
  }
  it("plain dọn nhà stays a clean; dọn nhà sang moves house", () => {
    expect(frameOf("dọn nhà").cls).toBe("clean");
    expect(frameOf("dọn nhà sang Quận 7").cls).toBe("move_house");
  });
  it("nộp hồ sơ học bổng stays paperwork, not a job application", () => {
    expect(frameOf("nộp hồ sơ học bổng").cls).toBe("paperwork");
  });
});

// The class table: every row sizes in half hours (micro chores 15), grows with its quantity, and a project of 5+ days gets 3+ sittings.
// Listed rows keep the table's own numbers: code, read (not retuned) and slides, budget, finance_paper make 2 sittings or fewer.
const SHORT = new Set<string>(["code", "read", "slides", "budget", "finance_paper"]);
const classes = Object.keys(T) as TaskClass[];
const run = (cls: TaskClass, n: number | undefined, hard: boolean, group: boolean): Size =>
  sizeOf({ objects: ["x"], cls, group, hard, ...(n === undefined ? {} : { qty: { n, unit: "trang" as const } }) }, { now: NOW });
describe("sizeOf class table", () => {
  it("every class, quantity, hard and group: whole half hours (micro 15), monotonic in quantity", () => {
    for (const cls of classes) for (const hard of [false, true]) for (const group of [false, true]) {
      for (const n of [undefined, 3, 10]) {
        const total = run(cls, n, hard, group).total;
        expect(T[cls].micro ? total : total % 30, `${cls} ${n}`).toBe(T[cls].micro ? 15 : 0);
      }
      expect(run(cls, 10, hard, group).total, cls).toBeGreaterThanOrEqual(run(cls, 3, hard, group).total);
    }
  });
  // deep work sits 90 minutes, so its 3 hours are 2 sittings; shorter sittings make 3+
  it("a project of 5+ days with no quantity gets 3+ sittings, 2+ when it sits 90 minutes", () => {
    for (const cls of classes) {
      const r = T[cls];
      if (r.shape !== "project" || r.days === undefined || r.days < 5 || SHORT.has(cls)) continue;
      expect(run(cls, undefined, false, false).sittings, cls).toBeGreaterThanOrEqual(r.per >= 90 ? 2 : 3);
    }
  });
});

describe("sizeOf with a class the table lacks", () => {
  it("sizes it as a plain errand instead of crashing (a stale heads.json)", () => {
    expect(sizeOf({ objects: ["x"], group: false, hard: false, cls: "gone" as never }, { now: NOW })).toMatchObject({ shape: "errand", total: 60 });
  });
});
