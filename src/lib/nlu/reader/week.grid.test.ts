import { describe, expect, it } from "vitest";
import { read } from "./reader";

// "3 buổi trong tuần sau": that many sessions, all inside next week; never one task, never a weekly repeat without an end
const REFS = [15, 16, 18, 21].map((d) => ({ y: 2026, m: 11, d, h: 9, mi: 0 }));
const NEXT_MON: Record<number, number> = { 15: 16, 16: 23, 18: 23, 21: 23 };

describe("n sessions next week", () => {
  for (const ref of REFS)
    for (const n of [1, 2, 3, 4, 5])
      for (const unit of ["buổi", "lần"])
        for (const mid of [" trong ", " "])
          for (const week of ["tuần sau", "tuần tới"]) {
            const text = `đọc code zf ${n} ${unit}${mid}${week}`;
            it(`${ref.d}/11: ${text}`, () => {
              const r = read(text, { source: "typed", ref });
              expect(r.items).toHaveLength(1);
              const x = r.items[0];
              expect(x.title).toBe("Đọc code zf");
              expect(x.rrule).toMatch(new RegExp(`^FREQ=WEEKLY;BYDAY=[A-Z,]+;COUNT=${n}$`));
              expect(x.rrule!.split("BYDAY=")[1].split(";")[0].split(",")).toHaveLength(n);
              const mon = NEXT_MON[ref.d];
              expect(x.notBefore).toBe(`2026-11-${mon} 00:00`);
              expect(x.deadline).toBe(`2026-11-${mon + 6} 23:59`);
            });
          }

  it("a rate stays an open weekly repeat", () => {
    const r = read("đọc code zf 3 buổi một tuần", { source: "typed", ref: REFS[0] });
    expect(r.items[0].rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
  });
});

describe("spoken counts", () => {
  const ref = REFS[2];
  for (const [w, n] of [["một", 1], ["hai", 2], ["ba", 3], ["bốn", 4], ["năm", 5]] as const)
    for (const unit of ["buổi", "lần"]) {
      it(`${w} ${unit} trong tuần sau`, () => {
        const x = read(`đọc code zf ${w} ${unit} trong tuần sau`, { source: "typed", ref }).items[0];
        expect(x.title).toBe("Đọc code zf");
        expect(x.rrule).toMatch(new RegExp(`;COUNT=${n}$`));
      });
      it(`${w} ${unit} một tuần`, () => {
        const x = read(`đọc code zf ${w} ${unit} một tuần`, { source: "typed", ref }).items[0];
        expect(x.title).toBe("Đọc code zf");
        expect(x.rrule).toMatch(/^FREQ=WEEKLY;BYDAY=[A-Z,]+$/);
      });
    }
});

// "3 buổi trong tuần này": that many sessions in the days left, Sunday last; a day with several has them in different parts
describe("n sessions this week", () => {
  const DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  for (const d of [16, 17, 18, 19, 20, 21, 22])
    for (const h of [7, 10, 15, 19, 21, 23])
      for (const n of [1, 2, 3, 4, 5, 6, 7])
        for (const text of [`đọc code zf ${n} buổi trong tuần này`, `đọc code zf ${n} lần tuần này`]) {
          it(`${DOW[new Date(2026, 10, d).getDay()]} ${d}/11 ${h}h: ${text}`, () => {
            const ref = { y: 2026, m: 11, d, h, mi: 0 };
            const items = read(text, { source: "typed", ref }).items;
            const lastDay = d + ((7 - new Date(2026, 10, d).getDay()) % 7);
            const keys = new Set<string>();
            for (const x of items) {
              expect(x.title).toBe("Đọc code zf");
              expect(x.rrule).toBeUndefined();
              const day = +x.notBefore!.slice(8, 10);
              expect(day).toBeGreaterThanOrEqual(d);
              expect(day).toBeLessThanOrEqual(lastDay);
              expect(x.deadline).toBe(`${x.notBefore!.slice(0, 10)} 23:59`);
              const perDay = items.filter((y) => y.notBefore === x.notBefore);
              // one a day has no part; several each have their own
              if (perDay.length === 1) expect(x.windows).toBeUndefined();
              else expect(x.windows).toHaveLength(1);
              keys.add(`${day}|${x.windows?.[0]}`);
              // today never gets a part already over
              if (day === d && x.windows) expect({ MORNING: 11, AFTERNOON: 18, NIGHT: 22 }[x.windows[0] as string]! - 1).toBeGreaterThanOrEqual(h);
            }
            expect(keys.size).toBe(items.length);
            const days = lastDay - d + 1;
            const room = (days - 1) * 3 + [11, 18, 22].filter((e) => e - 1 >= h).length;
            const todayOpen = room > (days - 1) * 3;
            const daysOpen = days - (todayOpen ? 0 : 1);
            if (!room) expect(items).toHaveLength(1);
            else expect(items).toHaveLength(Math.min(n, room));
            // never two on one day while a day of the week is still free
            if (n <= daysOpen) expect(new Set(items.map((x) => x.notBefore)).size).toBe(n);
          });
        }

  it("Monday, 3 sessions: Mon, Wed, Fri", () => {
    const r = read("đọc code zf ba buổi trong tuần này", { source: "typed", ref: { y: 2026, m: 11, d: 16, h: 9, mi: 0 } });
    expect(r.items.map((x) => x.notBefore)).toEqual(["2026-11-16 00:00", "2026-11-18 00:00", "2026-11-20 00:00"]);
  });

  it("Saturday, 5 sessions: Sunday takes all three parts", () => {
    const r = read("đọc code zf 5 buổi trong tuần này", { source: "typed", ref: { y: 2026, m: 11, d: 21, h: 9, mi: 0 } });
    expect(r.items.map((x) => `${x.notBefore!.slice(8, 10)} ${x.windows?.join() ?? ""}`).sort()).toEqual(["21 MORNING", "21 NIGHT", "22 AFTERNOON", "22 MORNING", "22 NIGHT"]);
  });
});
