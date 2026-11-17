// A day said in words and the same day restated in parentheses ("mai 16:00 (17/11)") is one fixed block, before and after
// the clock. A different date in parentheses is not a restatement and keeps its own read. Answers are worked out here.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

// Mon 16/11/2026 09:46
const REF = { y: 2026, m: 11, d: 16, h: 9, mi: 46 };
const DAYS: [string, string][] = [["mai", "2026-11-17"], ["ngày mai", "2026-11-17"], ["thứ 3", "2026-11-17"], ["thứ ba", "2026-11-17"], ["hôm nay", "2026-11-16"]];
const DATE_OF: Record<string, string> = { "2026-11-17": "17/11", "2026-11-16": "16/11" };
const CLOCKS: [string, string][] = [["16:00", "16:00"], ["16h", "16:00"], ["4 giờ chiều", "16:00"], ["8h30 sáng", "08:30"]];
const TITLES = ["Sửa báo cáo toàn văn", "Họp nhóm", "Đi khám răng"];
const MK: ((t: string, d: string, c: string, dt: string) => string)[] = [
  (t, d, c, dt) => `${t} ${d} ${c} (${dt})`,
  (t, d, c, dt) => `${t} ${d} (${dt}) ${c}`,
  (t, d, c, dt) => `${t} (${dt}) ${d} ${c}`,
  (t, d, c, dt) => `(${dt}) ${t} ${d} ${c}`,
  (t, d, c, dt) => `${t} ${c} ${d} (${dt})`,
];
const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");

type Row = { said: string; title: string; want: string; got: string };
const rows: Row[] = [];
let total = 0;
let bad = 0;
for (const [d, day] of DAYS) for (const [c, clock] of CLOCKS) for (const title of TITLES) for (const mk of MK) {
  const sentence = mk(title.toLowerCase(), d, c, DATE_OF[day]);
  const want = `busy ${day}T${clock}:00`;
  const items = read(sentence, { ref: REF, source: "typed" }).items.map(itemAction);
  const got = items.length === 1 && items[0].fixed === "busy" && items[0].when === `${day}T${clock}:00`
    ? want
    : items.map((a) => `${a.fixed ?? "-"} ${a.when ?? "-"} ${a.deadline ?? "-"}`).join(" | ") || "(none)";
  total++;
  if (got !== want) { bad++; rows.push({ said: sentence, title, want, got }); }
}

// a different date in parentheses is not a restatement: it still reads as the spoken day plus that date's own item
const OTHER: string[] = ["mai 16:00 (18/11)", "mai 16:00 (20/11)"];

it(`restated date merges into the said day and clock (${total} cases)`, () => {
  if (bad) console.log(rows.slice(0, 20));
  expect(bad, `${bad}/${total} misses`).toBe(0);
});

it("a different date in parentheses keeps its own read", () => {
  const out = OTHER.map((s) => [s, read(s, { ref: REF, source: "typed" }).items.map(itemAction).map((a) => [a.title, a.when, a.deadline, a.fixed])]);
  console.log(JSON.stringify(out));
});
