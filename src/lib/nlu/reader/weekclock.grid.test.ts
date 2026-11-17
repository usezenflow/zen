// A clock said with a week or month word and no weekday is ONE item, fixed at that clock, on the first day of the span:
// the Monday of "tuần sau"/"tuần tới", the 1st of "tháng sau", today for "tuần này" (every clock below is still ahead on the ref day).
// A said weekday wins. Answers are worked out here, not by the reader. Ref: Sat 14/11/2026 06:00.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };
const SPANS: [string, string][] = [["tuần sau", "2026-11-16"], ["tuần tới", "2026-11-16"], ["tuần sau nữa", "2026-11-23"], ["tháng sau", "2026-12-01"], ["tuần này", "2026-11-14"]];
const WEEKDAYS: [string, string][] = [["thứ 3 tuần sau", "2026-11-17"], ["thứ 6 tuần tới", "2026-11-20"], ["chủ nhật tuần sau", "2026-11-22"], ["thứ hai tuần sau nữa", "2026-11-23"]];
const CLOCKS: [string, string][] = [["9h", "09:00"], ["lúc 9h", "09:00"], ["9 giờ", "09:00"], ["14h30", "14:30"], ["8h sáng", "08:00"], ["3h chiều", "15:00"], ["lúc 3 giờ chiều", "15:00"]];
const TITLES: [string, string, "fixed" | "due"][] = [["họp nhóm", "Họp nhóm", "fixed"], ["nộp báo cáo", "Nộp báo cáo", "due"], ["gặp thầy", "Gặp thầy", "fixed"], ["gym", "Gym", "fixed"]];
const ORDERS: ((t: string, d: string, c: string) => string)[] = [(t, d, c) => `${t} ${d} ${c}`, (t, d, c) => `${t} ${c} ${d}`, (t, d, c) => `${c} ${d} ${t}`, (t, d, c) => `${d} ${c} ${t}`];
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase().trim();

function cases(): { said: string; title: string; kind: "fixed" | "due"; at: string }[] {
  const out = [];
  for (const [d, day] of [...SPANS, ...WEEKDAYS]) for (const [c, clock] of CLOCKS) for (const mk of ORDERS) for (const [t, title, kind] of TITLES)
    out.push({ said: mk(t, d, c), title, kind, at: `${day}T${clock}:00` });
  return out;
}

it("a clock with a week or month word and no weekday is one fixed item on the span's first day", () => {
  const all = cases();
  const bad: string[] = [];
  for (const c of all) {
    const items = read(c.said, { ref: REF, source: "typed" }).items.map(itemAction);
    const hit = items.filter((a) => fold(a.title ?? "") === fold(c.title));
    const ok = items.length === 1 && hit.length === 1 && (c.kind === "fixed" ? !!hit[0].fixed && hit[0].when === c.at : !hit[0].fixed && hit[0].deadline === c.at);
    if (!ok) bad.push(`${c.said} | want ${c.kind} ${c.at} | ${items.map((a) => `${a.title} when=${a.when} dl=${a.deadline} fx=${a.fixed}`).join(" ; ")}`);
  }
  expect(all.length).toBe(9 * 7 * 4 * 4);
  expect(bad.slice(0, 15)).toEqual([]);
});
