import { beforeEach, expect, it, vi } from "vitest";

const kv = new Map<string, string>();
vi.mock("./store", () => ({ kvGet: async (k: string) => kv.get(k) ?? null, kvSet: async (k: string, v: string) => void kv.set(k, v) }));
import { _reset, enqueue, dropWhere, snapshot, work } from "./queue";

beforeEach(() => { kv.clear(); _reset(); });

it("keeps one job per key, runs them in order, and retries a failure alone with a growing wait", async () => {
  let t = 1000;
  const clock = () => t;
  await enqueue([{ key: "tt:1", kind: "tt" }, { key: "ex", kind: "ex" }, { key: "tt:1", kind: "tt" }], t);
  expect((await snapshot()).jobs.map((j) => j.key)).toEqual(["tt:1", "ex"]);
  const ran: string[] = [];
  await work(async (j) => { ran.push(j.key); if (j.key === "tt:1") throw new Error("slow"); }, Infinity, clock);
  expect(ran).toEqual(["tt:1", "ex"]);
  const [back] = (await snapshot()).jobs;
  expect([back.key, back.tries, back.next]).toEqual(["tt:1", 1, 1000 + 60_000]);
  await work(async (j) => { ran.push(j.key); }, Infinity, clock); // not due yet
  expect(ran).toHaveLength(2);
  await enqueue([{ key: "tt:1", kind: "tt" }], t); // a tap asks now
  await work(async (j) => { ran.push(j.key); }, Infinity, clock);
  expect(ran).toEqual(["tt:1", "ex", "tt:1"]);
  expect((await snapshot()).jobs).toEqual([]);
});

it("an automatic enqueue leaves a waiting job's time alone, and a dropped job is not put back", async () => {
  await enqueue([{ key: "a", kind: "lms" }], 0);
  await work(async () => { await dropWhere((j) => j.kind === "lms"); throw new Error("refused"); }, Infinity, () => 0);
  expect((await snapshot()).jobs).toEqual([]);
  await enqueue([{ key: "b", kind: "ex" }], 0);
  await work(async () => { throw new Error("x"); }, Infinity, () => 0);
  await enqueue([{ key: "b", kind: "ex", auto: true }], 5);
  expect((await snapshot()).jobs[0].next).toBe(60_000);
});
