import { describe, expect, it } from "vitest";
import { D, KINDS } from "./linucb";
import { migrateModel, newModel } from "./model";

describe("migrateModel", () => {
  it("takes a model saved with 5 kinds: placed rows move, new slip counters start at zero", () => {
    const m = newModel(0) as any;
    m.arms.forEach((a: any) => { a.A = a.A.slice(0, 16 * 16); a.b = a.b.slice(0, 16); });
    m.arms = m.arms.map((a: any) => ({ A: Array.from({ length: 256 }, (_, k) => (k % 17 === 0 ? 1 : 0)), b: new Array(16).fill(0) }));
    delete m.slip.work; delete m.slip.self;
    m.placed = { t: { arm: 9, x: new Array(16).fill(0).map((_, i) => (i === 5 ? 1 : 0)), start: 0 } };
    const out = migrateModel(m);
    expect(out.arms[0].A).toHaveLength(D * D);
    expect(out.arms[0].A[5 * D + 5]).toBe(1);
    expect(out.placed.t.x).toHaveLength(D);
    expect(out.placed.t.x[5]).toBe(1);
    for (const k of KINDS) expect(out.slip[k]).toBeDefined();
  });
});
