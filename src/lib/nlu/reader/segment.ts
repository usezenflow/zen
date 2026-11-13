// S1 segment: lines, numbered sections, field labels, hint lines and sentence clauses.
// Offsets are into the repaired text.
import { fold } from "./fold";
import { findMentions } from "./mentions";

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
  const lines: { text: string; start: number }[] = [];
  const rawLines = text.split("\n");
  let pos = 0;
  for (const rawLn of rawLines) {
    // a piece ends at `at` and the next one starts at `next`; a separator is dropped
    const cuts: { at: number; next: number }[] = [];
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
      if (!/^\p{L}/u.test(after) || after.split(/\s+/).length < 2) continue;
      if (!findMentions(rawLn.slice(0, i)).length) continue;
      // a date, clock, place or correction after the comma completes the item before it
      const opener = fold(after).text;
      if (
        MODIFIER_OPEN.test(opener) ||
        MODIFIER_OPEN.test(opener.replace(/\d/g, ""))
      )
        continue;
      if (findMentions(after).some((m) => m.start === 0)) continue;
      cuts.push({ at: i, next: i + 1 });
    }
    cuts.sort((a, b) => a.at - b.at);
    const starts = [0, ...cuts.map((c) => c.next)];
    const ends = [...cuts.map((c) => c.at), rawLn.length];
    for (let i = 0; i < starts.length; i++) {
      const segText = rawLn.slice(starts[i], ends[i]);
      lines.push({ text: segText, start: pos + starts[i] });
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
    if (HEADER_NUM.test(l.text.trim()) && (near(i - 1) || near(i + 1)))
      listed.add(l);
  });
  let run: object[] = [];
  for (const l of [...lines, { text: "" }]) {
    const t = l.text.trim();
    if (t && plainShort(t)) run.push(l);
    else {
      if (run.length >= 2) for (const r of run) listed.add(r);
      run = [];
    }
  }

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
          });
        }
        from = cut;
        label = undefined;
        labelWord = undefined;
      }
    }
  }
  return out;
}
