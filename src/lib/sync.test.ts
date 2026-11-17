import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Notifications from "expo-notifications";
import { CampusLoginError, CampusSlowError } from "./dlu/client";
import { ask, drain, loginError } from "./sync";

// The campus fetches and the device are faked: the test is about what a refused or slow login says.
const fake = vi.hoisted(() => ({ kv: new Map<string, string>(), jobs: [] as { key: string; kind: string; auto?: boolean }[], exams: vi.fn(), lms: vi.fn() }));

vi.mock("expo-secure-store", () => ({}));
vi.mock("expo/fetch", () => ({ fetch: (u: string, i?: RequestInit) => globalThis.fetch(u, i) }));
vi.mock("react-native", () => ({ AppState: { currentState: "background" } }));
vi.mock("expo-notifications", () => ({ scheduleNotificationAsync: vi.fn(async () => undefined) }));
vi.mock("./store", () => ({ kvGet: async (k: string) => fake.kv.get(k) ?? null, kvSet: async (k: string, v: string) => { fake.kv.set(k, v); }, allTasks: async () => [] }));
vi.mock("./queue", () => ({
  enqueue: async (add: { key: string; kind: string; auto?: boolean }[]) => { fake.jobs.push(...add); },
  dropWhere: async (pick: (j: { kind: string }) => boolean) => { fake.jobs = fake.jobs.filter((j) => !pick(j)); },
  work: async (run: (j: { key: string; kind: string }) => Promise<void>) => {
    for (const j of [...fake.jobs]) { try { await run(j); fake.jobs = fake.jobs.filter((x) => x !== j); } catch { /* a slow job waits for its retry */ } }
  },
  nextDue: async () => null,
  snapshot: async () => ({ jobs: fake.jobs, current: null }),
  onQueue: () => () => {},
}));
vi.mock("./dlu", () => ({
  loadCreds: async () => ({ studentId: "1", password: "p", lmsPassword: "p" }),
  hasPortal: () => true,
  hasLms: () => true,
  fetchExams: fake.exams,
  fetchLms: fake.lms,
  saveCreds: async () => undefined,
  materialize: () => ({ upserts: [], deletes: [], digest: { exams: [], assignments: [], rooms: [], moved: [], due: [], makeup: [], cancelled: [] } }),
}));
vi.mock("./dlu/background", () => ({ stopBackgroundSync: async () => undefined }));
vi.mock("./widgets", () => ({ pushWidgetsNow: async () => undefined }));
vi.mock("./apply", () => ({ ingest: async () => ({ changed: false }), keepSweep: async () => undefined, loadGone: async () => ({ sections: {}, series: {} }), replan: async () => ({ changed: false }), topUp: async () => undefined }));
vi.mock("./nlu/context", () => ({ prepMult: () => () => 1 }));
vi.mock("./stats", () => ({ flush: async () => 0 }));

const notices = () => vi.mocked(Notifications.scheduleNotificationAsync).mock.calls.map((c) => c[0].content);
/** Queues one part by hand and runs the queue to its end. */
const runPart = async (p: "ex" | "lms") => { await ask(p); await drain(); };

beforeEach(() => {
  fake.kv.clear();
  fake.jobs = [];
  fake.exams.mockReset();
  fake.lms.mockReset();
  vi.mocked(Notifications.scheduleNotificationAsync).mockClear();
});

describe("a refused password", () => {
  it("says once when the flag flips, and not again while it stays set", async () => {
    fake.exams.mockRejectedValue(new CampusLoginError("portal"));
    await runPart("ex");
    expect(await loginError()).toBe("portal");
    expect(notices()).toEqual([{ title: "Online không nhận mật khẩu", body: "Nếu bạn không đổi, hãy kiểm tra tài khoản.", data: { route: "/settings" } }]);
    await runPart("ex");
    expect(notices()).toHaveLength(1);
  });

  it("says the LMS one for the LMS account", async () => {
    fake.lms.mockRejectedValue(new CampusLoginError("lms"));
    await runPart("lms");
    expect(notices()).toEqual([expect.objectContaining({ title: "LMS không nhận mật khẩu", data: { route: "/settings" } })]);
    expect(await loginError()).toBe("lms");
  });

  it("stays silent for a slow campus, which says nothing about the password", async () => {
    fake.exams.mockRejectedValue(new CampusSlowError("portal"));
    await runPart("ex");
    expect(notices()).toEqual([]);
    expect(await loginError()).toBeNull();
  });
});
