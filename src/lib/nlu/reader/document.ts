// S0 document: an official notice or plan (công văn, thông báo, kế hoạch) read by its structure, not sentence by sentence.
// Three shapes: a program table (time ranges under day headers), numbered items each with a "Thời gian:" block, and one
// "Thời gian: Từ … đến …" window for the document's subject. Staff-only sections make nothing. Undefined when the text is no
// such document or none of the shapes is found: the sentence reader takes it. Pure.
import type { ReaderItem, ReaderItemType, ReaderWC } from "../shared";
import { fold } from "./fold";

type Day = { y: number; m: number; d: number };
type Point = { day: Day; h?: number; mi?: number; part?: "sang" | "trua" | "chieu" | "toi" };

const pad = (n: number) => String(n).padStart(2, "0");
const dayNo = (d: Day) => Date.UTC(d.y, d.m - 1, d.d) / 86_400_000;
const plusDays = (d: Day, n: number): Day => {
  const t = new Date(Date.UTC(d.y, d.m - 1, d.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const ymd = (d: Day) => `${d.y}-${pad(d.m)}-${pad(d.d)}`;
/** A part of the day's start, for a point with a part and no clock ("chiều thứ ba, ngày 1/4"). */
const PART_START = { sang: [7, 0], trua: [11, 0], chieu: [13, 0], toi: [18, 0] } as const;
const stamp = (p: Point) => {
  const [h, mi] = p.h !== undefined ? [p.h, p.mi ?? 0] : p.part ? PART_START[p.part] : [23, 59];
  return `${ymd(p.day)} ${pad(h)}:${pad(mi)}`;
};
const minutesOf = (p: Point) => dayNo(p.day) * 1440 + (p.h ?? 0) * 60 + (p.mi ?? 0);

/** A first line, a header or a sign-off that only an official document has. Folded. */
const OFFICIAL = /cong hoa xa hoi chu nghia|doc lap\s*-\s*tu do|(?:^|\n)\s*so\s*:\s*\d+\s*\/|(?:^|\n)\s*noi nhan\s*:/;
const DOC_KIND = /(?:^|\n)\s*(?:thong bao|ke hoach|cong van|quyet dinh|giay moi|chuong trinh)\s*(?:\n|$)/;

/** The document's own date: "Lâm Đồng, ngày 05 tháng 11 năm 2026". */
function issued(f: string): Day | undefined {
  const m = /ngay\s*(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(\d{4})/.exec(f);
  return m ? { y: +m[3], m: +m[2], d: +m[1] } : undefined;
}

/**
 * A date as written, its year from the document: a missing year is the issue year (the next when that falls months
 * before the document); a written year one off the issue year that lands before the document is a typo ("22/04/2024" in
 * a notice of 03/2025).
 */
function dateOf(d: number, m: number, y: number | undefined, doc: Day): Day | undefined {
  if (d < 1 || d > 31 || m < 1 || m > 12) return undefined;
  const near = (yy: number) => ({ y: yy, m, d });
  if (y === undefined) {
    const same = near(doc.y);
    return dayNo(same) < dayNo(doc) - 60 ? near(doc.y + 1) : same;
  }
  if (Math.abs(y - doc.y) === 1 && dayNo(near(y)) < dayNo(doc) - 30 && dayNo(near(doc.y)) >= dayNo(doc) - 30) return near(doc.y);
  return near(y);
}

const CLOCK = /(?<![\d/.])([01]?\d|2[0-3])\s*[hg:]\s*([0-5]\d)?(?![\d/])/g;
const DATE = /(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{4}))?(?![\d/])/g;
const PART = /(?<![a-z])(sang|trua|chieu|toi)(?![a-z])/;

/** The points of a time phrase in order: each clock takes the date beside it, a date alone stands with its part of day. */
function points(text: string, doc: Day): Point[] {
  const f = fold(text).text;
  const dates = [...f.matchAll(DATE)].map((m) => ({ at: m.index ?? 0, day: dateOf(+m[1], +m[2], m[3] ? +m[3] : undefined, doc) }));
  const clocks = [...f.matchAll(CLOCK)].filter((m) => !dates.some((d) => Math.abs(d.at - (m.index ?? 0)) < 3));
  const out: { at: number; p: Point }[] = [];
  for (const c of clocks) {
    const at = c.index ?? 0;
    // the date after the clock ("8h00 ngày 16/11"), else the one before ("ngày 22/04 ... 15g00"), else the nearest
    const after = dates.find((d) => d.at > at && !clocks.some((o) => (o.index ?? 0) > at && (o.index ?? 0) < d.at && o !== c && dates.some((dd) => dd.at > (o.index ?? 0) && dd.at <= d.at && dd !== d)));
    const day = (after ?? [...dates].reverse().find((d) => d.at < at) ?? dates[0])?.day;
    if (day) out.push({ at, p: { day, h: +c[1], mi: c[2] ? +c[2] : 0 } });
  }
  for (const d of dates) {
    if (!d.day || out.some((o) => o.p.day === d.day)) continue;
    const part = PART.exec(f)?.[1] as Point["part"];
    out.push({ at: d.at, p: { day: d.day, part } });
  }
  return out.sort((a, b) => a.at - b.at).map((o) => o.p);
}

const cap = (s: string) => s.charAt(0).toLocaleUpperCase("vi") + s.slice(1);
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s\-–•*:.,;]+|[\s\-–:,;]+$/g, "").trim();
/** An all-caps heading in sentence case: "LỬA TRẠI - KẾT NỐI" is "Lửa trại - kết nối". */
const sentence = (s: string) => (/\p{Ll}/u.test(s) ? s : cap(s.toLocaleLowerCase("vi")));
/** A title cut at a word under 70 characters. */
function short(s: string): string {
  const t = clean(s);
  if (t.length <= 70) return t;
  const cut = t.slice(0, 70);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:-]+$/, "");
}

function item(type: ReaderItemType, title: string, evidence: string, extra: Partial<ReaderItem>): ReaderItem {
  return { type, title: cap(short(title)), note: null, confidence: 0.8, inferred: [], flags: [], alternatives: [], evidence: clean(evidence).slice(0, 300), checked: false, ...extra };
}

// --- program table ---------------------------------------------------------------------------------------------------

const RANGE_LINE = /^\s*([01]?\d|2[0-3])\s*[hg:]\s*([0-5]\d)?\s*[-–]\s*([01]?\d|2[0-3])\s*[hg:]\s*([0-5]\d)?\s*$/;
const DAY_HEAD = /^\s*ngay\s*(\d{1,2})\s*[-–]\s*(?:thu\s*\S+|chu nhat)\s*,?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/;
/** Who runs a row: the last column of a program, never a title. Folded. */
const ROLE = /^(?:btc|ban to chuc|tieu trai|cac tieu trai|ban giam khao|doan truong|doan thanh nien|hoi sinh vien|cac khoa|khoa|tat ca|toan the|sinh vien|trai sinh|mc|ban chi dao)$/;
/** Column heads and row numbers of the table. Folded. */
const TABLE_HEAD = /^(?:stt|thoi gian|noi dung|nguoi thuc hien|don vi thuc hien|ghi chu|\d{1,2}\.?)$/;

type Row = { day?: number; start: number; end: number; pre: string[]; post: string[]; closed: boolean };

/**
 * A program: day headers ("NGÀY 1 - THỨ SÁU, 23/10/2026 - …") and time ranges on lines of their own, each row's activity on
 * the lines around it. OCR reads the columns out of order, so each line of text goes to the earliest row still open; a who
 * column ("BTC", "Tiểu trại") or a finished sentence with an empty row waiting closes it; a line in lowercase continues the
 * row before; text with no open row heads the next one ("Đêm hội thanh niên" above its "18h00 - 21h00").
 */
function program(lines: string[], doc: Day): ReaderItem[] | undefined {
  const heads = lines.map((l) => DAY_HEAD.exec(fold(l).text));
  const ranges = lines.filter((l) => RANGE_LINE.test(fold(l).text));
  const firstHead = heads.find(Boolean);
  if (ranges.length < 3 || !firstHead) return undefined;
  // the days run on from the first header: a header's own date can be a typo ("NGÀY 3 - CHỦ NHẬT, 24/10" is 25/10)
  const day1 = dateOf(+firstHead[2], +firstHead[3], +firstHead[4], doc)!;
  const firstAt = Math.min(lines.findIndex((l) => RANGE_LINE.test(fold(l).text)), heads.findIndex(Boolean));
  const rows: Row[] = [];
  let day: number | undefined;
  let orphan: string[] = [];
  const open = () => rows.find((r) => !r.closed);
  for (const line of lines.slice(firstAt)) {
    const f = fold(line).text.trim();
    if (/^ghi chu\s*:/.test(f)) break;
    const head = DAY_HEAD.exec(f);
    if (head) { day = +head[1]; continue; }
    const r = RANGE_LINE.exec(f);
    if (r) {
      rows.push({ day, start: +r[1] * 60 + +(r[2] ?? 0), end: +r[3] * 60 + +(r[4] ?? 0), pre: orphan, post: [], closed: false });
      orphan = [];
      continue;
    }
    if (!f || TABLE_HEAD.test(f)) continue;
    const text = line.trim();
    if (ROLE.test(f)) {
      const o = open();
      if (o) o.closed = true;
      continue;
    }
    // a lowercase line, or a bracket still open, goes on with the row before
    const into = [...rows].reverse().find((x) => x.post.length || x.pre.length);
    if (into && (/^\p{Ll}/u.test(text) || (into.post.join(" ").split("(").length > into.post.join(" ").split(")").length))) {
      into.post.push(text);
      continue;
    }
    const o = open();
    if (!o) { orphan.push(text); continue; }
    o.post.push(text);
    // a finished sentence ends the row's text when a later row still waits for its own
    if (/[.!?]["”»]?$/.test(text) && rows.some((x) => x !== o && !x.closed && !x.post.length && rows.indexOf(x) > rows.indexOf(o))) o.closed = true;
  }
  if (rows.length < 3) return undefined;
  return rows.map((row) => {
    const at = plusDays(day1, (row.day ?? 1) - 1);
    const lines2 = [...row.pre, ...row.post];
    // the title: a heading above the clock, else an all-caps line of the row, else its first clause
    const capsAt = row.post.findIndex((l) => !/\p{Ll}/u.test(l) && /\p{Lu}.*\s.*\p{Lu}/u.test(l));
    const caps = capsAt >= 0 ? row.post.slice(capsAt).filter((l, k) => k === 0 || !/\p{Ll}/u.test(l)).join(" ") : undefined;
    const body = row.post.join(" ");
    const title = (row.pre.length ? sentence(row.pre.join(" ")) : caps ? sentence(caps) : body).split(/[.:]\s|[.:]$/)[0];
    const note = clean(lines2.join(" ")).replace(/^\(|\)$/g, "");
    const len = row.end > row.start ? row.end - row.start : row.end + 1440 - row.start;
    return item("BUSY", clean(title).replace(/^["“]|["”]$/g, ""), lines2.join(" "), {
      startsAt: `${ymd(at)} ${pad(Math.floor(row.start / 60))}:${pad(row.start % 60)}`,
      durationMinutes: len,
      note: note !== clean(title) ? note : null,
    });
  });
}

// --- numbered items with their time blocks -----------------------------------------------------------------------------

/** "0. Hoàn thành 06 bài", "Nội dung 1. Kiểm tra thực hành": a numbered item at a line's start. */
const NUMBERED = /^(?:noi dung\s+)?(\d{1,2})\.\s+(\S.*)$/;
const TIME_BLOCK = /thoi gian\s*:/;

/** The item's name: its numbered line and the one- or two-word lines after it, up to a bracket. */
function headingTitle(lines: string[], k: number): string {
  const raw = lines[k].trim().replace(/^(?:Nội dung|NỘI DUNG)\s+/, "").replace(/^\d{1,2}\.\s+/, "");
  let t = raw.split("(")[0];
  if (raw.includes("(")) return t;
  for (let j = k + 1; j < lines.length && j <= k + 3; j++) {
    const next = lines[j].trim();
    const head = next.split("(")[0].trim();
    if (!head || NUMBERED.test(fold(next).text) || /^[-•(]/.test(next) || TIME_BLOCK.test(fold(next).text)) break;
    if (head.split(/\s+/).length > 2 || (/^\p{Lu}/u.test(head) && t.trim().split(/\s+/).length >= 3 && head.split(/\s+/).length > 1)) break;
    t += ` ${head}`;
    if (next.includes("(")) break;
  }
  return t;
}

function numbered(lines: string[], doc: Day): ReaderItem[] | undefined {
  const heads = lines.map((l, k) => (NUMBERED.test(fold(l.trim()).text) && !/^\d{1,2}\.\s+\d/.test(l.trim()) ? k : -1)).filter((k) => k >= 0);
  const blocks: string[] = [];
  lines.forEach((l, k) => {
    const f = fold(l).text;
    const at = f.search(TIME_BLOCK);
    if (at < 0) return;
    // the block runs to the next time block, item, bullet or note, its place line included
    let text = l.slice(at);
    for (let j = k + 1; j < lines.length; j++) {
      const fj = fold(lines[j]).text.trim();
      if (TIME_BLOCK.test(fj) || NUMBERED.test(fj) || /^[-•]/.test(fj) || /^ghi chu/.test(fj)) break;
      text += `\n${lines[j]}`;
      if (/^dia diem\s*:/.test(fj)) break;
    }
    blocks.push(text);
  });
  if (heads.length < 2 || heads.length !== blocks.length) return undefined;
  const out: ReaderItem[] = [];
  heads.forEach((k, i) => {
    const title = headingTitle(lines, k);
    const block = blocks[i];
    const ps = points(block.split(/dia diem|địa điểm/i)[0], doc);
    if (!ps.length) return;
    const place = /(?:Địa điểm|Dia diem|ĐỊA ĐIỂM)\s*:\s*([^\n(]+)/i.exec(block)?.[1];
    const ft = fold(title).text;
    const type: ReaderItemType = /(?<![a-z])(?:kiem tra|thi|ktra)(?![a-z])/.test(ft) ? "EXAM" : /(?<![a-z])(?:bao cao|thuyet trinh|bao ve|hop|seminar)(?![a-z])/.test(ft) ? "BUSY" : "ASSIGNMENT";
    const loc = place ? clean(place) : undefined;
    if (type === "ASSIGNMENT") out.push(item(type, title, `${title} ${block}`, { deadline: stamp(ps[0]), location: loc }));
    else {
      const len = ps[1] && minutesOf(ps[1]) > minutesOf(ps[0]) ? minutesOf(ps[1]) - minutesOf(ps[0]) : type === "EXAM" ? 120 : 60;
      out.push(item(type, title, `${title} ${block}`, { startsAt: stamp(ps[0]), durationMinutes: len, location: loc }));
    }
  });
  return out.length >= 2 ? out : undefined;
}

// --- the subject's window --------------------------------------------------------------------------------------------

/** Verbs that make the subject a task done in its window ("đăng ký học phần"), not an event attended. Folded. */
const TASK_SUBJECT = /(?<![a-z])(?:dang ky|nop|cap nhat|khai bao|dong|hoan thanh|hoan thien|gui|xac nhan|danh gia|khao sat|dien|bo sung|tra loi|tham gia binh chon)(?![a-z])/;

/** The subject: "Về việc …" after the kind word, or the line after it, cut before the year, the audience or the "Kính gửi". */
function subjectOf(lines: string[]): string | undefined {
  const k = lines.findIndex((l) => DOC_KIND.test(`\n${fold(l).text.trim()}\n`));
  if (k < 0) return undefined;
  let s = "";
  for (let j = k + 1; j < lines.length && j <= k + 3; j++) {
    const f = fold(lines[j]).text;
    if (/^\s*(?:kinh gui|can cu|i\.|1\.)/.test(f)) break;
    s += ` ${lines[j].trim()}`;
  }
  const t = s.replace(/^\s*(?:Về việc|về việc|V\/v|v\/v)\s*/u, "");
  return clean(t.split(/,\s*năm học|\s+cho sinh viên|\s+cho các|\s+năm học/iu)[0]);
}

function windowItem(lines: string[], text: string, doc: Day): ReaderItem[] | undefined {
  const subject = subjectOf(lines);
  if (!subject) return undefined;
  const k = lines.findIndex((l) => /^\s*thoi gian\s*:\s*tu\b/.test(fold(l).text));
  if (k < 0) return undefined;
  const ps = points(lines.slice(k, k + 2).join(" ").split(/[.;](?:\s|$)/)[0], doc);
  if (ps.length < 2) return undefined;
  const [from, to] = [ps[0], ps[ps.length - 1]];
  const link = /https?:\/\/[^\s,)]+/.exec(text)?.[0];
  if (TASK_SUBJECT.test(fold(subject).text))
    return [item("PLAN", subject, lines.slice(k, k + 2).join(" "), { notBefore: stamp(from), deadline: stamp(to), durationMinutes: 30, inferred: ["durationMinutes"], location: link })];
  return [item("BUSY", subject, lines.slice(k, k + 2).join(" "), { startsAt: stamp(from), durationMinutes: Math.max(30, minutesOf(to) - minutesOf(from)) })];
}

/** The items of an official document, or undefined when the text is none or its structure is not one this reads. */
export function documentItems(raw: string, ref: ReaderWC): ReaderItem[] | undefined {
  const text = raw.normalize("NFC");
  const f = fold(text).text;
  const lines = text.split("\n");
  if (lines.filter((l) => l.trim()).length < 12) return undefined;
  if (!OFFICIAL.test(f) && !DOC_KIND.test(`\n${lines.slice(0, 8).map((l) => fold(l).text.trim()).join("\n")}\n`)) return undefined;
  const doc = issued(f) ?? { y: ref.y, m: ref.m, d: ref.d };
  return program(lines, doc) ?? numbered(lines, doc) ?? windowItem(lines, text, doc);
}
