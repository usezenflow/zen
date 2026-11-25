// kv persistence for Areas (kv "areas") and Zen rule modes (kv "zen.rules"). A corrupt or older value falls back to the defaults.
import { DEFAULT_AREAS, KINDS, type Area } from "./area";
import { kvGet, kvSet } from "./store";
import { ZEN_RULES, type ZenMode, type ZenRule } from "../planner/zen";
import type { Kind } from "./types";

const MODES: ZenMode[] = ["off", "auto", "strict"];

const parse = async (key: string): Promise<unknown> => {
  try { return JSON.parse((await kvGet(key)) ?? "null"); } catch { return null; }
};

/** One stored area, or undefined when its id or name is unusable. Bad kinds and words are dropped; the rest of the area survives. */
const cleanArea = (x: any): Area | undefined => {
  if (!x || typeof x !== "object" || typeof x.id !== "string" || typeof x.name !== "string") return undefined;
  const target = typeof x.targetPct === "number" && Number.isFinite(x.targetPct) ? Math.min(100, Math.max(0, x.targetPct)) : undefined;
  return {
    id: x.id,
    name: x.name,
    kinds: Array.isArray(x.kinds) ? x.kinds.filter((k: unknown): k is Kind => KINDS.includes(k as Kind)) : [],
    words: Array.isArray(x.words) ? x.words.filter((w: unknown): w is string => typeof w === "string") : [],
    ...(target !== undefined ? { targetPct: target } : {}),
  };
};

/** Each stored item is checked on its own: one bad area is dropped, the others are kept. Only unreadable JSON or no usable area at all resets to the defaults. */
export async function loadAreas(): Promise<Area[]> {
  const v = await parse("areas");
  if (!Array.isArray(v)) return DEFAULT_AREAS;
  const out = v.map(cleanArea).filter((a): a is Area => !!a);
  return out.length > 0 ? out : DEFAULT_AREAS;
}

export async function saveAreas(areas: Area[]): Promise<void> {
  await kvSet("areas", JSON.stringify(areas));
}

export async function loadZenModes(): Promise<Record<ZenRule, ZenMode>> {
  const v = (await parse("zen.rules")) as Partial<Record<ZenRule, unknown>> | null;
  const out = {} as Record<ZenRule, ZenMode>;
  for (const r of ZEN_RULES) {
    const m = v && typeof v === "object" ? v[r] : undefined;
    out[r] = MODES.includes(m as ZenMode) ? (m as ZenMode) : "auto";
  }
  return out;
}

export async function saveZenModes(modes: Record<ZenRule, ZenMode>): Promise<void> {
  await kvSet("zen.rules", JSON.stringify(modes));
}
