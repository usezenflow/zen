// A doubled vowel inside a time or cue word of a time-like line is a slip of the word ("tuần saau" is "tuần sau", "maai" is "mai"),
// not Telex for a rarer word ("sâu"). Answers are worked out here. Ref: Sat 14/11/2026 06:00.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };
const DAYS: [string, string][] = [
  ["tuần saau", "2026-11-16"], ["tuaan sau", "2026-11-16"], ["tuaan saau", "2026-11-16"], ["tuần sau", "2026-11-16"],
  ["tháng saau", "2026-12-01"], ["thaang sau", "2026-12-01"], ["thaang saau", "2026-12-01"],
  ["maai", "2026-11-15"], ["ngày maai", "2026-11-15"], ["hôm naay", "2026-11-14"], ["thứ 3 tuần saau", "2026-11-17"], ["thứ 3 tuaan sau", "2026-11-17"], ["thứ 6 tuần saau", "2026-11-20"],
];
const CLOCKS: [string, string][] = [["9h", "09:00"], ["lúc 9h", "09:00"], ["14h30", "14:30"], ["8h sáng", "08:00"], ["3h chiều", "15:00"]];
const TITLES: [string, string][] = [["họp nhóm", "Họp nhóm"], ["gặp thầy", "Gặp thầy"], ["đi khám răng", "Đi khám răng"]];
const ORDERS: ((t: string, d: string, c: string) => string)[] = [(t, d, c) => `${t} ${d} ${c}`, (t, d, c) => `${t} ${c} ${d}`, (t, d, c) => `${c} ${d} ${t}`, (t, d, c) => `${d} ${c} ${t}`];
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase().trim();

it("a doubled vowel in a time word with a clock reads as the word", () => {
  const bad: string[] = [];
  let n = 0;
  for (const [d, day] of DAYS) for (const [c, hm] of CLOCKS) for (const mk of ORDERS) for (const [t, title] of TITLES) {
    n++;
    const said = mk(t, d, c);
    const items = read(said, { ref: REF, source: "typed" }).items.map(itemAction);
    const a = items[0];
    if (items.length !== 1 || fold(a.title ?? "") !== fold(title) || !a.fixed || a.when !== `${day}T${hm}:00`) bad.push(`${said} | want ${title} ${day}T${hm} | ${items.map((x) => `${x.title} when=${x.when} dl=${x.deadline} nb=${x.notBefore} fx=${x.fixed}`).join(" ; ")}`);
  }
  expect(n).toBe(DAYS.length * CLOCKS.length * 4 * TITLES.length);
  if (process.env.GRID_OUT) { const seen = new Set<string>(); require("node:fs").writeFileSync(process.env.GRID_OUT, bad.filter((b) => { const k = b.split(" | ")[0].replace(/họp nhóm|gặp thầy|đi khám răng|\d+h\d*|lúc|sáng|chiều/g, "").trim(); if (seen.has(k)) return false; seen.add(k); return true; }).join("\n")); }
  expect(bad.slice(0, 15)).toEqual([]);
});

it("without a time cue a doubled vowel stays Telex: 'saau' is 'sâu'", () => {
  for (const said of ["cái hố saau", "đào hố saau", "biển saau"]) {
    const a = read(said, { ref: REF, source: "typed" }).items.map(itemAction)[0];
    expect((a.title ?? "").toLowerCase()).toContain("sâu");
    expect(a.when ?? a.deadline ?? a.notBefore).toBeUndefined();
  }
});
