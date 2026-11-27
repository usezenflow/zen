// "Đọc code môn game 6 buổi trước 8 tháng 12": the said count of sittings reaches the planner as that many sittings before
// the due, never one block. Reader → action → planner, end to end.
import { describe, expect, it } from "vitest";
import { newModel, plan } from "../../planner/index";
import type { Task } from "../types";
import { itemAction } from "./adapt";
import { read } from "./reader/reader";

const REF = { y: 2026, m: 11, d: 18, h: 9, mi: 0 };
const now = new Date(2026, 10, 18, 9, 0).getTime();

function sittings(said: string, source: "typed" | "voice" = "typed") {
  const [it] = read(said, { ref: REF, source }).items;
  const a = itemAction(it) as { title: string; effortMinutes?: number; maxSitting?: number; deadline?: string; effortGuessed?: boolean; notBefore?: string };
  const t: Task = {
    id: "g", title: a.title, kind: "other", source: "user", createdAt: now, effort: a.effortMinutes ?? 60,
    ...(a.maxSitting ? { maxSitting: a.maxSitting } : {}), ...(a.effortGuessed ? { effortGuessed: true } : {}),
    ...(a.deadline ? { deadline: new Date(a.deadline).getTime() } : {}),
  } as Task;
  const { diff } = plan([t], [], newModel(now), now);
  const ids = diff.split.find((s) => s.parentId === "g")?.ids ?? [];
  const placed = diff.placed.filter((p) => ids.includes(p.id));
  return { n: ids.length, due: t.deadline!, placed };
}

describe("a said count of sittings", () => {
  for (const said of ["Đọc code môn game 6 buổi trước 8 tháng 12", "đọc code môn game 6 buổi trước 8/12", "Đọc code môn game sáu buổi trước tám tháng mười hai"])
    for (const source of ["typed", "voice"] as const)
      it(`${source}: ${said}`, () => {
        const s = sittings(said, source);
        expect(s.n).toBe(6);
        expect(s.placed).toHaveLength(6);
        for (const p of s.placed) expect(p.end).toBeLessThanOrEqual(s.due);
      });
  for (const [said, n] of [["ôn thi 4 buổi trước 25/11", 4], ["làm đồ án 3 buổi mỗi buổi 2 tiếng trước 30/11", 3], ["học từ vựng 10 buổi trước 15/12", 10]] as const)
    it(said, () => expect(sittings(said).n).toBe(n));
});

describe("sittings spread over days", () => {
  const days = (said: string) => new Set(sittings(said).placed.map((p) => new Date(p.start).toDateString())).size;
  it("ôn thi 4 buổi trước 25/11: one a day while the days allow", () => expect(days("ôn thi 4 buổi trước 25/11")).toBe(4));
  it("học từ vựng 6 buổi trước 8/12", () => expect(days("học từ vựng 6 buổi trước 8/12")).toBeGreaterThanOrEqual(5));
});

describe("a lone task with a due", () => {
  it("lands before the last day, not on its eve", () => {
    const [it] = read("làm bài tập trước 25/11", { ref: REF, source: "typed" }).items;
    const a = itemAction(it) as { deadline?: string; effortMinutes?: number };
    const t = { id: "g", title: "b", kind: "study", source: "user", createdAt: now, effort: a.effortMinutes ?? 60, deadline: new Date(a.deadline!).getTime() } as Task;
    const p = plan([t], [], newModel(now), now).diff.placed.find((x) => x.id.startsWith("g"))!;
    expect(new Date(p.start).getDate()).toBeLessThanOrEqual(23);
  });
});

describe("a far due", () => {
  it("đọc code 4 buổi trước 17/12 (from 18/11): sittings reach past the first week", () => {
    const s = sittings("đọc code 4 buổi trước 17/12");
    expect(Math.max(...s.placed.map((p) => p.start))).toBeGreaterThan(now + 9 * 86400_000);
  });
});
