import * as store from "./store";

/**
 * A small job queue kept on the phone: every campus fetch, by hand or on a schedule, is a job. One runs at a time,
 * a failed one waits and retries alone, the same key queued twice is one job, and the queue survives closing the app.
 */
export type Job = { key: string; kind: string; arg?: string; auto?: boolean; tries: number; next: number };

const KEY = "queue";
const WAIT = [1, 5, 30, 120, 360].map((m) => m * 60_000); // after the 1st, 2nd… failure in a row
const GIVE_UP = 10; // a job that failed this often is dropped; the next schedule or tap asks again

let cache: Job[] | undefined;
let current: string | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

async function load(): Promise<Job[]> {
  if (!cache) { try { cache = JSON.parse((await store.kvGet(KEY)) || "[]") as Job[]; } catch { cache = []; } }
  return cache;
}
async function save(q: Job[]) { cache = q; await store.kvSet(KEY, JSON.stringify(q)); emit(); }

/** Listens to every change: a job added, started, done or put back. */
export function onQueue(cb: () => void): () => void { subs.add(cb); return () => { subs.delete(cb); }; }
/** The queued jobs and the key of the one running. */
export async function snapshot(): Promise<{ jobs: Job[]; current: string | null }> { return { jobs: [...(await load())], current }; }

/** Adds jobs; one already queued is kept, and a tap on one waiting to retry moves it to now. */
export async function enqueue(add: Omit<Job, "tries" | "next">[], now = Date.now()): Promise<void> {
  const q = [...(await load())];
  for (const j of add) {
    const old = q.find((x) => x.key === j.key);
    if (!old) q.push({ ...j, tries: 0, next: now });
    else if (!j.auto) Object.assign(old, { next: Math.min(old.next, now), auto: false });
  }
  await save(q);
}

/** Removes the jobs a test picks (a refused login drops that account's jobs). */
export async function dropWhere(pick: (j: Job) => boolean): Promise<void> { await save((await load()).filter((j) => !pick(j))); }

/** When the next job waiting to retry is due, or null. */
export async function nextDue(): Promise<number | null> {
  const q = await load();
  return q.length ? Math.min(...q.map((j) => j.next)) : null;
}

/** Runs due jobs one at a time until none is due or `budget` ms passed. A throw puts the job back with a growing wait. */
export async function work(run: (j: Job) => Promise<void>, budget = Infinity, clock = Date.now): Promise<void> {
  const start = clock();
  while (clock() - start < budget) {
    const j = (await load()).find((x) => x.next <= clock());
    if (!j) return;
    current = j.key; emit();
    let failed = false;
    try { await run(j); } catch { failed = true; }
    current = null;
    const q = (await load()).filter((x) => x.key !== j.key); // the job may have been dropped meanwhile
    if (failed && (await load()).some((x) => x.key === j.key) && j.tries + 1 < GIVE_UP) {
      q.push({ ...j, tries: j.tries + 1, next: clock() + WAIT[Math.min(j.tries, WAIT.length - 1)] });
    }
    await save(q);
  }
}

/** Test hook: forget the in-memory copy. */
export const _reset = () => { cache = undefined; current = null; };
