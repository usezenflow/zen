// Speed gate on the server: a 2,000 character run-on sentence in under 200 ms, each bulk sample in under 50 ms (warm).
import { describe, expect, it } from "vitest";
import { read } from "../reader";
import { loadCases } from "./run";

const ref = { y: 2026, m: 11, d: 8, h: 19, mi: 9 };
/** Fastest of three warm reads in CPU ms, so parallel suites don't inflate it; the first call pays for module setup. */
function warmMs(
  text: string,
  source: "typed" | "voice" | "paste" | "ocr",
): number {
  read(text, { ref, source });
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = process.cpuUsage();
    read(text, { ref, source });
    const { user, system } = process.cpuUsage(t0);
    best = Math.min(best, (user + system) / 1000);
  }
  return best;
}

// Gated in CI only: a loaded dev machine moves jest workers to slower cores, so local timings drift past the budgets.
const gate = process.env.CI ? describe : describe.skip;

gate("speed gate", () => {
  it("reads a 2,000 character run-on sentence in under 200 ms", () => {
    const runon =
      "làm bài tập lớn và nộp trước thứ 6, mua sữa, gọi mẹ 8h tối, họp nhóm 9h sáng mai, mua 2 hộp sữa, "
        .repeat(30)
        .slice(0, 2000);
    expect(warmMs(runon, "typed")).toBeLessThan(200);
  });

  it("reads each bulk sample in under 50 ms", () => {
    const bulk = loadCases().filter((c) => c.name.startsWith("bulk:"));
    expect(bulk.length).toBeGreaterThan(0);
    for (const c of bulk)
      expect([c.name, warmMs(c.text, c.source ?? "paste") < 50]).toEqual([
        c.name,
        true,
      ]);
  });

  it("reads a dense 10,000 character paste in under 1 s", () => {
    const dense = "Họp nhóm 9h sáng mai.\nNộp bài tập trước thứ 6, mua sữa.\n"
      .repeat(200)
      .slice(0, 10000);
    expect(warmMs(dense, "paste")).toBeLessThan(1000);
  });
});
