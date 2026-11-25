import { describe, expect, it } from "vitest";
import { DEFAULT_AREAS, areaOf, areaShare, underServed } from "./area";
import type { Task } from "./types";

const MIN = 60_000;
const now = new Date(2026, 10, 25, 12, 0).getTime();
const T = (over: Partial<Task>): Task => ({ id: "x", title: "Việc", kind: "study", source: "user", effort: 60, createdAt: 0, ...over });
// A task worked and ticked `ago` minutes before now, lasting an hour.
const worked = (id: string, title: string, kind: Task["kind"], ago: number): Task => {
  const doneAt = now - ago * MIN;
  return T({ id, title, kind, start: doneAt - 60 * MIN, end: doneAt, doneAt });
};

describe("areaOf", () => {
  it("matches a folded keyword in the title", () => {
    expect(areaOf(T({ title: "Ôn thi giữa kỳ", kind: "self" }), DEFAULT_AREAS)?.id).toBe("study");
  });

  it("matches a keyword in the course too", () => {
    expect(areaOf(T({ title: "Nộp file", course: "Báo cáo tài chính", kind: "self" }), DEFAULT_AREAS)?.id).toBe("work");
  });

  it("falls back to the task kind when no keyword matches", () => {
    expect(areaOf(T({ title: "Abc", kind: "exercise" }), DEFAULT_AREAS)?.id).toBe("health");
    expect(areaOf(T({ title: "Abc", kind: "finance" }), DEFAULT_AREAS)?.id).toBe("work");
  });

  it("is undefined when neither keyword nor kind maps", () => {
    expect(areaOf(T({ title: "Abc", kind: "errand" }), [DEFAULT_AREAS[0]])).toBeUndefined();
  });
});

describe("areaShare and underServed", () => {
  it("shares sum to 1 over the worked areas", () => {
    const tasks = [worked("a", "Ôn thi", "study", 60), worked("b", "Chạy bộ", "exercise", 120)];
    const share = areaShare(tasks, DEFAULT_AREAS, now);
    expect(share.study).toBeCloseTo(0.5);
    expect(share.health).toBeCloseTo(0.5);
  });

  it("ranks the neglected area highest", () => {
    const tasks = [
      worked("1", "Ôn thi", "study", 60), worked("2", "Ôn thi", "study", 180), worked("3", "Ôn thi", "study", 300),
      worked("4", "Báo cáo", "work", 400), worked("5", "Báo cáo", "work", 500),
      worked("6", "Gặp bạn", "social", 600), worked("7", "Giặt đồ", "chores", 700), worked("8", "Đọc sách", "self", 800),
    ];
    const d = underServed(tasks, DEFAULT_AREAS, now);
    expect(d.health).toBe(1);
    for (const id of ["study", "work", "people", "home", "self"]) expect(d.health).toBeGreaterThan(d[id]);
    for (const v of Object.values(d)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });

  it("is all zero with no worked time", () => {
    expect(Object.values(underServed([], DEFAULT_AREAS, now)).every((v) => v === 0)).toBe(true);
  });
});
