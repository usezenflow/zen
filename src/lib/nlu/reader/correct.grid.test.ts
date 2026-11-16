// Generated self-corrections: "<item>, <cue> <fixed>" after an earlier item. The cue replaces only the slot it names
// (a day, a clock, a part of day or a length) in the item before it; the items before it keep their own slots.
// Expected values are worked out here, not by the reader. Today is Mon 16/11/2026, 06:00.
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fold } from "./fold";
import { read } from "./reader";
import type { ReaderItem } from "../shared";

const REF = { y: 2026, m: 11, d: 16, h: 6, mi: 0 };
const TODAY = "2026-11-16 00:00";

const PREFIXES: (string | null)[] = [null, "đọc sách", "b-tree code", "gọi mẹ"];
const TITLES = ["học toán", "lsm code", "dọn phòng"];
const CUES = ["à không", "ý là", "nhầm", "à nhầm"];
// [slot, wrong, fixed]: the wrong word is said first, the fixed one after the cue
const PAIRS: [string, string, string][] = [
  ["day", "mai", "thứ 6"],
  ["day", "mốt", "mai"],
  ["day", "thứ 3", "thứ 5"],
  ["part", "sáng", "chiều"],
  ["clock", "8h", "9h"],
  ["length", "30p", "1 tiếng"],
];
// the day each day word names on Mon 16/11/2026
const DAY_OF: Record<string, string> = { mai: "2026-11-17", mốt: "2026-11-18", "thứ 3": "2026-11-17", "thứ 5": "2026-11-19", "thứ 6": "2026-11-20" };

// a title compares by its letters: the reader may spell "tree" as "trê"
const norm = (s: string) => fold(s).text.replace(/tree/g, "tre").replace(/[^a-z0-9]+/g, " ").trim();

interface Row { prefix: string | null; title: string; cue: string; slot: string; wrong: string; fixed: string }

function cases(): Row[] {
  const out: Row[] = [];
  for (const prefix of PREFIXES)
    for (const title of TITLES)
      for (const [slot, wrong, fixed] of PAIRS)
        for (const cue of CUES) out.push({ prefix, title, cue, slot, wrong, fixed });
  return out;
}

/** The sentence: the corrected item says the wrong slot, the cue, then the fixed one. */
function said(r: Row): string {
  // a part or a clock is said on the day it is mai's: "học toán mai 8h"; a length or a day word follows the title
  const item = r.slot === "part" || r.slot === "clock" ? `${r.title} mai ${r.wrong}` : `${r.title} ${r.wrong}`;
  const head = r.prefix ? `${r.prefix}, ` : "";
  return `${head}${item}, ${r.cue} ${r.fixed}`;
}

/** The problem with one row, or undefined when the items are right. */
function miss(r: Row): string | undefined {
  const text = said(r);
  const items: ReaderItem[] = read(text, { ref: REF, source: "typed" }).items;
  const want = r.prefix ? 2 : 1;
  if (items.length !== want) return `${text}: ${items.length} items, want ${want} (${items.map((i) => i.title).join(" | ")})`;
  const pre = r.prefix ? items.find((i) => norm(i.title) === norm(r.prefix!)) : undefined;
  if (r.prefix && !pre) return `${text}: no item "${r.prefix}"`;
  // a class's implied due is listed as inferred: only a said date counts as the prefix getting one
  if (pre && (pre.startsAt || (pre.deadline && !pre.inferred.includes("deadline")))) return `${text}: prefix got a date (${pre.startsAt ?? pre.deadline})`;
  if (pre && pre.notBefore && pre.notBefore !== TODAY) return `${text}: prefix notBefore ${pre.notBefore}`;
  const it = items.find((i) => norm(i.title) === norm(r.title));
  if (!it) return `${text}: no item "${r.title}" (got ${items.map((i) => i.title).join(" | ")})`;
  if (r.slot === "day") {
    const d = DAY_OF[r.fixed];
    if (it.notBefore !== `${d} 00:00` || it.deadline !== `${d} 23:59` || it.startsAt) return `${text}: day ${it.notBefore} / ${it.deadline} / ${it.startsAt}, want ${d}`;
  } else if (r.slot === "part") {
    if (it.notBefore !== "2026-11-17 00:00" || it.deadline !== "2026-11-17 18:00" || JSON.stringify(it.windows) !== '["AFTERNOON"]')
      return `${text}: part ${it.notBefore} / ${it.deadline} / ${JSON.stringify(it.windows)}, want 17/11 afternoon`;
  } else if (r.slot === "clock") {
    if (it.startsAt !== "2026-11-17 09:00") return `${text}: clock ${it.startsAt}, want 17/11 09:00`;
  } else if (it.durationMinutes !== 60) return `${text}: length ${it.durationMinutes}, want 60`;
  return undefined;
}

it("correct grid: a cue replaces only the slot it names, the items before it keep theirs", () => {
  const res = cases().map(miss).filter((x): x is string => !!x);
  if (process.env.GRID_OUT) writeFileSync(process.env.GRID_OUT, res.join("\n"));
  expect(res, `${res.length} misses, first: ${res.slice(0, 5).join(" || ")}`).toEqual([]);
}, 120000);

// the reported line: "sau" is no day word here, so the cue's "mai" is the only day and the items before it keep their own
it("correct: the reported line keeps the first item and dates the second to tomorrow", () => {
  const items = read("b-tree code, lsm code sau, à không mai", { ref: REF, source: "typed" }).items;
  expect(items).toHaveLength(2);
  // items sort by their due: the corrected one (tomorrow) first; the other keeps its class's implied due
  const first = items.find((i) => norm(i.title) === "b tre code");
  const second = items.find((i) => norm(i.title) === "lsm code");
  expect(first?.deadline === undefined || first.inferred.includes("deadline")).toBe(true);
  expect(first?.deadline?.startsWith("2026-11-17")).toBe(false);
  expect(second?.deadline).toBe("2026-11-17 23:59");
});
