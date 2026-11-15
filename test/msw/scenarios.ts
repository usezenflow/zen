// Overrides for `server.use(...)`: each is a way the campus can answer badly, as client.ts tells them apart.
import { http, HttpResponse } from "msw";
import { calls } from "./handlers.ts";

const seen = (r: Request) => calls.push(`${r.method} ${new URL(r.url).pathname}`);
const status = (s: number) => ({ request }: { request: Request }) => { seen(request); return new HttpResponse(null, { status: s }); };
const down = ({ request }: { request: Request }) => { seen(request); return HttpResponse.error(); };

/** Refused password: 401 on login. */
export const portalWrong = [http.post("*/api/authenticate/authpsc", status(401))];
/** Campus up but failing: 503 everywhere on the portal. */
export const portalSlow = [http.post("*/api/authenticate/authpsc", status(503)), http.get("*/api/student/*", status(503))];
/** Login answers 200 with no token. */
export const portalNoToken = [http.post("*/api/authenticate/authpsc", ({ request }) => { seen(request); return HttpResponse.json({}); })];
/** The next portal GET is refused once (expired token), then the defaults answer. */
export const tokenExpired = [http.get("*/api/student/*", status(401), { once: true })];

/** DLU re-renders the login form with its error. */
export const lmsWrong = [http.post("*/login/index.php", ({ request }) => { seen(request); return new HttpResponse('<div id="loginerrormessage">Invalid login</div>', { status: 200 }); })];
/** A refusal that bounces to the bare form. */
export const lmsBounced = [http.post("*/login/index.php", ({ request }) => { seen(request); return new HttpResponse(null, { status: 303, headers: { location: `${new URL(request.url).origin}/login/index.php` } }); })];
export const lmsSlow = [http.get("*/login/index.php", status(502))];
/** Signed in, but the dashboard holds no sesskey: a hiccup, not a wrong password. */
export const lmsNoSesskey = [http.get("*/my/", ({ request }) => { seen(request); return new HttpResponse("<p>no key</p>"); })];
/** The kept session died: the calendar call says invalidsesskey. */
export const lmsSessionDead = [http.post("*/lib/ajax/service.php", ({ request }) => { seen(request); return HttpResponse.json([{ error: true, exception: { errorcode: "invalidsesskey" } }]); }, { once: true })];

/** Every list empty. */
export const emptyEverything = [
  http.get("*/api/student/*", ({ request }) => { seen(request); return HttpResponse.json([]); }),
  http.post("*/lib/ajax/service.php", ({ request }) => { seen(request); return HttpResponse.json([{ error: false, data: { weeks: [] } }]); }),
];
/** No network at all. */
export const networkError = [http.all("*/api/*", down), http.all("*/login/*", down), http.all("*/my/", down), http.all("*/lib/ajax/*", down)];
/** GitHub fails. */
export const githubDown = [http.get("https://api.github.com/*", status(500))];

/** Logins work but every portal list fails: a first sync that brings nothing. */
export const portalDataDown = [http.get("*/api/student/*", status(503))];
/** A newer release with both installers, from this repo's downloads. */
export const githubNewer = [http.get("https://api.github.com/repos/*/releases/latest", () => HttpResponse.json({
  tag_name: "v99.0.0", html_url: "https://github.com/usezenflow/zen/releases/tag/v99.0.0", body: "- abc1234: Lịch thi mới\n- Sửa lỗi đồng bộ",
  assets: ["zen-android.apk", "zen-ios-unsigned.ipa"].map((name) => ({ name, browser_download_url: `https://github.com/usezenflow/zen/releases/download/v99.0.0/${name}` })),
}))];
