// Time fillers ("tí", "lát nữa", "chút về") and edge complements ("giúp", "nha", "nhé") leave the title of a task, and a name
// that happens to be "Tí" stays. A task's length does not change with its filler or complement: the answer is the same
// length as the bare activity. `pnpm vitest run fillers.grid` runs it.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

// Mon 16/11/2026 09:46
const REF = { y: 2026, m: 11, d: 16, h: 9, mi: 46 };
const acts = (said: string) => read(said, { ref: REF, source: "typed" }).items.map(itemAction);
const titleOf = (said: string) => acts(said)[0]?.title;
const cap = (s: string) => s[0].toLocaleUpperCase("vi") + s.slice(1);
/** A line with no clock keeps its typed case (a fallback task), so untimed titles compare without case. */
const same = (t: string | undefined, want: string) => (t ?? "").toLowerCase() === want.toLowerCase();

const FILLERS = ["tí", "tý", "lát", "chút", "xíu", "tẹo", "tí nữa", "lát nữa", "chút nữa", "xíu nữa", "tẹo nữa", "tí về", "lát về", "tí xong", "chút rảnh"];
const OBJS = ["cho gà ăn", "tưới cây", "đổ rác", "uống thuốc", "gọi mẹ", "nộp bài", "họp nhóm", "dọn phòng", "giặt đồ", "tập gym"];
// "nha" is left out: unaccented it is also "nhà" (the house), see assemble.ts edgesOf
const COMPLEMENTS = ["giúp", "giùm", "dùm", "hộ", "với", "cái", "coi", "đi", "nhé", "nhen", "nghen", "nhé1", "giúp mình"];

it("a time filler before a verb leaves the title; with a clock it is the nearest future clock", () => {
  const miss: string[] = [];
  let n = 0;
  for (const f of FILLERS) for (const o of OBJS) {
    // the filler leads; one at the end is not a lead and is not tested here
    for (const said of [`${f} ${o}`, `${f} ${o} lúc 8h30`]) {
      n++;
      const t = titleOf(said);
      if (!same(t, o)) miss.push(`"${said}" -> "${t}" want "${cap(o)}"`);
    }
    const timed = acts(`${f} ${o} lúc 8h30`).filter((a) => a.when);
    n++;
    if (timed.length && !timed.every((a) => a.when?.endsWith("T20:30:00") || a.when?.endsWith("T08:30:00"))) miss.push(`clock "${f} ${o} lúc 8h30" -> ${timed.map((a) => a.when).join(",")}`);
  }
  expect(miss.slice(0, 30)).toEqual([]);
  expect(n).toBeGreaterThan(FILLERS.length * OBJS.length * 2);
});

it("an edge complement leaves the title", () => {
  const miss: string[] = [];
  for (const o of OBJS) for (const c of COMPLEMENTS) {
    const said = `${o} ${c}`;
    const t = titleOf(said);
    if (!same(t, o)) miss.push(`"${said}" -> "${t}"`);
  }
  expect(miss.slice(0, 30)).toEqual([]);
});

it("a name Tí is a name: a verb after it is not a filler", () => {
  expect(titleOf("gặp Tí chiều mai")).toBe("Gặp Tí");
  expect(titleOf("sinh nhật Tí tối nay")).toBe("Sinh nhật Tí");
  expect(titleOf("mua quà cho Tí")).toBe("Mua quà cho Tí");
  expect(titleOf("gọi Tí")).toBe("Gọi Tí");
  expect(titleOf("lát bánh mì")?.toLowerCase()).toBe("lát bánh mì");
});

it("the length of a task is the length of its bare activity, with or without a filler or a complement", () => {
  const ACT = ["giặt đồ", "dọn nhà", "đọc sách", "tập gym", "họp nhóm", "gọi điện", "viết báo cáo", "học tiếng Anh"];
  const miss: string[] = [];
  for (const a of ACT) {
    const base = acts(a)[0]?.effortMinutes;
    for (const f of ["tí", "lát nữa", "chút", "tẹo nữa"]) {
      const m = acts(`${f} ${a}`)[0]?.effortMinutes;
      if (m !== base) miss.push(`${f} ${a}: ${m} vs ${base}`);
    }
    for (const c of ["giúp", "nhé", "giúp mình"]) {
      const m = acts(`${a} ${c}`)[0]?.effortMinutes;
      if (m !== base) miss.push(`${a} ${c}: ${m} vs ${base}`);
    }
  }
  expect(miss).toEqual([]);
});
