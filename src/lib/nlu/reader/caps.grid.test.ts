import { describe, expect, it } from "vitest";
import { MAX_SESSION_DAYS, MAX_TASK_MINUTES, type ReaderItem } from "../shared";
import { read } from "./reader";

// Caps and bad numbers: a near miss clamps (31/11 is 30/11, 24:30 is 00:30 the next day), any other bad value stays in
// the title; offsets and years are plain arithmetic, however far; only lengths and rows per line are capped.
const REFS = [
  { y: 2026, m: 11, d: 15, h: 9, mi: 0 },
  { y: 2027, m: 1, d: 31, h: 23, mi: 10 },
];
const NUMS = [0, 1, 2, 9, 12, 13, 23, 24, 25, 31, 32, 59, 60, 99, 100, 999, 9999];
const YEARS = [0, 25, 1899, 1999, 2024, 2026, 2031, 2032, 2099, 3026, 20266, 99999];
const TEMPLATES: ((n: number) => string)[] = [
  (n) => `học ${n} phút`,
  (n) => `học ${n} tiếng`,
  (n) => `học ${n}h`,
  (n) => `học trong ${n}h`,
  (n) => `học ${n} tiết`,
  (n) => `học ${n} hours`,
  (n) => `học ${n} tiếng rưỡi`,
  (n) => `học lúc ${n}h`,
  (n) => `họp lúc ${n}h mai`,
  (n) => `họp lúc 9h${n}`,
  (n) => `họp ${n}:30 mai`,
  (n) => `họp 9h kém ${n}`,
  (n) => `học ngày ${n}/11`,
  (n) => `học ngày 15/${n}`,
  (n) => `họp lúc 9h ngày ${n}/12`,
  (n) => `học ngày 15 tháng ${n}`,
  (n) => `học đầu tháng ${n}`,
  (n) => `học tuần thứ 2 của tháng ${n}`,
  (n) => `học ${n} ngày nữa`,
  (n) => `họp lúc 9h ${n} ngày nữa`,
  (n) => `học ${n} tuần nữa`,
  (n) => `học ${n} tháng nữa`,
  (n) => `học ${n} năm nữa`,
  (n) => `học in ${n} days`,
  (n) => `học ${n} phút nữa`,
  (n) => `học mỗi ${n} ngày`,
  (n) => `học mỗi ${n} tuần`,
  (n) => `học mỗi ${n} tháng`,
  (n) => `uống nước mỗi ${n} tiếng`,
  (n) => `học ${n} buổi trong tuần sau`,
  (n) => `học ${n} buổi trong tuần này`,
  (n) => `học ${n} buổi một tuần`,
  (n) => `học mỗi thứ 2 ${n} buổi`,
  (n) => `học mỗi ngày trong ${n} tuần`,
  (n) => `học mỗi ngày trong ${n} ngày`,
  (n) => `học bù tiết ${n} thứ 5`,
  (n) => `học bù tiết ${n}-2 thứ 5`,
];
const YEAR_TEMPLATES: ((y: number) => string)[] = [
  (y) => `học 20/11/${y}`,
  (y) => `họp lúc 9h 20/11/${y}`,
  (y) => `nộp báo cáo 20/11/${y}`,
  (y) => `học mỗi ngày đến 20/11/${y}`,
  (y) => `học mỗi ngày trước 20/11/${y}`,
];

const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** A stamp a calendar has: "YYYY-MM-DD HH:mm" with a real month, day, hour and minute. */
function realStamp(s: string) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)$/.exec(s);
  return !!m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= dim(+m[1], +m[2]) && +m[4] <= 23 && +m[5] <= 59;
}
function invariants(text: string, items: ReaderItem[]) {
  expect(items.length, "a line makes a task").toBeGreaterThan(0);
  // "N buổi trong tuần này" fills at most three parts a day for the days left
  expect(items.length, "rows per line").toBeLessThanOrEqual(3 * 7);
  for (const it of items) {
    expect(it.title.trim(), "title").not.toBe("");
    for (const s of [it.startsAt, it.notBefore, it.deadline]) if (s) expect(realStamp(s), `${s} is a real stamp`).toBe(true);
    if (it.notBefore && it.deadline) expect(it.notBefore <= it.deadline, `${it.notBefore} <= ${it.deadline}`).toBe(true);
    if (it.durationMinutes !== undefined && !it.days) expect(it.durationMinutes).toBeLessThanOrEqual(MAX_TASK_MINUTES);
    if (it.rrule) {
      expect(it.rrule, "no zero or one interval").not.toMatch(/INTERVAL=[01](?!\d)/);
      expect(it.rrule, "no zero count").not.toMatch(/COUNT=0(?!\d)/);
      const until = /UNTIL=(\d{4})(\d\d)(\d\d)/.exec(it.rrule);
      if (until) expect(realStamp(`${until[1]}-${until[2]}-${until[3]} 00:00`)).toBe(true);
    }
  }
  if (/mỗi ngày trước/.test(text)) expect(items.length).toBeLessThanOrEqual(MAX_SESSION_DAYS);
}

describe("caps: invariants over every numeric slot", () => {
  for (const ref of REFS) {
    for (const t of TEMPLATES)
      for (const n of NUMS) {
        const text = t(n);
        it(`${ref.m}/${ref.d}: ${text}`, () => invariants(text, read(text, { source: "typed", ref }).items));
      }
    for (const t of YEAR_TEMPLATES)
      for (const y of YEARS) {
        const text = t(y);
        it(`${ref.m}/${ref.d}: ${text}`, () => invariants(text, read(text, { source: "typed", ref }).items));
      }
  }
});

const REF = REFS[0];
const one = (text: string, source: "typed" | "voice" = "typed") => {
  const r = read(text, { source, ref: REF });
  expect(r.items).toHaveLength(1);
  return r.items[0];
};

describe("caps: lengths", () => {
  for (const [text, min] of [
    ["học 50 hours", 2400],
    ["học 99 tiếng rưỡi", 2400],
    ["học 100000 phút", 2400],
    ["học 99h99p", 2400],
    ["học 1.5 tiếng", 90],
    ["học 1,5 tiếng", 90],
    ["học 2.5h", 150],
    ["học 3 tiết", 150],
    ["ôn 3 tiết", 150],
    ["học trong 25h", 1500],
  ] as const)
    it(`${text} is ${min} minutes`, () => {
      const x = one(text);
      expect(x.durationMinutes).toBe(min);
      expect(x.deadline).toBeUndefined();
    });
  for (const text of ["học 0 phút", "học 0 tiết"])
    it(`${text}: no length, the words stay`, () => expect(one(text).title).toMatch(/ 0 /));
});

describe("caps: clocks", () => {
  for (const [text, words] of [
    ["học lúc 25h", "25h"],
    ["học lúc 99h", "99h"],
    ["học lúc 9h99", "9h99"],
    ["học 12:60", "12:60"],
    ["họp 25h mai", "25h"],
  ] as const)
    it(`${text}: no clock, no length`, () => {
      const x = one(text);
      expect(x.type).toBe("PLAN");
      expect(x.startsAt).toBeUndefined();
      expect(x.title).toContain(words);
      expect(x.durationMinutes).toBeLessThanOrEqual(120);
    });
  for (const [text, at] of [
    ["học lúc 24:30", "2026-11-16 00:30"],
    ["học 24:00", "2026-11-16 00:00"],
    ["họp lúc 9h kém 0 mai", "2026-11-16 09:00"],
  ] as const)
    it(`${text} starts ${at}`, () => expect(one(text).startsAt).toBe(at));
  it("voice: hai mươi lăm giờ is 25, no clock", () => {
    const x = one("học lúc hai mươi lăm giờ", "voice");
    expect(x.startsAt).toBeUndefined();
    expect(x.title).toContain("25");
  });
});

describe("caps: dates", () => {
  for (const [text, words] of [
    ["học ngày 0/11", "0/11"],
    ["học ngày 32/11", "32/11"],
    ["học ngày 30/13", "30/13"],
    ["học ngày 99/99", "99/99"],
    ["học đầu tháng 13", "tháng 13"],
    ["học đầu tháng 0", "tháng 0"],
  ] as const)
    it(`${text}: no date, the words stay`, () => {
      const x = one(text);
      expect(x.title).toContain(words);
      expect(x.deadline).toBeUndefined();
    });
  for (const [text, day] of [
    ["học 31/11", "2026-11-30"],
    ["học ngày 31/2", "2027-02-28"],
    ["học 29/2/2027", "2027-02-28"],
  ] as const)
    it(`${text} clamps to ${day}, flagged`, () => {
      const x = one(text);
      expect(x.deadline?.slice(0, 10)).toBe(day);
      expect(x.flags).toContain("date_clamped");
    });
  for (const [text, day, past] of [
    ["học 20/11/1999", "1999-11-20", true],
    ["học 20/11/25", "2025-11-20", true],
    ["học 20/11/2099", "2099-11-20", false],
    ["học 20/11/99999", "9999-11-20", false],
  ] as const)
    it(`${text} keeps its year`, () => {
      const x = one(text);
      expect(x.deadline?.slice(0, 10)).toBe(day);
      expect(x.flags.includes("date_past")).toBe(past);
    });
  it("a range written backwards is the same two days", () => {
    const x = one("học từ 20/11 đến 19/11");
    expect(x.notBefore).toBe("2026-11-19 00:00");
    expect(x.deadline).toBe("2026-11-20 23:59");
  });
  it("a series end years away keeps its year", () =>
    expect(one("học mỗi ngày đến 20/11/2035").rrule).toBe("FREQ=DAILY;UNTIL=20351120T235959"));
});

describe("caps: offsets", () => {
  for (const [text, day] of [
    ["học 3 tuần nữa", "2026-12-06"],
    ["học 10 tuần nữa", "2027-01-24"],
    ["học 1 tuần nữa", "2026-11-22"],
    ["học 100 ngày nữa", "2027-02-23"],
    ["học 9999 ngày nữa", "2054-04-01"],
    ["học in 999 days", "2029-08-10"],
    ["học 5 tháng nữa", "2027-04-15"],
    ["học 2 năm nữa", "2028-11-15"],
  ] as const)
    it(`${text} is ${day}`, () => {
      const x = one(text);
      expect(x.deadline?.slice(0, 10)).toBe(day);
      expect(x.title).toBe("Học");
    });
  it("voice: ba trăm ngày nữa is 300 days", () => expect(one("học ba trăm ngày nữa", "voice").deadline?.slice(0, 10)).toBe("2027-09-11"));
  it("voice: một trăm linh năm ngày nữa is 105 days", () =>
    expect(one("học một trăm linh năm ngày nữa", "voice").deadline?.slice(0, 10)).toBe("2027-02-28"));
});

describe("caps: repeats", () => {
  for (const [text, rule] of [
    ["học mỗi 0 tuần", "FREQ=WEEKLY"],
    ["học mỗi 1 tuần", "FREQ=WEEKLY"],
    ["học mỗi 0 ngày", "FREQ=DAILY"],
    ["học mỗi 1 ngày", "FREQ=DAILY"],
    ["học mỗi 0 tháng", "FREQ=MONTHLY"],
    ["học mỗi 100 ngày", "FREQ=DAILY;INTERVAL=100"],
    ["học mỗi 100 tuần", "FREQ=WEEKLY;INTERVAL=100"],
    ["học 9 buổi trong tuần sau", "FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA;COUNT=7"],
    ["học 30 buổi trong tuần sau", "FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA;COUNT=7"],
    ["học 10 buổi một tuần", "FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA"],
    ["học mỗi thứ 2 100 buổi", "FREQ=WEEKLY;BYDAY=MO;COUNT=100"],
    ["học mỗi ngày trước 20/11/2031", "FREQ=DAILY;UNTIL=20311120T235959"],
  ] as const)
    it(`${text} is ${rule}`, () => expect(one(text).rrule).toBe(rule));
  it("0 buổi trong tuần sau is one task next week, no count", () => {
    const x = one("học 0 buổi trong tuần sau");
    expect(x.rrule).toBeUndefined();
    expect(x.deadline).toBe("2026-11-22 23:59");
  });
  it("mỗi ngày 120 buổi leaves no number in the title", () => expect(one("học mỗi ngày 120 buổi").title).toBe("Học"));
  it("a daily run to 14 days is a row a day", () => expect(read("học mỗi ngày trước 28/11", { source: "typed", ref: REF }).items).toHaveLength(14));
});

describe("caps: periods", () => {
  it("tiết 5-2 is periods 2 to 5", () =>
    expect(one("học bù tiết 5-2 thứ 5")).toMatchObject({ startsAt: one("học bù tiết 2-5 thứ 5").startsAt, durationMinutes: 210 }));
  it("an unknown period keeps the exam, no clock", () => expect(one("thi tiết 15")).toMatchObject({ type: "EXAM", title: "Thi" }));
});
