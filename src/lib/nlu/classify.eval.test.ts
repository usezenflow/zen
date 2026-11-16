import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { noised } from "../../../scripts/embed/noise";
import { embed } from "./embed";
import { classify } from "./classify";

// Held-out titles, written by hand, never in the training generator. Noised copy: no diacritics plus one typo.
const held: { text: string; cls: string }[] = readFileSync(
  new URL("../../../scripts/embed/heldout.jsonl", import.meta.url),
  "utf-8",
)
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

/**
 * Precision over every answer (a NONE title answered is wrong), and coverage over the task titles only: a NONE title
 * is meant to get no answer, so it does not count against coverage.
 */
function score(texts: string[]) {
  const got = texts.map((t) => classify(t));
  let answers = 0;
  let correct = 0;
  let taskAnswers = 0;
  let tasks = 0;
  got.forEach((g, i) => {
    const isTask = held[i].cls !== "none";
    if (isTask) tasks++;
    if (!g.cls) return;
    answers++;
    if (g.cls === held[i].cls) correct++;
    if (isTask) taskAnswers++;
  });
  return { precision: correct / answers, coverage: taskAnswers / tasks };
}

describe("classify on held-out titles", () => {
  it("is precise and answers most titles, clean", () => {
    const s = score(held.map((h) => h.text));
    expect(s.precision).toBeGreaterThanOrEqual(0.85);
    // The model only answers what the rules left class-less, and abstains on generic titles (NONE class): precision over reach.
    expect(s.coverage).toBeGreaterThanOrEqual(0.55);
  });

  it("stays precise with no diacritics and a typo", () => {
    const s = score(held.map((h, i) => noised(h.text, i + 1)));
    expect(s.precision).toBeGreaterThanOrEqual(0.8);
  });

  // Timing is machine-dependent: skipped on CI like the other timing tests in this repo.
  (process.env.CI ? it.skip : it)("embeds in p95 under 2 ms", () => {
    const titles = Array.from({ length: 1000 }, (_, i) => held[i % held.length].text);
    titles.slice(0, 50).forEach((t) => classify(t)); // warm the lazy table load
    const ms = titles.map((t) => {
      const t0 = performance.now();
      embed(t);
      return performance.now() - t0;
    });
    ms.sort((a, b) => a - b);
    expect(ms[Math.floor(ms.length * 0.95)]).toBeLessThan(2);
  });
});

describe("classify output", () => {
  it("returns a class and its domain above the threshold, and only p below it", () => {
    const hit = classify("tập gym 45 phút");
    expect(hit.cls).toBe("workout_gym");
    expect(hit.domain).toBe("health");
    expect(classify("   ")).toEqual({ p: 0 });
  });
});
