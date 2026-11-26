import { aggregate, validateBatch, type Row, type Stats } from "./core";
import { page } from "./page";

export interface Env { DB: D1Database }

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

async function load(env: Env): Promise<Row[]> {
  // shortcut: reads up to 200k rows per request, add a daily rollup table past free-tier scale
  const { results } = await env.DB.prepare("SELECT * FROM rows ORDER BY at DESC LIMIT 200000").all<any>();
  return results.map((r) => ({
    install: r.install, at: r.at, policy: r.policy, arm: r.arm, x: JSON.parse(r.x),
    theta: r.theta ? JSON.parse(r.theta) : undefined, reward: r.reward, kind: r.kind, zeroEdit: !!r.zero_edit,
  }));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === "OPTIONS")
      return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" } });
    if (req.method === "POST" && pathname === "/e") {
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > 1_000_000) return json({ error: "size" }, 413);
      let body: unknown;
      const raw = await req.text(); // content-length can be missing or false (chunked), so the cap is checked on the bytes read
      if (raw.length > 1_000_000) return json({ error: "size" }, 413);
      try { body = JSON.parse(raw); } catch { return json({ error: "json" }, 400); }
      const v = validateBatch(body);
      if (!v.ok) return json({ error: v.error }, 400);
      const st = env.DB.prepare(
        "INSERT OR IGNORE INTO rows (install, at, policy, arm, x, theta, reward, kind, zero_edit) VALUES (?,?,?,?,?,?,?,?,?)");
      await env.DB.batch(v.rows.map((r) =>
        st.bind(r.install, r.at, r.policy, r.arm, JSON.stringify(r.x), r.theta ? JSON.stringify(r.theta) : null, r.reward, r.kind, r.zeroEdit ? 1 : 0)));
      return json({ ok: true, n: v.rows.length });
    }
    if (req.method === "GET" && pathname === "/stats") {
      // the bootstrap over up to 200k rows is the costly part: compute once per 5 minutes per edge
      const key = new Request(req.url), hit = await caches.default.match(key);
      if (hit) return hit;
      const res = json(aggregate(await load(env), Math.floor(Date.now() / 1000)));
      res.headers.set("cache-control", "public, max-age=300");
      await caches.default.put(key, res.clone());
      return res;
    }
    if (req.method === "GET" && pathname === "/")
      return new Response(page(), { headers: { "content-type": "text/html; charset=utf-8" } });
    return json({ error: "not found" }, 404);
  },
};
export type { Stats };
