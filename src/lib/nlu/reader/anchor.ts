// Anchors: "ôn trước kỳ thi CSDL", "sau buổi Toán thứ 3", "sau khi xong báo cáo", "trước khi nộp X" name an exam, a class or a task
// the item is placed by. Pure: the names are found with find.ts over the user's tasks; one match rewrites the item, else it is flagged.
import type { Action, Task } from "../../types";
import { found, parse } from "../../find";
import { wallIso } from "../context";
import { fold, osa } from "./fold";
import { FIX } from "./fixes";

type Kind = "exam" | "class" | "task" | "busy"; // busy: a fixed block of the user's own ("sau cuộc họp", "trước buổi hẹn")
export interface Anchor {
  rel: "before" | "after";
  kind: Kind;
  /** The tasks the name matches, the earliest first; one is the anchor. */
  xs: Task[];
  /** The folded cue and name words, as the clause writes them: stripped from the title once one task is found. */
  phrase?: string;
}

// A cue is a relation word, filler, then a kind word, each read with typos ("trươc", "truóc", "tiêt", "ktra"). Folded words.
const near = (w: string, v: string) => w === v || (v.length >= 4 && osa(w, v) <= (v.length >= 8 ? 2 : 1));
const REL: [string[], Anchor["rel"]][] = [[["truoc", "trc", "before"], "before"], [["sau", "after"], "after"]];
const FILL = ["ngay", "ky", "ki", "buoi", "tiet", "khi", "mon", "lop", "cai", "the", "gio", "cuoc"];
// [words, kind, needs "khi" before it]: "nop", "xong", "lam", "hoc" alone are verbs, a kind only after "khi"
const KINDS: [string[], Kind, boolean][] = [
  [["thi"], "exam", false], [["kiem", "tra"], "exam", false], [["ktra"], "exam", false], [["exam"], "exam", false], [["test"], "exam", false], [["midterm"], "exam", false], [["final"], "exam", false], [["giua", "ky"], "exam", false], [["cuoi", "ky"], "exam", false],
  [["hop"], "busy", false], [["meeting"], "busy", false], [["hen"], "busy", false],
  [["tiet"], "class", false], [["lecture"], "class", false], [["class"], "class", false], [["lab"], "class", false], [["thuc", "hanh"], "class", false], [["hoc"], "class", true],
  [["bai", "tap"], "task", false], [["btl"], "task", false], [["do", "an"], "task", false], [["assignment"], "task", false], [["deadline"], "task", false], [["han", "nop"], "task", false], [["project"], "task", false],
  [["xong"], "task", true], [["nop"], "task", true], [["lam"], "task", true], [["submit"], "task", true], [["finish"], "task", true],
];
const LEAD_NAME = new Set(["mon", "cua", "ngay", "lop", "cai", "the", "bai"]);

/** The clause as it is finally said: after "à nhầm", "ý là" the correction replaces what it corrects. Folded words; `cue` from the part before when the correction names only the thing. */
function said(c: string): { cue: string[]; name: string[] } {
  const T = c.match(/[\p{L}\p{N}]+/gu) ?? [];
  let at = -1, len = 0;
  for (let i = 0; i < T.length; i++) for (const p of FIX) if (p.every((x, k) => T[i + k] === x) && i + p.length >= at + len) { at = i; len = p.length; }
  if (at < 0) return { cue: T, name: [] };
  const post = T.slice(at + len);
  return cueOf(post) ? { cue: post, name: [] } : { cue: T.slice(0, at), name: post };
}

type Cue = { start: number; rel: Anchor["rel"]; kind: Kind; end: number };
/** Where a cue starts in `T` and where its name begins. */
function cueOf(T: string[]): Cue | undefined {
  for (let i = 0; i < T.length; i++) {
    const rel = REL.find(([vs]) => vs.some((v) => near(T[i], v)))?.[1];
    if (!rel) continue;
    let j = i + 1, khi = false, lab: Kind | undefined;
    while (j < T.length && FILL.includes(T[j])) { if (T[j] === "khi") khi = true; if (["buoi", "tiet", "lop"].includes(T[j])) lab = "class"; j++; }
    const k = KINDS.find(([ws, , needKhi]) => (!needKhi || khi) && ws.every((w, n) => T[j + n] !== undefined && near(T[j + n], w)));
    if (k) return { start: i, rel, kind: k[1], end: j + k[0].length };
    if (lab) return { start: i, rel, kind: lab, end: j };
  }
  return undefined;
}

/** The anchor a clause names, or undefined. Its candidates are the open tasks the name finds; "thứ N" picks the Nth of several. */
export function anchorOf(clause: string, tasks: Task[], now: number): Anchor | undefined {
  const { cue: T, name: fixedName } = said(fold(clause).text);
  const m = cueOf(T);
  if (!m) return undefined;
  const { rel, kind } = m;
  const name = fixedName.length ? fixedName : T.slice(m.end);
  const lead = name.findIndex((w) => !LEAD_NAME.has(w));
  const nm = (lead < 0 ? [] : name.slice(lead)).join(" ");
  const ord = /\bthu (\d)\b/.exec(nm);
  const ws = nm.replace(/\bthu \d\b/, " ").split(" ").filter(Boolean);
  // open tasks, unscheduled ones placed at their deadline (or today) so the finder can see them
  const open = tasks.filter((x) => !x.doneAt).map((x) => (x.start === undefined ? { ...x, start: x.deadline ?? now } : x));
  const search = (q: string) => found(open, parse(q, now), now).flatMap((g) => g.xs);
  const pre = kind === "exam" ? "thi " : kind === "class" ? "tiet " : "";
  const said0 = T.slice(m.start, m.end).join(" ") + (lead > 0 ? " " + name.slice(0, lead).join(" ") : "");
  // the longest leading run of the name that finds something, then the longest trailing one ("toan lam bai tap" finds "toan"; "bai ktpm" finds "ktpm")
  for (const run of [(n: number) => ws.slice(0, n), (n: number) => ws.slice(ws.length - n)]) {
    for (let n = ws.length; n > 0; n--) {
      let xs = search(pre + run(n).join(" ")).sort((a, b) => a.start! - b.start!);
      // a lecture or exam kind keeps to those rows when the name finds both ("thi ktpm" is the exam, not the lecture)
      const kinded = xs.filter((x) => (kind === "exam" ? x.fixed === "exam" : kind === "class" ? x.fixed === "lecture" : kind === "busy" ? x.fixed === "busy" : !x.fixed));
      if (kinded.length) xs = kinded;
      if (!xs.length) continue;
      if (ord && xs.length > 1 && +ord[1] <= xs.length) xs = [xs[+ord[1] - 1]];
      return { rel, kind, xs, phrase: (said0 ? said0 + " " : "") + run(n).join(" ") };
    }
  }
  return { rel, kind, xs: [] };
}

/** The anchors of an utterance by item index: a clause's anchor goes to the one item it is about (the only item, else the most shared words). */
export function anchorsOf(text: string, titles: string[], tasks: Task[], now: number): Map<number, Anchor> {
  const out = new Map<number, Anchor>();
  for (const clause of text.split(/[,;.\n]+|\s+(?:rồi|sau đó)\s+/iu)) {
    const h = anchorOf(clause, tasks, now);
    if (!h) continue;
    const words = new Set(fold(clause).text.split(/\s+/));
    const shared = titles.map((t) => fold(t).text.split(/\s+/).filter((w) => words.has(w)).length);
    const i = titles.length === 1 ? 0 : shared.indexOf(Math.max(...shared));
    if (i >= 0 && (titles.length === 1 || shared[i] > 0) && !out.has(i)) out.set(i, h);
  }
  return out;
}

/** The title without the anchor's phrase: "làm slide sau khi xong báo cáo" is "làm slide". */
function untitled(title: string, phrase: string): string {
  const f = fold(title);
  const i = f.text.indexOf(phrase);
  if (i < 0) return title;
  const out = (title.slice(0, f.map[i]) + title.slice(f.map[i + phrase.length] ?? title.length)).replace(/\s{2,}/g, " ").trim();
  return out || title;
}

/** The action with its anchor applied: one match sets the time or the link; none or several flags "anchor-ambiguous" with the candidates. */
export function anchorAction(a: Action, h: Anchor): Action {
  if (a.fixed) return a;
  if (h.xs.length !== 1) return { ...a, flags: [...(a.flags ?? []), "anchor-ambiguous", `anchor:${h.rel}:${h.kind}`], alternatives: h.xs.map((x) => x.id) };
  const x = h.xs[0];
  if (h.phrase && a.title) a = { ...a, title: untitled(a.title, h.phrase) };
  if (h.rel === "after") {
    if (h.kind === "task") return { ...a, after: x.id };
    const notBefore = wallIso(x.end ?? x.start!);
    return { ...a, notBefore, ...(a.when && a.when < notBefore ? { when: notBefore } : {}) };
  }
  if (h.kind === "exam") return { ...a, deadline: wallIso(x.start!), anchor: x.id };
  if (h.kind === "class" || h.kind === "busy") return { ...a, deadline: wallIso(x.start!) };
  return x.deadline === undefined ? a : { ...a, deadline: wallIso(x.deadline) };
}
