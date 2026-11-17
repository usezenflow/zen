// A meeting with a span ("tuần sau", "quý này") and no said clock is a flexible plan, never a guessed fixed hour;
// with a clock it is fixed at that clock. A leading time filler with no day means later today, flexible.
// `pnpm vitest run spanmeet.grid` runs it.
import { expect, it } from "vitest";
import { read } from "./reader";

// Sun 08/11/2026 19:09
const REF = { y: 2026, m: 11, d: 8, h: 19, mi: 9 };
const items = (said: string) => read(said, { ref: REF, source: "typed" }).items;

const MEET = ["họp", "họp nhóm", "họp tổ", "họp team", "họp khoa", "họp phụ huynh", "họp giao ban", "họp dự án"];
const SPANS = ["tuần sau", "tuần tới", "tuần này", "tháng sau", "tháng tới", "tháng này", "năm nay", "quý này", "quý sau", "học kỳ này", "kỳ này"];
const CLOCKS: [string, string][] = [["9h", "09:00"], ["14h30", "14:30"], ["8h sáng", "08:00"], ["3h chiều", "15:00"]];

it("a meeting in a span with no clock is flexible", () => {
  const miss: string[] = [];
  let n = 0;
  for (const m of MEET) for (const s of SPANS) for (const said of [`${m} ${s}`, `${s} ${m}`]) {
    n++;
    const r = items(said);
    if (r.length !== 1 || r[0].startsAt || r[0].type === "BUSY") miss.push(`${said} -> ${JSON.stringify(r.map((x) => [x.type, x.startsAt, x.deadline]))}`);
  }
  expect(miss.slice(0, 30)).toEqual([]);
  expect(n).toBe(MEET.length * SPANS.length * 2);
});

it("a meeting in a span with a clock is fixed at that clock", () => {
  const miss: string[] = [];
  for (const m of MEET) for (const s of SPANS) for (const [c, hhmm] of CLOCKS) for (const said of [`${m} ${s} lúc ${c}`, `${s} ${m} ${c}`]) {
    const r = items(said);
    if (r.length !== 1 || !r[0].startsAt?.endsWith(hhmm)) miss.push(`${said} -> ${JSON.stringify(r.map((x) => [x.type, x.startsAt, x.deadline]))}`);
  }
  expect(miss.slice(0, 30)).toEqual([]);
});

const FILLERS = ["tí", "tý", "lát", "chút", "xíu", "tí nữa", "lát nữa", "chút nữa", "xíu nữa", "tí về", "lát xong", "chút rảnh"];
const ACTS = ["nộp báo cáo", "họp nhóm", "tưới cây", "gọi mẹ", "đổ rác", "dọn phòng", "viết báo cáo", "uống thuốc"];

it("a leading filler with no day or clock is later today, flexible", () => {
  const miss: string[] = [];
  let n = 0;
  for (const f of FILLERS) for (const a of ACTS) {
    n++;
    const r = items(`${f} ${a}`);
    const x = r[0];
    if (r.length !== 1 || x.startsAt || !x.deadline?.startsWith("2026-11-08") || (x.notBefore && x.notBefore < "2026-11-08 19:09")) miss.push(`${f} ${a} -> ${JSON.stringify(r.map((y) => [y.type, y.startsAt, y.notBefore, y.deadline]))}`);
  }
  expect(miss.slice(0, 30)).toEqual([]);
  expect(n).toBe(FILLERS.length * ACTS.length);
});

it("a leading filler with a clock is the nearest future clock, fixed", () => {
  const miss: string[] = [];
  for (const f of FILLERS) for (const a of ACTS) {
    // a due task ("nộp") takes the clock as its deadline, an activity as its start
    const r = items(`${f} ${a} lúc 8h30`).map((x) => x.startsAt ?? x.deadline);
    if (r.length !== 1 || !r[0]!.endsWith("20:30") || !r[0]!.startsWith("2026-11-08")) miss.push(`${f} ${a} -> ${JSON.stringify(r)}`);
  }
  expect(miss.slice(0, 30)).toEqual([]);
});

it("a name Tí and a word lát stay", () => {
  for (const said of ["gặp Tí", "sinh nhật Tí", "lát bánh mì", "mua quà cho Tí"]) {
    const x = items(said)[0];
    expect(x.deadline?.startsWith("2026-11-08") && x.notBefore, said).toBeFalsy();
  }
});
