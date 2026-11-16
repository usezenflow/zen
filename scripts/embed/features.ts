// Embeds the training rows, the held-out rows and their noised copies with the runtime embed() itself, so the heads
// are trained on exactly what the app computes. Writes scripts/embed/build/features.json.
// Run: node scripts/embed/run.mjs scripts/embed/features.ts   (after build_model.py)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { embed } from "../../src/lib/nlu/embed.ts";
import { noised } from "./noise.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rows = (f: string) => readFileSync(join(here, f), "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const r = (x: number) => Math.round(x * 1e5) / 1e5; // keeps the JSON small without moving any decision

const train = rows("build/train.jsonl");
const held = rows("heldout.jsonl");
const out = {
  train: train.map((t) => ({ y: t.cls, g: t.group, aug: t.aug, x: Array.from(embed(t.text), r) })),
  heldout: held.map((t, i) => ({ y: t.cls, text: t.text, x: Array.from(embed(t.text), r), xn: Array.from(embed(noised(t.text, i + 1)), r) })),
};
writeFileSync(join(here, "build/features.json"), JSON.stringify(out));
console.log(`train ${out.train.length}, heldout ${out.heldout.length}`);
