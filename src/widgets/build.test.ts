import { expect, it } from "vitest";
import type { Task } from "../lib/types";
import { instants, widgetData } from "./build";

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
  expect(w.exam).toMatchObject({ title: "Giải tích 2", big: "11 ngày", inline: "Thi Giải tích 2 còn 11 ngày" });
});

it("empties after the last item and schedules each boundary", () => {
  expect(widgetData(tasks, at(20), art).next).toBeUndefined();
  const ts = instants(tasks, at(14, 22));
  expect(ts).toContain(at(14, 30));
  expect(ts).toContain(at(0, 0, 17));
  expect(ts.every((t, i) => i === 0 || t > ts[i - 1])).toBe(true);
});
