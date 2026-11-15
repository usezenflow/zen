// Phase 0.8: invariants over every case text, its mutations and some junk: never throws, offsets lie inside the raw text,
// repair is idempotent, the time budget holds.
import { describe, expect, it } from "vitest";
import { repair } from "../repair";
import { read } from "../reader";
import { FAMILIES, mutate, mutateNoisy, NOISY } from "./mutate";
import { loadCases } from "./run";

const ref = { y: 2026, m: 11, d: 14, h: 9, mi: 0 };
const SOURCES = ["typed", "voice", "paste", "ocr"] as const;
const cases = loadCases(true);
const junk = ["", " ", "\n\n\t", "0", "???", "\u0000​", "a".repeat(3000), "9h ".repeat(500), "😀 mai 😀 9h 😀", "<b>mai</b> &nbsp;&amp; 9h"];
const texts = [
  ...junk,
  ...cases.map((c) => c.text),
  ...cases.slice(0, 200).flatMap((c, i) => [...FAMILIES.map((f) => mutate(f, c.text, i)), ...NOISY.map((f) => mutateNoisy(f, c.text, i))]),
];

describe("reader properties", () => {
  it("never throws and keeps every offset inside the raw text", () => {
    const bad: string[] = [];
    for (const text of texts)
      for (const source of SOURCES) {
        let res;
        try {
          res = read(text, { ref, source });
        } catch (e) {
          bad.push(`throws ${source} ${JSON.stringify(text.slice(0, 50))}: ${e}`);
          continue;
        }
        const spans = [...res.mentions, ...res.repairs, ...(res.hints ?? [])];
        for (const s of spans)
          if (!(s.start >= 0 && s.start <= s.end && s.end <= text.length)) bad.push(`offset ${source} ${JSON.stringify(text.slice(0, 50))} ${s.start}-${s.end}`);
      }
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);

  // Not idempotent today ("9h ICT", tabbed tables, long pastes); item 3.10 should drive this to 0. Until then it may not grow.
  const NON_IDEMPOTENT_NOW = 20;
  it("repair is idempotent: the count of texts a second pass still edits does not grow", () => {
    const bad: string[] = [];
    for (const text of texts.slice(0, 600))
      for (const source of SOURCES) {
        const once = repair(text, source).text;
        if (repair(once, source).text !== once) bad.push(`${source} ${JSON.stringify(text.slice(0, 60))}`);
      }
    process.stdout.write(`non-idempotent repairs: ${bad.length}\n`);
    expect(bad.length).toBeLessThanOrEqual(NON_IDEMPOTENT_NOW);
  }, 120_000);

  it.skipIf(!!process.env.CI)("reads a 10,000 character paste inside a generous budget (the strict gate is speed.spec, SPEED_GATE=1)", () => { // timing: off in CI
    const t0 = performance.now();
    read("Họp nhóm 9h sáng mai.\nNộp bài tập trước thứ 6, mua sữa.\n".repeat(200).slice(0, 10000), { ref, source: "paste" });
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
