// The rule reader: repair, segment, assemble, output. Pure and offline.
import {
  sanitizeNoteHtml,
  type ReaderItem,
  type ReaderResult,
  type ReaderSource,
  type ReaderWC,
} from "../shared";
import { fold } from "./fold";
import { PART, PART_ALIAS, PART_WORD } from "./parts";
import { hintsOf } from "./hints";
import {
  clauseItems,
  fallbackTask,
  laterToday,
  leadsFiller,
  findAnnouncementTopic,
  findCourseTitle,
  applyPrior,
  type Ctx,
  type Prior,
  firstUrl,
  resolveDate,
} from "./assemble";
import { applyDayPick, hidePick, joinFragments, type CalDay } from "./daypick";
import { applyImplied } from "./implied";
import { lengthMin, saidMin } from "./calendar";
import { joinConnectors, linkOrder, splitOrdered } from "./order";
import { CORRECTION, findMentions, mentionsOf } from "./mentions";
import { repair } from "./repair";
import { repairsOf, repairWord } from "./repairs";
import { bareTitle, segment, type Clause } from "./segment";
import { findMentions as findDates } from "./mentions";
import { sizeItems } from "./sizing";
import { isMicro, defaultMinutes } from "../size";
import { documentItems } from "./document";
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
  /** Per frame class, the multiplier of its guessed lengths, learned from what the user finished (context.ts classMults). */
  classMult?: Record<string, number>;
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

/** The piece starts a line of its own after one newline: a list line, not a paragraph break ("\n\n") or a wrapped sentence. */
function singleBreak(text: string, at: number): boolean {
  const before = text.slice(0, at);
  return before === "" || (before.endsWith("\n") && !before.endsWith("\n\n"));
}

/** A bare title of a comma list that no rule reads ("sáng sớm b-tree code", "mai báo cáo web") is still its task, with its own day and part. */
function pieceTask(text: string, ref: ReaderWC): ReaderItem | undefined {
  const dm = findDates(text).find((m) => m.kind === "date");
  const rest = dm ? `${text.slice(0, dm.start)} ${text.slice(dm.end)}` : text;
  // "à không chiều" opens a correction or a filler, not a title
  if (/^(?:a|o|u|um|uh)\b/.test(fold(text).text) || !bareTitle(rest)) return undefined;
  // a short title (3 words, its part of day aside), not a sentence with a verb of its own
  if (fold(rest).text.replace(/\b(?:sang|som|trua|chieu|toi|dem|khuya)\b/g, " ").trim().split(/\s+/).length > 3) return undefined;
  const it = fallbackTask(text.trim());
  const f = fold(text).text;
  const pm = PART_WORD.exec(f);
  const spec = pm ? PART[PART_ALIAS[pm[1]] ?? pm[1]] : undefined;
  const day = dm ? resolveDate(dm, ref) : null;
  if (day) {
    const d = `${day.wc.y}-${String(day.wc.m).padStart(2, "0")}-${String(day.wc.d).padStart(2, "0")}`;
    const end = spec ? `${String(spec.due[0]).padStart(2, "0")}:${String(spec.due[1]).padStart(2, "0")}` : "23:59";
    it.notBefore = `${d} 00:00`;
    it.deadline = `${d} ${end}`;
    if (spec) it.windows = [spec.window];
    it.inferred.push("notBefore", "deadline");
  }
  return it;
}

export function read(raw: string, opts: ReadOpts): ReaderResult {
  const rep = repair(raw, opts.source);
  const repairs = repairsOf(raw, rep).filter(
    (r) => !opts.rejected?.has(repairWord(raw, r)),
  );
  // an official notice or plan (a PDF, a scan): read by its structure; a pasted or OCR schedule: its cells as columns
  const sched =
    opts.source === "ocr" || opts.source === "paste"
      ? (documentItems(raw, opts.ref) ?? ocrSchedule(rep.text, opts.ref))
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
  // a leading date or span ("mai", "tuần sau", "năm nay") holds for the later clauses of its line; a newline resets it
  type Span = { notBefore?: string; deadline?: string; windows?: ReaderItem["windows"] };
  // the words that may stand before a lead date: "trước thứ 6 ...", "trong năm nay ...", "từ mai ...", "sáng mai ...", "tối nay ..."
  const LEAD_CUE = /^(?:(?:truoc|tu|trong|het|cuoi|den|buoi|sang|trua|chieu|toi|dem|khuya|som)\s+)*$/;
  // a clock before the lead date: "8h mai", "8h sáng mai"
  const CLOCK_LEAD = /^\d{1,2}(?:\s*[h:.]\s*\d{0,2})?\s*(?:(?:sang|trua|chieu|toi|dem|khuya)\s+)?$/;
  let carry: Span | undefined;
  let lineDay: string | undefined;
  // the items of the line so far, and whether a clause of it said a date or a clock
  let lineItems: ReaderItem[] = [];
  let lineTimed = false;
  let prev: Clause | undefined;
  for (const c of joinFragments(joinConnectors(clauses), opts.calendar)) {
    const sameLine =
      !!prev && !rep.text.slice(prev.start, c.start).includes("\n");
    if (!sameLine) {
      carry = undefined;
      lineItems = [];
      lineTimed = false;
    }
    const { parts, edges } = splitOrdered(c);
    const per = parts.map((p, k) => {
      const out = clauseItems(
        { ...p, text: hidePick(p.text, opts.calendar) },
        ctx,
      );
      dropped.push(...out.dropped);
      // a bare title of a comma list that no rule reads ("sáng sớm b-tree code") is still its task
      if (!out.items.length && (opts.source === "typed" || opts.source === "voice") && !p.label && fold(rep.text).text.search(CORRECTION) < 0 && !/^\s*(?:à|ờ|ừ|ừm|ơ)\b/i.test(parts[k + 1]?.text ?? "") && (p.piece || (rep.text.includes("\n") && singleBreak(rep.text, p.start))) && !/[:&]/.test(p.text) && fold(p.text).text.search(CORRECTION) < 0 && !/^(?:\d+[.)]|[-•*])(?:\s|$)/.test(rep.text.slice(rep.text.lastIndexOf("\n", p.start - 1) + 1, p.start).trim())) {
        const fb = pieceTask(p.text, opts.ref);
        if (fb) out.items.push(fb);
      }
      return applyDayPick(p.text, out.items, opts.calendar);
    });
    // the end of the part a task names itself, from a part word that leads its clause: "tối" 22:00, "sáng sớm" 08:00 ("sau bữa trưa" is an anchor, no part)
    const partDue = new Map<ReaderItem, string>();
    parts.forEach((p, k) => {
      const f = fold(p.text).text;
      const m = PART_WORD.exec(f.trimStart());
      // or a part that trails a task with no date of its own: "dọn phòng chiều" is this afternoon
      // "sau bữa trưa" is an anchor, no part: the word after "sau" or "bữa" is not trailing
      const trail = findMentions(p.text).some((x) => x.kind === "date" || x.kind === "time") ? null : PART_WORD.exec(f);
      const anchored = !!trail && /(?:sau|bua|buoi)\s+$/.test(f.slice(0, trail.index));
      const w = m?.index === 0 ? m[1] : anchored ? undefined : trail?.[1];
      const spec = w ? PART[PART_ALIAS[w] ?? w] : undefined;
      if (!spec) return;
      const end = `${String(spec.due[0]).padStart(2, "0")}:${String(spec.due[1]).padStart(2, "0")}`;
      // a task the reader gave no window ("sáng sớm lsm code") takes its part's window when the piece says no date or clock
      const undated = !findMentions(p.text).some((x) => x.kind === "date" || x.kind === "time");
      for (const it of per[k]) {
        if (!it.windows?.length && undated && !it.startsAt && !it.rrule && (it.type === "PLAN" || it.type === "ASSIGNMENT")) it.windows = [spec.window];
        if (it.windows?.length) partDue.set(it, end);
      }
    });
    const dayOf =(it: ReaderItem) =>
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
    // a flexible task: no fixed clock and no repeat of its own
    const flexible = (it: ReaderItem) =>
      (it.type === "PLAN" || it.type === "ASSIGNMENT") &&
      !it.startsAt &&
      !it.rrule;
    // the span replaces the default start of today a clause without a date gets
    const apply = (s: Span, it: ReaderItem, partEnd?: string) => {
      // a part the task names itself stays: "sáng mai A, tối B" gives B tomorrow evening, the lead's day with B's end
      const ownEnd = partEnd ? ` ${partEnd}` : it.windows?.length ? it.deadline?.slice(10) : undefined;
      const day = (s.notBefore ?? s.deadline)?.slice(0, 10);
      it.notBefore = s.notBefore;
      it.deadline = ownEnd && day ? day + ownEnd : s.deadline;
      it.windows = it.windows?.length ? it.windows : s.windows;
      if (s.notBefore) it.inferred.push("notBefore");
      if (s.deadline) it.inferred.push("deadline");
    };
    const dates = mentions.filter((m) => m.kind === "date");
    // "tháng này" is a span from today to the month's end; "hết tháng này" stays a deadline alone
    if (
      dates.length === 1 &&
      (c.text.includes(",") ||
        lineItems.length > 0 ||
        rep.text.slice(c.start + c.text.length).split("\n")[0].trim() !== "") &&
      /^thang\s+nay/.test(fold(c.text.slice(dates[0].start)).text)
    ) {
      const today = `${opts.ref.y}-${String(opts.ref.m).padStart(2, "0")}-${String(opts.ref.d ?? 0).padStart(2, "0")} 00:00`;
      for (const it of own)
        if (flexible(it) && it.deadline && !it.notBefore) it.notBefore = today;
    }
    if (carry && sameLine && !dates.length) {
      for (const it of own) if (flexible(it) && !it.startsAt) apply(carry, it, partDue.get(it));
    } else if (!carry && !dates.length && !lineTimed) {
      // no lead and no day: a part names today's part, as "tối nay" does, so "tối dọn phòng" is tonight
      const todayStart = `${opts.ref.y}-${String(opts.ref.m).padStart(2, "0")}-${String(opts.ref.d ?? 0).padStart(2, "0")} 00:00`;
      for (const it of own) {
        const due = partDue.get(it);
        if (due && flexible(it) && !it.startsAt && !it.deadline && (!it.notBefore || it.notBefore === todayStart))
          apply({ notBefore: todayStart, deadline: `${todayStart.slice(0, 10)} ${due}` }, it, due);
      }
    }
    // a lead date may follow a cue word: "trước thứ 6", "trong năm nay", "từ mai", "hết tháng này"
    const lead = c.text.length - c.text.trimStart().length;
    const leadDate =
      mentions[0]?.kind === "date" &&
      LEAD_CUE.test(fold(c.text.slice(lead, mentions[0].start)).text);
    if (dates.length) {
      const src = own[0];
      // "8h sáng mai A, B": B gets the day and the part, never A's clock; a part ends at its usual end
      const clockLead =
        !!src?.startsAt && (leadDate || CLOCK_LEAD.test(fold(c.text.slice(lead, dates[0].start)).text));
      const pm = /\b(sang|trua|chieu|toi|dem|khuya)\b/.exec(fold(c.text.slice(0, dates[0].start)).text)?.[1];
      const part = pm ? PART[pm] : undefined;
      if (clockLead && src?.startsAt) {
        const day = src.startsAt.slice(0, 10);
        const due = part ? `${String(part.due[0]).padStart(2, "0")}:${String(part.due[1]).padStart(2, "0")}` : "23:59";
        carry = { notBefore: `${day} 00:00`, deadline: `${day} ${due}`, windows: part ? [part.window] : undefined };
      } else
        carry =
          // a date that follows an item of its line is that item's own: "học toán, sáng mai dọn phòng, gọi mẹ" gives it to "dọn phòng" only
          leadDate && lineItems.length === 0 && src && (src.notBefore || src.deadline)
            ? { notBefore: src.notBefore, deadline: src.deadline, windows: src.windows }
            : undefined;
    }
    // a trailing date ends the line: "học toán, viết báo cáo tuần sau" gives its span to the items before it
    // a corrected day is its own slot: "lsm code, b-tree code, à không mai" gives it to the corrected item only
    const endsLine =
      dates.length === 1 &&
      fold(c.text).text.search(CORRECTION) < 0 &&
      c.text.slice(dates[0].end).trim() === "" &&
      rep.text.slice(c.start + c.text.length).split("\n")[0].trim() === "";
    if (endsLine && !leadDate && !lineTimed) {
      const src = [...own].reverse().find((it) => it.notBefore || it.deadline);
      if (src)
        for (const it of [...lineItems, ...own])
          if (flexible(it) && !it.deadline) apply(src, it);
    }
    lineItems.push(...own);
    if (mentions.some((m) => m.kind === "date" || m.kind === "time"))
      lineTimed = true;
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

  // the activity's parts of the day come before the history prior, which overrides them
  for (const it of items) applyImplied(it, opts.ref);
  for (const it of items) applyPrior(it, opts.prior);
  // the class sizes what the words did not: length, sittings, due, repeat (a said one stays)
  const sizeOpts = { ref: opts.ref, source: opts.source, calendar: opts.calendar, affinity: opts.affinity, classMult: opts.classMult };
  items = sizeItems(items, sizeOpts, new Set(links.flat()));

  // a said length keeps the 15 minute grid ("45p"); a guessed one rounds to 30, at least 30
  for (const it of items)
    if (it.durationMinutes !== undefined)
      it.durationMinutes = !it.inferred.includes("durationMinutes") ? saidMin(it.durationMinutes) : isMicro(it.cls) ? it.durationMinutes : lengthMin(it.durationMinutes);

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
    // the repaired words, so a spoken term ("đăng pốt") reads as its form in the title
    const fb = fallbackTask(rep.text.trim() ? rep.text : raw);
    applyImplied(fb, opts.ref);
    if (leadsFiller(fb.evidence) && !findDates(raw).some((m) => m.kind === "date")) laterToday(fb, opts.ref);
    // a task with no words for a length takes its class's or its kind's (size.ts), never none
    if (fb.durationMinutes === undefined) {
      fb.durationMinutes = defaultMinutes(fb.type, fb.evidence);
      fb.inferred.push("durationMinutes");
    }
    items = sizeItems(applyDayPick(raw, [fb], opts.calendar), { ref: opts.ref, source: opts.source, calendar: opts.calendar, affinity: opts.affinity, classMult: opts.classMult }, new Set());
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
