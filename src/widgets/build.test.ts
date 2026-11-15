import { expect, it } from "vitest";
import type { Task } from "../lib/types";
import { abbr, instants, widgetData } from "./build";

const at = (h: number, m = 0, d = 16) => new Date(2026, 10, d, h, m).getTime();
const task = (id: string, title: string, s: number, e: number, x: Partial<Task> = {}): Task =>
  ({ id, title, kind: "study", source: "user", effort: (e - s) / 60000, start: s, end: e, createdAt: 0, ...x });
const art = Object.fromEntries(["plan", "lecture", "exam", "assignment", "busy"].map((k) => [k, { square: k, wide: k }])) as never;
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
  expect(w.next).toMatchObject({ id: "a", big: "5 phút", small: "đến 14:30", mins: "5′", fill: 0.5 });
  expect(w.rows.map((r) => [r.id, r.check, r.done])).toEqual([["b", true, true], ["c", false, false]]);
  expect(w.summary).toBe("2 việc, 1 tiết học");
  expect(w.doneLabel).toBe("Xong (1)");
  expect(w.tomorrow).toBe("Mai: Cấu trúc dữ liệu 07:00");
  expect(widgetData(tasks, at(10, 0, 24), art).tomorrow).toBe("T6: Thi Giải tích 2 08:00");
  expect(widgetData(tasks, at(10, 0, 21), art).tomorrow).toBe("T6 27/11: Thi Giải tích 2 08:00");
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
  expect(w.next).toMatchObject({ id: "a", big: "10 phút", small: "đến 14:20", mins: "10′", rect: "14:20, còn 10 phút", left: "còn 10 phút" });
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
  expect([free.doneCount, free.dayName, free.aheadHead]).toEqual(["", "Thứ năm 19", "T6 27/11"]);
  // Nothing ahead at all: no head, the widget shows the try-saying prompt instead.
  expect(widgetData(tasks, at(10, 0, 28), art).aheadHead).toBe("");
  expect(widgetData(tasks, at(10, 0, 24), art).aheadHead).toBe("Thứ sáu");
  expect(free.exam).toMatchObject({ n: "8", unit: "ngày nữa" });
  expect(widgetData(tasks, at(7, 0, 27), art).exam).toMatchObject({ n: "08:00", unit: "hôm nay" });
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
