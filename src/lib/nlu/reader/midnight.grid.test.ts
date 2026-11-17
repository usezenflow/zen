// Two basics: a clock range whose end is before its start runs past midnight;
// a repeat with no said clock is flexible, with a clock fixed. Answers are worked out here. Ref: Sat 14/11/2026 06:00.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase().trim();
const run = (said: string, source: "typed" | "voice" | "paste" | "ocr") => read(said, { ref: REF, source }).items.map(itemAction);
const show = (items: ReturnType<typeof run>) => items.map((a) => `${a.title} when=${a.when} dl=${a.deadline} nb=${a.notBefore} na=${a.notAfter} fx=${a.fixed} eff=${a.effortMinutes} rp=${a.repeat}`).join(" ; ");

it("(b) a clock range ending before its start runs past midnight", () => {
  const STARTS: [string, number][] = [["21h", 21 * 60], ["22h", 22 * 60], ["23h30", 23 * 60 + 30]];
  const ENDS: [string, number][] = [["1h sáng", 60], ["2h", 120], ["0h30", 30], ["nửa đêm", 0]];
  const CONNS = ["đến", "tới", "-", "~"];
  const TITLES: [string, string][] = [["họp nhóm", "Họp nhóm"], ["dọn kho", "Dọn kho"]];
  const bad: string[] = [];
  let n = 0;
  for (const [s, sm] of STARTS) for (const [e, em] of ENDS) for (const c of CONNS) for (const [t, title] of TITLES) for (const mk of [(r: string) => `${t} ${r}`, (r: string) => `${r} ${t}`, (r: string) => `${t} tối nay ${r}`]) {
    n++;
    const said = mk(`${s} ${c} ${e}`);
    const items = run(said, "typed");
    const a = items[0];
    const mins = (em + 1440 - sm) % 1440 || 1440;
    const hh = String(Math.floor(sm / 60)).padStart(2, "0");
    const mm = String(sm % 60).padStart(2, "0");
    if (items.length !== 1 || fold(a.title ?? "") !== fold(title) || !a.fixed || a.when !== `2026-11-14T${hh}:${mm}:00` || a.effortMinutes !== mins) bad.push(`${said} | want ${title} 14/11 ${hh}:${mm} ${mins}p | ${show(items)}`);
  }
  expect(n).toBe(3 * 4 * 4 * 2 * 3);
  expect(bad.slice(0, 15)).toEqual([]);
});

it("(c) a repeat with no said clock is flexible, with a clock fixed", () => {
  const REPEATS = ["mỗi ngày", "hàng ngày", "hằng ngày", "mỗi tuần", "hàng tuần", "mỗi sáng", "mỗi tối", "mỗi thứ 2", "thứ 2 hàng tuần", "mỗi tháng", "ngày nào cũng"];
  const TITLES = ["đọc sách", "chạy bộ", "tập yoga", "học tiếng Anh", "uống thuốc", "gym", "thiền", "viết nhật ký", "họp nhóm", "tưới cây"];
  const bad: string[] = [];
  let n = 0;
  for (const r of REPEATS) for (const t of TITLES) for (const src of ["typed", "voice"] as const) for (const mk of [(x: string) => `${t} ${r}`, (x: string) => `${r} ${t}`]) {
    n++;
    const said = mk(r);
    const items = run(said, src);
    if (items.length !== 1 || items[0].fixed || !items[0].repeat) bad.push(`${said} (${src}) | want flexible repeat | ${show(items)}`);
    n++;
    const withClock = `${t} ${r} ${r === "mỗi tối" ? "7h tối" : "7h"}`;
    const w = run(withClock, src);
    if (w.length !== 1 || !w[0].fixed || !w[0].repeat || !w[0].when?.endsWith(r === "mỗi tối" ? "T19:00:00" : "T07:00:00")) bad.push(`${withClock} (${src}) | want fixed repeat at 7 | ${show(w)}`);
  }
  expect(n).toBe(11 * 10 * 2 * 2 * 2);
  expect(bad.slice(0, 15)).toEqual([]);
});
