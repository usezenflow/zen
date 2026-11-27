import { describe, expect, it, vi } from "vitest";

const rows: Record<string, any>[] = [{ id: "old", title: "code b-tree", vec: new Uint8Array(256 * 4), kind: "study", effort: 60, deadline: null, notBefore: null, rrule: null, start: null, end: null, doneAt: null, meta: "{}" }];
const kv = new Map<string, string>();
let reads = 0;
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    getAllAsync: async (sql: string) => { reads++; return sql.includes("id, title") ? rows.map((r) => ({ id: r.id, title: r.title })) : rows.map((r) => ({ ...r })); },
    getFirstAsync: async (sql: string) => (sql.includes("kv") ? (kv.has("vec.version") ? { value: kv.get("vec.version") } : null) : null),
    runAsync: async (sql: string, v: unknown[]) => {
      if (sql.startsWith("UPDATE tasks SET vec")) rows.find((r) => r.id === v[1])!.vec = v[0];
      else if (sql.startsWith("INSERT OR REPLACE INTO kv")) kv.set("vec.version", v[0] as string);
      else if (sql.startsWith("INSERT OR REPLACE INTO tasks")) rows.push({ id: v[0], title: v[1], vec: null, kind: v[3], effort: v[4], deadline: null, notBefore: null, rrule: null, start: null, end: null, doneAt: null, meta: v[11] });
    },
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  }),
}));
vi.mock("../planner", () => ({ newModel: () => ({}) }));
vi.mock("../planner/linucb", () => ({ upgradePrior: () => {} }));

const store = await import("./store");

describe("stored vectors", () => {
  it("recomputes a 256-dim task vector from its title, once, on open", async () => {
    const [t] = await store.allTasks();
    expect(t.id).toBe("old");
    expect(t.vec!.length).toBe(96);
    expect(kv.get("vec.version")).toBe("embed96");
    await store.allTasks();
    expect(rows.length).toBe(1);
    rows.length = 0;
  });
});

describe("allTasks cache", () => {
  it("reads once until a write, and hands each caller its own copies", async () => {
    await store.putTasks([{ id: "a", title: "A", kind: "other", effort: 30, source: "user", createdAt: 0 } as never]);
    await store.allTasks(); // warm: a write patches the cache in place, so no re-read follows
    const n = reads, one = await store.allTasks(), two = await store.allTasks();
    expect(reads - n).toBe(0);
    one.find((x) => x.id === "a")!.title = "changed";
    expect(two.find((x) => x.id === "a")!.title).toBe("A");
    expect((await store.allTasks()).find((x) => x.id === "a")!.title).toBe("A");
    await store.putTasks([{ id: "b", title: "B", kind: "other", effort: 30, source: "user", createdAt: 0 } as never]);
    expect((await store.allTasks()).map((x) => x.id)).toContain("b");
  });
});
