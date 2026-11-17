// Spans said as a period of the year: "quý này", "quý sau", "năm nay", "tháng này", "kỳ này" and "học kỳ này". A submission
// with a span is due on the span's last day, in lead or trailing position. Answers are worked out here from Mon 16/11/2026.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

const REF = { y: 2026, m: 11, d: 16, h: 9, mi: 46 };
// phrase, last day of the span (23:59 of that day)
const SPANS: [string, string][] = [
  ["quý này", "2026-12-31"],
  ["quý sau", "2027-03-31"],
  ["năm nay", "2026-12-31"],
  ["trong năm nay", "2026-12-31"],
  ["hết năm", "2026-12-31"],
  ["tháng này", "2026-11-30"],
  ["học kỳ này", "2026-12-27"],
  ["kỳ này", "2026-12-27"],
  ["hk này", "2026-12-27"],
];
const TITLES = ["Nộp báo cáo", "Nộp bài tập", "Nộp slide thuyết trình"];
const MK: ((s: string, t: string) => string)[] = [(s, t) => `${s} ${t}`, (s, t) => `${t} ${s}`, (s, t) => `${t} ${s} cho cô`];

type Row = { said: string; want: string; got: string };
const misses: Row[] = [];
let total = 0;
it(`a span is the due day, lead or trailing (${SPANS.length * TITLES.length * MK.length} cases)`, () => {
  for (const [span, day] of SPANS) for (const title of TITLES) for (const mk of MK) {
    const said = mk(span, title.toLowerCase());
    total++;
    const items = read(said, { ref: REF, source: "typed" }).items.map(itemAction);
    const ok = items.length === 1 && items[0].deadline === `${day}T23:59:00` && items[0].fixed === undefined;
    if (!ok) misses.push({ said, want: `due ${day}T23:59`, got: items.map((a) => `${a.title}|${a.when ?? "-"}|${a.deadline ?? "-"}|${a.fixed ?? "-"}`).join(" ; ") || "(none)" });
  }
  if (misses.length) console.log(misses.slice(0, 15));
  expect(misses.length, `${misses.length}/${total} misses`).toBe(0);
});

// flexible plans with a span keep their start today and never a guessed clock (no said clock means no fixed block)
it("a flexible plan with a span has no fixed clock", () => {
  for (const [span] of SPANS) {
    for (const said of [`đọc sách ${span}`, `${span} đọc sách`]) {
      const a = read(said, { ref: REF, source: "typed" }).items.map(itemAction);
      expect(a.length, said).toBe(1);
      expect(a[0].fixed, said).toBeUndefined();
    }
  }
});
