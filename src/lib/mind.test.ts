import { describe, expect, it } from "vitest";
import { ACTION_SCHEMA, SYSTEM, buildUser, setComplete, think, type Context } from "./mind";

const ctx: Context = {
  now: new Date("2026-11-13T10:00:00Z"),
  lang: "vi",
  tasks: Array.from({ length: 25 }, (_, i) => ({ id: `t${i}`, title: `task ${i}`, start: 0 })),
};

describe("mind", () => {
  it("builds the prompt", () => {
    expect(SYSTEM.match(/^Input:/gm)).toHaveLength(8);
    const u = buildUser("hi", ctx);
    expect(u).toContain("language: vi");
    expect(u).toContain("Input: hi");
    expect(u).not.toContain("task 20");
  });

  it("schema constrains op and kind", () => {
    const item = ACTION_SCHEMA.properties.actions.items;
    expect(item.properties.op.enum).toContain("done");
    expect(item.properties.kind.enum).toHaveLength(5);
    expect(item.required).toEqual(["op"]);
  });

  it("parses model output", async () => {
    setComplete(async () => '{"actions":[{"op":"done","target":"t1"}]}');
    expect(await think("done", ctx)).toEqual([{ op: "done", target: "t1" }]);
  });

  it("falls back to one create when the model is missing, bad or empty", async () => {
    for (const fn of [
      async () => {
        throw new Error("no model");
      },
      async () => "not json",
      async () => '{"actions":[]}',
    ]) {
      setComplete(fn);
      expect(await think("buy milk", ctx)).toEqual([{ op: "create", title: "buy milk" }]);
    }
  });
});
