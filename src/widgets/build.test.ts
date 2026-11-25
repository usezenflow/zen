import { expect, it } from "vitest";
import type { Task } from "../lib/types";
import { USES, abbr, instants, slim, widgetData } from "./build";

const at = (h: number, m = 0, d = 16) => new Date(2026, 10, d, h, m).getTime();
const task = (id: string, title: string, s: number, e: number, x: Partial<Task> = {}): Task =>
  ({ id, title, kind: "study", source: "user", effort: (e - s) / 60000, start: s, end: e, createdAt: 0, ...x });
const art = "file:///w/";
const tasks = [
  task("a", "Ôn Giải tích", at(14, 20), at(14, 30)),
  task("b", "Báo cáo nhóm", at(16), at(17), { deadline: at(23, 59) }),
  task("c", "Cơ sở dữ liệu", at(17, 30), at(19), { fixed: "lecture" }),
  task("d", "Xong rồi", at(9), at(10), { doneAt: at(10) }),
  task("e", "Cấu trúc dữ liệu", at(7, 0, 17), at(9, 30, 17), { fixed: "lecture" }),
  task("x", "Thi Giải tích 2", at(8, 0, 27), at(10, 0, 27), { fixed: "exam" }),
];

it("builds the mockup's day", () => {
  const w = widgetData(tasks, at(14, 25), art, ["b"]);
  expect(w.next).toMatchObject({ id: "a", big: "5p", small: "đến 14:30", mins: "5′", fill: 0.5 }); // the running block: the card is the one on now
  expect(w.rows.map((r) => [r.id, r.check, r.done])).toEqual([["b", true, true], ["c", false, false]]); // rows are the day less the next card
  expect(w.summary).toBe("2 việc, 1 tiết học");
  expect(w.doneLabel).toBe("Xong (1)");
  expect(w.tomorrow).toBe("Mai: Cấu trúc dữ liệu 7:00");
  expect(widgetData(tasks, at(10, 0, 24), art).tomorrow).toBe("T6: Thi Giải tích 2 8:00");
  expect(widgetData(tasks, at(10, 0, 21), art).tomorrow).toBe("T6 27/11: Thi Giải tích 2 8:00");
  expect(w.exam).toMatchObject({ title: "Giải tích 2", big: "11 ngày", inline: "Thi GT2 còn 11 ngày", fill: 1 - 11 / 28 });
  expect(w.count).toBe("2 việc");
});

it("empties after the last item and schedules each boundary", () => {
  expect(widgetData(tasks, at(20), art).next).toBeUndefined();
  const ts = instants(tasks, at(14, 22));
  expect(ts).toContain(at(14, 30));
  expect(ts).toContain(at(0, 0, 17));
  expect(ts.every((t, i) => i === 0 || t > ts[i - 1])).toBe(true);
});

it("counts down to an upcoming start, as the mockup at 14:20", () => {
  const w = widgetData(tasks, at(14, 10), art);
  expect(w.next).toMatchObject({ id: "a", big: "10p", small: "đến 14:20", mins: "10′", rect: "14:20, còn 10p", left: "còn 10p" }); // the earliest upcoming today by start
  expect(w.next!.fill).toBeCloseTo(1 / 3);
  expect(widgetData(tasks, at(12), art).next!.fill).toBe(1);
});

it("shortens course names like students do", () => {
  expect(abbr("Giải tích 2")).toBe("GT2");
  expect(abbr("Cơ sở dữ liệu")).toBe("CSDL");
  expect(abbr("Triết")).toBe("Triết");
});

it("turns an empty today to the next day with anything", () => {
  const done = widgetData(tasks, at(20), art);
  expect(done.rows).toEqual([]);
  expect(done.doneCount).toBe("1 việc xong");
  expect([done.aheadHead, done.aheadCount, done.ahead.map((r) => r.id)]).toEqual(["Mai", "1 tiết học", ["e"]]);
  // A free Thursday: no done count; the 27th's exam is 8 days out, past the week, so the head carries its date.
  const free = widgetData(tasks, at(10, 0, 19), art);
  expect([free.doneCount, free.dayName, free.aheadHead]).toEqual(["", "T5 19", "T6 27/11"]);
  // Nothing ahead at all: no head, the widget shows the try-saying prompt instead.
  expect(widgetData(tasks, at(10, 0, 28), art).aheadHead).toBe("");
  expect(widgetData(tasks, at(10, 0, 24), art).aheadHead).toBe("T6");
  expect(free.exam).toMatchObject({ n: "8", unit: "ngày nữa" });
  expect(widgetData(tasks, at(7, 0, 27), art).exam).toMatchObject({ n: "8:00", unit: "hôm nay" });
});

it("the timeline runs through the end of tomorrow, so it never freezes on yesterday", () => {
  const ts = instants(tasks, at(20));
  expect(ts[ts.length - 1]).toBe(at(0, 0, 18));
  expect(ts).toContain(at(7, 0, 17)); // tomorrow's lecture start
  expect(ts.length).toBeLessThan(250);
  expect(widgetData(tasks, at(7, 30, 17), art).next?.id).toBe("e");
});

it("keeps the medium head to one figure however packed the day", () => {
  // 12 tasks and 4 classes on the 18th: never "12 việc, 4 tiết học", which overflows the ~21-character head.
  const packed = [
    ...Array.from({ length: 12 }, (_, i) => task(`p${i}`, `Việc ${i}`, at(6 + i, 0, 18), at(6 + i, 30, 18))),
    ...Array.from({ length: 4 }, (_, i) => task(`l${i}`, `Môn ${i}`, at(7 + i, 30, 18), at(8 + i, 0, 18), { fixed: "lecture" })),
  ];
  const w = widgetData(packed, at(20, 0, 17), art);
  expect([w.aheadHead, w.aheadCount]).toEqual(["Mai", "12 việc"]);
  expect(w.ahead).toHaveLength(3);
  expect((w.aheadHead + w.aheadCount).length).toBeLessThanOrEqual(21);
  // A classes-only day reads in classes, not "0 việc".
  expect(widgetData(packed.filter((x) => x.fixed), at(7, 0, 18), art).count).toBe("4 tiết học");
});

it("tops the medium list up with next-up from later days, the day in the time column", () => {
  // 14:25 on the 16th: one row left today (c; b is ticked but still listed), then tomorrow's class and the 27th's exam.
  const w = widgetData(tasks, at(14, 25), art);
  expect(w.more.map((r) => [r.id, r.time])).toEqual([["e", "Mai 7:00"]]); // b and c fill two of the three rows
  // Tomorrow showing on the right: next-up starts after it, this week's day short ("T6 08:00").
  const fri = widgetData([...tasks, task("f", "Họp nhóm", at(8, 0, 20), at(9, 0, 20))], at(20), art);
  expect(fri.more.map((r) => [r.id, r.time])).toEqual([["f", "T6 8:00"], ["x", "27/11"]]);
});

it("gives each iOS widget only its fields, an entry only where they change", () => {
  const tl = instants(tasks, at(14, 22)).map((t) => ({ date: new Date(t), props: widgetData(tasks, t, art) }));
  expect(slim(tl, USES.ZenTalk)).toHaveLength(1);
  expect(slim(tl, USES.ZenScan)).toHaveLength(1);
  const next = slim(tl, USES.ZenNext);
  expect(Object.keys(next[0].props).sort()).toEqual([...USES.ZenNext].sort());
  // every change survives: each kept entry differs from the one before, and the countdown at 14:25 is still there
  expect(next.every((e, i) => i === 0 || JSON.stringify(e.props) !== JSON.stringify(next[i - 1].props))).toBe(true);
  expect(next.some((e) => e.date.getTime() === at(14, 25))).toBe(true);
  expect(slim(tl, USES.ZenToday).length).toBeLessThanOrEqual(tl.length);
});

it("a day of daily series sends three rows, today's first then next-up, and stays small", () => {
  const many: Task[] = [];
  for (let s = 0; s < 8; s++) for (let d = 0; d < 60; d++) many.push(task(`s${s}d${d}`, `Đọc sách ${s}`, at(7 + 2 * s, 0, 16 + d), at(7 + 2 * s, 30, 16 + d)));
  const w = widgetData(many, at(8, 3), art);
  expect([w.rows.length, w.ahead.length, w.more.length]).toEqual([3, 0, 0]);
  const late = widgetData(many, at(20, 40), art); // 21:00 is next, 21:00 is the last today: no rows, tomorrow's three
  expect([late.rows.length, late.ahead.length, late.more.length]).toEqual([0, 3, 0]);
  const tl = instants(many, at(8, 3)).map((t) => ({ date: new Date(t), props: widgetData(many, t, art) }));
  expect(JSON.stringify(slim(tl, USES.ZenToday)).length).toBeLessThan(250_000);
});

it("every widgets.html state still fills three slots (rows, then next-up, then the layout's try-saying lines)", () => {
  const slots = (w: ReturnType<typeof widgetData>) => [...(w.rows.length ? w.rows : w.ahead), ...w.more].slice(0, 3).map((r) => r.id);
  const lab = (d: number) => task("lab", "Nộp Lab 3", at(22, 0, d), at(22, 30, d));
  const t1 = task("t1", "Ôn Giải tích", at(15, 0, 17), at(16, 0, 17));
  const cs = task("cs", "Cấu trúc dữ liệu", at(7, 0, 17), at(9, 0, 17), { fixed: "lecture" });
  const now = at(14, 20), a = task("a", "Ôn Giải tích", at(14, 30), at(15));
  // Today, a few left: one row today, the two free slots take later days.
  expect(slots(widgetData([a, task("b", "Báo cáo nhóm", at(16), at(17)), cs, lab(18)], now, art))).toEqual(["b", "cs", "lab"]);
  // Today, last one: next keeps the left, tomorrow's three fill the right.
  expect(slots(widgetData([a, cs, t1, lab(17), lab(19)], now, art))).toEqual(["cs", "t1", "lab"]);
  // Little ahead: tomorrow has one, nothing after: one row, the layout adds two try lines.
  expect(slots(widgetData([a, t1], now, art))).toEqual(["t1"]);
  // Today, free / all done: nothing left today, tomorrow on the right.
  expect(slots(widgetData([cs, t1], now, art))).toEqual(["cs", "t1"]);
  // Nothing ahead at all: no rows, the layout shows its three try lines.
  expect(slots(widgetData([], now, art))).toEqual([]);
});
