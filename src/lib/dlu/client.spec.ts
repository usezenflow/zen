import { afterEach, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({}));
vi.mock("expo/fetch", () => ({ fetch: (u: string, i?: RequestInit) => globalThis.fetch(u, i) }));
import { CampusLoginError, CampusSlowError, checkLogin, fetchExams, fetchLms, fetchWeek, owed, payUrl, type Sessions } from "./client";
import type { Creds } from "./creds";

const C: Creds = { studentId: "1", password: "p", lmsPassword: "q", portalApiKey: "k" };
const NOW = Date.UTC(2026, 8, 1);
const res = (status: number, body = "") => new Response(body, { status });
const stub = (portal: (url: string) => Response | Promise<Response>, lms: () => Response | Promise<Response>) =>
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("portal-api") ? portal(url) : lms())));
const lmsOk = () => new Response('name="logintoken" value="t" "sesskey":"abc"', { status: 200, headers: { "set-cookie": "MoodleSession=s; path=/" } });

afterEach(() => vi.unstubAllGlobals());

it("tells a refused password from a slow campus, per account", async () => {
  stub(() => res(401), () => res(503));
  expect(await checkLogin(C)).toMatchObject({ portal: "wrong", lms: "slow" });
  stub(() => { throw new TypeError("network"); }, lmsOk);
  expect(await checkLogin(C)).toMatchObject({ portal: "slow", lms: "ok" });
  stub(() => res(200, JSON.stringify({ Token: "x" })), () => res(200, "<p>loginerror</p>"));
  expect(await checkLogin(C)).toMatchObject({ portal: "ok", lms: "wrong" });
  stub(() => res(200, JSON.stringify({ Token: "x" })), () => res(200, "<p>signed in, no key</p>"));
  expect((await checkLogin(C)).lms).toBe("slow"); // no sesskey is a hiccup, not a wrong password
  expect(await checkLogin({ ...C, lmsPassword: undefined })).toMatchObject({ lms: "off" }); // blank: not tried, no fallback
});

it("a job's fetch throws refused or slow, and a week is authoritative only inside itself", async () => {
  stub(() => res(401), () => res(502));
  const term = { academicYear: "2026-2027", semester: "HK01" as const };
  await expect(fetchWeek(C, term, "2026-09-07", NOW, {})).rejects.toBeInstanceOf(CampusLoginError);
  await expect(fetchLms(C, NOW, {})).rejects.toBeInstanceOf(CampusSlowError);
  stub((url) => res(200, url.includes("authpsc") ? JSON.stringify({ Token: "x" }) : "[]"), lmsOk);
  const w = await fetchWeek(C, term, "2026-09-07", NOW, {});
  expect([w.failed, w.skipped, w.window]).toEqual([["lms"], ["portal:exam"], [Date.UTC(2026, 8, 6, 17), Date.UTC(2026, 8, 13, 17)]]);
});

it("carries the cookie a good LMS login sets, without following its redirect", async () => {
  const seen: Record<string, string | undefined> = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("portal-api")) return res(200, JSON.stringify({ Token: "x" }));
    const cookie = (init?.headers as Record<string, string> | undefined)?.cookie;
    expect([init?.credentials, init?.redirect]).toEqual(["omit", "manual"]);
    if (init?.method === "POST") {
      seen.post = cookie;
      return new Response("", { status: 303, headers: { location: "https://lms.dlu.edu.vn/login/index.php?testsession=7", "set-cookie": "MoodleSession=new; path=/" } });
    }
    if (url.endsWith("/my/")) { seen.my = cookie; return res(200, '"sesskey":"abc"'); }
    return new Response('name="logintoken" value="t"', { status: 200, headers: { "set-cookie": "MoodleSession=anon; path=/" } });
  }));
  const r = await checkLogin(C);
  expect(r.lms).toBe("ok");
  expect(seen).toEqual({ post: "MoodleSession=anon", my: "MoodleSession=new" });
  expect(r.sessions.lmsSession?.cookie).toBe("MoodleSession=new");
});

it("a refused LMS login bounces to the bare form", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("portal-api")) return res(200, JSON.stringify({ Token: "x" }));
    if (init?.method === "POST") return new Response("", { status: 303, headers: { location: "https://lms.dlu.edu.vn/login/index.php" } });
    return lmsOk();
  }));
  expect((await checkLogin(C)).lms).toBe("wrong");
});

it("reuses a kept portal token instead of logging in, and logs in again when it is refused", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(url.replace(/^https:\/\/[^/]+/, ""));
    if (url.includes("authpsc")) return res(200, JSON.stringify({ Token: "new", Expire: "2099-01-01T00:00:00.1234567+07:00" }));
    const ok = (init?.headers as Record<string, string>)?.authorization === "Bearer new";
    return ok ? res(200, "[]") : res(401);
  }));
  const kept = { t: "old", exp: NOW + 3_600_000 };
  const out: Sessions = {};
  await fetchExams({ ...C, lmsPassword: undefined, portalToken: kept }, NOW, out);
  expect(calls.filter((x) => x.includes("authpsc"))).toHaveLength(1); // the kept one was refused once, then a fresh login
  expect(out.portalToken?.t).toBe("new");
  calls.length = 0;
  await fetchExams({ ...C, lmsPassword: undefined, portalToken: { t: "new", exp: NOW + 3_600_000 } }, NOW, {});
  expect(calls.some((x) => x.includes("authpsc"))).toBe(false);
});

it("sums what is owed across terms and links the pay page", () => {
  expect(owed([{ ConNo: 0, PaidLeft: 0 }, { ConNo: 1_590_000 }, { ConNo: null, PaidLeft: 683_100 }, { ConNo: -5 }])).toBe(2_273_100);
  expect(payUrl("2123456")).toBe("https://e-bills.vn/pay/dlu?customer=2123456");
});

it("a data request refused right after a good login is a retry, not a wrong password", async () => {
  stub((url) => (url.includes("authpsc") ? res(200, JSON.stringify({ Token: "x" })) : res(403)), lmsOk);
  const term = { academicYear: "2026-2027", semester: "HK01" as const };
  const e = await fetchWeek(C, term, "2026-09-07", NOW, {}).catch((x) => x);
  expect(e).toBeInstanceOf(Error);
  expect(e).not.toBeInstanceOf(CampusLoginError);
});

it("a reply that is not a list fails the fetch instead of reading as an empty week", async () => {
  stub((url) => res(200, url.includes("authpsc") ? JSON.stringify({ Token: "x" }) : JSON.stringify({ Message: "bảo trì" })), lmsOk);
  await expect(fetchWeek(C, { academicYear: "2026-2027", semester: "HK01" }, "2026-09-07", NOW, {})).rejects.toThrow(/not a list/);
});

it("keeps the LMS session as long as the page's M.cfg sessiontimeout says, minus 5 min; 55 min without it", async () => {
  const lms = (page: string) => new Response(page, { status: 200, headers: { "set-cookie": "MoodleSession=s; path=/" } });
  for (const [page, life] of [['name="logintoken" value="t" "sesskey":"abc","sessiontimeout":"3600"', 55], ['name="logintoken" value="t" "sesskey":"abc"', 55], ['name="logintoken" value="t" "sesskey":"abc","sessiontimeout":"7200"', 115]] as const) {
    stub(() => res(200, JSON.stringify({ Token: "x" })), () => lms(page));
    const r = await checkLogin({ ...C, password: "" });
    expect(r.sessions.lmsSession!.exp - Date.now()).toBeGreaterThan((life - 1) * 60_000);
    expect(r.sessions.lmsSession!.exp - Date.now()).toBeLessThanOrEqual(life * 60_000);
  }
});
