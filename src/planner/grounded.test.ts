import { describe, expect, it } from "vitest";
import type { Kind, Task } from "../lib/types";
import { HOLDS, newModel, plan } from "./index";

const now = new Date(2026, 10, 16, 8, 0).getTime();
const day = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
const mk = (o: Partial<Task>): Task => ({ id: "a", title: "viết báo cáo", kind: "work", source: "user", effort: 60, createdAt: now, ...o });

// utterance windows as adapt.ts makes them: whole day ("hôm nay", "trong hôm nay") ends 23:59; a part ends at its own hour
const WINDOWS: [string, number | undefined, boolean][] = [["trong hôm nay", day(23, 59), false], ["hôm nay", day(23, 59), false], ["sáng nay", day(11), true], ["chiều nay", day(18), true], ["tối nay", day(22), true], ["no window", undefined, false]];

describe("reasons are true of the task", () => {
  for (const kind of ["other", "work", "study"] as Kind[]) for (const [say, notAfter, isPart] of WINDOWS) {
    it(`${kind} · ${say}`, () => {
      const t = mk({ kind, notBefore: day(8), notAfter });
      const { diff } = plan([t], [], newModel(now), now);
      for (const p of diff.placed) {
        const keys = (p.why ?? []).map((r) => r.key);
        expect(keys.includes("said"), `said for ${say}`).toBe(isPart && keys.includes("said"));
        if (!isPart) expect(keys).not.toContain("said");
        for (const r of p.why ?? []) expect(HOLDS[r.key](r, { task: t, start: p.start, rules: [] }), `${r.key} for ${say}/${kind}`).toBe(true);
        if (kind === "other") expect(keys).not.toContain("kind");
      }
    });
  }
  it("a rule that is gone, and a pin that is gone, are not claimed", () => {
    const t = mk({});
    expect(HOLDS.rule({ key: "rule", w: 1, vars: { text: "không tập tối" } }, { task: t, start: day(9), rules: [] })).toBe(false);
    expect(HOLDS.pinned({ key: "pinned", w: 1 }, { task: { ...t, start: day(9) }, start: day(9), rules: [] })).toBe(false);
    expect(HOLDS.pinned({ key: "pinned", w: 1 }, { task: { ...t, start: day(9), pinned: true }, start: day(9), rules: [] })).toBe(true);
  });
});
