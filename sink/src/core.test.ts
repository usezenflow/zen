import { describe, expect, it } from "vitest";
import { aggregate, bootstrapCI, MAX_BATCH, validateBatch, validateRow, type Row } from "./core";

const row = (o: Partial<Row> = {}): Row => ({
  install: "abcdefgh12", at: 1_800_000_000, policy: "linucb", arm: 3, x: [0.1, 1],
  reward: 1, kind: "task", zeroEdit: true, ...o,
});

describe("validation", () => {
  it("accepts a good row", () => expect(validateRow(row())).not.toBeNull());
  it("rejects extra text fields", () => expect(validateRow({ ...row(), title: "essay" })).toBeNull());
  it("rejects free text in tags", () => {
    expect(validateRow(row({ kind: "my essay due" }))).toBeNull();
    expect(validateRow({ ...row(), x: ["a"] })).toBeNull();
  });
  it("limits batch size", () => {
    expect(validateBatch(Array(MAX_BATCH).fill(row())).ok).toBe(true);
    expect(validateBatch(Array(MAX_BATCH + 1).fill(row())).ok).toBe(false);
    expect(validateBatch([]).ok).toBe(false);
  });
});

describe("bootstrap", () => {
  it("is deterministic and brackets the mean", () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8];
    const [lo, hi] = bootstrapCI(v);
    expect(bootstrapCI(v)).toEqual([lo, hi]);
    expect(lo).toBeLessThan(4.5);
    expect(hi).toBeGreaterThan(4.5);
  });
  it("collapses on constants", () => expect(bootstrapCI([2, 2, 2])).toEqual([2, 2]));
});

describe("aggregate", () => {
  const now = 1_800_000_000 + 86400;
  const rows = [row(), row({ policy: "random", reward: 0, zeroEdit: false, at: 1_800_000_100 }), row({ at: 1_700_000_000, theta: [2, 4] }), row({ theta: [4] })];
  const s = aggregate(rows, now);
  it("compares policies", () => {
    expect(s.policies.map((p) => p.policy)).toEqual(["linucb", "random"]);
    expect(s.policies[0].reward.mean).toBe(1);
  });
  it("counts the 7 day window", () => expect(s.zeroEdit7d).toEqual({ n: 3, rate: 2 / 3 }));
  it("averages weights per index", () => expect(s.weights).toEqual([3, 4]));
});
