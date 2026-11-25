// Anchors: "ôn trước kỳ thi CSDL", "sau buổi Toán thứ 3", "sau khi xong báo cáo", "trước khi nộp X" name an exam, a class or a task
// the item is placed by. Pure: the names are found with find.ts over the user's tasks; one match rewrites the item, else it is flagged.
import type { Action, Task } from "../../types";
import { found, parse } from "../../find";
import { wallIso } from "../context";
import { fold } from "./fold";

type Kind = "exam" | "class" | "task";
export interface Anchor {
  rel: "before" | "after";
  kind: Kind;
  /** The tasks the name matches, the earliest first; one is the anchor. */
  xs: Task[];
  /** The folded cue and name words, as the clause writes them: stripped from the title once one task is found. */
  phrase?: string;
}

// Folded cues, each with its relation and the kind of thing it names. The name is the words after the cue.
const CUES: [RegExp, Anchor["rel"], Kind][] = [
  [/\btruoc (?:ky |buoi )?thi\b\s*/, "before", "exam"],
  [/\btruoc buoi\b\s*/, "before", "class"],
  [/\btruoc khi (?:xong|nop|lam)\b\s*/, "before", "task"],
  [/\bbefore (?:the )?(?:exam|test)\b\s*/, "before", "exam"],
  [/\bbefore (?:the )?class\b\s*/, "before", "class"],
  [/\bbefore i (?:submit|finish|do)\b\s*/, "before", "task"],
  [/\bsau (?:buoi|tiet|gio)\b\s*/, "after", "class"],
  [/\bsau khi (?:hoc|hoc xong)\b\s*/, "after", "class"],
  [/\bsau khi (?:xong|nop)\b\s*/, "after", "task"],
  [/\bafter (?:the )?(?:exam|test)\b\s*/, "after", "exam"],
  [/\bafter (?:the )?class\b\s*/, "after", "class"],
];

/** The anchor a clause names, or undefined. Its candidates are the open tasks the name finds; "thứ N" picks the Nth of several. */
export function anchorOf(clause: string, tasks: Task[], now: number): Anchor | undefined {
  const c = fold(clause).text;
  for (const [re, rel, kind] of CUES) {
    const m = re.exec(c);
    if (!m) continue;
    const name = c.slice(m.index + m[0].length);
    const ord = /\bthu (\d)\b/.exec(name);
    const ws = name.replace(/\bthu \d\b/, " ").split(" ").filter(Boolean);
    // open tasks, unscheduled ones placed at their deadline (or today) so the finder can see them
    const open = tasks.filter((x) => !x.doneAt).map((x) => (x.start === undefined ? { ...x, start: x.deadline ?? now } : x));
    const search = (q: string) => found(open, parse(q, now), now).flatMap((g) => g.xs);
    const pre = kind === "exam" ? "thi " : kind === "class" ? "tiet " : "";
    // longest leading run of the name that finds something: "toan lam bai tap" finds "toan" when "lam bai tap" is the item's own words
    for (let n = ws.length; n > 0; n--) {
      let xs = search(pre + ws.slice(0, n).join(" ")).sort((a, b) => a.start! - b.start!);
      if (!xs.length) continue;
      if (ord && xs.length > 1 && +ord[1] <= xs.length) xs = [xs[+ord[1] - 1]];
      return { rel, kind, xs, phrase: c.slice(m.index, m.index + m[0].length) + ws.slice(0, n).join(" ") };
    }
    return { rel, kind, xs: [] };
  }
  return undefined;
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
  if (h.xs.length !== 1) return { ...a, flags: [...(a.flags ?? []), "anchor-ambiguous"], alternatives: h.xs.map((x) => x.id) };
  const x = h.xs[0];
  if (h.phrase && a.title) a = { ...a, title: untitled(a.title, h.phrase) };
  if (h.rel === "after") {
    if (h.kind === "task") return { ...a, after: x.id };
    const notBefore = wallIso(x.end ?? x.start!);
    return { ...a, notBefore, ...(a.when && a.when < notBefore ? { when: notBefore } : {}) };
  }
  if (h.kind === "exam") return { ...a, deadline: wallIso(x.start!), anchor: x.id };
  if (h.kind === "class") return { ...a, deadline: wallIso(x.start!) };
  return x.deadline === undefined ? a : { ...a, deadline: wallIso(x.deadline) };
}
