import type { Action } from "./types";
import { modelPath } from "./models";

export const ACTION_SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { enum: ["create", "edit", "done", "delete", "note"] },
          target: { type: "string" },
          title: { type: "string" },
          when: { type: "string" },
          effortMinutes: { type: "integer" },
          deadline: { type: "string" },
          repeat: { type: "string" },
          kind: { enum: ["study", "exercise", "chores", "social", "other"] },
        },
        required: ["op"],
      },
    },
  },
  required: ["actions"],
};

export interface Context {
  now: Date;
  lang: "vi" | "en";
  tasks: { id: string; title: string; start?: number }[];
}

const EXAMPLES: [string, string][] = [
  ["gym 3 lan mot tuan", '{"actions":[{"op":"create","title":"Gym","kind":"exercise","repeat":"FREQ=WEEKLY;COUNT=3"}]}'],
  ["essay due next tuesday", '{"actions":[{"op":"create","title":"Essay","kind":"study","deadline":"2026-11-17T23:00:00"}]}'],
  ["doc sach moi toi", '{"actions":[{"op":"create","title":"Doc sach","kind":"study","repeat":"FREQ=DAILY"}]}'],
  ["move essay to friday", '{"actions":[{"op":"edit","target":"t2","when":"2026-11-13T09:00:00"}]}'],
  ["xong bai tap toan", '{"actions":[{"op":"done","target":"t1"}]}'],
  ["delete the dentist", '{"actions":[{"op":"delete","target":"t3"}]}'],
  ["note: ba goi dien thoai chieu mai", '{"actions":[{"op":"note","title":"Ba goi dien thoai chieu mai"}]}'],
  ["clean room 30 min and call mom tonight", '{"actions":[{"op":"create","title":"Clean room","kind":"chores","effortMinutes":30},{"op":"create","title":"Call mom","kind":"social","when":"2026-11-13T20:00:00"}]}'],
];

export const SYSTEM = [
  "You turn one spoken line (Vietnamese or English) into planner actions. Reply with JSON only.",
  "ops: create a task, edit or done or delete an existing task by target id, note for loose thoughts.",
  "Times are local ISO 8601. Resolve relative dates from now. Omit fields not stated.",
  "Examples (now is 2026-11-13T10:00, Friday):",
  ...EXAMPLES.map(([i, o]) => `Input: ${i}\nOutput: ${o}`),
].join("\n");

export function buildUser(text: string, ctx: Context): string {
  const tasks = ctx.tasks.slice(0, 20).map((t) => ({
    id: t.id,
    title: t.title,
    start: t.start && new Date(t.start).toISOString(),
  }));
  return `now: ${ctx.now.toISOString()}\nlanguage: ${ctx.lang}\ntasks: ${JSON.stringify(tasks)}\nInput: ${text}`;
}

export const fallback = (text: string): Action[] => [{ op: "create", title: text }];

type Complete = (system: string, user: string, schema: object) => Promise<string>;
type Llama = { completion(p: object): Promise<{ text: string }> };
let llama: Promise<Llama | undefined> | undefined;

// Single seam to the native model; tests replace it.
let complete: Complete = async (system, user, schema) => {
  llama ??= (async () => {
    const path = await modelPath("mind");
    if (!path) return undefined;
    const { initLlama } = await import("llama.rn");
    return initLlama({ model: path, n_ctx: 2048, n_gpu_layers: 99 });
  })();
  const ctx = await llama;
  if (!ctx) {
    llama = undefined;
    throw new Error("mind: model not downloaded");
  }
  const r = await ctx.completion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    jinja: true,
    enable_thinking: false,
    response_format: { type: "json_schema", json_schema: { strict: true, schema } },
    temperature: 0,
    n_predict: 512,
  });
  return r.text;
};

export function setComplete(fn: Complete) {
  complete = fn;
}

export async function run<T>(system: string, user: string, schema: object): Promise<T> {
  return JSON.parse(await complete(system, user, schema)) as T;
}

export async function think(text: string, ctx: Context): Promise<Action[]> {
  try {
    const { actions } = await run<{ actions: Action[] }>(SYSTEM, buildUser(text, ctx), ACTION_SCHEMA);
    return Array.isArray(actions) && actions.length ? actions : fallback(text);
  } catch {
    return fallback(text);
  }
}
