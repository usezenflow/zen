// Generated place codes after a motion or assembly verb ("lên TV2", "tập trung ở B1"), with the answers worked out here.
// A clock, a weekday or an English term after the verb is never a place. `pnpm vitest run place.grid` reads a spread.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

// Mon 16/11/2026 09:46
const REF = { y: 2026, m: 11, d: 16, h: 9, mi: 46 };
const run = (said: string, source: "typed" | "voice" = "typed") => read(said, { ref: REF, source }).items.map(itemAction);

const VERBS = ["lên", "xuống", "qua", "sang", "ra", "vào", "tới", "đến", "về", "tập trung ở", "tập trung tại", "có mặt ở", "có mặt tại"];
/** Codes as typed; the place reads them uppercased, the dot kept. */
const CODES: [string, string][] = [["tv2", "TV2"], ["b1", "B1"], ["c3.2", "C3.2"], ["a101", "A101"], ["h2", "H2"], ["d4b", "D4B"], ["TV2", "TV2"]];
const LINES = (verb: string, code: string) => [
  `họp nhóm ${verb} ${code} chiều mai 16:00 sửa báo cáo`,
  `sửa báo cáo ${verb} ${code} chiều mai 16:00`,
  `họp nhóm ${verb} ${code} lúc 16:00 mai`,
  `@All chiều mai 16:00 các nhóm ${verb} ${code} để c sửa báo cáo toàn văn nhé1`,
];

it("a motion verb and a code is the place, uppercased, in any line order", () => {
  let n = 0;
  for (const verb of VERBS) for (const [code, shown] of CODES) for (const line of LINES(verb, code)) {
    n++;
    const items = run(line);
    // the fixed item carries the place; a duplicate deadline item of the same line is not a place holder
    const fixed = items.filter((a) => a.fixed);
    expect(fixed.length, line).toBeGreaterThan(0);
    for (const a of fixed) expect(a.location, line).toBe(shown);
  }
  expect(n).toBe(VERBS.length * CODES.length * 4);
});

it("a clock, a weekday or a word that is no place after the verb is never a place", () => {
  // every clock is still a clock; "lên kế hoạch" is a plan, no code
  const NOT = ["16h", "8h30", "9g", "9h", "8:30", "16 giờ", "t3", "t2", "thứ 3", "ux2", "ai2", "pr1", "os2", "kế hoạch", "nhà", "trường"];
  let n = 0;
  for (const verb of VERBS) for (const w of NOT) {
    n++;
    const items = run(`họp nhóm ${verb} ${w}`);
    for (const a of items) expect(a.location, `${verb} ${w}`).toBeUndefined();
  }
  expect(n).toBe(VERBS.length * NOT.length);
});

it("the target line: the mentions drop out and the title keeps only the work", () => {
  const items = run("@All chiều mai 16:00 (17/11) các nhóm lên TV2 để c sửa báo cáo toàn văn nhé1");
  expect(items.length).toBeGreaterThan(0);
  for (const a of items) expect(a.title).toBe("Sửa báo cáo toàn văn");
  const first = items.find((a) => a.fixed);
  expect(first?.location).toBe("TV2");
  expect(first?.when).toBe("2026-11-17T16:00:00");
});

it("the lead 'để c/cô/chị/thầy' and the @mentions drop from the title of any motion line", () => {
  for (const verb of VERBS) for (const who of ["c", "cô", "chị", "thầy"]) {
    const items = run(`@All các nhóm ${verb} TV2 để ${who} sửa báo cáo nhé1 chiều mai 16:00`);
    expect(items.length, `${verb} ${who}`).toBeGreaterThan(0);
    for (const a of items) expect(a.title, `${verb} ${who}`).toBe("Sửa báo cáo");
  }
});
