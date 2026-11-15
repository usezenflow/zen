// The campus for e2e: `pnpm mock` serves the same handlers jest uses on :9090, logging every request.
// Build the app with EXPO_PUBLIC_DLU_PORTAL_URL / _LMS_URL / EXPO_PUBLIC_STATS_URL pointing here (see e2e/README.md).
import { createServer } from "node:http";
import { getResponse } from "msw";
import { handlers } from "./handlers.ts";

const port = Number(process.env.PORT ?? 9090);
createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body });
  const r = (await getResponse(handlers, request)) ?? new Response("no handler", { status: 404 });
  console.log(`${r.status} ${req.method} ${req.url?.split("?")[0]}`);
  // Each Set-Cookie on its own header line, as a real server sends them.
  const headers = [...r.headers].filter(([k]) => k !== "set-cookie");
  res.writeHead(r.status, [...headers.flat(), ...r.headers.getSetCookie().flatMap((c) => ["set-cookie", c])]);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`campus mock on :${port}`));
