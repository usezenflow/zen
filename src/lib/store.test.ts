import { describe, expect, it, vi } from "vitest";

const rows: Record<string, unknown>[] = [];
let reads = 0;
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    getAllAsync: async () => { reads++; return rows.map((r) => ({ ...r })); },
    runAsync: async (_sql: string, v: unknown[]) => { rows.push({ id: v[0], title: v[1], vec: null, kind: v[3], effort: v[4], deadline: null, notBefore: null, rrule: null, start: null, end: null, doneAt: null, meta: v[11] }); },
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  }),
}));
vi.mock("../planner", () => ({ newModel: () => ({}) }));
vi.mock("../planner/linucb", () => ({ upgradePrior: () => {} }));

const store = await import("./store");

describe("allTasks cache", () => {
  it("reads once until a write, and hands each caller its own copies", async () => {
    await store.putTasks([{ id: "a", title: "A", kind: "other", effort: 30, source: "user", createdAt: 0 } as never]);
    const n = reads, one = await store.allTasks(), two = await store.allTasks();
    expect(reads - n).toBe(1);
    one[0].title = "changed";
    expect(two[0].title).toBe("A");
    expect((await store.allTasks())[0].title).toBe("A");
    await store.putTasks([{ id: "b", title: "B", kind: "other", effort: 30, source: "user", createdAt: 0 } as never]);
    expect((await store.allTasks()).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
