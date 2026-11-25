// Usage: pnpm mine <metro-or-device.log> > candidates.jsonl
// Prints candidate golden lines (see src/lib/nlu/reader/eval/mine.ts) for review before they go into golden/commands.jsonl.
import { readFileSync } from "node:fs";
import { mine } from "../src/lib/nlu/reader/eval/mine.ts";

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/mine-heard.ts <log file>"); process.exit(1); }
for (const c of mine(readFileSync(file, "utf8"))) console.log(JSON.stringify(c));
