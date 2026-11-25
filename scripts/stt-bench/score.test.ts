import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { edits, matches, score, type Clip, type Hyp } from "./score";

it("counts word edits, ignoring case and punctuation", () => {
  expect(edits("Nộp bài, toán!", "nộp bài toán")).toEqual({ edits: 0, n: 3 });
  expect(edits("họp nhóm lúc 9 giờ", "họp nhóm 9 giờ")).toEqual({ edits: 1, n: 5 });
  expect(edits("a b", "")).toEqual({ edits: 2, n: 2 });
});

it("matches an expectation on the fields it names only", () => {
  expect(matches({ kind: "add" }, { kind: "add", title: "x" })).toBe(true);
  expect(matches({ kind: "add" }, { kind: "done" })).toBe(false);
  expect(matches({ kind: "add" }, undefined)).toBe(false);
});

it("scores a run against a manifest", () => {
  const manifest: Clip[] = [{ clip: "1.wav", text: "nộp bài toán" }, { clip: "2.wav", text: "họp nhóm" }];
  const run: Record<string, Hyp> = { "1.wav": { text: "nộp bài toán", firstPartialMs: 800 }, "2.wav": { text: "họp", firstPartialMs: 1200 } };
  const r = score(manifest, run);
  expect(r.wer).toBeCloseTo(1 / 5);
  expect(r.firstPartialMsMedian).toBe(1200);
  expect(r.e2e).toBeNull();
});

// Real clips: STT_BENCH=<dir with manifest.json and run.json> pnpm vitest run scripts/stt-bench
const dir = process.env.STT_BENCH;
it.runIf(!!dir)("reports the bench for a recorded set", () => {
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8")) as Clip[];
  const run = JSON.parse(readFileSync(`${dir}/run.json`, "utf8")) as Record<string, Hyp>;
  const r = score(manifest, run);
  console.log(JSON.stringify({ wer: r.wer.toFixed(3), firstPartialMsMedian: r.firstPartialMsMedian, e2e: r.e2e, misses: r.rows.filter((x) => x.ok === false).map((x) => x.clip) }, null, 2));
});
