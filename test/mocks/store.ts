// In-memory stand-in for src/lib/store.ts (expo-sqlite): same exports, Maps instead of tables. `reset()` runs after each test.
import { newModel, type Model } from "@/planner";
import type { Task, TaskEvent } from "@/lib/types";

const tasks = new Map<string, Task>();
const events = new Map<string, TaskEvent>();
const kv = new Map<string, string>();
let model: Model | undefined;

export const reset = () => { tasks.clear(); events.clear(); kv.clear(); model = undefined; };

export const allTasks = async () => [...tasks.values()].map((t) => ({ ...t }));
export const putTasks = async (ts: Task[]) => { for (const t of ts) tasks.set(t.id, { ...t }); };
export const removeTasks = async (ids: string[]) => { for (const id of ids) tasks.delete(id); };
export const allEvents = async (taskId?: string) => [...events.values()].filter((e) => !taskId || e.taskId === taskId).sort((a, b) => a.at - b.at);
export const putEvent = async (e: TaskEvent) => { events.set(e.id, e); };
export const putEvents = async (es: TaskEvent[]) => { for (const e of es) events.set(e.id, e); };
export const removeEvents = async (ids: string[]) => { for (const id of ids) events.delete(id); };
export const loadModel = async (now: number) => model ?? newModel(now);
export const saveModel = async (m: Model) => { model = m; };
export const kvGet = async (key: string) => kv.get(key) ?? null;
export const kvSet = async (key: string, value: string) => { kv.set(key, value); };
