// The rule reader: repair, segment, assemble, output. Pure and offline.
import {
  sanitizeNoteHtml,
  type ReaderItem,
  type ReaderResult,
  type ReaderSource,
  type ReaderWC,
} from "../shared";
import { fold } from "./fold";
import { hintsOf } from "./hints";
import {
  clauseItems,
  fallbackTask,
  findAnnouncementTopic,
  findCourseTitle,
  applyPrior,
  workloadMinutes,
  type Ctx,
  type Prior,
  firstUrl,
} from "./assemble";
import { applyDayPick, hidePick, joinFragments, type CalDay } from "./daypick";
import { applyImplied } from "./implied";
import { lengthMin } from "./calendar";
import { joinConnectors, linkOrder, splitOrdered } from "./order";
import { findMentions, mentionsOf } from "./mentions";
import { repair } from "./repair";
import { repairsOf, repairWord } from "./repairs";
import { segment, type Clause } from "./segment";
import { ocrSchedule } from "./table";
/** Options of `read`. The controller maps `ReadRequest` onto it. */
export interface ReadOpts {
  ref: ReaderWC;
  source: ReaderSource;
  /** Free-text hint, e.g. "Tui tham gia co vua". */
  hint?: string;
  /** The user's habits per folded title, from earlier commits. */
  prior?: Map<string, Prior>;
  /** Folded raw words whose repair the user rejected twice: not offered again. */
  rejected?: Set<string>;
  /** Course multiplier of prep tasks (0.75 to 1.6) by folded course title. The caller reads it from the marks; the reader is pure. */
  affinity?: Map<string, number>;
  /** The user's classes and exams from today on; a timetable phrase picks days from them. */
  calendar?: CalDay[];
}

/** Words of a hint that name the person, not the section they want: "Tui tham gia co vua" reads "co vua". */
const HINT_STOP = new Set([
  "tui",
  "toi",
  "minh",
  "mik",
  "em",
  "tham",
  "gia",
  "la",
  "mot",
  "cac",
  "va",
  "dang",
  "giup",
  "nho",
  "hay",
  "xin",
]);

function hintPhrase(hint: string): string {
  return fold(hint)
    .text.split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w && !HINT_STOP.has(w))
    .join(" ");
}

/** Words that tell the reader the text lists things to prepare: a class it names is already on the timetable. */
function hasPrepCue(text: string): boolean {
  return /mang theo|nho mang|chuan bi/i.test(fold(text).text);
}

export function read(raw: string, opts: ReadOpts): ReaderResult {
  const rep = repair(raw, opts.source);
  const repairs = repairsOf(raw, rep).filter(
    (r) => !opts.rejected?.has(repairWord(raw, r)),
  );
  // a pasted or OCR schedule: its cells are read as columns, not as sentences
  const sched =
    opts.source === "ocr" || opts.source === "paste"
      ? ocrSchedule(rep.text, opts.ref)
      : undefined;
  if (sched?.length) {
    for (const it of sched)
      if (it.durationMinutes !== undefined)
        it.durationMinutes = lengthMin(it.durationMinutes);
    return {
      items: sched,
      dropped: [],
      mentions: mentionsFor(rep, raw.length),
      repairs,
      hints: hintsOf(raw, { ref: opts.ref, repairs }),
    };
  }
  const clauses: Clause[] = segment(rep.text);

  // place lines name the place of their section
  const sectionPlace = new Map<number, string>();
  for (const c of clauses) {
    if (c.label !== "place") continue;
    // a bare room line, "A24.1 + A24Lau", is the place itself
    const pm = findMentions(c.text).find((m) => m.kind === "place");
    sectionPlace.set(
      c.section ?? -1,
      pm && pm.v.k === "place" ? pm.v.text : c.text.replace(/\.$/, "").trim(),
    );
  }

  // numbered sections: a hint picks one, else every section is a menu item to confirm
  const hint = opts.hint ?? clauses.find((c) => c.hint)?.text ?? "";
  const phrase = hintPhrase(hint);
  const sections = new Set(
    clauses.map((c) => c.section).filter((n): n is number => n !== undefined),
  );
  const numbered = sections.size >= 2;
  const picked = new Set<number>();
  if (phrase && numbered) {
    for (const c of clauses) {
      if (
        c.section !== undefined &&
        c.sectionTitle &&
        fold(c.sectionTitle).text.includes(phrase)
      )
        picked.add(c.section);
    }
  }
  const prepCue =
    (opts.source === "paste" || opts.source === "ocr") && hasPrepCue(rep.text);

  // note-like clauses per section or global
  const sectionNote = new Map<number, string>();
  const noteClausesBySection = new Map<number, string[]>();
  for (const c of clauses) {
    if (c.hint) continue;
    const f = fold(c.text).text;
    if (/^(chao|than gui|kinh gui|chuc|neu co ai can hoi)\b/i.test(f)) continue;
    const isNote =
      c.label === "content" ||
      /\b(mang theo|nho mang|chuan bi|luu y|chu y|can mang|dem theo)\b/i.test(
        f,
      ) ||
      (prepCue &&
        !findMentions(c.text).some(
          (m) => m.kind === "date" || m.kind === "time",
        ));
    if (isNote) {
      const sec = c.section ?? -1;
      const list = noteClausesBySection.get(sec) ?? [];
      list.push(c.text);
      noteClausesBySection.set(sec, list);
    }
  }
  for (const [sec, list] of noteClausesBySection) {
    const rawNote = list.join("\n");
    const sanitized = sanitizeNoteHtml(rawNote);
    if (sanitized) sectionNote.set(sec, sanitized);
  }

  const docTopic = findAnnouncementTopic(clauses);
  const courseTitle = findCourseTitle(clauses);
  const meetingUrl = firstUrl(rep.text);

  const ctx: Ctx = {
    prepCue,
    calendar: opts.calendar,
    taken: [],
    affinity: opts.affinity,
    fullText: rep.text,
    ref: opts.ref,
    source: opts.source,
    sectionPlace,
    sectionNote,
    docTopic,
    courseTitle,
    meetingUrl,
    clauses,
    gate: (c) => {
      if (!numbered || c.section === undefined) return "keep";
      if (picked.size) return picked.has(c.section) ? "keep" : "not_mine";
      return "menu";
    },
  };

  let items: ReaderItem[] = [];
  const dropped: ReaderResult["dropped"] = [];
  const links: [ReaderItem, ReaderItem][] = [];
  // a phrase that sets a start or a day pick joins its task clause, even across a comma
  // a leading day ("mai") holds for the later clauses of its line; a newline resets it
  let carry: string | undefined;
  let lineDay: string | undefined;
  let prev: Clause | undefined;
  for (const c of joinFragments(joinConnectors(clauses), opts.calendar)) {
    const sameLine =
      !!prev && !rep.text.slice(prev.start, c.start).includes("\n");
    if (!sameLine) carry = undefined;
    const { parts, edges } = splitOrdered(c);
    const per = parts.map((p) => {
      const out = clauseItems(
        { ...p, text: hidePick(p.text, opts.calendar) },
        ctx,
      );
      dropped.push(...out.dropped);
      return applyDayPick(p.text, out.items, opts.calendar);
    });
    const dayOf = (it: ReaderItem) =>
      (it.deadline ?? it.startsAt ?? it.notBefore)?.slice(0, 10);
    const own = per.flat();
    const mentions = findMentions(c.text);
    // "họp mai 8h rồi 4h chiều đi khám": said in one line, a later clock with no day of its own is on the day named before it
    const dated = mentions.some((m) => m.kind === "date" || m.kind === "recur");
    if (!sameLine) lineDay = undefined;
    if (lineDay && !dated && opts.source !== "paste" && opts.source !== "ocr")
      for (const it of own)
        if (it.startsAt && !it.rrule) {
          it.startsAt = lineDay + it.startsAt.slice(10);
          if (it.days?.length) it.days = [lineDay];
        }
    if (dated) lineDay = own.length ? dayOf(own[own.length - 1]) : undefined;
    if (carry && sameLine && !mentions.some((m) => m.kind === "date"))
      for (const it of own)
        if (
          (it.type === "PLAN" || it.type === "ASSIGNMENT") &&
          !it.deadline &&
          !it.startsAt
        ) {
          it.deadline = `${carry} 23:59`;
          it.notBefore = `${carry} 00:00`;
          it.inferred.push("deadline");
        }
    const lead = c.text.length - c.text.trimStart().length;
    if (mentions.some((m) => m.kind === "date"))
      carry =
        mentions[0].kind === "date" && mentions[0].start === lead && own[0]
          ? dayOf(own[0])
          : undefined;
    prev = c;
    for (const its of per) items = items.concat(its);
    for (const [i, j] of edges) {
      const flex = (xs: ReaderItem[]) =>
        xs.filter((x) => x.type === "PLAN" || x.type === "ASSIGNMENT");
      const pre = flex(per[i]).at(-1);
      if (pre) for (const succ of flex(per[j])) links.push([pre, succ]);
    }
  }

  // a link is a place or a source, never part of the title
  for (const it of items)
    it.title =
      it.title
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\s{2,}/g, " ")
        .trim() || it.title;

  // the activity's length and parts of the day come before the history prior, which overrides them
  for (const it of items)
    applyImplied(
      it,
      opts.ref,
      workloadMinutes(it.type, `${it.evidence} ${it.title}`) !== undefined,
    );
  for (const it of items) applyPrior(it, opts.prior);

  // a length rounds to the 30 minute grid, at least 30, whatever was typed
  for (const it of items)
    if (it.durationMinutes !== undefined)
      it.durationMinutes = lengthMin(it.durationMinutes);

  // S7: one item per type, title, time and place
  const seen = new Set<string>();
  items = items
    .filter((it) => {
      const key = `${it.type}|${fold(it.title).text}|${it.startsAt ?? ""}|${it.deadline ?? ""}|${it.location ?? ""}|${it.planKey ?? ""}|${it.windows?.join() ?? ""}|${it.days?.join() ?? ""}|${it.notBefore ?? ""}|${JSON.stringify(it.clocks ?? [])}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      (a.startsAt ?? a.deadline ?? "").localeCompare(
        b.startsAt ?? b.deadline ?? "",
      ),
    );
  linkOrder(items, links);

  // text that makes no item still makes one flexible task, unless it is blank
  if (!items.length && raw.trim()) {
    const fb = fallbackTask(raw);
    applyImplied(
      fb,
      opts.ref,
      workloadMinutes(fb.type, fb.evidence) !== undefined,
    );
    items = applyDayPick(raw, [fb], opts.calendar);
  }

  // a bare deadline label is no title: name the task by the list due with it
  const listed = [
    ...raw.matchAll(/^\s*(?:\d{1,2}[.)]|[-•*+])\s+(.+?)\.?\s*$/gm),
  ].map((m) => m[1].replace(/\s{2,}/g, " ").trim());
  for (const it of items) {
    const f = fold(it.title).text;
    if (!/^(han nop|han chot|han|thoi han|deadline)$/.test(f)) continue;
    if (listed.length)
      it.title = `Nộp ${listed[0]}${listed.length > 1 ? ` và ${listed.length - 1} mục khác` : ""}`;
    else if (f === "han nop") it.title = "Nộp bài";
  }

  // a pasted text keeps all its words: with no note of its own, the text is the note
  // (the input box sends a paste as "typed"; a short line needs no note repeating it,
  // nor does a jotted list: each task's words are its own title, the rest is only the other tasks)
  const lines = raw.trim().includes("\n");
  if (
    ((opts.source === "paste" || opts.source === "ocr") && (items.length === 1 || lines)) ||
    (opts.source === "typed" && items.length === 1 && (lines || raw.length > 120))
  )
    for (const it of items) it.note ||= sanitizeNoteHtml(raw) || null;

  return {
    items,
    dropped,
    mentions: mentionsFor(rep, raw.length),
    repairs,
    hints: hintsOf(raw, { ref: opts.ref, repairs }),
  };
}

/** Mention offsets back to the raw input. The end is where the next char starts in raw: repair maps every char of a token it
 *  touched ("8g00", "27/11") to the token's first raw char, so `map[end - 1] + 1` would cut the span after one char. */
function mentionsFor(
  rep: { text: string; map: number[] },
  rawLen: number,
): ReaderResult["mentions"] {
  return mentionsOf(rep.text).map((m) => ({
    kind: m.kind,
    start: rep.map[m.start],
    end: m.end < rep.map.length ? rep.map[m.end] : rawLen,
  }));
}

/** Reads per voice input: the main transcript and up to four alternatives. */
export const MAX_READS = 5;

/** A read's score: resolved date, time and duration mentions, minus the digits no mention read. */
export function readScore(raw: string, res: ReaderResult): number {
  const covered = new Uint8Array(raw.length);
  for (const m of res.mentions) covered.fill(1, m.start, m.end);
  let unread = 0;
  for (let i = 0; i < raw.length; i++)
    if (!covered[i] && raw[i] >= "0" && raw[i] <= "9") unread++;
  // a bare "tết" with no holiday word beside it is a word, not a holiday: 3 points each
  let stray = 0;
  const f = fold(raw);
  for (const m of f.text.matchAll(/(?<![a-z])tet(?![a-z])/g))
    if (!covered[f.map[m.index ?? 0]]) stray += 3;
  return (
    res.mentions.filter((m) => m.kind === "date" || m.kind === "time").length -
    unread -
    stray
  );
}

/** The day an item is on, for comparing two reads. */
const dayOfItem = (it?: ReaderItem) =>
  (it?.startsAt ?? it?.deadline ?? it?.notBefore)?.slice(0, 10);

/**
 * Reads each transcript and keeps the best-scored read. Ties keep the earlier one, so the main text wins.
 * The main text is what the user saw on screen: another hearing may add what it missed (a clock, a day it had none of),
 * never move the day it read.
 */
export function readBest(texts: string[], opts: ReadOpts): ReaderResult {
  let best: ReaderResult | undefined;
  let bestScore = -Infinity;
  // other transcripts exist only for speech: a typed text is read alone
  const reads =
    opts.source === "voice" ? texts.slice(0, MAX_READS) : texts.slice(0, 1);
  let mainDays: string[] | undefined;
  for (const text of reads) {
    const res = read(text, opts);
    const score = readScore(text, res);
    const days = res.items.map(dayOfItem).filter((d): d is string => !!d).sort();
    if (!best) mainDays = days;
    else if (mainDays?.length && days.join() !== mainDays.join()) continue;
    if (score > bestScore) {
      best = res;
      bestScore = score;
    }
  }
  if (!best) throw new Error("readBest needs at least one transcript");
  return best;
}
