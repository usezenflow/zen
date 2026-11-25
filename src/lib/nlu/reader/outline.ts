// Outline reader: a pasted list or document (markdown, a Google Docs paste, a chat list, an OCR'd syllabus) read by its
// lines as groups and leaves. Each leaf's words go through read() for their length, deadline and kind. Pure and offline.
import type { ReaderWC } from "../shared";
import type { Action, Kind } from "../../types";
import { classify } from "../classify";
import { saidMin } from "./calendar";
import { read } from "./reader";

export interface Leaf {
  title: string;
  minutes?: number;
  done: boolean;
  /** Epoch ms, local time. */
  deadline?: number;
  /** Epoch ms: a start the words gave ("họp 14h thứ 4"); it saves as a busy block of `minutes`. */
  start?: number;
  /** Epoch ms: "sau 15/12", the earliest it may run. */
  notBefore?: number;
  kind?: string;
  /** "said": the words gave the length. "budget": the group's budget did. Absent: the learned guess. */
  sized: "said" | "budget" | undefined;
}

export interface Group {
  title: string;
  budgetMin?: number;
  /** Its leaves run in order: numbered, checked or "Bước N" leaves, or a heading that says so. */
  ordered?: boolean;
  items: Leaf[];
  groups?: Group[];
}

interface Line {
  indent: number;
  text: string;
  /** Markdown heading level (1 to 6). */
  head?: number;
  /** Bullet, number or checkbox: a list line. */
  marker: boolean;
  /** A numbered, "Bước N" or checkbox line: its order is the document's. */
  seq: boolean;
  /** Checked or ticked: done. */
  done: boolean;
  /** Heading by its form: caps, trailing colon, or a short line over a list. */
  heading: boolean;
  /** Numbering depth ("1.2.3" is 2). */
  depth: number;
}

interface Node extends Line {
  key: number;
  kids: Node[];
}

const CHECK = /^(\[[ xX]\]|☐|☑|☒|✅|✔️?|✓)\s*/u;
const CHECK_DONE = /^(\[[xX]\]|☑|✅|✔️?|✓)/u;
const BULLET = /^([-*+•–▪○●◦]|\p{Extended_Pictographic}️?)\s+/u;
const KEYWORD = /^(Bước|Tuần|Day|Buổi)\s*\d+(?:\.\d+)*\s*[:.)\-–]?(?=\s|$)/iu;
// "1.", "1)", "1.2" (dotted: a sub-number), "I.", "a."
const NUMBER = /^(\d+(?:\.\d+)+)[.)]?(?=\s|$)|^\d+[.)](?=\s|$)|^([IVX]+|[a-z])[.)](?=\s|$)/u;
const DONE_TAG = /\s*\((?:xong|done)\)\s*$|\s+done\s*$/i;
const TIME_WORD = /sáng|chiều|tối|trưa|đêm|khuya/i;
const ORDER_WORD = /theo thứ tự|in order|steps/i;

function lineOf(raw: string): Line | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // a tab is four columns
  const expanded = raw.replace(/\t/g, "    ");
  const indent = expanded.length - expanded.trimStart().length;
  let s = trimmed;
  let head: number | undefined;
  const h = /^(#{1,6})\s+(.*)$/.exec(s);
  if (h) {
    head = h[1].length;
    s = h[2];
  }
  let marker = false;
  let done = false;
  let depth = 0;
  // a checkbox, alone or after a bullet ("- [x]"); the bullet test goes first so an emoji bullet does not eat "✅"
  let c = CHECK.exec(s);
  if (!c) {
    const b = BULLET.exec(s);
    if (b) {
      marker = true;
      s = s.slice(b[0].length);
      c = CHECK.exec(s);
    }
  }
  if (c) {
    marker = true;
    done = CHECK_DONE.test(c[1]);
    s = s.slice(c[0].length);
  }
  const k = KEYWORD.exec(s);
  const n = k ? undefined : NUMBER.exec(s);
  if (k) marker = true;
  if (n) {
    marker = true;
    if (n[1]) depth = n[1].split(".").length - 1;
    s = s.slice(n[0].length);
  }
  if (DONE_TAG.test(s)) {
    done = true;
    s = s.replace(DONE_TAG, "");
  }
  const text = s.trim();
  const caps = !/\p{Ll}/u.test(text) && (text.match(/\p{L}/gu)?.length ?? 0) >= 3;
  const heading = head !== undefined || (!marker && caps) || text.endsWith(":");
  return { indent, text: text || trimmed, head, marker, seq: !!(c || k || n), done, heading, depth };
}

/** Length and deadline of a phrase, and what is left of it. Read's answer comes first; a bare "4h" or "(90p)" it misses. */
interface Parsed {
  rest: string;
  minutes?: number;
  deadline?: number;
  start?: number;
  notBefore?: number;
  cls?: string;
}

const SIZE = /(?<![\p{L}\d.,])(\d+(?:[.,]\d+)?)\s*(giờ|tiếng|h|phút|ph|p)(?![\p{L}\d])(\s*rưỡi)?/giu;
const CLOCK_AFTER = /^\s*(sáng|chiều|tối|trưa|đêm|khuya|:)/i;
const CLOCK_BEFORE = /(lúc|vào|từ|đến|tới)\s*$/i;

/** A size written by hand: "4h", "1.5h", "90p", "1 tiếng rưỡi". Skips a clock ("5h chiều", "lúc 9h"). */
function sizeWord(text: string): { minutes: number; start: number; end: number } | undefined {
  for (const m of text.matchAll(SIZE)) {
    const at = m.index ?? 0;
    const end = at + m[0].length;
    const n = Number(m[1].replace(",", "."));
    const hours = !/^(ph|p)/i.test(m[2]);
    // a clock ("5h chiều", "lúc 9h") or a long span is no size
    if (hours && (n > 12 || CLOCK_AFTER.test(text.slice(end)) || CLOCK_BEFORE.test(text.slice(0, at)))) continue;
    const minutes = hours ? Math.round(n * 60) + (m[3] ? 30 : 0) : Math.round(n);
    return { minutes, start: at, end };
  }
  return undefined;
}

function parse(text: string, ref: ReaderWC): Parsed {
  const res = read(text, { ref, source: "typed" });
  const item = res.items[0];
  const spans: [number, number][] = [];
  // the size's own words leave the title; read's span can run into the title ("3 - 1 tiếng" in "chương 3 - 1 tiếng")
  const w = sizeWord(text);
  let minutes: number | undefined;
  if (item && item.durationMinutes !== undefined && !item.inferred.includes("durationMinutes")) {
    minutes = item.durationMinutes;
  } else if (w) {
    minutes = saidMin(w.minutes);
  }
  if (w && minutes === saidMin(w.minutes)) spans.push([w.start, w.end]);
  else if (minutes !== undefined) for (const m of res.mentions) if (m.kind === "dur") spans.push([m.start, m.end]);
  let deadline: number | undefined;
  // a written date counts even when read defaulted the hour to the end of the day
  const dates = res.mentions.filter((m) => m.kind === "date");
  if (item?.deadline && (dates.length || !item.inferred.includes("deadline"))) {
    const [d, t] = item.deadline.split(" ");
    const [y, mo, da] = d.split("-").map(Number);
    const [hh, mm] = t.split(":").map(Number);
    deadline = new Date(y, mo - 1, da, hh, mm).getTime();
    for (const m of dates) spans.push([m.start, m.end]);
  }
  let notBefore: number | undefined;
  if (item?.notBefore && !item.inferred.includes("notBefore") && !item.startsAt) {
    const [d, t] = item.notBefore.split(" ");
    const [y, mo, da] = d.split("-").map(Number);
    const [hh, mm] = t.split(":").map(Number);
    notBefore = new Date(y, mo - 1, da, hh, mm).getTime();
  }
  let start: number | undefined;
  if (item?.startsAt && !item.inferred.includes("startsAt")) {
    const [d, t] = item.startsAt.split(" ");
    const [y, mo, da] = d.split("-").map(Number);
    const [hh, mm] = t.split(":").map(Number);
    start = new Date(y, mo - 1, da, hh, mm).getTime();
  }
  let rest = text;
  for (const [a, b] of spans.sort((x, y) => y[0] - x[0])) rest = rest.slice(0, a) + " " + rest.slice(b);
  rest = rest
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|,;]+|[\s\-–—:|,;]+$/g, "")
    .trim();
  // a date taken out of the front ("Mai đi siêu thị") leaves a lower-case start
  rest = rest.charAt(0).toLocaleUpperCase("vi") + rest.slice(1);
  return { rest, minutes, deadline, start, notBefore, cls: item?.cls };
}

/** Lines into a tree: a line is the child of the nearest earlier line with a smaller key. */
function tree(lines: Line[]): Node[] {
  const keyOf = (l: Line) =>
    l.head !== undefined ? -100 + l.head : l.heading ? -90 : l.indent + l.depth * 1000;
  const roots: Node[] = [];
  const stack: Node[] = [];
  for (const l of lines) {
    const n: Node = { ...l, key: keyOf(l), kids: [] };
    while (stack.length && stack[stack.length - 1].key >= n.key) stack.pop();
    (stack.length ? stack[stack.length - 1].kids : roots).push(n);
    stack.push(n);
  }
  return roots;
}

/** Prose: a sentence or a paragraph, not a task. */
const isProse = (l: Line) => !l.marker && (l.text.split(/\s+/).length > 12 || (/[.!?]$/.test(l.text) && l.text.split(/\s+/).length > 5));

function toGroup(nodes: Node[], ref: ReaderWC, title: string, budgetMin?: number): Group {
  const items: Leaf[] = [];
  const groups: Group[] = [];
  let seq = true, leaves = 0; // ordered only when every leaf is numbered or checked: one ✅ among bullets orders nothing
  for (const n of nodes) {
    if (n.kids.length) {
      const p = parse(n.text, ref);
      const g = toGroup(n.kids, ref, p.rest || n.text, p.minutes);
      if (countLeaves(g)) groups.push(g);
    } else if (!n.heading && !isProse(n)) {
      const p = parse(n.text, ref);
      leaves++;
      seq = seq && n.seq;
      const leaf: Leaf = { title: p.rest || n.text, done: n.done, sized: undefined };
      if (p.minutes !== undefined) {
        leaf.minutes = p.minutes;
        leaf.sized = "said";
      }
      if (p.deadline !== undefined) leaf.deadline = p.deadline;
      if (p.start !== undefined) leaf.start = p.start;
      if (p.notBefore !== undefined) leaf.notBefore = p.notBefore;
      const kind = p.cls ?? classify(leaf.title).cls;
      if (kind) leaf.kind = kind;
      items.push(leaf);
    }
  }
  // shortcut: the budget shares only the group's own leaves, not its sub-groups' (each sub-group has its own budget), upgrade when a parent budget must cover nested items
  if (budgetMin) {
    const said = items.reduce((s, i) => s + (i.sized === "said" ? (i.minutes ?? 0) : 0), 0);
    const open = items.filter((i) => !i.done && i.minutes === undefined);
    if (open.length) {
      const each = Math.max(15, Math.round((budgetMin - said) / open.length / 15) * 15);
      for (const i of open) {
        i.minutes = each;
        i.sized = "budget";
      }
    }
  }
  const g: Group = { title, items };
  if (budgetMin) g.budgetMin = budgetMin;
  if ((seq && leaves > 0) || ORDER_WORD.test(title)) g.ordered = true;
  if (groups.length) g.groups = groups;
  return g;
}

const countLeaves = (g: Group): number => g.items.length + (g.groups ?? []).reduce((s, x) => s + countLeaves(x), 0);

/**
 * The save: a titled group is one parent, its open leaves are creates. An ordered group chains each open leaf after the
 * one before (`ref`/`after`); done leaves are not scheduled, so they are left out of the chain too.
 */
export function actionsOf(groups: Group[]): Action[] {
  const out: Action[] = [];
  let n = 0;
  const walk = (gs: Group[]) => {
    for (const g of gs) {
      // a group is not a task (parentId means split sittings): its title rides along as the leaf's note
      let prev: string | undefined;
      for (const l of g.items) {
        if (l.done) continue;
        const ref = `l${++n}`;
        const a: Action = { op: "create", title: l.title, ref, ...(g.title ? { note: g.title } : {}) };
        if (l.minutes !== undefined) { a.effortMinutes = l.minutes; if (l.sized !== "said") a.effortGuessed = true; }
        if (l.deadline !== undefined) a.deadline = new Date(l.deadline).toISOString();
        if (l.notBefore !== undefined) a.notBefore = new Date(l.notBefore).toISOString();
        if (l.start !== undefined) { a.when = new Date(l.start).toISOString(); a.fixed = "busy"; }
        if (l.kind) a.kind = l.kind as Kind;
        if (g.ordered && prev) a.after = prev;
        if (g.ordered) prev = ref;
        out.push(a);
      }
      if (g.groups) walk(g.groups);
    }
  };
  walk(groups);
  return out;
}

/**
 * The groups and leaves of a pasted outline, or undefined when fewer than three leaves are found (the sentence reader
 * takes the text then). Lines without children are leaves; a line with children is a group.
 */
export function outline(text: string, now: Date | number): { groups: Group[] } | undefined {
  const t = now instanceof Date ? now : new Date(now);
  const ref: ReaderWC = { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), h: t.getHours(), mi: t.getMinutes() };
  const lines = text.split(/\r?\n/).map(lineOf).filter((l): l is Line => !!l);
  // a plain short line over a list is a heading: "Indexing" over "- B-tree (1h)"
  lines.forEach((l, i) => {
    const next = lines[i + 1];
    if (!l.marker && !l.heading && next?.marker && next.indent >= l.indent && l.text.split(/\s+/).length <= 6 && !TIME_WORD.test(l.text) && !isProse(l))
      l.heading = true;
  });
  const roots = tree(lines);
  const top = toGroup(roots, ref, "");
  if (countLeaves(top) < 3) return undefined;
  // leaves above every heading go in an untitled first group
  const groups = top.items.length ? [{ title: "", items: top.items, ordered: top.ordered }, ...(top.groups ?? [])] : (top.groups ?? []);
  return { groups };
}
