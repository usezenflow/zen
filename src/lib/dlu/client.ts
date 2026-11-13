import { parseExams, parseTimetable, type PortalExamRow, type PortalTimetableRow } from "./parse/portal";
import { parseMonthlyView, type MoodleMonthlyView } from "./parse/lms";
import type { ParsedBlock, ParsedLmsItem, ParsedPortalItem } from "./parse/types";
import { parseMarks, type ParsedMarks, type PortalMarksYear, type PortalStudyProgramRow } from "./parse/student";
import { resolveTerm, vnDate, weeksToTermEnd } from "./season";
import { hasLms, hasPortal, type Creds } from "./creds";

export type UpstreamItem = Pick<ParsedBlock, "externalKey" | "title" | "type" | "scheduledStartTime" | "durationMinutes" | "location" | "note"> &
  Partial<Pick<ParsedPortalItem, "scheduleStudyUnitId" | "teacher">> &
  Partial<Pick<ParsedLmsItem, "lmsCourse" | "url" | "description">> & {
    submitted?: boolean;
    examFormat?: string | null;
  };

export type Source = "portal" | "lms";
/** `failed` lists sources that errored or are disconnected, so materialize does not read their absence as removal.
 *  `rejected` is the subset whose login was refused, `slow` the ones that timed out or answered 5xx. */
export type Fetched = UpstreamItem[] & { failed?: Source[]; rejected?: Source[]; slow?: Source[] };

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

async function timed(source: Source, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }).catch(() => { throw new CampusSlowError(source); });
  if (res.status >= 500) throw new CampusSlowError(source);
  return res;
}

async function portalLogin(c: Creds, base: string): Promise<string> {
  const res = await timed("portal", `${base}/api/authenticate/authpsc`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: c.portalApiKey, clientid: "vhu" },
    body: JSON.stringify({ username: c.studentId, password: c.password, type: 0 }),
  });
  if ([400, 401, 403].includes(res.status)) throw new CampusLoginError("portal");
  if (!res.ok) throw new Error(`portal login ${res.status}`);
  const token = ((await res.json().catch(() => null)) as { Token?: string } | null)?.Token;
  if (!token) throw new Error("portal returned no token");
  return token;
}

async function portalGet<T>(c: Creds, base: string, token: string, path: string): Promise<T[]> {
  const res = await timed("portal", `${base}${path}`, { headers: { authorization: `Bearer ${token}`, clientid: "vhu", apikey: c.portalApiKey } });
  if (res.status === 401 || res.status === 403) throw new CampusLoginError("portal");
  if (!res.ok) throw new Error(`portal ${path.split("?")[0]} ${res.status}`);
  const json: unknown = await res.json();
  return Array.isArray(json) ? (json as T[]) : [];
}

// RN's fetch follows redirects and keeps cookies in the native jar, so the session
// cookie is read from set-cookie when exposed and otherwise left to the jar.
const sessionCookie = (res: Response) => /(MoodleSession[^=]*=[^;,\s]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];

async function lmsLogin(c: Creds, base: string): Promise<{ cookie?: string; sesskey: string }> {
  const form = await timed("lms", `${base}/login/index.php`);
  const logintoken = /name="logintoken"\s+value="([^"]*)"/.exec(await form.text())?.[1];
  let cookie = sessionCookie(form);
  const sent = await timed("lms", `${base}/login/index.php`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams({ username: c.studentId, password: c.lmsPassword || c.password, anchor: "", ...(logintoken ? { logintoken } : {}) }).toString(),
  });
  cookie = sessionCookie(sent) ?? cookie;
  const body = (await sent.text()).toLowerCase();
  if (LOGIN_ERROR_MARKERS.some((m) => body.includes(m))) throw new CampusLoginError("lms");
  const dash = await timed("lms", `${base}/my/`, { headers: cookie ? { cookie } : {} });
  const sesskey = /"sesskey":"([A-Za-z0-9]+)"/.exec(await dash.text())?.[1];
  if (!sesskey) throw new CampusLoginError("lms");
  return { cookie, sesskey };
}

async function lmsMonth(base: string, s: { cookie?: string; sesskey: string }, year: number, month: number): Promise<MoodleMonthlyView> {
  const methodname = "core_calendar_get_calendar_monthly_view";
  const res = await timed("lms", `${base}/lib/ajax/service.php?sesskey=${encodeURIComponent(s.sesskey)}&info=${methodname}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(s.cookie ? { cookie: s.cookie } : {}) },
    body: JSON.stringify([{ index: 0, methodname, args: { year, month, courseid: 1, includenavigation: false, mini: true, day: 1 } }]),
  });
  if (res.url.includes("/login/")) throw new CampusLoginError("lms");
  if (!res.ok) throw new Error(`lms calendar ${res.status}`);
  const env = ((await res.json()) as { error?: unknown; data?: MoodleMonthlyView; exception?: { errorcode?: string } }[])?.[0];
  if (!env) throw new Error("empty lms response");
  if (env.error) {
    if (["requireloginerror", "invalidsesskey"].includes(env.exception?.errorcode ?? "")) throw new CampusLoginError("lms");
    throw new Error("lms calendar error");
  }
  return env.data ?? {};
}

/** Parsed marks for every study program of the student. */
export async function fetchMarks(c: Creds): Promise<ParsedMarks> {
  const base = c.portalUrl ?? PORTAL;
  const token = await portalLogin(c, base);
  const programs = await portalGet<PortalStudyProgramRow>(c, base, token, "/api/student/getstudyprogram");
  const years: PortalMarksYear[] = [];
  for (const p of programs) {
    years.push(...(await portalGet<PortalMarksYear>(c, base, token, `/api/student/marks?${new URLSearchParams({ ctdt: p.StudyProgramID, loai: "SV" })}`)));
  }
  return parseMarks(years);
}

export type Check = "ok" | "wrong" | "slow";

/** Logs in to each account once: refused is "wrong", anything else that failed is "slow". */
export async function checkLogin(c: Creds): Promise<{ portal: Check; lms: Check }> {
  const run = (p: Promise<unknown>): Promise<Check> => p.then(() => "ok" as const, (e) => (e instanceof CampusLoginError ? "wrong" : "slow"));
  const [portal, lms] = await Promise.all([run(portalLogin(c, c.portalUrl ?? PORTAL)), run(lmsLogin(c, c.lmsUrl ?? LMS))]);
  return { portal, lms };
}

/** Portal and LMS fail independently: one down keeps the other's items, and both outcomes are reported. Never throws for a login. */
export async function fetchAll(c: Creds, now = Date.now()): Promise<Fetched> {
  const portal = c.portalUrl ?? PORTAL;
  const lms = c.lmsUrl ?? LMS;
  const term = resolveTerm(now);
  const q = `namhoc=${term.academicYear}&hocky=${term.semester}`;
  const nowDate = new Date(now);

  const fromPortal = async (): Promise<UpstreamItem[]> => {
    const token = await portalLogin(c, portal);
    const items: UpstreamItem[] = [];
    const weeks = await Promise.allSettled(
      weeksToTermEnd(now, term).map((w) => portalGet<PortalTimetableRow>(c, portal, token, `/api/student/DrawingStudentSchedules?${q}&tuan=${w}`)),
    );
    for (const w of weeks) {
      if (w.status === "rejected" && w.reason instanceof CampusLoginError) throw w.reason;
      if (w.status === "fulfilled") items.push(...parseTimetable(w.value, TZ).items);
    }
    items.push(...parseExams(await portalGet<PortalExamRow>(c, portal, token, `/api/student/exam?${q}`), TZ).items);
    return items;
  };

  const fromLms = async (): Promise<UpstreamItem[]> => {
    const session = await lmsLogin(c, lms);
    const [y, m] = vnDate(now).split("-").map(Number);
    const next = m === 12 ? [y + 1, 1] : [y, m + 1];
    const items = new Map<string, UpstreamItem>();
    for (const [yy, mm] of [[y, m], next]) {
      for (const i of parseMonthlyView(await lmsMonth(lms, session, yy, mm), nowDate).items) items.set(i.externalKey, i);
    }
    return [...items.values()];
  };

  const [p, l] = await Promise.allSettled([
    hasPortal(c) ? fromPortal() : Promise.reject(undefined),
    hasLms(c) ? fromLms() : Promise.reject(undefined),
  ]);
  const failed: Source[] = [];
  const rejected: Source[] = [];
  const slow: Source[] = [];
  for (const [src, r, on] of [["portal", p, hasPortal(c)], ["lms", l, hasLms(c)]] as const) {
    if (r.status === "fulfilled") continue;
    failed.push(src);
    if (on) (r.reason instanceof CampusLoginError ? rejected : slow).push(src);
  }
  return Object.assign([...(p.status === "fulfilled" ? p.value : []), ...(l.status === "fulfilled" ? l.value : [])], { failed, rejected, slow });
}
