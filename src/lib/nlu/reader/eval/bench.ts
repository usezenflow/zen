// Speed gate: median time of one extract over 10,000 characters of golden text (docs/nlu/algorithm.md, Speed).
import { read } from "../reader";
import { loadCases } from "./run";

export function benchMs(chars = 10_000, runs = 5): number {
  const base =
    loadCases()
      .map((c) => c.text)
      .join("\n") + "\n";
  let text = "";
  while (text.length < chars) text += base;
  text = text.slice(0, chars);
  const ref = { y: 2026, m: 11, d: 5, h: 9, mi: 0 };
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    read(text, { ref, source: "paste" });
    times.push(performance.now() - t0);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)] ?? Infinity;
}
