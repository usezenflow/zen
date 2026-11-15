import { expect, it, vi } from "vitest";
// A slow scheduler and a store that changes mid-run: an older run must not leave reminders for tasks since done.
const st = vi.hoisted(() => ({ tasks: [] as unknown[], sched: new Map<string, unknown>() }));
const slow = () => new Promise((r) => setTimeout(r, 300));
vi.mock("expo-notifications", () => ({
  AndroidImportance: {}, SchedulableTriggerInputTypes: { DATE: "date" },
  getPermissionsAsync: async () => ({ granted: true }),
  getAllScheduledNotificationsAsync: async () => [...st.sched.keys()].map((identifier) => ({ identifier })),
  cancelScheduledNotificationAsync: async (id: string) => void st.sched.delete(id),
  scheduleNotificationAsync: async (n: { identifier: string }) => { await slow(); st.sched.set(n.identifier, n); },
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./store", () => ({ allTasks: async () => st.tasks }));
import { pushReminders } from "./reminders";

it("the latest push wins over a slower older one", async () => {
  vi.useFakeTimers();
  const soon = Date.now() + 3600_000;
  const task = (id: string, doneAt?: number) => ({ id, title: id, kind: "study", source: "user", effort: 30, start: soon, createdAt: 0, doneAt });
  st.tasks = [task("a"), task("b"), task("c")];
  pushReminders();
  await vi.advanceTimersByTimeAsync(500); // the first run is now inside its slow schedule loop
  st.tasks = [task("a", 1), task("b", 1), task("c")];
  pushReminders();
  await vi.advanceTimersByTimeAsync(5000);
  expect([...st.sched.keys()]).toEqual(["remind:c"]);
  vi.useRealTimers();
});
