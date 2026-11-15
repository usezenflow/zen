// The campus as Zen sees it (src/lib/dlu/client.ts). Paths carry no host, so the same handlers answer the real hosts in jest
// and the mock server (serve.ts) in e2e. Every request is also recorded in `calls` so tests can assert what was (not) asked.
import { http, HttpResponse, type HttpHandler, type JsonBodyType } from "msw";
import { examRows, feeRows, lectureRows, lmsMonth, marksYears, programs } from "./fixtures.ts";

export const calls: string[] = [];
const seen = (r: Request) => { const u = new URL(r.url); calls.push(`${r.method} ${u.pathname}`); };
/** Expire as the portal writes it: VN wall clock, seven fractional digits, +07:00. Good for an hour. */
const expire = () => new Date(Date.now() + 3_600_000 + 7 * 3_600_000).toISOString().replace("Z", "0000+07:00");
const authed = (r: Request) => r.headers.get("authorization") === "Bearer tok";
const portalGet = (path: string, body: (r: Request) => JsonBodyType) =>
  http.get(`*${path}`, ({ request }) => { seen(request); return authed(request) ? HttpResponse.json(body(request)) : new HttpResponse(null, { status: 401 }); });

export const portal: HttpHandler[] = [
  http.post("*/api/authenticate/authpsc", ({ request }) => { seen(request); return HttpResponse.json({ Token: "tok", Expire: expire() }); }),
  portalGet("/api/student/DrawingStudentSchedules", (r) => lectureRows(Date.now(), Number(new URL(r.url).searchParams.get("tuan")))),
  portalGet("/api/student/exam", () => examRows(Date.now())),
  portalGet("/api/student/getstudyprogram", () => programs),
  portalGet("/api/student/marks", () => marksYears),
  portalGet("/api/student/AccountFeeHocPhan", () => feeRows),
];

const html = (body: string, init: ResponseInit = {}) => new HttpResponse(body, { ...init, headers: { "content-type": "text/html", ...(init.headers as object) } });
// MSW folds cookies it saw set back into later requests, so the check is "carries the signed one", not equality.
const SIGNED = "MoodleSession=signed";
export const lms: HttpHandler[] = [
  http.get("*/login/index.php", ({ request }) => { seen(request); return html('<input name="logintoken" value="lt1">', { headers: { "set-cookie": "MoodleSession=anon; path=/" } }); }),
  http.post("*/login/index.php", ({ request }) => {
    seen(request);
    return new HttpResponse(null, { status: 303, headers: { location: `${new URL(request.url).origin}/login/index.php?testsession=1`, "set-cookie": `${SIGNED}; path=/` } });
  }),
  http.get("*/my/", ({ request }) => { seen(request); return html((request.headers.get("cookie") ?? "").includes(SIGNED) ? '<script>M.cfg={"sesskey":"sk1"}</script>' : "<p>login</p>"); }),
  http.post("*/lib/ajax/service.php", async ({ request }) => {
    seen(request);
    const [{ args }] = (await request.json()) as [{ args: { year: number; month: number } }];
    return HttpResponse.json([{ error: false, data: lmsMonth(Date.now(), args.year, args.month) }]);
  }),
];

/** Off-campus hosts the app also calls: GitHub releases (no newer version) and the stats sink. */
export const other: HttpHandler[] = [
  http.get("https://api.github.com/repos/*/releases/latest", () => HttpResponse.json({ tag_name: "v0.0.0", body: "", assets: [], html_url: "https://github.com" })),
  http.post("*/e", () => HttpResponse.json({ ok: true, n: 0 })),
];

export const handlers = [...portal, ...lms, ...other];
