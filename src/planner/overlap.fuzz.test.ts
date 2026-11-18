import { expect, it } from "vitest";
import type { Kind, Task } from "../lib/types";
import { learn, newModel, plan } from "./index";
const now = new Date(2026, 10, 16, 8, 0).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 10, 16 + d, h, m).getTime();
const kinds: Kind[] = ["study", "exercise", "chores", "social", "other", "work", "errand", "finance", "self"];
it("fuzz: no two placed pieces overlap", () => {
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let run = 0; run < 60; run++) {
    let m = newModel(now);
    for (let i = 0; i < Math.floor(r() * 4); i++) m = learn(m, { id: `e${i}`, taskId: `d${i}`, type: "drag", at: now, data: { fromStart: at(0, 7 + Math.floor(r() * 14)), toStart: at(0, 7 + Math.floor(r() * 14)) } }, { id: `d${i}`, title: "x", kind: kinds[i % 9], source: "user", effort: 60, createdAt: now } as Task);
    const ts: Task[] = Array.from({ length: 3 + Math.floor(r() * 12) }, (_, i) => ({ id: `t${i}`, title: `t${i}`, kind: kinds[Math.floor(r() * 9)], source: "user", effort: [15, 30, 60, 90, 120][Math.floor(r() * 5)], createdAt: now, ...(r() < 0.3 ? { deadline: at(1 + Math.floor(r() * 3), 22) } : {}) } as Task));
    const p = plan(ts, [], m, now).diff.placed.sort((a, b) => a.start - b.start);
    for (let i = 1; i < p.length; i++) expect(p[i].start, `run ${run}`).toBeGreaterThanOrEqual(p[i - 1].end);
  }
});
