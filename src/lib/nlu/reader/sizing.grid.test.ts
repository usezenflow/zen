// The sizer, end to end: a typed title becomes an Action with the length, sittings, due or repeat its class gives.
// Ref: Mon 16/11/2026 10:00 (UTC+7). Generated over every sizer class, with and without diacritics, verb first and object first.
import { describe, expect, it } from "vitest";
import { itemAction, sizedSub } from "../adapt";
import type { Action } from "../../types";
import type { CalDay } from "./daypick";
import { read } from "./reader";
import type { ReaderSource } from "../shared";

const REF = { y: 2026, m: 11, d: 16, h: 10, mi: 0 };

const acts = (text: string, source: ReaderSource = "typed", calendar?: CalDay[]): Action[] =>
  read(text, { ref: REF, source, calendar }).items.map(itemAction);
const dayOf = (s?: string) => s?.slice(0, 10);
const multipleOf30 = (n?: number) => n !== undefined && n % 30 === 0;

interface Row {
  /** Title phrasings: with diacritics, without, verb first and object first. */
  titles: string[];
  total: number;
  /** Minutes a sitting; undefined for errands and events, which are one sitting. */
  per?: number;
  /** Day the due lands on, "YYYY-MM-DD"; undefined for an event with no due. */
  due?: string;
}

const PROJECTS: Row[] = [
  { titles: ["code b-tree", "lập trình b-tree", "b-tree code"], total: 180, per: 90, due: "2026-11-23" },
  { titles: ["viết báo cáo mạng máy tính", "bao cao mang may tinh", "báo cáo mạng máy tính"], total: 270, per: 90, due: "2026-11-23" },
  { titles: ["tiểu luận triết học", "viết tiểu luận triết học", "triết học tiểu luận"], total: 1200, per: 90, due: "2026-11-30" },
  { titles: ["slide chương 3", "làm slide chương 3", "thuyết trình chương 3"], total: 90, per: 90, due: "2026-11-21" },
  { titles: ["ôn thi giải tích", "ôn giải tích", "giải tích ôn thi"], total: 180, per: 60, due: "2026-11-26" },
  { titles: ["làm bài tập đại số", "bài tập đại số", "đại số làm bài tập"], total: 90, per: 90, due: "2026-11-19" },
  { titles: ["khóa luận tốt nghiệp", "làm khóa luận tốt nghiệp", "khoa luan tot nghiep"], total: 6000, per: 120, due: "2027-01-15" },
];
const ERRANDS: Row[] = [
  { titles: ["đóng tiền điện", "dong tien dien", "trả tiền điện"], total: 30, due: "2026-11-30" },
  { titles: ["đi chợ", "di cho", "đi siêu thị"], total: 60, due: "2026-11-19" },
  { titles: ["gọi điện cho mẹ", "goi dien cho me", "gọi cho mẹ"], total: 30, due: "2026-11-17" },
  { titles: ["giặt đồ", "giat do", "giặt ủi đồ"], total: 60, due: "2026-11-19" },
  { titles: ["fix bug đăng nhập", "sửa lỗi đăng nhập", "debug đăng nhập"], total: 60, due: "2026-11-18" },
];
const EVENTS: Row[] = [
  { titles: ["họp nhóm đồ án", "hop nhom do an", "đồ án họp nhóm"], total: 90 },
  { titles: ["khám răng", "kham rang", "đi khám răng"], total: 120 },
];
/** Practices: a session's length, and the weekdays it repeats on. */
const PRACTICES: [string[], number, string][] = [
  [["học tiếng anh", "hoc tieng anh", "tiếng anh học"], 30, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
  [["tập gym", "tap gym", "gym"], 60, "FREQ=WEEKLY;BYDAY=MO,WE,FR"],
  [["chạy bộ", "chay bo"], 30, "FREQ=WEEKLY;BYDAY=MO,WE,FR"],
  [["tập bơi", "tap boi"], 60, "FREQ=WEEKLY;BYDAY=TU,FR"],
  [["đọc sách", "doc sach"], 30, "FREQ=DAILY"],
];

describe("sizer: each class, typed", () => {
  it("a project or errand gets its length, sittings and due; an event its length only", () => {
    const misses: string[] = [];
    for (const row of [...PROJECTS, ...ERRANDS, ...EVENTS])
      for (const title of row.titles) {
        const all = acts(title);
        const tag = `${title} (${row.total})`;
        if (all.length !== 1) { misses.push(`count | ${tag} | ${all.length}`); continue; }
        const a = all[0];
        if (a.effortMinutes !== row.total) misses.push(`length | ${tag} | ${a.effortMinutes}`);
        if (!multipleOf30(a.effortMinutes)) misses.push(`not30 | ${tag} | ${a.effortMinutes}`);
        if (a.effortGuessed !== true) misses.push(`guessed | ${tag} | ${a.effortGuessed}`);
        if (a.fixed) misses.push(`fixed | ${tag}`);
        if (a.repeat) misses.push(`repeat | ${tag} | ${a.repeat}`);
        if (dayOf(a.deadline) !== row.due) misses.push(`due | ${tag} | ${a.deadline}`);
        if (a.deadline && !a.deadline.endsWith("T23:59:00")) misses.push(`clock | ${tag} | ${a.deadline}`);
        if (row.per !== undefined && a.maxSitting !== row.per) misses.push(`maxSitting | ${tag} | ${a.maxSitting}`);
        if (row.per === undefined && a.maxSitting !== undefined) misses.push(`maxSitting on one sitting | ${tag} | ${a.maxSitting}`);
      }
    expect(misses).toEqual([]);
  });

  it("a practice repeats on its weekdays, one session a day, with no deadline", () => {
    const misses: string[] = [];
    for (const [titles, per, rule] of PRACTICES)
      for (const title of titles) {
        const all = acts(title);
        if (all.length !== 1) { misses.push(`count | ${title} | ${all.length}`); continue; }
        const a = all[0];
        if (a.repeat !== rule) misses.push(`rule | ${title} | ${a.repeat}`);
        if (a.effortMinutes !== per) misses.push(`session | ${title} | ${a.effortMinutes}`);
        if (a.deadline) misses.push(`deadline | ${title} | ${a.deadline}`);
        if (a.fixed) misses.push(`fixed | ${title}`);
        if (a.maxSitting) misses.push(`maxSitting | ${title} | ${a.maxSitting}`);
      }
    expect(misses).toEqual([]);
  });

  it("a voice read sizes the same way", () => {
    const misses: string[] = [];
    for (const row of [PROJECTS[0], ERRANDS[0], EVENTS[0]])
      for (const title of row.titles) {
        const a = acts(title, "voice")[0];
        if (a?.effortMinutes !== row.total) misses.push(`voice length | ${title} | ${a?.effortMinutes}`);
      }
    expect(misses).toEqual([]);
  });
});

describe("sizer: what the words said stays", () => {
  it("a said length wins: no split, no sitting size", () => {
    const all = acts("code b-tree 45p");
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ title: "Code b-tree", effortMinutes: 45 });
    expect(all[0].maxSitting).toBeUndefined();
  });

  it("a fixed start only with a said clock", () => {
    const misses: string[] = [];
    for (const row of [...PROJECTS, ...ERRANDS, ...EVENTS])
      for (const title of row.titles) if (acts(title).some((a) => a.fixed)) misses.push(title);
    expect(misses).toEqual([]);
    const timed = acts("tập gym 18h thứ 4");
    expect(timed.some((a) => a.fixed === "busy" && a.when?.slice(11, 16) === "18:00")).toBe(true);
  });
});

describe("sizer: several objects, sittings and a due", () => {
  it("code b-tree và lsm: two tasks of 180, 90 a sitting, due 23/11", () => {
    const all = acts("code b-tree và lsm");
    expect(all.map((a) => a.title)).toEqual(["Code b-tree", "Code lsm"]);
    for (const a of all) {
      expect(a.effortMinutes).toBe(180);
      expect(a.maxSitting).toBe(90);
      expect(dayOf(a.deadline)).toBe("2026-11-23");
    }
  });

  it("trong năm nay học tiếng anh, tập gym, đọc 10 cuốn sách: three repeats to 31/12", () => {
    const all = acts("trong năm nay học tiếng anh, tập gym, đọc 10 cuốn sách");
    expect(all).toHaveLength(3);
    const by = (k: string) => all.find((a) => a.title?.toLowerCase().includes(k));
    expect(by("tiếng anh")).toMatchObject({ repeat: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261231", effortMinutes: 30 });
    expect(by("gym")).toMatchObject({ repeat: "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261231", effortMinutes: 60 });
    expect(by("sách")).toMatchObject({ repeat: "FREQ=DAILY;UNTIL=20261231", effortMinutes: 90 });
    for (const a of all) expect(a.deadline).toBeUndefined();
  });

  it("đóng tiền điện: 30 minutes, due 30/11", () => {
    expect(acts("đóng tiền điện")[0]).toMatchObject({ effortMinutes: 30, deadline: "2026-11-30T23:59:00" });
  });

  it("tuần sau học toán, viết báo cáo, đi khám: every due by 29/11, every start 23/11", () => {
    const all = acts("tuần sau học toán, viết báo cáo, đi khám");
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const a of all) {
      if (a.deadline) expect((dayOf(a.deadline) ?? "") <= "2026-11-29").toBe(true);
      expect(dayOf(a.notBefore)).toBe("2026-11-23");
    }
  });

  it("an exam prep is due the day before its exam, and the action names the exam", () => {
    const cal: CalDay[] = [{ date: "2026-12-04", classes: [], exams: [{ title: "Giải tích", start: 540 }] }];
    const a = acts("ôn giải tích", "typed", cal)[0];
    expect(a).toMatchObject({ effortMinutes: 180, maxSitting: 60, anchor: "2026-12-04" });
    expect(a.deadline).toBe("2026-12-03T23:59:00");
  });
});

describe("capture toast sub", () => {
  // Mon 16/11/2026 10:00 in the device's zone, as the toast reads it.
  const now = new Date(2026, 10, 16, 10, 0).getTime();
  const sub = (text: string, cal?: CalDay[]) => sizedSub(acts(text, "typed", cal), now);

  it("names the exam a prep is due before", () => {
    const cal: CalDay[] = [{ date: "2026-12-04", classes: [], exams: [{ title: "Giải tích", start: 540 }] }];
    expect(sub("ôn giải tích", cal)).toBe("Trước buổi thi 4/12");
  });
  it("one task with nothing shared has no sub", () => {
    expect(sub("đóng tiền điện")).toBeUndefined();
  });
  it("repeats that end on one day share the end: đến 31/12", () => {
    expect(sub("trong năm nay học tiếng anh, tập gym, đọc 10 cuốn sách")).toBe("đến 31/12");
  });
  it("tasks in one span share it: 23 - 29/11", () => {
    expect(sub("tuần sau học toán, viết báo cáo, đi khám")).toBe("23 - 29/11");
  });
  it("projects due together show their sittings and due: 4 buổi · Hạn T2 23/11", () => {
    expect(sub("code b-tree và lsm")).toBe("4 buổi · Hạn T2 23/11");
  });
});
