// Parts of the day and how a list of them reads. Pure.
// OR: "sáng/tối", "sáng hoặc tối" is one item in any part. AND: "sáng và tối" is one item per part.
import type { ReaderWindow } from "../shared";

/** Part of the day as a default: the deadline's clock, the fixed start's clock, and the SessionWindow. */
/** `before` is the deadline after "trước/trc" (and its kin), `due` the end of the part for every other cue. */
export const PART: Record<
  string,
  {
    before: [number, number];
    due: [number, number];
    start: [number, number];
    window: ReaderWindow;
  }
> = {
  "sang som": { before: [6, 0], due: [8, 0], start: [6, 0], window: "MORNING" },
  sang: { before: [7, 0], due: [12, 0], start: [9, 0], window: "MORNING" },
  trua: { before: [12, 0], due: [14, 0], start: [12, 0], window: "NOON" },
  chieu: { before: [13, 0], due: [17, 0], start: [14, 0], window: "AFTERNOON" },
  "chieu toi": {
    before: [17, 0],
    due: [18, 0],
    start: [17, 0],
    window: "AFTERNOON",
  },
  toi: { before: [18, 0], due: [22, 0], start: [19, 0], window: "NIGHT" },
  dem: { before: [22, 0], due: [23, 59], start: [21, 0], window: "MIDNIGHT" },
  khuya: { before: [23, 0], due: [23, 59], start: [23, 0], window: "MIDNIGHT" },
};
/** Folded part phrases that name another row of PART. */
export const PART_ALIAS: Record<string, string> = {
  morning: "sang",
  noon: "trua",
  afternoon: "chieu",
  evening: "toi",
  night: "toi",
  "rang sang": "sang som",
  "buoi trua": "trua",
  "giua trua": "trua",
  "xe chieu": "chieu toi",
  "cuoi gio chieu": "chieu toi",
  "nua dem": "khuya",
};
export const PART_ALT =
  "rang sang|sang som|buoi trua|giua trua|xe chieu|cuoi gio chieu|chieu toi|nua dem|khuya|sang|trua|chieu|toi|dem|morning|afternoon|evening|night|noon";
export const PART_WORD = new RegExp(`\\b(${PART_ALT})\\b`);
/** "trong sáng mai": the span from the part's start to its end. */
export const IN_PART = new RegExp(
  `\\btrong\\s+(?:buoi\\s+)?(?:${PART_ALT})\\b`,
);

export type PartSpec = (typeof PART)[string];

/** One part word of a run, as [start, end) in the folded text. */
export interface PartToken {
  word: string;
  start: number;
  end: number;
}

/** Part words joined by separators. `and` when any join is "và", "với", "&", a bare space, and so on. */
export interface PartRun {
  tokens: PartToken[];
  and: boolean;
  /** The run's span in the folded text, with a leading "cả" or "both" of an AND run. */
  start: number;
  end: number;
}

const TOKEN = new RegExp(`\\b(${PART_ALT})\\b`, "g");
/** Joins that read as AND: "&", "+", "và", "với", "cùng", "lẫn", "cũng như", "rồi", "xong", "sau đó", "and", or a bare space. */
export const AND_GAP =
  /^(?:\s*(?:&|\+)\s*|\s+(?:va|n|voi lai|va lai|voi|vs|cung nhu|cung|lan|roi|xong|sau do|and|with)\s+|\s+)(?:buoi\s+)?$/;
/** Joins that read as OR: "/", "|", ",", "hoặc", "hoặc là", "hay", "or". */
export const OR_GAP =
  /^(?:\s*(?:\/|\||,)\s*|\s+(?:hoac la|hoac|hay|or|hok)\s+)(?:buoi\s+)?$/;

/** The runs of part words in folded `text`, in order. A word joined to the next by a separator is in the same run. */
export function partRuns(text: string): PartRun[] {
  const runs: PartRun[] = [];
  let cur: PartRun | undefined;
  for (const m of text.matchAll(TOKEN)) {
    const tok: PartToken = {
      word: m[1],
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[1].length,
    };
    const gap = cur ? text.slice(cur.end, tok.start) : "";
    // "sáng nay hoặc tối mai": a day word may sit in an OR join
    if (cur && OR_GAP.test(gap.replace(/\b(?:nay|mai|mot)\b/g, " "))) {
      cur.tokens.push(tok);
      cur.end = tok.end;
    } else if (cur && AND_GAP.test(gap)) {
      cur.tokens.push(tok);
      cur.end = tok.end;
      cur.and = true;
    } else {
      cur = { tokens: [tok], and: false, start: tok.start, end: tok.end };
      runs.push(cur);
    }
  }
  // "cả sáng và chiều", "both morning and evening": the lead word belongs to the AND
  for (const r of runs) {
    if (!r.and) continue;
    const lead = /\b(?:ca|both)\s+$/.exec(text.slice(0, r.start));
    if (lead) r.start -= lead[0].length;
  }
  return runs;
}

/** The part words of a run, as their table keys. A single part word is its own run. */
export function runParts(run: PartRun): string[] {
  return run.tokens.map((t) => PART_ALIAS[t.word] ?? t.word);
}
