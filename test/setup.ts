// Runs before every component test file. The campus is MSW (test/msw): an unhandled request fails the test, so nothing reaches upstream.
import { server, calls } from "./msw/server";
import { NOW } from "./now";

// Dev builds trace every campus answer ([dlu …] in client.ts) and expo-notifications warns about Expo Go: noise here.
const log = console.log, warn = console.warn;
jest.spyOn(console, "log").mockImplementation((...a) => { if (!String(a[0]).startsWith("[dlu ")) log(...a); });
jest.spyOn(console, "warn").mockImplementation((...a) => { if (!String(a[0]).includes("Expo Go")) warn(...a); });

jest.mock("@/lib/store", () => require("./mocks/store"));
jest.mock("expo/fetch", () => ({ fetch: (u: string, i?: RequestInit) => globalThis.fetch(u, i) })); // LMS calls go through expo/fetch
jest.mock("expo-secure-store", () => {
  const m = new Map<string, string>();
  return {
    __reset: () => m.clear(),
    getItemAsync: async (k: string) => m.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => { m.set(k, v); },
    deleteItemAsync: async (k: string) => { m.delete(k); },
  };
});
jest.mock("expo-haptics", () => {
  const p = () => Promise.resolve(); // every call site chains .catch
  return {
    impactAsync: jest.fn(p), notificationAsync: jest.fn(p), selectionAsync: jest.fn(p),
    ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
    NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  };
});
jest.mock("react-native-reanimated", () => require("./mocks/reanimated"));
jest.mock("react-native-worklets", () => require("react-native-worklets/lib/module/mock"));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  calls.length = 0;
});
afterEach(() => {
  server.resetHandlers();
  jest.useRealTimers();
  require("./mocks/store").reset();
  require("expo-secure-store").__reset();
});
afterAll(() => server.close());
