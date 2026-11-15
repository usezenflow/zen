import { parseExams, parseTimetable, type PortalExamRow, type PortalTimetableRow } from "./parse/portal";
import { parseMonthlyView, type MoodleMonthlyView } from "./parse/lms";
import type { ParsedBlock, ParsedLmsItem, ParsedPortalItem } from "./parse/types";
import { parseMarks, type ParsedMarks, type PortalMarksYear, type PortalStudyProgramRow } from "./parse/student";
import { isoWeek, LMS_MONTHS, termNow, vnDate, vnMidnight, type Term } from "./season";
import { hasLms, hasPortal, type Creds, type LmsSession, type PortalToken } from "./creds";
import { fetch as expoFetch } from "expo/fetch";

export type UpstreamItem = Pick<ParsedBlock, "externalKey" | "title" | "type" | "scheduledStartTime" | "durationMinutes" | "location" | "note"> &
  Partial<Pick<ParsedPortalItem, "scheduleStudyUnitId" | "teacher">> &
  Partial<Pick<ParsedLmsItem, "lmsCourse" | "url" | "description">> & {
    submitted?: boolean;
    examFormat?: string | null;
  };

export type Source = "portal" | "lms";
/** One job's answer. Only what it asked for is authoritative, so materialize reads no other absence as removal:
 *  `failed` lists sources not asked, `skipped` key prefixes of portal parts not asked ("portal:lecture", "portal:exam"),
 *  and `window` limits lectures to the one week fetched. */
/** `only`: when set, the answer may delete only these keys (exams this term listed before), not every key of its kind. */
export type Fetched = UpstreamItem[] & { failed?: Source[]; skipped?: string[]; window?: [number, number]; only?: string[] };
/** Sessions a fetch opened, kept for the next one so a login is not repeated. */
export type Sessions = { portalToken?: PortalToken; lmsSession?: LmsSession };

/** The campus refused this account's login. */
export class CampusLoginError extends Error {
  constructor(readonly source: Source) { super(`${source} login rejected`); }
}
/** The campus did not answer (timeout, network, 5xx): says nothing about the password. */
export class CampusSlowError extends Error {
  constructor(readonly source: Source) { super(`${source} slow`); }
}

const PORTAL = "https://portal-api.dlu.edu.vn";
const LMS = "https://lms.dlu.edu.vn";
const TZ = "Asia/Ho_Chi_Minh";
const LOGIN_ERROR_MARKERS = ["loginerror", "invalid login", "invalidlogin", "sai tên đăng nhập"];

// Dev builds only: what the campus answered, so a refused login can be read rather than guessed. Request bodies (passwords) are never logged; tokens and session keys are blanked.
const redact = (s: string) => s.replace(/("(?:Token|sesskey|logintoken)"\s*:\s*")[^"]*/gi, "$1…").replace(/(name="logintoken"\s+value=")[^"]*/g, "$1…");
async function trace(source: Source, method: string, url: string, res: Response) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const raw = await res.clone().text().catch(() => "");
  const landed = res.url && res.url !== url ? ` (landed ${res.url.split("?")[0]})` : "";
  // The portal query is only term and week; the LMS one carries the session key, so it is cut.
  const shown = source === "portal" ? url : url.split("?")[0];
  let what: string;
  if (raw.trimStart().startsWith("<")) { // a page: its title, size and which login-error words it holds, not the markup
    const title = /<title>([^<]*)/i.exec(raw)?.[1]?.trim();
    const hits = LOGIN_ERROR_MARKERS.filter((m) => raw.toLowerCase().includes(m));
    const msg = /id="loginerrormessage"[^>]*>([\s\S]{0,300}?)<\/(?:div|span|p)>/i.exec(raw)?.[1]?.replace(/<[^>]*>/g, "").trim();
    what = `html "${title}" ${raw.length}b markers=[${hits}]${msg ? ` message="${msg}"` : ""}`;
  } else {
    try { const j = JSON.parse(raw); what = `${Array.isArray(j) ? `array(${j.length})` : "json"} ${redact(raw).slice(0, 400)}`; } catch { what = redact(raw).slice(0, 400); }
  }
  console.log(`[dlu ${source}] ${method} ${shown} -> ${res.status}${landed} ${what}`);
}

// Polite to the campus: one request at a time per host, each starting a short, jittered pause after the previous one ended.
const GAP = typeof process !== "undefined" && process.env.VITEST ? 0 : 700;
const queue: Record<Source, Promise<unknown>> = { portal: Promise.resolve(), lms: Promise.resolve() };
const ended: Record<Source, number> = { portal: 0, lms: 0 };
function inTurn<T>(source: Source, run: () => Promise<T>): Promise<T> {
  const mine = queue[source].then(async () => {
    const wait = ended[source] + GAP + Math.random() * GAP * 0.5 - Date.now();
    if (GAP && wait > 0) await new Promise((r) => setTimeout(r, wait));
    try { return await run(); } finally { ended[source] = Date.now(); }
  });
  queue[source] = mine.catch(() => {});
  return mine;
}

async function timed(source: Source, url: string, init: RequestInit = {}) {
  // The LMS goes through expo/fetch: it alone honours `redirect: "manual"` and `credentials: "omit"`, which the cookie dance below needs.
  const go = (source === "lms" ? expoFetch : fetch) as typeof fetch;
  const res = await inTurn(source, () => go(url, { ...init, signal: AbortSignal.timeout(15_000) })).catch(() => { throw new CampusSlowError(source); });
  await trace(source, init.method ?? "GET", url, res);
  if (res.status >= 500) throw new CampusSlowError(source);
  return res;
}

const MIN = 60_000;

async function portalLogin(c: Creds, base: string, now: number): Promise<PortalToken> {
  const res = await timed("portal", `${base}/api/authenticate/authpsc`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: c.portalApiKey, clientid: "vhu" },
    body: JSON.stringify({ username: c.studentId, password: c.password, type: 0 }),
  });
  if ([400, 401, 403].includes(res.status)) throw new CampusLoginError("portal");
  if (!res.ok) throw new Error(`portal login ${res.status}`);
  const j = (await res.json().catch(() => null)) as { Token?: string; Expire?: string } | null;
  if (!j?.Token) throw new Error("portal returned no token");
  // Expire carries seven fractional digits, which not every JS engine reads
  const exp = Date.parse((j.Expire ?? "").replace(/(\.\d{3})\d+/, "$1"));
  return { t: j.Token, exp: Number.isFinite(exp) ? exp : now + 30 * MIN };
}

/** Runs `fn` with the kept token while it is good; a refused one is replaced by a fresh login, once. The fresh token is reported through `out`. */
/** The login just worked, so a refusal now is that one request (a gateway blip, a page this student can't see), not a wrong password:
 *  a plain error, retried later with nothing changed, instead of marking the account refused. */
const refusedLater = <T>(p: Promise<T>): Promise<T> =>
  p.catch((e) => { throw e instanceof CampusLoginError ? new Error(`${e.message}: refused after a good login`) : e; });

async function withPortal<T>(c: Creds, base: string, now: number, out: Sessions | undefined, fn: (token: string) => Promise<T>): Promise<T> {
  const kept = c.portalToken;
  if (kept && kept.exp - MIN > now) {
    try { return await fn(kept.t); } catch (e) { if (!(e instanceof CampusLoginError)) throw e; }
  }
  const fresh = await portalLogin(c, base, now);
  if (out) out.portalToken = fresh;
  return refusedLater(fn(fresh.t));
}

async function portalGet<T>(c: Creds, base: string, token: string, path: string): Promise<T[]> {
  const res = await timed("portal", `${base}${path}`, { headers: { authorization: `Bearer ${token}`, clientid: "vhu", apikey: c.portalApiKey } });
  if (res.status === 401 || res.status === 403) throw new CampusLoginError("portal");
  if (!res.ok) throw new Error(`portal ${path.split("?")[0]} ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error(`portal ${path.split("?")[0]} not a list`); // a maintenance page must not read as "nothing there", which deletes
  return json as T[];
}

// The LMS is driven as the backend does: no native cookie jar, no redirect chase. Moodle regenerates the session id on a good login
// and the jar raced that new cookie against the redirect, landing on "Phiên hoạt động của bạn đã hết". So the cookie is carried by hand.
const lmsInit = (cookie: string, init: RequestInit = {}): RequestInit =>
  ({ ...init, credentials: "omit", redirect: "manual", headers: { ...(init.headers as Record<string, string>), ...(cookie ? { cookie } : {}) } });
/** The newest MoodleSession a response sets; RN joins several Set-Cookie headers with commas. */
export function moodleCookie(res: Response): string | null {
  const all = [...(res.headers.get("set-cookie") ?? "").matchAll(/(MoodleSession[^=;,\s]*)=([^;,\s]+)/g)].filter((m) => m[2] !== "deleted");
  const m = all.at(-1);
  return m ? `${m[1]}=${m[2]}` : null;
}

async function lmsLogin(c: Creds, base: string, now: number): Promise<LmsSession> {
  const form = await timed("lms", `${base}/login/index.php`, lmsInit(""));
  const logintoken = /name="logintoken"\s+value="([^"]*)"/.exec(await form.text())?.[1];
  let cookie = moodleCookie(form) ?? "";
  const sent = await timed("lms", `${base}/login/index.php`, lmsInit(cookie, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: c.studentId, password: c.lmsPassword ?? "", anchor: "", ...(logintoken ? { logintoken } : {}) }).toString(),
  }));
  cookie = moodleCookie(sent) ?? cookie; // the cookie set on THIS response is the signed-in one
  if (sent.status >= 300 && sent.status < 400) {
    // a refusal bounces to the bare form; a good login goes on to ?testsession=… or the wanted page
    if (/\/login\/index\.php\/?$/.test(sent.headers.get("location") ?? "")) throw new CampusLoginError("lms");
  } else {
    // DLU may answer the POST with 200: a refusal re-renders the form with its error
    const body = (await sent.text()).toLowerCase();
    if (LOGIN_ERROR_MARKERS.some((m) => body.includes(m))) throw new CampusLoginError("lms");
  }
  if (!cookie) throw new Error("lms signed in but set no cookie");
  const dash = await timed("lms", `${base}/my/`, lmsInit(cookie));
  const page = await dash.text();
  const sesskey = /"sesskey":"([A-Za-z0-9]+)"/.exec(page)?.[1];
  // Signed in but no sesskey: an LMS hiccup, not a wrong password (as the backend reads it).
  if (!sesskey) throw new Error("lms signed in but no sesskey");
  // M.cfg in the page's script tag says how long the session lives ("sessiontimeout":"3600"); kept 5 min short of it, else 55 min.
  const life = Number(/"sessiontimeout":"?(\d+)/.exec(page)?.[1]) * 1000;
  return { sesskey, cookie, exp: now + (life > 10 * MIN ? life - 5 * MIN : 55 * MIN) };
}

async function withLms<T>(c: Creds, base: string, now: number, out: Sessions | undefined, fn: (s: LmsSession) => Promise<T>): Promise<T> {
  const kept = c.lmsSession;
  if (kept?.cookie && kept.exp > now) {
    try { return await fn(kept); } catch (e) { if (!(e instanceof CampusLoginError)) throw e; } // kept from before the cookie was carried, or expired early
  }
  const fresh = await lmsLogin(c, base, now);
  if (out) out.lmsSession = fresh;
  return refusedLater(fn(fresh));
}

async function lmsMonth(base: string, s: LmsSession, year: number, month: number): Promise<MoodleMonthlyView> {
  const methodname = "core_calendar_get_calendar_monthly_view";
  const res = await timed("lms", `${base}/lib/ajax/service.php?sesskey=${encodeURIComponent(s.sesskey)}&info=${methodname}`, lmsInit(s.cookie ?? "", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([{ index: 0, methodname, args: { year, month, courseid: 1, includenavigation: false, mini: true, day: 1 } }]),
  }));
  if (res.status >= 300 && res.status < 400) throw new CampusLoginError("lms"); // bounced to the login page
  if (!res.ok) throw new Error(`lms calendar ${res.status}`);
  const env = ((await res.json()) as { error?: unknown; data?: MoodleMonthlyView; exception?: { errorcode?: string } }[])?.[0];
  if (!env) throw new Error("empty lms response");
  if (env.error) {
    if (["requireloginerror", "invalidsesskey"].includes(env.exception?.errorcode ?? "")) throw new CampusLoginError("lms");
    throw new Error("lms calendar error");
  }
  if (!env.data) throw new Error("lms calendar without data"); // as above: not an empty month
  return env.data;
}

/** Parsed marks for every study program of the student. */
export async function fetchMarks(c: Creds, out?: Sessions): Promise<ParsedMarks> {
  const base = c.portalUrl ?? PORTAL;
  return withPortal(c, base, Date.now(), out, async (token) => {
    const programs = await portalGet<PortalStudyProgramRow>(c, base, token, "/api/student/getstudyprogram");
    const years: PortalMarksYear[] = [];
    for (const p of programs) {
      years.push(...(await portalGet<PortalMarksYear>(c, base, token, `/api/student/marks?${new URLSearchParams({ ctdt: p.StudyProgramID, loai: "SV" })}`)));
    }
    return parseMarks(years);
  });
}

/** One fee line as the portal returns it (fees.json); only what the fees screen shows. Name, phone and class are not kept. */
export type PortalFeeRow = {
  FeeName?: string; DebtAmount?: number | null; PaidAmount?: number | null; PaidLeft?: number | null; ConNo?: number | null;
  DaGiam?: number | null; PaidDate?: string | null; YearStudy?: string; TermID?: string;
};
const FEE_KEYS = ["FeeName", "DebtAmount", "PaidAmount", "PaidLeft", "ConNo", "DaGiam", "PaidDate", "YearStudy", "TermID"] as const;
/** What the student still owes, in đồng, across every term (an old unpaid term still counts). */
export const owed = (rows: PortalFeeRow[]): number => rows.reduce((a, r) => a + Math.max(0, r.ConNo ?? 0, r.PaidLeft ?? 0), 0);
/** The school's payment page for this student: the e-bills link at the top of fees.json. */
export const payUrl = (studentId: string) => `https://e-bills.vn/pay/dlu?customer=${encodeURIComponent(studentId)}`;

/** Every fee line of every term, trimmed to what the screen shows. */
export async function fetchFees(c: Creds, out?: Sessions): Promise<PortalFeeRow[]> {
  const base = c.portalUrl ?? PORTAL;
  const rows = await withPortal(c, base, Date.now(), out, (token) => portalGet<PortalFeeRow>(c, base, token, "/api/student/AccountFeeHocPhan"));
  return rows.map((r) => Object.fromEntries(FEE_KEYS.map((k) => [k, r[k] ?? null])) as PortalFeeRow);
}

export type Check = "ok" | "wrong" | "slow" | "off";

/** Logs in to each account once: refused is "wrong", anything else that failed is "slow", no password is "off". The sessions it opened come back to be kept. */
export async function checkLogin(c: Creds, now = Date.now()): Promise<{ portal: Check; lms: Check; sessions: Sessions }> {
  const sessions: Sessions = {};
  const run = (on: boolean, p: () => Promise<void>): Promise<Check> => (on ? p().then(() => "ok" as const, (e) => (e instanceof CampusLoginError ? "wrong" : "slow")) : Promise.resolve("off"));
  const [portal, lms] = await Promise.all([
    run(hasPortal(c), async () => { sessions.portalToken = await portalLogin(c, c.portalUrl ?? PORTAL, now); }),
    run(hasLms(c), async () => { sessions.lmsSession = await lmsLogin(c, c.lmsUrl ?? LMS, now); }),
  ]);
  return { portal, lms, sessions };
}

// One fetcher per queue job. Each throws CampusLoginError (refused), CampusSlowError (timeout, 5xx) or Error, and reports new sessions through `out`.

/** One week of the timetable, `monday` being its `YYYY-MM-DD` (VN): authoritative only for lectures inside that week. */
export async function fetchWeek(c: Creds, term: Pick<Term, "academicYear" | "semester"> & { start?: string }, monday: string, now: number, out: Sessions): Promise<Fetched> {
  const base = c.portalUrl ?? PORTAL;
  const rows = await withPortal(c, base, now, out, (token) =>
    portalGet<PortalTimetableRow>(c, base, token, `/api/student/DrawingStudentSchedules?namhoc=${term.academicYear}&hocky=${term.semester}&tuan=${isoWeek(monday)}`));
  const from = vnMidnight(monday), p = parseTimetable(rows, TZ);
  // Only this term's days are authoritative: a week before the term starts still holds the last term's classes, which this answer lacks.
  const lo = Math.max(from, term.start ? vnMidnight(term.start) : from);
  // A row the parser could not read is not a cancelled class: no deletes from this answer.
  const skipped = p.skipped.length ? ["portal:exam", "portal:lecture"] : ["portal:exam"];
  return Object.assign(p.items, { failed: ["lms"] as Source[], skipped, window: [lo, Math.max(lo, from + 7 * 86_400_000)] as [number, number] });
}

/** Exams of the term being examined now (not the one starting in two weeks). */
export async function fetchExams(c: Creds, now: number, out: Sessions): Promise<Fetched> {
  const base = c.portalUrl ?? PORTAL;
  const et = termNow(now);
  const rows = await withPortal(c, base, now, out, (token) => portalGet<PortalExamRow>(c, base, token, `/api/student/exam?namhoc=${et.academicYear}&hocky=${et.semester}`));
  const p = parseExams(rows, TZ); // an unreadable row is not a cancelled exam: no deletes from this answer
  return Object.assign(p.items, { failed: ["lms"] as Source[], skipped: p.skipped.length ? ["portal:lecture", "portal:exam"] : ["portal:lecture"] });
}

/** This month's LMS calendar and the next three, so month and week views can cross months (keep in step with lmsCoverageEnd). */
export async function fetchLms(c: Creds, now: number, out: Sessions): Promise<Fetched> {
  const base = c.lmsUrl ?? LMS;
  const items = await withLms(c, base, now, out, async (session) => {
    const [y, m] = vnDate(now).split("-").map(Number);
    const got = new Map<string, UpstreamItem>();
    for (let k = 0; k < LMS_MONTHS; k++) {
      const yy = y + Math.floor((m - 1 + k) / 12), mm = ((m - 1 + k) % 12) + 1;
      for (const i of parseMonthlyView(await lmsMonth(base, session, yy, mm), new Date(now)).items) got.set(i.externalKey, i);
    }
    return [...got.values()];
  });
  return Object.assign(items, { failed: ["portal"] as Source[] });
}
