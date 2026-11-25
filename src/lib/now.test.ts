import { describe, expect, it } from "vitest";
import type { Task } from "./types";
import { pickNow } from "./now";

const HR = 3600_000, NOW = new Date(2026, 10, 16, 12).getTime();
const mk = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "study", source: "user", effort: 60, createdAt: NOW, start: NOW + HR, end: NOW + 2 * HR, ...o });

describe("pickNow", () => {
  it("a running fixed block beats a running flexible one", () => {
    const flex = mk("flex", { start: NOW - HR, end: NOW + HR });
    const fixed = mk("fixed", { fixed: "busy", start: NOW - 10 * 60_000, end: NOW + 20 * 60_000 });
    expect(pickNow([flex, fixed], NOW)?.id).toBe("fixed");
    expect(pickNow([flex], NOW)?.id).toBe("flex");
  });

  it("an unscheduled task due within 3h comes before the next timed task, the soonest due first", () => {
    const later = mk("later", { start: NOW + HR, end: NOW + 2 * HR });
    const due2 = mk("due2", { start: undefined, end: undefined, deadline: NOW + 2 * HR });
    const due1 = mk("due1", { start: undefined, end: undefined, deadline: NOW + HR });
    const far = mk("far", { start: undefined, end: undefined, deadline: NOW + 5 * HR });
    expect(pickNow([later, due2, due1], NOW)?.id).toBe("due1");
    expect(pickNow([later, far], NOW)?.id).toBe("later");
  });

  it("else the earliest upcoming task today by start, fixed or not", () => {
    const a = mk("a", { start: NOW + 3 * HR, end: NOW + 4 * HR });
    const b = mk("b", { fixed: "busy", start: NOW + 2 * HR, end: NOW + 3 * HR });
    const tomorrow = mk("tomorrow", { start: NOW + 24 * HR, end: NOW + 25 * HR });
    expect(pickNow([a, b, tomorrow], NOW)?.id).toBe("b");
    expect(pickNow([tomorrow], NOW)).toBeUndefined();
  });

  it("ignores done and deleted tasks, and a parent in favour of its child", () => {
    const parent = mk("p", { start: NOW + HR, end: NOW + 2 * HR });
    const child = mk("c", { parentId: "p", start: NOW + 3 * HR, end: NOW + 4 * HR });
    const done = mk("d", { doneAt: NOW, start: NOW - HR, end: NOW + HR });
    const gone = mk("g", { deletedAt: NOW, start: NOW - HR, end: NOW + HR });
    expect(pickNow([parent, child, done, gone], NOW)?.id).toBe("c");
  });

  it("skips a task whose predecessor is open, and takes it once the predecessor is done or deleted", () => {
    const a = mk("a", { deadline: NOW + HR, after: ["b"] }), b = mk("b", { start: NOW + 5 * HR, end: NOW + 6 * HR });
    expect(pickNow([a, b], NOW)?.id).toBe("b");
    expect(pickNow([a, { ...b, doneAt: NOW }], NOW)?.id).toBe("a");
    expect(pickNow([a, { ...b, deletedAt: NOW }], NOW)?.id).toBe("a");
  });
});
