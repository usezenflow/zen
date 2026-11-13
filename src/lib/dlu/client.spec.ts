import { afterEach, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({}));
import { checkLogin, fetchAll } from "./client";
import type { Creds } from "./creds";

const C: Creds = { studentId: "1", password: "p", portalApiKey: "k" };
const NOW = Date.UTC(2026, 8, 1);
const res = (status: number, body = "") => new Response(body, { status });
const stub = (portal: () => Response | Promise<Response>, lms: () => Response | Promise<Response>) =>
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("portal-api") ? portal() : lms())));
const lmsOk = () => res(200, 'name="logintoken" value="t" "sesskey":"abc"');

afterEach(() => vi.unstubAllGlobals());

it("tells a refused password from a slow campus, per account", async () => {
  stub(() => res(401), () => res(503));
  expect(await checkLogin(C)).toEqual({ portal: "wrong", lms: "slow" });
  stub(() => { throw new TypeError("network"); }, lmsOk);
  expect(await checkLogin(C)).toEqual({ portal: "slow", lms: "ok" });
  stub(() => res(200, JSON.stringify({ Token: "x" })), () => res(200, "<p>loginerror</p>"));
  expect(await checkLogin(C)).toEqual({ portal: "ok", lms: "wrong" });
});

it("fetchAll reports both outcomes and skips a disconnected account", async () => {
  stub(() => res(401), () => res(502));
  const r = await fetchAll(C, NOW);
  expect([r.rejected, r.slow, r.failed]).toEqual([["portal"], ["lms"], ["portal", "lms"]]);
  const only = await fetchAll({ ...C, password: "", lmsPassword: "q" }, NOW);
  expect([only.rejected, only.slow, only.failed]).toEqual([[], ["lms"], ["portal", "lms"]]);
});
