// NONE training rows: the titles the reader hands to frameOf() that the rule pass leaves class-less. classify() only
// ever sees those titles (frame.ts: frameOf(it.title)), so they are the right training text, not the raw input.
// Sources: the reader's eval inputs (golden/reader.jsonl, collisions.spec.ts, negatives.ts) and generic subjects with
// date and number spans ("học toán 20/11 đến 19/11"). Writes build/none_eval.jsonl.
// Run: STUB_CLASSIFY=1 node scripts/embed/run.mjs scripts/embed/none_eval.ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { frameOf } from "../../src/lib/nlu/frame.ts";
import { read } from "../../src/lib/nlu/reader/reader.ts";
import { NEGATIVES } from "../../src/lib/nlu/reader/eval/negatives.ts";

type Ref = { y: number; m: number; d: number; h: number; mi: number };
const ev = (f: string) => fileURLToPath(new URL(`../../src/lib/nlu/reader/eval/${f}`, import.meta.url));
const REF: Ref = { y: 2026, m: 11, d: 16, h: 10, mi: 0 };

const inputs: { text: string; ref: Ref }[] = [];
for (const l of readFileSync(ev("golden/reader.jsonl"), "utf-8").split("\n").filter(Boolean)) {
  const g = JSON.parse(l) as { text: string; ref: number[] };
  const [y, m, d, h, mi] = g.ref;
  inputs.push({ text: g.text, ref: { y, m, d, h, mi } });
}
for (const m of readFileSync(ev("collisions.spec.ts"), "utf-8").matchAll(/\[\s*"[^"]*",\s*"([^"]*)",/g)) inputs.push({ text: m[1], ref: REF });
for (const n of NEGATIVES) inputs.push({ text: n.text, ref: REF });

// Generic subjects with date and number spans. Only these get spans: open-vocabulary titles keep their positives.
const SUBJECTS = ["học toán", "học văn", "học lý", "học hóa", "học sử", "học bài", "học nhóm", "học thêm", "học", "làm", "đọc", "họp", "dọn phòng", "gọi mẹ", "đi khám", "viết", "ôn"];
const SPANS = ["20/11", "19/11", "23 - 29/11", "20/11 đến 19/11", "9h", "9h30", "15 phút", "2h", "2h trong tuần này", "tuần sau", "mai", "hôm nay", "thứ 6", "ngày 15/12", "3 tuần nữa", "tháng 12", "30 phút", "99 phút", "9 tiếng", "lúc 9h", "9h kém 15", "ngày 31/11", "đầu tháng 3", "25h", "9999", "31/12/2026", "2026", "0 phút", "60 phút", "1 tiết", "tuần này", "cuối tháng"];
for (const s of SUBJECTS) for (const sp of SPANS) {
  inputs.push({ text: `${s} ${sp}`, ref: REF });
  inputs.push({ text: `${sp} ${s}`, ref: REF });
}

// The titles the reader gives frameOf (classify is stubbed, so this is the rule pass). Class-less titles are NONE.
const titles = new Set<string>();
for (const { text, ref } of inputs) {
  for (const it of read(text, { ref, source: "typed" }).items) {
    const t = it.title.trim();
    if (t && !frameOf(t).cls) titles.add(t);
  }
}
const rows = [...titles].map((text) => JSON.stringify({ text, cls: "none", group: `eval:${text}`, aug: "eval" }));
writeFileSync(fileURLToPath(new URL("build/none_eval.jsonl", import.meta.url)), rows.join("\n") + "\n");
console.log(`inputs ${inputs.length}, NONE titles ${titles.size}, sample ${[...titles].slice(0, 8).join(" | ")}`);
