// The fixes `repair` made, as offsets into the raw input: what the app underlines and offers.
import type { ReaderRepair } from "../shared";
import { fold } from "./fold";
import { repeatSpans, type Repaired } from "./repair";

const WORD = /[\p{L}\p{N}]/u;
/** Longest raw phrase a repair covers; longer runs are layout fixes, not typos. */
const MAX_RAW = 40;

function wordAround(s: string, from: number, to: number): [number, number] {
  while (from > 0 && WORD.test(s[from - 1])) from--;
  while (to < s.length && WORD.test(s[to])) to++;
  return [from, to];
}

/** Word level changes from raw to repaired text. Spacing, markup and deletions are not repairs. */
export function repairsOf(raw: string, rep: Repaired): ReaderRepair[] {
  const { text, map } = rep;
  const runs: { rs: number; re: number; ts: number; te: number }[] = [];
  let cur: { rs: number; ts: number } | undefined;
  let p = 0;
  const close = (re: number, te: number) => {
    if (cur) runs.push({ ...cur, re, te });
    cur = undefined;
  };
  for (let i = 0; i < text.length; i++) {
    const m = map[i];
    if (text[i] === raw[m] && m >= p) {
      close(m, i);
      p = m + 1;
    } else cur ??= { rs: Math.max(m, p), ts: i };
  }
  close(raw.length, text.length);

  const out: ReaderRepair[] = [];
  const quiet = repeatSpans(raw);
  let last = 0;
  for (const r of runs) {
    if (r.rs === r.re) continue;
    const [start, end] = wordAround(raw, r.rs, r.re);
    const [ts, te] = wordAround(text, r.ts, r.te);
    const was = raw.slice(start, end);
    const to = text.slice(ts, te);
    if (start < last || end - start > MAX_RAW || /\n/.test(was + to)) continue;
    if (!WORD.test(was) || !WORD.test(to) || was === to) continue;
    const strip = (s: string) => s.normalize("NFC").replace(/\s+/g, "");
    if (strip(was) === strip(to)) continue;
    if (quiet.some(([a, b]) => start < b && end > a)) continue;
    out.push({ start, end, to });
    last = end;
  }
  return out;
}

/** The folded raw words of repairs, the key of a rejection. */
export function repairWord(raw: string, r: ReaderRepair): string {
  return fold(raw.slice(r.start, r.end)).text;
}
