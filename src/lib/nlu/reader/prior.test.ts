import { describe, expect, it } from "vitest";
import { type Committed, personalPrior } from "./assemble";
import { read } from "./reader";

const row = (
  durationMinutes: number,
  extra: Partial<Committed> = {},
): Committed => ({
  title: "Ôn giải tích",
  type: "PLAN",
  durationMinutes,
  ...extra,
});
const ref = { y: 2026, m: 11, d: 5, h: 9, mi: 0 };
const KEY = "on giai tich";

describe("personal prior", () => {
  it("stays silent with one saved row", () => {
    expect(personalPrior([row(60)]).size).toBe(0);
  });

  it("speaks from two rows", () => {
    expect(personalPrior([row(60), row(60)]).get(KEY)?.durationMinutes).toBe(
      60,
    );
  });

  it("takes the median and the mode of the newest 5 rows", () => {
    const rows = [
      row(90, { window: "EVENING", type: "ASSIGNMENT" }),
      row(60, { window: "EVENING", type: "ASSIGNMENT" }),
      row(120, { window: "MORNING" }),
      row(30, { window: "MORNING" }),
      row(60, { window: "EVENING", type: "ASSIGNMENT" }),
      // older than 5 rows: ignored
      row(480, { window: "DAWN", type: "EXAM" }),
    ];
    expect(personalPrior(rows).get(KEY)).toEqual({
      durationMinutes: 60,
      window: "EVENING",
      type: "ASSIGNMENT",
    });
  });

  it("fills open fields of the read and keeps them inferred", () => {
    const prior = personalPrior([
      row(90, { window: "EVENING" }),
      row(90, { window: "EVENING" }),
    ]);
    const [it] = read("ôn giải tích", { ref, source: "typed", prior }).items;
    expect(it.durationMinutes).toBe(90);
    expect(it.inferred).toContain("durationMinutes");
  });

  it("never fills a time of day from the saved rows", () => {
    const prior = personalPrior([
      row(90, { window: "EVENING" }),
      row(90, { window: "EVENING" }),
    ]);
    const [it] = read("ôn giải tích", { ref, source: "typed", prior }).items;
    expect(it.windows).toBeUndefined();
    expect(it.inferred).not.toContain("windows");
  });

  it("never overrides a length the text gave", () => {
    const prior = personalPrior([row(90), row(90)]);
    const [it] = read("ôn giải tích 2 tiếng", {
      ref,
      source: "typed",
      prior,
    }).items;
    expect(it.durationMinutes).toBe(120);
  });
});
