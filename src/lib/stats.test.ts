import { expect, it } from "vitest";
import { flush, forget, record, setOptOut, installId, type Storage } from "./stats";

const mem = (): Storage => { const m = new Map<string, string>(); return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) }; };
const r = { policy: "linucb", arm: 1, x: [1], reward: 1, kind: "task", zeroEdit: true };

it("queues, flushes once a day, keeps one install id", async () => {
  const s = mem(); let calls = 0;
  const post = (async () => (calls++, { ok: true, status: 200 })) as unknown as typeof fetch;
  await record(s, r);
  expect(await flush(s, "http://x", 1e12, post)).toBe(1);
  await record(s, r);
  expect(await flush(s, "http://x", 1e12 + 1000, post)).toBe(0);
  expect(await installId(s)).toBe(await installId(s));
});
it("opt-out drops and blocks", async () => {
  const s = mem();
  await record(s, r); await setOptOut(s, true); await record(s, r);
  expect(await flush(s, "http://x", 1e12, (async () => { throw 1; }) as any)).toBe(0);
});
it("keeps rows on failure", async () => {
  const s = mem(); await record(s, r);
  expect(await flush(s, "http://x", 1e12, (async () => ({ ok: false, status: 500 })) as any)).toBe(0);
  expect(await flush(s, "http://x", 1e12, (async () => ({ ok: true, status: 200 })) as any)).toBe(1);
});
it("concurrent records keep every row", async () => {
  // a slow store: every read and write yields, so unserialized calls would read the same queue and drop rows
  const m = new Map<string, string>(), tick = () => new Promise((r) => setTimeout(r, 1));
  const s: Storage = { get: async (k) => (await tick(), m.get(k) ?? null), set: async (k, v) => { await tick(); m.set(k, v); } };
  await Promise.all(Array.from({ length: 10 }, () => record(s, r)));
  expect(JSON.parse(m.get("stats.queue")!)).toHaveLength(10);
});
it("forget drops only the rows tagged with the undone events, and the tag is never sent", async () => {
  const s = mem(), sent: unknown[] = [];
  await record(s, { ...r, ev: "e1" }); await record(s, { ...r, ev: "e2" }); await record(s, r);
  await forget(s, ["e1"]);
  expect(JSON.parse((await s.get("stats.queue"))!).map((x: { ev?: string }) => x.ev)).toEqual(["e2", undefined]);
  await flush(s, "http://x", 1e12, (async (_u: string, o: { body: string }) => (sent.push(...JSON.parse(o.body)), { ok: true, status: 200 })) as unknown as typeof fetch);
  expect(sent).toHaveLength(2);
  for (const row of sent as object[]) expect(Object.keys(row)).not.toContain("ev");
});
