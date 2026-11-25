// kv persistence for Areas (kv "areas") and Zen rule modes (kv "zen.rules"). A corrupt or older value falls back to the defaults.
import { DEFAULT_AREAS, type Area } from "./area";
import { kvGet, kvSet } from "./store";
import { ZEN_RULES, type ZenMode, type ZenRule } from "../planner/zen";

const MODES: ZenMode[] = ["off", "auto", "strict"];
const isArea = (x: any): x is Area =>
  !!x && typeof x.id === "string" && typeof x.name === "string" && Array.isArray(x.kinds) && Array.isArray(x.words) && (x.targetPct === undefined || typeof x.targetPct === "number");

const parse = async (key: string): Promise<unknown> => {
  try { return JSON.parse((await kvGet(key)) ?? "null"); } catch { return null; }
};

export async function loadAreas(): Promise<Area[]> {
  const v = await parse("areas");
  return Array.isArray(v) && v.every(isArea) ? v : DEFAULT_AREAS;
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
