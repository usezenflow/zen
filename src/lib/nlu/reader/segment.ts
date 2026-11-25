// S1 segment: lines, numbered sections, field labels, hint lines and sentence clauses.
// Offsets are into the repaired text.
import { fold } from "./fold";
import { findMentions } from "./mentions";
import { PART_WORD } from "./parts";
import { andCuts } from "./order";

/** Folded words that carry no task: time cues and courtesy. */
const TIME_CUE_WORDS = /(?<![a-z])(?:truoc|trc|han|han chot|luc|vao|den|toi|tu|het|trong|sau|cham nhat|muon nhat|deadline|dl|khoang|tam|ngay|nhe|nha|nhe|giup|minh|voi|di|la|thi|nhu|moi|buoi|lan)(?![a-z])/g;
const VALUE_KINDS = new Set(["date", "time", "dur"]);

/**
 * "nộp báo cáo, trước thứ 6", "mai, mua sữa", "họp nhóm, 9h sáng mai, 2 tiếng": a comma piece of time words only is no item;
 * its cut goes, so it joins the piece before it (else after), when that piece has no value of the same kind
 * ("họp 9h, 14h" stays two meetings).
 */
/** The date, clock and length kinds a piece holds. */
export const valueKinds = (t: string) => new Set(findMentions(t).filter((m) => VALUE_KINDS.has(m.kind)).map((m) => m.kind));
/** A piece of time words only: a date, clock or length and nothing that names a task ("trước thứ 6", "9h sáng mai"). */
export function timeOnly(t: string): boolean {
  const ms = findMentions(t).filter((m) => m.kind !== "place");
  // a length alone has its own comma rule ("Học bài, 90 phút" sizes the task): only a date or a clock is a piece's time
  if (!ms.some((m) => m.kind === "date" || m.kind === "time")) return false;
  let rest = t;
  for (const m of [...ms].sort((a, b) => b.start - a.start)) rest = rest.slice(0, m.start) + " " + rest.slice(m.end);
  return !/[a-z]/.test(fold(rest).text.replace(TIME_CUE_WORDS, " "));
}

function mergeTimeOnly(rawLn: string, cuts: { at: number; next: number; comma?: boolean }[]) {
  const kinds = valueKinds;
  const bare = timeOnly;
  for (let changed = true; changed && cuts.length; ) {
    changed = false;
    const starts = [0, ...cuts.map((c) => c.next)];
    const ends = [...cuts.map((c) => c.at), rawLn.length];
    for (let i = 0; i < starts.length && !changed; i++) {
      const seg = rawLn.slice(starts[i], ends[i]);
      if (!bare(seg)) continue;
      const mine = kinds(seg);
      const fits = (k: number) => k >= 0 && k < starts.length && ![...kinds(rawLn.slice(starts[k], ends[k]))].some((x) => mine.has(x));
      if (i > 0 && cuts[i - 1].comma && fits(i - 1)) cuts.splice(i - 1, 1);
      else if (i < cuts.length && cuts[i].comma && fits(i + 1)) cuts.splice(i, 1);
      else continue;
      changed = true;
    }
  }
}

export type LabelKind = "time" | "place" | "content";

export interface Clause {
  text: string;
  /** Offset of the clause in the repaired text. */
  start: number;
  /** Number of the numbered section the clause sits in, e.g. 3 for "3. Môn Cờ vua". */
  section?: number;
  sectionTitle?: string;
  /** The first or last line, starting like a first-person request. */
  hint: boolean;
  label?: LabelKind;
  /** The label as written, e.g. "Lịch thi", for the title and the type. */
  labelWord?: string;
  /** A timetable row, "Thứ 2 7:30-9:30 Toán rời rạc A2.101": a weekly class. */
  timetable?: boolean;
  /** A piece of a comma list ("b-tree code, lsm code"): a bare title of 2+ words is an item of its own. */
  piece?: boolean;
}

const TIMETABLE =
  /^(?:thu [2-7]|t[2-7]|cn|chu nhat)\s+(?:luc\s+)?\d{1,2}[:h]\d{2}\s*-\s*\d{1,2}[:h]\d{2}\b/;
const GREETING_OR_SIGNOFF =
  /^(?:kinh gui|than gui|chao|tran trong|than ai|cam on|ts\.|th\.?s\.|pgs\.|gs\.|bs\.|tp\.)/;

/** A short line with no bullet, number, colon or end mark, a list item when its neighbours are too. */
function plainShort(t: string): boolean {
  return (
    t.length <= 40 &&
    !HEADER_NUM.test(t) &&
    !/^[-+*•▪●○]\s/.test(t) &&
    !/[.!?;:]$/.test(t) &&
    !t.includes(":") &&
    !GREETING_OR_SIGNOFF.test(fold(t).text)
  );
}

const MODIFIER_OPEN =
  // a clause with a subject or a date: "các bạn sẽ làm ..." completes the item before it
  /^(?:keo dai|ngay|thu|luc|vao|hom|tai|o|phong|dia diem|tap trung|co mat|den|toi|sang|chieu|trua|dem|a khong|a quen|khong phai|ma la|y la|sua lai|nham|cn|chu nhat|t[2-7]|cac ban|cac em|ban|em|minh|tui|thay|co|anh|chi)(?![a-z])/;

const PART_ONLY = /^(?:sang|trua|chieu|toi|dem)$/;
const DATE_WORD = /^(?:nay|mai|hom|qua|kia|ngay|thu|tuan|thang|nam|cuoi|sau|nua|khuya)(?![a-z])/;

/** A part of day that opens a task: "tối dọn phòng" yes, "tối nay" and "tối 8h" no. */
export function partLeads(text: string): boolean {
  const t = text.trim();
  // "sáng sớm" is one part of the day: its rest starts after both words
  const words = t.split(/\s+/);
  const rest = words.slice(fold(words.slice(0, 2).join(" ")).text === "sang som" ? 2 : 1).join(" ");
  const fr = fold(rest).text;
  return (
    /^(?:sang|trua|chieu|toi|dem)\s/.test(fold(t).text) &&
    rest !== "" &&
    !/^\d/.test(fr) &&
    !DATE_WORD.test(fr) &&
    !findMentions(rest).some((m) => m.start === 0)
  );
}

/** A date or clock, after at most part words, that is followed by a task: "sáng mai dọn phòng", "9h họp nhóm". "sáng mai" alone is no task. */
/** A bare title with its time at the end of the piece: "lsm code 9h", "lsm code chiều". No figure, brackets or colon in it. */
function titleThenTime(after: string): boolean {
  const piece = after.split(/[,;]/)[0];
  if (/[():]/.test(piece)) return false;
  const m = findMentions(piece).find((x) => x.kind === "date" || x.kind === "time");
  const f = fold(piece);
  const pm = PART_WORD.exec(f.text);
  const endsTimed = (!!m && piece.slice(m.end).trim() === "") || (!!pm && f.text.slice(pm.index + pm[0].length).trim() === "");
  if (!endsTimed) return false;
  const at = Math.min(m ? m.start : Infinity, pm ? f.map[pm.index] ?? Infinity : Infinity);
  if (at === Infinity || at === 0) return false;
  const head = fold(piece.slice(0, at)).text.trim().replace(/\s+(?:luc|vao)$/, "");
  return head.split(/\s+/).length >= 2 && !MODIFIER_OPEN.test(head);
}

export function opensDatedTask(text: string): boolean {
  const m = findMentions(text).find(
    (x) => (x.kind === "date" || x.kind === "time") && /^(?:(?:sang|trua|chieu|toi|dem|khuya|som|luc|vao)\s+)*$/.test(fold(text.slice(0, x.start)).text),
  );
  return !!m && /^\p{L}/u.test(text.slice(m.end).trimStart());
}

/** A piece of a comma list that is a bare title: 2+ words, no clock or date, no modifier ("ở thư viện" is not one). */
export function bareTitle(piece: string): boolean {
  const t = piece.trim();
  const f = fold(t).text;
  return (
    f.split(/\s+/).length >= 2 &&
    !findMentions(t).length &&
    (!MODIFIER_OPEN.test(f) || partLeads(t))
  );
}

const HEADER_NUM = /^(\d{1,2})[.)]\s+(.+)$/;
const BULLET = /^([-+*•▪●○]|\d+[.)](?=\s)|[a-z][.)](?=\s))\s*/;

const FOLDED_LABEL_WORDS = [
  "thoi gian tap trung",
  "thoi gian thuc hien",
  "thoi gian",
  "thoi han",
  "ngay thi dau",
  "lich thi",
  "lich",
  "han nop",
  "han chot",
  "han",
  "dia diem",
  "noi dung",
  "ghi chu",
  "phong",
  "deadline",
  "ngay",
];

const FOLDED_LABEL_RE = new RegExp(
  `^(?:${FOLDED_LABEL_WORDS.join("|")})\\s*:\\s*`,
  "i",
);

// "Từ ngày: 20/11 - Đến ngày: 22/11" is one range: its "ngày" after từ or đến is no label
const INLINE_LABEL_RE = new RegExp(
  `(?<=\\s|^)(?<!\\b(?:tu|den) )(?:${FOLDED_LABEL_WORDS.join("|")})\\s*:`,
  "gi",
);

function matchLabelPrefix(
  piece: string,
): { labelWord: string; body: string; length: number } | null {
  const f = fold(piece);
  const m = f.text.match(FOLDED_LABEL_RE);
  if (!m) return null;
  const matchLen = m[0].length;
  const colonIdx = m[0].indexOf(":");
  const rawBodyStart = f.map[matchLen - 1] + 1;
  const rawWordEnd = f.map[colonIdx];
  const labelWord = piece.slice(0, rawWordEnd).trim();
  const body = piece.slice(rawBodyStart);
  return { labelWord, body, length: rawBodyStart };
}

function splitInlineLabels(line: string): { piece: string; start: number }[] {
  const f = fold(line);
  const matches = [...f.text.matchAll(INLINE_LABEL_RE)];
  if (matches.length <= 1 && (!matches.length || matches[0].index === 0)) {
    return [{ piece: line, start: 0 }];
  }
  const cuts: number[] = [0];
  for (const m of matches) {
    const idx = m.index ?? 0;
    if (idx > 0) cuts.push(f.map[idx]);
  }
  cuts.push(line.length);
  const out: { piece: string; start: number }[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const s = cuts[i];
    const e = cuts[i + 1];
    const piece = line.slice(s, e);
    out.push({ piece, start: s });
  }
  return out;
}

function labelOf(word: string): LabelKind {
  const w = fold(word).text;
  if (/^(dia diem|phong)/.test(w)) return "place";
  if (/^(noi dung|ghi chu)/.test(w)) return "content";
  return "time";
}

/** Splits into clauses. A clause is one sentence, or one field line, under the section it sits in. */
export function segment(text: string): Clause[] {
  const lines: { text: string; start: number; piece: boolean }[] = [];
  const rawLines = text.split("\n");
  let pos = 0;
  for (const rawLn of rawLines) {
    // a piece ends at `at` and the next one starts at `next`; a separator is dropped
    const cuts: { at: number; next: number; comma?: boolean }[] = [];
    for (const sm of rawLn.matchAll(
      /(?<=[.:;!?]|\s-\s)\s+(?=\d{1,2}[.)]\s+[^\d])/g,
    )) {
      if (sm.index != null)
        cuts.push({
          at: sm.index + sm[0].length,
          next: sm.index + sm[0].length,
        });
    }
    // an item separator cuts when the item before holds a mention and the next starts with a word
    for (const sm of rawLn.matchAll(/[,;.!?](?=\s)/g)) {
      const i = sm.index ?? 0;
      // the comma of a street address ("Lê Lợi, P. Bến Nghé") stays in its place
      if (
        findMentions(rawLn).some(
          (m) => m.kind === "place" && i >= m.start && i < m.end,
        )
      )
        continue;
      const after = rawLn.slice(i + 1).trimStart();
      if (!(/^\p{L}/u.test(after) || opensDatedTask(after)) || after.split(/\s+/).length < 2) continue;
      // a ";" after a title of 2+ words is a list of titles too: "b-tree code ; lsm code"
      const listSemi = rawLn[i] === ";" && fold(rawLn.slice(0, i)).text.trim().split(/\s+/).length >= 2;
      // a bare title before the comma ("học toán") is its own item when the piece after opens a task: "sáng mai dọn phòng"; a task that opens with a part ("sáng sớm dọn phòng") is one too
      const before = rawLn.slice(0, i);
      // "họp nhóm chín giờ, à quên, mười giờ sáng mai": the correction's comma keeps its item and its fix together
      if (/\ba\d? (?:quen|khong)$/.test(fold(before).text.trim())) continue;
      const tail = before.split(/[,;]\s*/).pop() ?? before;
      // a bare title has no figure: "mục tiêu 8 trang, tuần này phải xong" is one task, its "tuần này" a due
      const titleBefore = !findMentions(before).length && !/\d+\s*(?:trang|tieng|phut|gio|km|buoi|cau)\b/.test(fold(tail).text) && fold(tail).text.trim().split(/\s+/).length >= 2;
      // "ôn bài sáng, trưa hoặc tối mai": a piece that ends in a part word keeps the list's part, so it takes no task
      // "ôn bài sáng, trưa hoặc tối mai": a tail that ends in a part keeps the list's part, so only a bare title after it is a task
      const tailPart = /\b(?:sang|trua|chieu|toi|dem|khuya|som)$/.test(fold(tail).text.trim());
      const piece = after.split(/[,;]/)[0];
      const taskLead = titleBefore && (tailPart
        ? bareTitle(piece)
        : partLeads(after) || opensDatedTask(after) || partLeads(tail) || titleThenTime(after));
      if (!findMentions(rawLn.slice(0, i)).length && !listSemi && !taskLead) continue;
      // a date, clock, place or correction after the comma completes the item before it; a part word that opens a task ("tối dọn phòng") is an item of its own
      const opener = fold(after).text;
      const partTask = partLeads(after) || taskLead;
      if (
        !partTask &&
        (MODIFIER_OPEN.test(opener) || MODIFIER_OPEN.test(opener.replace(/\d/g, "")))
      )
        continue;
      if (!partTask && findMentions(after).some((m) => m.start === 0)) continue;
      // a piece of a labelled field ("Địa điểm: A, B") is the field's, not a title of its own
      const labelled = fold(rawLn.slice(0, i)).text.search(INLINE_LABEL_RE) >= 0;
      cuts.push({ at: i, next: i + 1, comma: !labelled && rawLn[i] !== "." && rawLn[i] !== "!" && rawLn[i] !== "?" });
    }
    // "học toán và đọc sách": an "và" join between tasks cuts like a comma
    for (const j of andCuts(rawLn)) cuts.push({ at: j.at, next: j.end });
    cuts.sort((a, b) => a.at - b.at);
    mergeTimeOnly(rawLn, cuts);
    const starts = [0, ...cuts.map((c) => c.next)];
    const ends = [...cuts.map((c) => c.at), rawLn.length];
    for (let i = 0; i < starts.length; i++) {
      const segText = rawLn.slice(starts[i], ends[i]);
      // a piece beside a comma cut is an item of its own when it is a bare title
      const piece = !!(cuts[i]?.comma || (i > 0 && cuts[i - 1].comma));
      lines.push({ text: segText, start: pos + starts[i], piece });
    }
    pos += rawLn.length + 1;
  }
  const nonEmpty = lines.filter((l) => l.text.trim());
  const firstLine = nonEmpty[0];
  const lastLine = nonEmpty[nonEmpty.length - 1];
  const out: Clause[] = [];
  let section: number | undefined;
  let sectionTitle: string | undefined;
  let pending: LabelKind | undefined;

  // list items: runs of numbered lines and runs of short plain lines, so "1. Mua quà" is a task, not a section
  const listed = new Set<object>();
  nonEmpty.forEach((l, i) => {
    const near = (j: number) =>
      j >= 0 && j < nonEmpty.length && HEADER_NUM.test(nonEmpty[j].text.trim());
    // a "1." after a plain intro line opens a list, even when it is the only numbered line; a section whose next line is a field (Ngày, Thời gian) stays a section
    const opensList = /^1[.)]\s/.test(l.text.trim()) && i > 0 && !HEADER_NUM.test(nonEmpty[i - 1].text.trim()) && !matchLabelPrefix(nonEmpty[i + 1]?.text.trim() ?? "");
    if (HEADER_NUM.test(l.text.trim()) && (near(i - 1) || near(i + 1) || opensList))
      listed.add(l);
  });
  // a run whose lines are all bare titles is a list of titles, one per line: "b-tree code" / "lsm code"
  const titleRun = new Set<object>();
  let run: { text: string }[] = [];
  for (const l of [...lines, { text: "" }]) {
    const t = l.text.trim();
    if (t && plainShort(t)) run.push(l);
    else {
      if (run.length >= 2) for (const r of run) listed.add(r);
      if (run.length >= 2 && run.every((r) => bareTitle(r.text))) for (const r of run) titleRun.add(r);
      run = [];
    }
  }

  // a listed numbered line that is a bare title is a list item of its own: "3. chữa đề"; under a label ("Hạn nộp: …") the list is that label's run
  const labelled = nonEmpty.some((x) => matchLabelPrefix(x.text.trim()));
  for (const l of nonEmpty)
    if (!labelled && listed.has(l) && bareTitle(l.text.trim().replace(HEADER_NUM, "$2"))) titleRun.add(l);

  for (const line of lines) {
    let trimmed = line.text.trim();
    if (!trimmed) continue;
    const lead = line.text.search(/\S/);
    const lineStart = line.start + lead;

    const header = listed.has(line) ? null : trimmed.match(HEADER_NUM);
    if (header) {
      const fHeader = fold(header[2]).text;
      const isContent = /noi dung thi dau/.test(fHeader);
      const firstLabelIdx = fHeader.search(INLINE_LABEL_RE);
      const hasInlineLabel = firstLabelIdx >= 0;

      // a numbered line that names a submission, deadline or date is an item, not a section heading
      const actionable =
        /\b(nop|gui|truoc|han|deadline|thu [2-7]|mai|nay|\d{1,2}\/\d{1,2}|\d{1,2}h\d*)\b/.test(
          fHeader,
        );
      if (
        !isContent &&
        !actionable &&
        !/[.!?;]$/.test(trimmed) &&
        !hasInlineLabel
      ) {
        section = Number(header[1]);
        sectionTitle = header[2].trim();
        continue;
      }
      if (hasInlineLabel && !isContent) {
        section = Number(header[1]);
        if (firstLabelIdx > 0) {
          const f2 = fold(header[2]);
          sectionTitle = header[2].slice(0, f2.map[firstLabelIdx]).trim();
          trimmed = header[2].slice(f2.map[firstLabelIdx]).trim();
        }
      }
    }
    const letters = [...trimmed].filter((c) => /\p{L}/u.test(c));
    const capsRatio = letters.length
      ? letters.filter((c) => /\p{Lu}/u.test(c)).length / letters.length
      : 0;
    // an all-caps line is a heading of a document, not the whole of a one-line input
    if (
      rawLines.length > 1 &&
      letters.length >= 3 &&
      capsRatio >= 0.7 &&
      !/\d/.test(trimmed)
    ) {
      sectionTitle = trimmed;
      section = undefined;
      continue;
    }

    // the bullet is a prefix, so body0 is the end of the trimmed line
    const body0 = trimmed.replace(BULLET, "");
    const bodyStart = lineStart + (trimmed.length - body0.length);
    const lm = matchLabelPrefix(body0);
    const isTransitionHeading =
      /(?:chuyen\s+sang|truc\s+tuyen|online|hoc\s+bu|day\s+bu|buoi\s+hoc|lich\s+hoc)/i.test(
        fold(body0).text,
      );
    const hasScheduleCues =
      /\d|\bluc\b|\bgio\b|\btiet\b|\bngay\b|\bthu\s*(?:hai|ba|tu|nam|sau|bay|[2-7])\b/i.test(
        fold(body0).text,
      );
    if (
      (/:$/.test(body0) || (isTransitionHeading && !hasScheduleCues)) &&
      body0.length < 60 &&
      !lm
    ) {
      if (isTransitionHeading) {
        sectionTitle = body0.replace(/:$/, "").trim();
        section = undefined;
      } else {
        // a heading such as "Kính gửi:" or "Lịch thi đấu:"
        continue;
      }
    }
    if (lm && lm.length === body0.length) {
      pending = labelOf(lm.labelWord);
      continue;
    }

    const hint =
      (line === firstLine || line === lastLine) &&
      trimmed.length <= 80 &&
      /^(toi|tui|minh|mik|giup toi|giup minh|nho|em)\b/.test(
        fold(trimmed).text,
      );

    // a line may carry several field labels: "Thời gian: 13g00 Địa điểm: A24.1"
    const pieces = splitInlineLabels(body0);
    for (const p of pieces) {
      const piece = p.piece;
      const pieceStart = bodyStart + p.start;
      let label: LabelKind | undefined = pending;
      let labelWord: string | undefined;
      let body = piece;
      let bodyAt = pieceStart;
      const pm = matchLabelPrefix(piece);
      if (pm) {
        label = labelOf(pm.labelWord);
        labelWord = pm.labelWord;
        body = pm.body;
        bodyAt = pieceStart + pm.length;
      }
      pending = undefined;
      if (!body.trim()) continue;
      // sentence cut points: a . ! ? ; followed by a space or the end, but not the "P." or "Q." of an address
      let from = 0;
      const cuts: number[] = [];
      for (const c of body.matchAll(
        /(?<!(?<!\p{L})(?:[PQ]|TP)|(?<!\p{L})(?:p|q|tp))[.!?;]+(?=\s|$)/gu,
      ))
        cuts.push((c.index ?? 0) + c[0].length);
      cuts.push(body.length);
      for (const cut of cuts) {
        const seg = body.slice(from, cut);
        const lead2 = seg.search(/\S/);
        if (seg.trim()) {
          out.push({
            text: seg.trim(),
            start: bodyAt + from + lead2,
            section,
            sectionTitle,
            hint,
            label,
            labelWord,
            timetable: TIMETABLE.test(fold(body0).text),
            // a run of short plain lines is a list of titles, one per line
            piece: line.piece || titleRun.has(line),
          });
        }
        from = cut;
        label = undefined;
        labelWord = undefined;
      }
    }
  }
  return splitTrailing(out, text);
}

/**
 * "học toán, viết báo cáo, đi khám tuần sau": a date that ends its line and is the only date of its clause
 * takes the tasks before its comma as a clause of their own, so they can take its span.
 */
function splitTrailing(list: Clause[], text: string): Clause[] {
  return list.flatMap((c) => {
    const ms = findMentions(c.text);
    const dates = ms.filter((m) => m.kind === "date");
    // a part of day alone ("tối nay") is no clock: the trailing date may carry it
    if (dates.length !== 1 || ms.some((m) => m.kind === "time" && !PART_ONLY.test(fold(c.text.slice(m.start, m.end)).text))) return [c];
    const d = dates[0];
    if (c.text.slice(d.end).trim() !== "") return [c];
    // the date ends its piece when the line goes on after a comma: "b-tree code, lsm code mai, code api login"
    const rest = text.slice(c.start + c.text.length).split("\n")[0].trim();
    if (rest !== "" && !rest.startsWith(",")) return [c];
    const cut = c.text.lastIndexOf(",", d.start);
    // the tasks before the comma need words of their own: "ôn bài sáng, tối mai" and "nộp báo cáo, thứ sáu" stay one clause
    if (cut <= 0 || c.text.slice(cut + 1, d.start).trim() === "") return [c];
    // a part of day alone before the date is its modifier: "học toán, sáng mai" is one task
    if (PART_ONLY.test(fold(c.text.slice(cut + 1, d.start).trim()).text)) return [c];
    // "nộp báo cáo, trước thứ 6": a piece of time words only is the due of the task before it
    if (timeOnly(c.text.slice(cut + 1))) return [c];
    if (fold(c.text.slice(0, cut)).text.split(/\s+/).length < 2) return [c];
    if (findMentions(c.text.slice(0, cut)).length) return [c];
    // a part of day in the tasks before the comma is theirs: "ôn bài sáng, tối mai" keeps its part on "ôn bài"
    if (/\b(sang|trua|chieu|toi|dem|morning|noon|afternoon|evening|night)\b/.test(fold(c.text.slice(0, cut)).text)) return [c];
    return [
      { ...c, text: c.text.slice(0, cut), piece: true },
      { ...c, text: c.text.slice(cut + 1), start: c.start + cut + 1, piece: true },
    ];
  });
}
