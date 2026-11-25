import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, string>();
vi.mock("./store", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: string) => { kv.set(k, v); },
}));

import { DEFAULT_AREAS } from "./area";
import { loadAreas, loadZenModes, saveAreas, saveZenModes } from "./areas-store";

beforeEach(() => kv.clear());

describe("areas", () => {
  it("defaults to the six core areas when nothing is saved", async () => {
    expect(await loadAreas()).toEqual(DEFAULT_AREAS);
  });

  it("round-trips a saved list", async () => {
    const mine = [...DEFAULT_AREAS, { id: "custom-1", name: "Side Project", kinds: [], words: ["app"] }];
    await saveAreas(mine);
    expect(await loadAreas()).toEqual(mine);
  });

  it("falls back to the defaults on corrupt JSON or a wrong shape", async () => {
    kv.set("areas", "{not json");
    expect(await loadAreas()).toEqual(DEFAULT_AREAS);
    kv.set("areas", JSON.stringify([{ id: 3 }]));
    expect(await loadAreas()).toEqual(DEFAULT_AREAS);
  });
});

describe("zen modes", () => {
  it("defaults every rule to auto", async () => {
    expect(await loadZenModes()).toEqual({ rest: "auto", early: "auto", night: "auto", balance: "auto" });
  });

  it("keeps valid modes and resets unknown ones to auto", async () => {
    await saveZenModes({ rest: "off", early: "strict", night: "auto", balance: "auto" });
    expect(await loadZenModes()).toEqual({ rest: "off", early: "strict", night: "auto", balance: "auto" });
    kv.set("zen.rules", JSON.stringify({ rest: "loud", night: "off" }));
    expect(await loadZenModes()).toEqual({ rest: "auto", early: "auto", night: "off", balance: "auto" });
  });

  it("tolerates corrupt JSON", async () => {
    kv.set("zen.rules", "[[");
    expect(await loadZenModes()).toEqual({ rest: "auto", early: "auto", night: "auto", balance: "auto" });
  });
});
