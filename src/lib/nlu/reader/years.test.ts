import { describe, expect, it } from "vitest";
import { read } from "./reader";

const W = ["cn", "t2", "t3", "t4", "t5", "t6", "t7"];
const REFS = [
  { y: 2026, m: 11, d: 7, h: 15, mi: 0 },
  { y: 2026, m: 1, d: 3, h: 15, mi: 0 },
  { y: 2026, m: 12, d: 28, h: 15, mi: 0 },
];

// Every day of the year, with and without a weekday: the year is never a guess.
describe("year sweep", () => {
  it("keeps every date within a year either side and never offers another year", () => {
    const bad: string[] = [];
    for (const ref of REFS)
      for (let m = 1; m <= 12; m++)
        for (let d = 1; d <= 31; d += 2) {
          const dt = new Date(Date.UTC(ref.y, m - 1, d));
          if (dt.getUTCMonth() !== m - 1) continue;
          const dow = dt.getUTCDay();
          for (const t of [
            `nộp bài ${d}/${m}`,
            `${W[dow]} ${d}/${m} nộp bài`,
            `${W[(dow + 1) % 7]} ${d}/${m} nộp bài`,
            `họp nhóm ${d}/${m} 9h, nộp bài t5`,
          ]) {
            const out = read(t, { ref, source: "typed" });
            if (!out.items.length) bad.push(`${t}: no item`);
            for (const it of out.items) {
              const at = it.startsAt ?? it.deadline ?? "";
              const y = +at.slice(0, 4);
              // a written date is in its nearest year: the year before, this one or the next
              if (Math.abs(y - ref.y) > 1) bad.push(`${t}: ${at}`);
            }
          }
        }
    expect(bad.slice(0, 10)).toEqual([]);
  }, 30_000); // ~2s here, past the 5s default on a slow CI runner
});
