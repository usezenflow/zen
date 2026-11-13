import { expect, it } from "vitest";
import { flush, record, setOptOut, installId, type Storage } from "./stats";

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
