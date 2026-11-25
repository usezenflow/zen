import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { patchOf } from "./patch";

const now = new Date("2026-11-13T03:00:00Z"); // Fri 10:00, UTC+7
const task = { id: "gym", title: "Gym", start: Date.UTC(2026, 10, 13, 9), end: Date.UTC(2026, 10, 13, 10), createdAt: 0, source: "user" } as Task;
const series = { ...task, rrule: "FREQ=WEEKLY;BYDAY=MO" } as Task;

describe("patchOf", () => {
  it("sets a clock and a length on the task", () => {
    expect(patchOf("mai 3h chiều 90 phút", task, now).edit).toMatchObject({ op: "edit", target: "gym", when: "2026-11-14T15:00:00", effortMinutes: 90 });
  });
  it("sets a due day", () => {
    expect(patchOf("hạn thứ 6", task, now).edit).toMatchObject({ op: "edit", target: "gym", deadline: "2026-11-13T23:59:00" });
  });
  it("reshapes a repeat from its weekdays, with no due date", () => {
    const p = patchOf("mỗi T3 T5", series, now);
    expect(p.reshape).toMatchObject({ rrule: "FREQ=WEEKLY;BYDAY=TU,TH", from: now.getTime() });
    expect(p.edit?.deadline).toBeUndefined();
  });
  it("clears the repeat", () => {
    expect(patchOf("bỏ lặp", series, now)).toEqual({ clearRepeat: true });
  });
  it("asks for sittings", () => {
    expect(patchOf("chia 3 buổi", task, now)).toEqual({ splitCount: 3 });
  });
  it("reads the number said in words", () => {
    expect(patchOf("chia ba buổi", task, now)).toEqual({ splitCount: 3 });
  });
  it("sets a length alone", () => {
    expect(patchOf("90p", task, now).edit).toEqual({ op: "edit", target: "gym", effortMinutes: 90 });
  });
  it("patches nothing from a line with no date, length or repeat", () => {
    expect(patchOf("xyz", task, now).edit).toBeUndefined();
    expect(patchOf("xyz", task, now).reshape).toBeUndefined();
  });
});
