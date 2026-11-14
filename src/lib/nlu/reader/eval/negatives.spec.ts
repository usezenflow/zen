// Negative suite: no item from these texts may carry a date, clock, repeat or exam type.
import { describe, expect, it } from "vitest";
import { read } from "../reader";
import { NEGATIVES } from "./negatives";
import { held } from "./run";

describe("reader: texts that must not become dated tasks", () => {
  for (const n of NEGATIVES) {
    const gated = held(n.phase);
    (gated ? it : it.skip)(n.text, () => {
      const res = read(n.text, { ref: { y: 2026, m: 11, d: 14, h: 9, mi: 0 }, source: n.source ?? "typed" });
      const bad = res.items.filter((i) => i.deadline || i.startsAt || i.rrule || i.clocks?.length || i.type === "EXAM");
      expect(bad.map((i) => `${i.type} ${i.title} ${i.deadline ?? i.startsAt ?? i.rrule ?? ""}`)).toEqual([]);
    });
  }
});
