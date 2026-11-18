import { expect, it } from "vitest";
import type { Task } from "../lib/types";
import { learn, newModel } from "./index";

it("a tick on a task Zen never placed credits the hour it was done in, and no other", () => {
  const now = new Date(2026, 10, 17, 20, 0).getTime();
  const m = newModel(now);
  const t: Task = { id: "a", title: "Chạy bộ", kind: "exercise", source: "user", effort: 30, createdAt: now - 3600_000 };
  const before = m.arms.map((a) => Array.from(a.b));
  const after = learn(m, { id: "e1", taskId: "a", type: "done", at: now }, t);
  const moved = after.arms.map((a, h) => Array.from(a.b).some((v, i) => v !== before[h][i]));
  expect(moved[20]).toBe(true);
  expect(moved.filter(Boolean)).toHaveLength(1);
});
