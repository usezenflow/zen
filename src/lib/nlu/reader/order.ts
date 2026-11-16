// Order between tasks in one clause: "A roi B", "after A, B", "B but first A". Parts come out in time order.
import { fold } from "./fold";
import { CORRECTION, findMentions } from "./mentions";
import type { Clause } from "./segment";
import type { ReaderItem } from "../shared";

const TASK_WORDS = new Set([
  "hoc",
  "lam",
  "nop",
  "doc",
  "viet",
  "on",
  "tap",
  "bai",
  "chay",
  "mua",
  "goi",
  "don",
  "giat",
  "dien",
  "gui",
  "nau",
  "study",
  "read",
  "write",
  "do",
  "submit",
  "finish",
  "call",
  "clean",
  "wash",
  "buy",
  "practice",
  "prepare",
  "send",
  "cook",
  "run",
  "exercise",
  "pay",
  "email",
  "check",
  "print",
  "review",
  "revise",
]);
// a side with one of these is a fixed item: its clock is the anchor, not an edge
const FIXED_WORDS = new Set([
  "kiem",
  "exam",
  "lop",
  "tiet",
  "class",
  "lecture",
  "lich",
]);
const LIST_SEP = /\s*[,;]\s*|\s+(?:and|va|và)\s+/i;
const CHAIN_WORD =
  /^(?:first|firstly|dau tien|finally|cuoi cung|next|tiep theo)\s+/;
// written first, then second: the first one happens first
const FWD_MID =
  /^(.+?)(?:\s+(?:and then|then|afterwards|after that|next|before|roi moi|xong roi|roi|sau do|tiep theo|xong thi|truoc roi)[,;]?\s+|\s*->\s*)(.+)$/;
// written first, then second: the second one happens first
const BWD_MID =
  /^(.+?)\s+(?:but before that|but first|nhung truoc do|truoc do phai|truoc do|after|sau khi|once|when i finish)[,;]?\s+(.+)$/;
const PRE =
  /^(after|sau khi|once|when i finish|before|truoc khi)\s+(.+?)[,;]\s*(.+)$/;

const words = (s: string) => fold(s).text.split(/[^a-z]+/);
/** Whether a text names a task verb: the words that make a clause a task, not a time or a note. */
export const hasTaskWord = (s: string) =>
  words(s).some((w) => TASK_WORDS.has(w));
/** Words of a side with its date, clock and place spans blanked. */
const bareWords = (s: string): number => {
  let t = s;
  for (const m of findMentions(s).reverse())
    t = t.slice(0, m.start) + " ".repeat(m.end - m.start) + t.slice(m.end);
  // words of two or more letters: a code like "A2.101" is no word
  return (fold(t).text.match(/[a-z]{2,}/g) ?? []).length;
};
const hasFixed = (s: string) => words(s).some((w) => FIXED_WORDS.has(w));
const hasClock = (s: string) =>
  findMentions(s).some((m) => m.kind === "date" || m.kind === "time");

/** The parts of one side, in time order, or undefined when the side is not a task. */
function pieces(s: string, bareOk = false): string[] | undefined {
  const sub = chainOf(s);
  if (sub) return sub;
  // a bare title of 2+ words is a side of its own when both sides are bare: "b-tree code rồi lsm code"; its date words do not count
  const bare = bareOk && bareWords(s) >= 2;
  if ((!hasTaskWord(s) && !bare) || hasFixed(s)) return undefined;
  const list = s
    .split(LIST_SEP)
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length > 1 && list.every(hasTaskWord) ? list : [s];
}

/** The task parts of a clause in time order, or undefined when no connector joins two tasks. */
function chainOf(raw: string): string[] | undefined {
  // a correction keeps only the order after its cue: "học toán rồi làm bài, à không, làm bài rồi học toán"
  const cue = fold(raw);
  let cut = 0;
  for (const m of cue.text.matchAll(CORRECTION))
    cut = cue.map[(m.index ?? 0) + m[0].length] ?? raw.length;
  const text = raw.slice(cut);
  const f = fold(text);
  const t = f.text;
  // original text between two folded offsets
  const span = (a: number, b: number) =>
    text.slice(f.map[a], b < t.length ? f.map[b] : text.length).trim();
  const side = (s: number, e: number) => {
    const lead = CHAIN_WORD.exec(t.slice(s, e));
    return span(s + (lead?.[0].length ?? 0), e);
  };

  let w1: [number, number];
  let w2: [number, number];
  let forward: boolean;
  // only the "rồi" link joins two bare titles; "sau khi" makes one task of its two sides
  let roiLink = false;
  const pre = PRE.exec(t);
  const fm = FWD_MID.exec(t);
  const bm = BWD_MID.exec(t);
  if (pre) {
    const s = t.indexOf(pre[2], pre[1].length);
    w1 = [s, s + pre[2].length];
    w2 = [t.length - pre[3].length, t.length];
    forward = !/^(before|truoc khi)$/.test(pre[1]);
  } else if (fm && (!bm || fm[1].length <= bm[1].length)) {
    w1 = [0, fm[1].length];
    w2 = [t.length - fm[2].length, t.length];
    forward = true;
    // checked on the raw text: "rời" (apart) folds to "roi" too
    const mid = text.slice(f.map[fm[1].length] ?? 0, f.map[t.length - fm[2].length] ?? text.length);
    roiLink = /\s(?:rồi|roi|xong rồi|xong roi)[,;]?\s/i.test(mid);
  } else if (bm) {
    w1 = [0, bm[1].length];
    w2 = [t.length - bm[2].length, t.length];
    forward = false;
  } else return undefined;

  const first = side(w1[0], w1[1]);
  const second = side(w2[0], w2[1]);
  // both sides with their own clock keep the clocks; the order is not an edge
  if (hasClock(first) && hasClock(second)) return undefined;
  const bareOk = roiLink && !hasTaskWord(first) && !hasTaskWord(second);
  const p1 = pieces(first, bareOk);
  const p2 = pieces(second, bareOk);
  if (!p1 || !p2) return undefined;
  return forward ? [...p1, ...p2] : [...p2, ...p1];
}

const DANGLING_FWD =
  /\s(?:roi|xong roi|sau do|tiep theo|xong thi|then|after that|afterwards|next)$/;
const DANGLING_BWD = /^(?:but |nhung )?(?:before that|truoc do)\b/;

const CUE_START = new RegExp(`^(?:${CORRECTION.source})`);

/**
 * Joins a clause that ends with a forward connector to the clause after it ("học toán rồi, làm bài tập"),
 * and a clause that opens with a backward one to the clause before it, when the join makes a chain.
 */
export function joinConnectors(clauses: Clause[]): Clause[] {
  const out: Clause[] = [];
  for (const c of clauses) {
    const prev = out.at(-1);
    const joinable =
      !!prev &&
      prev.section === c.section &&
      !prev.label &&
      !c.label &&
      (DANGLING_FWD.test(fold(prev.text).text.trim()) ||
        DANGLING_BWD.test(fold(c.text).text.trim()));
    const text = joinable ? `${prev.text.trim()} ${c.text.trim()}` : "";
    if (joinable && chainOf(text)) out[out.length - 1] = { ...prev, text };
    // a correction clause corrects the clause before it: "lsm code sau, à không mai" is one clause
    else if (
      !!prev &&
      prev.section === c.section &&
      !prev.label &&
      !c.label &&
      CUE_START.test(fold(c.text).text.trim())
    )
      out[out.length - 1] = { ...prev, text: `${prev.text.trim()}, ${c.text.trim()}` };
    else out.push(c);
  }
  return out;
}

/** Cuts a clause at its order connectors. `edges` joins each part to the next: [k, k + 1]. */
export function splitOrdered(c: Clause): {
  parts: Clause[];
  edges: [number, number][];
} {
  const chain = chainOf(c.text);
  if (!chain) return { parts: [c], edges: [] };
  // a side that is a bare title of up to 3 words is a task of its own, "b-tree code rồi lsm code"
  const parts = chain.map((text) => ({
    ...c,
    text,
    piece: !hasTaskWord(text) && text.trim().split(/\s+/).length <= 3,
    start: c.start + Math.max(0, c.text.indexOf(text)),
  }));
  const edges = parts.slice(1).map((_, k): [number, number] => [k, k + 1]);
  return { parts, edges };
}

/**
 * Sets `ref` and `after` from the links (pred, succ), in place. Later links win: a link that
 * gives a second predecessor or closes a cycle is dropped.
 */
export function linkOrder(
  items: ReaderItem[],
  links: [ReaderItem, ReaderItem][],
): void {
  const kept = new Set(items);
  const next = new Map<ReaderItem, ReaderItem[]>();
  const pred = new Map<ReaderItem, ReaderItem>();
  const reaches = (from: ReaderItem, to: ReaderItem) => {
    const seen = new Set<ReaderItem>();
    const stack = [from];
    while (stack.length) {
      const x = stack.pop() as ReaderItem;
      if (x === to) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(next.get(x) ?? []));
    }
    return false;
  };
  for (const [a, b] of [...links].reverse()) {
    if (a === b || !kept.has(a) || !kept.has(b)) continue;
    if (pred.has(b) || reaches(b, a)) continue;
    pred.set(b, a);
    next.set(a, [...(next.get(a) ?? []), b]);
  }
  const linked = new Set([...pred.keys(), ...pred.values()]);
  items.forEach((it, k) => {
    if (linked.has(it)) it.ref = `i${k}`;
  });
  for (const [b, a] of pred) b.after = a.ref;
}
