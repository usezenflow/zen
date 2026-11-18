// The time fields of one item, exhaustively: deadline, start, not-before, part of day and length, across day words, cue words,
// clocks, parts, lengths, word order, missing tones, abbreviations, spoken numbers, self-corrections and pasted announcements.
// Every expected value is worked out here from REF, never copied from the reader. `pnpm vitest run timefields.grid` runs it.
import { describe, expect, it } from "vitest";
import type { ReaderItem } from "../shared";
import { read } from "./reader";

// Wed 18/11/2026 09:00
const REF = { y: 2026, m: 11, d: 18, h: 9, mi: 0 };
const TODAY = "2026-11-18";
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const plus = (n: number) => ymd(REF.y, REF.m, REF.d + n);
/** Strips tones and đ, as a phone keyboard without Vietnamese input writes it. */
const toneless = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");

type Want = { deadline?: string; startsAt?: string; notBefore?: string | null; window?: string; durationMinutes?: number; title?: string };
function check(text: string, want: Want, source: "typed" | "voice" | "paste" = "typed") {
  const r = read(text, { ref: REF, source });
  expect(r.items.length, `${text}: items`).toBeGreaterThanOrEqual(1);
  const x = r.items[0] as ReaderItem & { notBefore?: string; windows?: string[] };
  const got: Want = {};
  if ("deadline" in want) got.deadline = x.deadline;
  if ("startsAt" in want) got.startsAt = x.startsAt;
  if ("durationMinutes" in want) got.durationMinutes = x.durationMinutes;
  if ("window" in want) got.window = x.windows?.[0];
  if ("title" in want) got.title = x.title;
  // null: no not-before past today (a deadline cue starts the work now)
  if ("notBefore" in want) got.notBefore = want.notBefore === null ? (x.notBefore && x.notBefore > `${TODAY} 23:59` ? x.notBefore : null) : x.notBefore;
  expect(got, text).toEqual(want);
}

/** Day words and the day they name. */
const DAYS: [string, string][] = [
  ["mai", plus(1)], ["ngày mai", plus(1)], ["ngày kia", plus(2)], ["mốt", plus(2)],
  ["thứ 6", plus(2)], ["t6", plus(2)], ["thứ sáu", plus(2)], ["thứ 7", plus(3)], ["chủ nhật", plus(4)], ["cn", plus(4)],
  ["thứ 2", plus(5)], ["thứ hai", plus(5)], ["thứ 3 tuần sau", plus(6)], ["thứ 6 tuần sau", plus(9)], ["t4 tuần sau", plus(7)],
  ["20/11", plus(2)], ["25/11", plus(7)], ["25-11", plus(7)], ["ngày 25", plus(7)], ["ngày 25/11", plus(7)],
  ["1/12", "2026-12-01"], ["01/12", "2026-12-01"], ["25/12", "2026-12-25"], ["5/1", "2027-01-05"], ["10/1/2027", "2027-01-10"],
  ["20 tháng 12", "2026-12-20"], ["3 ngày nữa", plus(3)],
];
const TASKS = ["làm báo cáo", "gọi mẹ", "mua sữa", "học bài"];

describe("a day alone: the work is on that day", () => {
  for (const [d, day] of DAYS) for (const task of TASKS.slice(0, 2)) {
    const want = { deadline: `${day} 23:59`, notBefore: `${day} 00:00` };
    it(`${task} ${d}`, () => check(`${task} ${d}`, want));
    it(`${d} ${task}`, () => check(`${d} ${task}`, want));
  }
});

describe("a deadline cue: due by the day's end, work starts now", () => {
  const CUES = ["trước", "trc", "hạn", "deadline", "hết", "chậm nhất", "muộn nhất", "trước ngày", "hạn chót"];
  for (const [d, day] of DAYS) for (const cue of CUES) {
    if ((/^ngày|nữa$/.test(d)) && cue === "trước ngày") continue;
    it(`làm báo cáo ${cue} ${d}`, () => check(`làm báo cáo ${cue} ${d}`, { deadline: `${day} 23:59`, notBefore: null }));
  }
  // a holiday's "trước" is its eve: "trước noel" is by 24/12, "hết noel" by its own day
  for (const cue of ["trước", "trc", "hạn", "chậm nhất"]) it(`làm báo cáo ${cue} noel`, () => check(`làm báo cáo ${cue} noel`, { deadline: "2026-12-24 23:59", notBefore: null }));
  it("làm báo cáo hết noel", () => check("làm báo cáo hết noel", { deadline: "2026-12-25 23:59", notBefore: null }));
  it("đi chơi noel", () => check("đi chơi noel", { deadline: "2026-12-25 23:59", notBefore: "2026-12-25 00:00" }));
  for (const [d, day] of DAYS.slice(0, 12)) it(`${d} phải xong báo cáo`, () => check(`trước ${d} phải xong báo cáo`, { deadline: `${day} 23:59`, notBefore: null }));
});

/** Clocks that say their part, and the wall time. */
const CLOCKS: [string, string][] = [
  ["9h sáng", "09:00"], ["9 giờ sáng", "09:00"], ["9g sáng", "09:00"], ["3h chiều", "15:00"], ["3 giờ chiều", "15:00"], ["15h", "15:00"],
  ["15:00", "15:00"], ["8h tối", "20:00"], ["20h", "20:00"], ["19:30", "19:30"], ["19h30", "19:30"], ["7h30 sáng", "07:30"],
  ["7 giờ 30 sáng", "07:30"], ["7 rưỡi sáng", "07:30"], ["7h rưỡi tối", "19:30"], ["9h15 sáng", "09:15"], ["10h kém 15 sáng", "09:45"],
  ["12h trưa", "12:00"], ["14h45", "14:45"], ["6h chiều", "18:00"], ["10 giờ đêm", "22:00"], ["11h trưa", "11:00"],
];

describe("a clock on a day: a fixed start", () => {
  for (const [d, day] of DAYS.filter((_, i) => i % 2 === 0)) for (const [c, hm] of CLOCKS) {
    const want = { startsAt: `${day} ${hm}` };
    it(`họp ${c} ${d}`, () => check(`họp ${c} ${d}`, want));
    it(`${d} ${c} họp`, () => check(`${d} ${c} họp`, want));
  }
  for (const [c, hm] of CLOCKS) it(`họp lúc ${c} mai`, () => check(`họp lúc ${c} mai`, { startsAt: `${plus(1)} ${hm}` }));
});

describe("before a clock is a deadline at it, after a clock a not-before", () => {
  for (const [d, day] of DAYS.filter((_, i) => i % 3 === 0)) for (const [c, hm] of CLOCKS.filter((_, i) => i % 2 === 0)) {
    it(`nộp bài trước ${c} ${d}`, () => check(`nộp bài trước ${c} ${d}`, { deadline: `${day} ${hm}` }));
    it(`làm báo cáo sau ${c} ${d}`, () => check(`làm báo cáo sau ${c} ${d}`, { notBefore: `${day} ${hm}` }));
  }
});

/** Parts of a day: the window, and its end as the due time. */
const PARTS: [string, string, string, string][] = [
  ["sáng", "MORNING", "11:00", "07:00"], ["trưa", "NOON", "13:00", "12:00"], ["chiều", "AFTERNOON", "18:00", "13:00"], ["tối", "NIGHT", "22:00", "18:00"],
];

describe("a part of a day: the window on that day", () => {
  for (const [d, day] of DAYS.filter((_, i) => i % 2 === 1)) for (const [p, win, end, start] of PARTS) {
    it(`làm báo cáo ${p} ${d}`, () => check(`làm báo cáo ${p} ${d}`, { window: win, deadline: `${day} ${end}`, notBefore: `${day} 00:00` }));
    it(`${p} ${d} làm báo cáo`, () => check(`${p} ${d} làm báo cáo`, { window: win, deadline: `${day} ${end}` }));
    it(`làm báo cáo trước ${p} ${d}`, () => check(`làm báo cáo trước ${p} ${d}`, { deadline: `${day} ${start}` }));
  }
  it("chiều nay", () => check("làm báo cáo chiều nay", { window: "AFTERNOON", deadline: `${TODAY} 18:00` }));
  it("tối nay", () => check("làm báo cáo tối nay", { window: "NIGHT", deadline: `${TODAY} 22:00` }));
});

/** Lengths as written and spoken. */
const LENGTHS: [string, number][] = [
  ["1 tiếng", 60], ["2 tiếng", 120], ["1 tiếng rưỡi", 90], ["1 tiếng 30 phút", 90], ["1 tiếng 15 phút", 75], ["nửa tiếng", 30],
  ["30 phút", 30], ["30p", 30], ["45 phút", 45], ["90 phút", 90], ["2h", 120], ["2 giờ đồng hồ", 120], ["3 tiếng", 180],
  ["một tiếng", 60], ["hai tiếng", 120], ["mười lăm phút", 15], ["ba mươi phút", 30], ["một tiếng rưỡi", 90], ["15p", 15], ["2 tiếng rưỡi", 150],
];
// "2h" beside a clock may be a clock itself: only alone is it a length

describe("a said length is the length", () => {
  for (const [l, min] of LENGTHS) {
    it(`học bài ${l}`, () => check(`học bài ${l}`, { durationMinutes: min }));
    if (l === "2h") continue;
    it(`họp 9h sáng mai ${l}`, () => check(`họp 9h sáng mai ${l}`, { startsAt: `${plus(1)} 09:00`, durationMinutes: min }));
    it(`mai học bài ${l} trước 5h chiều`, () => check(`mai học bài ${l} trước 5h chiều`, { deadline: `${plus(1)} 17:00`, durationMinutes: min }));
  }
  const RANGES: [string, string, number][] = [
    ["9h-11h sáng mai", "09:00", 120], ["từ 9h đến 11h sáng mai", "09:00", 120], ["9h đến 11h30 sáng mai", "09:00", 150],
    ["14h-16h mai", "14:00", 120], ["mai 13:30-15:00", "13:30", 90], ["từ 2h đến 4h chiều mai", "14:00", 120], ["mai 7h-9h tối", "19:00", 120],
  ];
  for (const [r, hm, min] of RANGES) it(`họp ${r}`, () => check(`họp ${r}`, { startsAt: `${plus(1)} ${hm}`, durationMinutes: min }));
});

describe("missing tones and capitals read the same", () => {
  const SAMPLES: [string, Want][] = [
    ["làm báo cáo trước thứ 6", { deadline: `${plus(2)} 23:59` }],
    ["họp 3 giờ chiều mai", { startsAt: `${plus(1)} 15:00` }],
    ["họp 9h sáng thứ 2 tuần sau", { startsAt: `${plus(5)} 09:00` }],
    ["nộp bài trước 5h chiều chủ nhật", { deadline: `${plus(4)} 17:00` }],
    ["học bài 1 tiếng rưỡi tối mai", { durationMinutes: 90, window: "NIGHT", deadline: `${plus(1)} 22:00` }],
    ["gọi mẹ ngày kia", { deadline: `${plus(2)} 23:59` }],
    ["làm báo cáo hạn chót 25/11", { deadline: `${plus(7)} 23:59` }],
    ["họp từ 9h đến 11h sáng mai", { startsAt: `${plus(1)} 09:00`, durationMinutes: 120 }],
  ];
  for (const [s, want] of SAMPLES) {
    it(toneless(s), () => check(toneless(s), want));
    it(s.toUpperCase(), () => check(s.toUpperCase(), want));
    it(`${s} nhé`, () => check(`${s} nhé`, want));
    it(`${s}, giúp mình`, () => check(`${s}, giúp mình`, want));
  }
});

describe("spoken numbers by voice", () => {
  const SPOKEN: [string, Want][] = [
    ["họp chín giờ sáng mai", { startsAt: `${plus(1)} 09:00` }],
    ["họp ba giờ chiều thứ sáu", { startsAt: `${plus(2)} 15:00` }],
    ["họp bảy giờ ba mươi tối mai", { startsAt: `${plus(1)} 19:30` }],
    ["họp bảy giờ rưỡi tối mai", { startsAt: `${plus(1)} 19:30` }],
    ["họp mười giờ kém mười lăm sáng mai", { startsAt: `${plus(1)} 09:45` }],
    ["họp mười một giờ trưa mai", { startsAt: `${plus(1)} 11:00` }],
    ["nộp bài trước năm giờ chiều ngày hai mươi lăm", { deadline: `${plus(7)} 17:00` }],
    ["nộp bài trước ngày hai lăm tháng mười một", { deadline: `${plus(7)} 23:59` }],
    ["học bài hai tiếng tối mai", { durationMinutes: 120, deadline: `${plus(1)} 22:00` }],
    ["họp chín giờ sáng mai trong một tiếng rưỡi", { startsAt: `${plus(1)} 09:00`, durationMinutes: 90 }],
    ["ba ngày nữa nộp báo cáo", { deadline: `${plus(3)} 23:59` }],
  ];
  for (const [s, want] of SPOKEN) it(s, () => check(s, want, "voice"));
});

describe("a self-correction keeps the last value", () => {
  const FIX: [string, Want][] = [
    ["họp 9h à nhầm 10h sáng mai", { startsAt: `${plus(1)} 10:00` }],
    ["họp 9h sáng mai à không 10h", { startsAt: `${plus(1)} 10:00` }],
    ["họp 9h sáng mai, à không, 10h", { startsAt: `${plus(1)} 10:00` }],
    ["nộp bài thứ 5 à nhầm thứ 6", { deadline: `${plus(2)} 23:59` }],
    ["nộp bài thứ 5 à không thứ 6", { deadline: `${plus(2)} 23:59` }],
    ["họp mai à không ngày kia lúc 9h sáng", { startsAt: `${plus(2)} 09:00` }],
    ["gọi mẹ tối mai, ý là tối ngày kia", { window: "NIGHT", deadline: `${plus(2)} 22:00` }],
    ["họp 3h chiều mai nhầm 4h chiều", { startsAt: `${plus(1)} 16:00` }],
  ];
  for (const [s, want] of FIX) { it(s, () => check(s, want)); it(`voice: ${s}`, () => check(s, want, "voice")); }
});

describe("a pasted announcement", () => {
  const NOTICES: [string, Want][] = [
    ["THÔNG BÁO\nCác bạn sinh viên nộp báo cáo thực tập trước 17h00 ngày 25/11/2026 tại văn phòng khoa.", { deadline: "2026-11-25 17:00" }],
    ["Hạn chót nộp bài: 23h59 ngày 30/11/2026", { deadline: "2026-11-30 23:59" }],
    ["Hạn nộp: 25/11/2026 lúc 17:00", { deadline: "2026-11-25 17:00" }],
    ["Thời gian: 8h00 - 11h00, thứ Sáu ngày 27/11/2026\nĐịa điểm: Hội trường A", { startsAt: "2026-11-27 08:00", durationMinutes: 180 }],
    ["Lịch họp lớp: 14h00 ngày 20/11/2026 tại phòng B2.01", { startsAt: "2026-11-20 14:00" }],
    ["Kính gửi các em,\nThầy dời buổi bảo vệ sang 9h00 sáng thứ Hai, 23/11/2026.\nTrân trọng.", { startsAt: "2026-11-23 09:00" }],
    ["[Thông báo] Deadline nộp đồ án: 23:59 Chủ nhật 29/11", { deadline: "2026-11-29 23:59" }],
  ];
  for (const [s, want] of NOTICES) it(s.split("\n")[0], () => check(s, want, "paste"));
});
