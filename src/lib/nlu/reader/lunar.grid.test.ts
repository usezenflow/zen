// Lunar dates are dates, never clocks ("15 âm" is not 15:00 "15 am"), and "rằm tháng giêng cúng" is one item on that day.
// Expected days come from the shared lunar calendar (Hồ Ngọc Đức) or a known Tết/Trung thu date, not from the reader.
// Ref: Sat 14/11/2026 06:00.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { lunarToSolar } from "../shared";
import { read } from "./reader";

const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };
const lunar = (year: number, month: number, day: number) => lunarToSolar({ year, month, day, leap: false })!;
const TET = "2027-02-06"; // Tết Đinh Mùi
const RAM_THANG_GIENG = "2027-02-20";
const MID_AUTUMN = "2027-09-15";
// the next 15th and the next 1st of any lunar month from the ref (Nov 2026 is lunar month 10, Dec 2026 month 11)
const NEXT_15 = lunar(2026, 10, 15);
const NEXT_1 = lunar(2026, 11, 1);
const PHRASES: [string, string][] = [
  ["15 âm", NEXT_15], ["15 âm lịch", NEXT_15], ["ngày 15 âm lịch", NEXT_15], ["15 am lich", NEXT_15], ["rằm", NEXT_15],
  ["mùng 1 âm", NEXT_1], ["mùng 1 âm lịch", NEXT_1], ["mồng 1 âm", NEXT_1], ["1 âm lịch", NEXT_1],
  ["rằm tháng giêng", RAM_THANG_GIENG], ["rằm tháng 1", RAM_THANG_GIENG], ["15/1 âm lịch", RAM_THANG_GIENG], ["15 tháng 1 âm lịch", RAM_THANG_GIENG], ["15 âm lịch tháng giêng", RAM_THANG_GIENG],
  ["rằm tháng 8", MID_AUTUMN], ["15/8 âm", MID_AUTUMN], ["15 tháng 8 âm lịch", MID_AUTUMN],
  ["mùng 1 tháng 1 âm lịch", TET], ["1/1 âm lịch", TET],
];
const VERBS: [string, string][] = [["cúng", "Cúng"], ["cúng ông bà", "Cúng ông bà"], ["đi chùa", "Đi chùa"], ["thắp hương", "Thắp hương"], ["họp gia đình", "Họp gia đình"], ["dọn bàn thờ", "Dọn bàn thờ"]];
const ORDERS: ((v: string, p: string) => string)[] = [(v, p) => `${v} ${p}`, (v, p) => `${p} ${v}`];
const CLOCKS: [string, string][] = [["7h tối", "19:00"], ["15h", "15:00"], ["9 giờ sáng", "09:00"]];
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase().trim();

function run(said: string) { return read(said, { ref: REF, source: "typed" }).items.map(itemAction); }
const show = (items: ReturnType<typeof run>) => items.map((a) => `${a.title} when=${a.when} nb=${a.notBefore} na=${a.notAfter} fx=${a.fixed}`).join(" ; ");

it("lunar phrases x verbs: one item on the lunar day, flexible", () => {
  const bad: string[] = [];
  let n = 0;
  for (const [p, day] of PHRASES) for (const [v, title] of VERBS) for (const mk of ORDERS) {
    n++;
    const said = mk(v, p);
    const items = run(said);
    const a = items[0];
    if (items.length !== 1 || fold(a.title ?? "") !== fold(title) || a.fixed || a.when?.slice(0, 10) !== day || a.notAfter?.slice(0, 10) !== day) bad.push(`${said} | want ${title} ${day} | ${show(items)}`);
  }
  expect(n).toBe(PHRASES.length * VERBS.length * 2);
  expect(bad.slice(0, 15)).toEqual([]);
});

it("lunar phrases x clock: the clock is the clock, the lunar words are the day", () => {
  const bad: string[] = [];
  let n = 0;
  for (const [p, day] of PHRASES) for (const [c, hm] of CLOCKS) for (const [v, title] of VERBS.slice(0, 3)) for (const said of [`${v} ${p} ${c}`, `${c} ${p} ${v}`, `${p} ${c} ${v}`]) {
    n++;
    const items = run(said);
    const a = items[0];
    if (items.length !== 1 || fold(a.title ?? "") !== fold(title) || !a.fixed || a.when !== `${day}T${hm}:00`) bad.push(`${said} | want ${title} ${day}T${hm} | ${show(items)}`);
  }
  expect(n).toBe(PHRASES.length * CLOCKS.length * 3 * 3);
  expect(bad.slice(0, 15)).toEqual([]);
});

it("negatives: 15h, 15:00, 3 giờ chiều and 9 am stay clocks, on today", () => {
  const bad: string[] = [];
  const NEG: [string, string][] = [["15h", "15:00"], ["15:00", "15:00"], ["15 giờ", "15:00"], ["3h chiều", "15:00"], ["9 am", "09:00"], ["3 pm", "15:00"], ["9h sáng", "09:00"], ["10 am", "10:00"]];
  for (const [c, hm] of NEG) for (const [v, title] of VERBS.slice(0, 4)) for (const said of [`${v} ${c}`, `${c} ${v}`]) {
    const items = run(said);
    const a = items[0];
    if (items.length !== 1 || fold(a.title ?? "") !== fold(title) || !a.fixed || a.when !== `2026-11-14T${hm}:00`) bad.push(`${said} | want ${title} 2026-11-14T${hm} | ${show(items)}`);
  }
  expect(bad.slice(0, 15)).toEqual([]);
});
