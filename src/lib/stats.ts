// Anonymous stats client: rows queue locally, flush at most once a day. No titles, text or vectors of text.
export type StatRow = {
  install: string; at: number; policy: string; arm: number;
  x: number[]; theta?: number[]; reward: number; kind: string; zeroEdit: boolean;
  ev?: string; // queue tag: the event that made the row, so an undo can drop it. Never sent (see flushNow).
};

export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const Q = "stats.queue", INSTALL = "stats.install", OFF = "stats.optOut", LAST = "stats.lastFlush";
const DAY_MS = 86400_000, BATCH = 500, MAX_QUEUE = 5000;

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ?? Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("");

export async function installId(s: Storage): Promise<string> {
  let id = await s.get(INSTALL);
  if (!id) { id = uuid(); await s.set(INSTALL, id); }
  return id;
}

export const isOptedOut = async (s: Storage) => (await s.get(OFF)) === "1";

export async function setOptOut(s: Storage, off: boolean) {
  await s.set(OFF, off ? "1" : "0");
  if (off) await s.set(Q, "[]");
}

// The queue is read-modify-write and record() is fire-and-forget: one write at a time, or concurrent calls lose rows.
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn); chain = r.catch(() => {}); return r; };

export const record = (s: Storage, r: Omit<StatRow, "install" | "at"> & { at?: number }) => serial(() => recordNow(s, r));

/** Drops the queued rows of these events (an undone change). Rows already sent stay sent. */
export const forget = (s: Storage, evs: string[]) => serial(async () => {
  const gone = new Set(evs), q: StatRow[] = JSON.parse((await s.get(Q)) ?? "[]");
  if (q.some((r) => r.ev && gone.has(r.ev))) await s.set(Q, JSON.stringify(q.filter((r) => !r.ev || !gone.has(r.ev))));
});

async function recordNow(s: Storage, r: Omit<StatRow, "install" | "at"> & { at?: number }) {
  if (await isOptedOut(s)) return;
  const q: StatRow[] = JSON.parse((await s.get(Q)) ?? "[]");
  q.push({ ...r, install: await installId(s), at: r.at ?? Math.floor(Date.now() / 1000) });
  await s.set(Q, JSON.stringify(q.slice(-MAX_QUEUE)));
}

/** Sends the queue if a day has passed; keeps rows on failure. Returns rows sent. Queued behind record() so its rewrite keeps their rows. */
export const flush = (s: Storage, url: string, now = Date.now(), post: typeof fetch = fetch): Promise<number> => serial(() => flushNow(s, url, now, post));

async function flushNow(s: Storage, url: string, now: number, post: typeof fetch): Promise<number> {
  if (await isOptedOut(s)) return 0;
  if (now - Number((await s.get(LAST)) ?? 0) < DAY_MS) return 0;
  let q: StatRow[] = JSON.parse((await s.get(Q)) ?? "[]");
  let sent = 0;
  while (q.length) {
    const batch = q.slice(0, BATCH).map((r) => ({ ...r, ev: undefined })); // JSON.stringify drops the undefined tag: the sink sees only its 9 keys
    try {
      const res = await post(url.replace(/\/$/, "") + "/e", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(batch),
      });
      if (!res.ok && res.status !== 400) break; // 400 = unfixable rows, drop them
    } catch { break; }
    q = q.slice(batch.length);
    sent += batch.length;
    await s.set(Q, JSON.stringify(q));
  }
  if (!q.length) await s.set(LAST, String(now));
  return sent;
}
