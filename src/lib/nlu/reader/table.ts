// Pasted grids (3a) and OCR schedules (3a2). Pure: the reference day is a parameter, nothing reads the clock.
import type { ReaderItem, ReaderWC } from "../shared";
import { addDays, lengthMin, round15 } from "./calendar";
import { fold } from "./fold";
import { isSyllable } from "./syllables";

export interface Edit {
  start: number;
  end: number;
  text: string;
}

// ---------- 3a: grids become one sentence per row ----------

/** Header keywords by field, folded. The first field whose keyword matches wins. */
const FIELDS: [string, RegExp][] = [
  ["deadline", /(^| )(han|deadline|due)( |$)/],
  ["period", /(^| )tiet( |$)/],
  ["time", /(^| )(gio|time|thoi gian|bat dau|ket thuc|ca)( |$)/],
  ["day", /(^| )(ngay|date|thu|day)( |$)/],
  ["place", /(^| )(phong|room|dia diem|co so)( |$)/],
  ["title", /(^| )(mon|hoc phan|subject|course|noi dung|ten)( |$)/],
  ["type", /(^| )(hinh thuc|ghi chu)( |$)/],
];

const SEP_CELL = /^:?-{2,}:?$/;

function fieldOf(cell: string): string | undefined {
  const f = fold(cell).text;
  return FIELDS.find(([, re]) => re.test(f))?.[0];
}

/** A cell read by its own shape when the grid has no header for its column. */
function shapeOf(c: string): "day" | "time" | "place" | undefined {
  const f = fold(c).text;
  if (
    /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(c) ||
    /^(thu [2-7]|thu[2-7]|t[2-7]|chu nhat|cn)$/.test(f)
  )
    return "day";
  if (
    /^\d{1,2}([:hg]\d{0,2})?\s*-\s*\d{1,2}([:hg]\d{0,2})?$/i.test(c) ||
    /^\d{1,2}[:hg]\d{2}$/i.test(c)
  )
    return "time";
  if (/^\p{L}\d{1,2}\.\d{2,3}$/iu.test(c) || /^(phòng|p\.)\s*\S/i.test(c))
    return "place";
  return undefined;
}

/** CSV cells: a comma inside double quotes stays in its cell. */
function csvCells(t: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of t) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** One line as cells, with the separator it uses. Undefined for a line that is not a row. */
function splitRow(line: string): { sep: string; cells: string[] } | undefined {
  const t = line.trim();
  if (!t) return undefined;
  if (t.includes("|")) {
    let parts = t.split("|");
    // outer pipes of a markdown row go; an empty cell between pipes stays (a merged cell)
    if (t.startsWith("|") && t.endsWith("|")) parts = parts.slice(1, -1);
    const cells = parts.map((s) => s.trim());
    return cells.length >= 2 ? { sep: "pipe", cells } : undefined;
  }
  if (line.includes("\t")) {
    const cells = line.split("\t").map((s) => s.trim());
    return cells.filter(Boolean).length >= 2
      ? { sep: "tab", cells }
      : undefined;
  }
  if (/\S {2,}\S/.test(t)) {
    const cells = t.split(/ {2,}/).map((s) => s.trim());
    return cells.length >= 2 ? { sep: "space", cells } : undefined;
  }
  if (t.includes(";")) {
    const cells = t.split(";").map((s) => s.trim());
    return cells.length >= 2 && cells.every((c) => c.length <= 40)
      ? { sep: "semi", cells }
      : undefined;
  }
  if (t.includes(",")) {
    const cells = csvCells(t);
    return cells.length >= 3 && cells.every((c) => c.length <= 40)
      ? { sep: "comma", cells }
      : undefined;
  }
  return undefined;
}

/** The sentence a grid row reads as: title, day, time, period, place, deadline, in the order a reader expects. */
function rowSentence(f: Record<string, string>): string {
  const isWeekday = /^(thu|t[2-7]|chu nhat|cn)/.test(fold(f.day ?? "").text);
  const dayPart = f.day ? (isWeekday ? f.day : `ngày ${f.day}`) : "";
  const timePart = f.time ? `lúc ${f.time}` : "";
  const periodPart = f.period ? `tiết ${f.period}` : "";
  const placePart = f.place
    ? /^\p{L}\d/iu.test(f.place)
      ? `phòng ${f.place}`
      : `tại ${f.place}`
    : "";
  const deadlinePart = f.deadline ? `hạn ${f.deadline}` : "";
  // a comma inside a cell would cut the sentence: it reads as a space
  for (const k of Object.keys(f))
    f[k] = f[k].replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const ordered = isWeekday
    ? [dayPart, timePart, f.title, periodPart, placePart, deadlinePart]
    : [f.title, dayPart, timePart, periodPart, placePart, deadlinePart];
  return ordered.filter(Boolean).join(" ").trim() + ".";
}

/**
 * Edits that turn each pasted grid (two or more rows sharing a separator, with the same cell count) into one
 * sentence per row. A header row maps columns by keyword; without one, each cell is read by its shape.
 * An empty day cell under a day column takes the day above (merged cells). Markdown separator rows go.
 * `read` decodes a cell before it is classified.
 */
export function gridEdits(
  text: string,
  read: (cell: string) => string = (c) => c,
): Edit[] {
  const lines = text.split("\n");
  const offs: number[] = [];
  let o = 0;
  for (const l of lines) {
    offs.push(o);
    o += l.length + 1;
  }
  // cells are read decoded (typed headers "Thuws 2" are "Thứ 2"); the edits still cut the raw lines
  const rows = lines.map((l) => {
    const r = splitRow(l);
    return r && { ...r, cells: r.cells.map(read) };
  });
  const edits: Edit[] = [];
  let i = 0;
  while (i < lines.length) {
    const r0 = rows[i];
    if (!r0) {
      i++;
      continue;
    }
    let j = i + 1;
    while (
      j < lines.length &&
      rows[j] &&
      rows[j]?.sep === r0.sep &&
      rows[j]?.cells.length === r0.cells.length
    )
      j++;
    if (j - i < 2) {
      i = j;
      continue;
    }
    const body = rows
      .slice(i, j)
      .map((r) => r?.cells ?? [])
      .filter((cells) => !cells.every((c) => c === "" || SEP_CELL.test(c)));
    let header: (string | undefined)[] | undefined;
    let data = body;
    const mapped = body[0]?.map(fieldOf) ?? [];
    if (mapped.filter(Boolean).length >= 2) {
      header = mapped;
      data = body.slice(1);
    }
    const dayColumn = header?.includes("day") ?? false;
    let prevDay = "";
    const sentences: string[] = [];
    for (const cells of data) {
      const f: Record<string, string> = {};
      const free: string[] = [];
      cells.forEach((c, k) => {
        if (!c) return;
        const field = header?.[k];
        if (field) f[field] = f[field] ?? c;
        else {
          const shape = shapeOf(c);
          if (shape && !f[shape]) f[shape] = c;
          else free.push(c);
        }
      });
      if (!f.title && free.length)
        f.title = free.reduce((a, b) => (b.length > a.length ? b : a));
      if (dayColumn && !f.day && prevDay) f.day = prevDay;
      if (f.day) prevDay = f.day;
      const sentence = rowSentence(f);
      if (sentence.length > 1) sentences.push(sentence);
    }
    edits.push({
      start: offs[i],
      end: offs[j - 1] + lines[j - 1].length,
      text: sentences.join("\n"),
    });
    i = j;
  }
  return edits;
}

/** Two or more lines that open with a clock range: a schedule whose line breaks must survive the dewrap. */
export function isScheduleText(text: string): boolean {
  return (
    text
      .split("\n")
      .filter((l) => /^\s*\d{1,2}\s*[gh:]\s*\d{0,2}\s*-\s*\d{1,2}/.test(l))
      .length >= 2
  );
}

// ---------- 3a2: OCR schedules, one cell per line or flattened ----------

const DATE_RE = /(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?!\d)/g;
/** "7g30 - 9g30", "10h-11h", "7:30 - 9:30": a clock range, minutes optional. */
const CLOCK_RE =
  /(?<![\p{L}\d])(\d{1,2})\s*[gh:]\s*(\d{2}|\d)?\s*-\s*(\d{1,2})(?:\s*[gh:]\s*(\d{2}|\d)?)?(?!\d)/gu;
const PLACE_CUE =
  /(^| )(san|phong|hoi truong|nha thi dau|ntd|khu|co so|giang duong|tang|thu vien|lab|sanh)( |$)/;
const ROOM = /\p{Lu}\d{1,2}\.\d{2,3}/u;

function validDM(d: number, m: number): boolean {
  return d >= 1 && d <= 31 && m >= 1 && m <= 12;
}

/** A glued token of 6 or more letters with two vowel runs splits where both halves are syllables: "sânbóng", "đanăng". */
function splitWord(w: string): string {
  if (isSyllable(w) || (fold(w).text.match(/[aeiouy]+/g) ?? []).length < 2)
    return w;
  for (let i = 2; i <= w.length - 2; i++) {
    const a = w.slice(0, i);
    const b = w.slice(i);
    if (isSyllable(a) && isSyllable(b)) return `${a} ${b}`;
  }
  return w;
}

/** OCR glue, undone at token boundaries: two dates, ")" and a letter or digit, a lower and an upper letter, a letter and a clock. */
function unglue(raw: string): string {
  let t = raw.replace(
    /(\d{1,2})\/(\d{1,2})(?=(\d{1,2})\/(\d{1,2}))/g,
    (m, d, mo, d2, mo2) =>
      validDM(+d, +mo) && validDM(+d2, +mo2) ? `${m} ` : m,
  );
  t = t.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
  t = t.replace(/(\d)(?=Th[ưứu]\s*[2-7])/gu, "$1 ");
  t = t.replace(/([)\]])(?=[\p{L}\d])/gu, "$1 ");
  t = t.replace(/(\p{L})(?=\d{1,2}\s*[gh:]\s*\d)/gu, "$1 ");
  return t.replace(/\p{L}{6,}/gu, splitWord);
}

/** OCR title repairs: lost diacritics on a known word, acronyms kept in capitals. */
function fixTitle(s: string): string {
  return s
    .replace(/\bHôi\b/g, "Hội")
    .replace(/\bhôi\b/g, "hội")
    .replace(/\bvcnld\b/gi, "VCNLĐ");
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Day number from a civil date, for ordering and weekdays. */
function dayNum(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** The first day on or after `ref` with the given weekday (0 is Sunday). */
function nextWeekday(ref: ReaderWC, dow: number): [number, number, number] {
  const base = dayNum(ref.y, ref.m, ref.d);
  for (let k = 0; k < 7; k++) {
    const n = base + k;
    if (new Date(n * 86400000).getUTCDay() === dow) {
      const dt = new Date(n * 86400000);
      return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
    }
  }
  return [ref.y, ref.m, ref.d];
}

interface Clock {
  at: number;
  end: number;
  start: number;
  stop: number;
}

function clocksIn(text: string, from = 0, to = text.length): Clock[] {
  const out: Clock[] = [];
  for (const m of text.slice(from, to).matchAll(CLOCK_RE)) {
    const sh = +m[1];
    const sm = +(m[2] ?? 0);
    const eh = +m[3];
    const em = +(m[4] ?? 0);
    if (sh > 23 || sm > 59 || eh > 23 || em > 59) continue;
    const at = (m.index ?? 0) + from;
    out.push({
      at,
      end: at + m[0].length,
      start: sh * 60 + sm,
      stop: eh * 60 + em,
    });
  }
  return out;
}

/** The title and activity of one clock entry: "bóng đá (sân bóng)" is the activity and its place. */
function activityOf(raw: string): {
  name: string;
  place?: string;
  note?: string;
} {
  const act = collapse(raw.replace(/^\s*:\s*/, ""));
  const m = act.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!m) return { name: act };
  const paren = collapse(m[2]);
  const name = collapse(m[1]) || act;
  if (PLACE_CUE.test(fold(paren).text) || ROOM.test(paren))
    return { name, place: paren };
  return { name, note: paren };
}

/**
 * An OCR or pasted schedule: leading dates or weekdays head the columns, or each date starts its own block.
 * Entries split into columns by a repeat of the first clock, or by an interleaved pattern (one clock per column,
 * the same clock for each column). Each entry is one BUSY at its clock. Undefined when the text is not a schedule.
 */
export function ocrSchedule(
  rawIn: string,
  ref: ReaderWC,
): ReaderItem[] | undefined {
  const raw = unglue(rawIn);
  const clocks = clocksIn(raw);
  if (clocks.length < 2) return undefined;
  const firstClock = clocks[0].at;

  // blocks: { day, title, entries }
  type Entry = { c: Clock; act: string };
  type Block = {
    day: [number, number, number];
    title: string;
    entries: Entry[];
  };
  const blocks: Block[] = [];
  const entryAt = (cs: Clock[], to: number): Entry[] =>
    cs.map((c, k) => {
      const next = cs[k + 1]?.at ?? to;
      return { c, act: raw.slice(c.end, Math.min(next, to)) };
    });
  const yearOf = (m: number, d: number, y?: string) => {
    if (y) return y.length === 2 ? 2000 + +y : +y;
    const diff = dayNum(ref.y, ref.m, ref.d) - dayNum(ref.y, m, d);
    return diff > 120 ? ref.y + 1 : ref.y;
  };

  const leadOf = (head: string): [number, number, number][] =>
    /\d\//.test(head)
      ? [...head.matchAll(DATE_RE)].map((m) => {
          const mo = +m[2];
          const d = +m[1];
          return [yearOf(mo, d, m[3]), mo, d] as [number, number, number];
        })
      : [...head.matchAll(/[2-7]/g)].map((m) => nextWeekday(ref, +m[0] - 1));
  const lead = raw.match(
    /^\s*((?:(?:Thứ|thứ|Thu|thu)\s*[2-7]\s*)+|(?:\d{1,2}\/\d{1,2}(?:\/(?:\d{4}|\d{2}))?\s*)+)/,
  );
  const leadDays = lead && lead[1].trim() ? leadOf(lead[1]) : [];
  if (lead && leadDays.length >= 2) {
    const headEnd = lead[0].length;
    const days = leadDays;
    const n = days.length;
    // title cells: the head's lines when there are n of them, else the repeats of the first title's first two words
    const headText = raw.slice(headEnd, firstClock);
    const lines = headText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^\d{1,2}\/\d{1,2}/.test(l));
    let cells: string[];
    if (lines.length === n) cells = lines;
    else {
      const flat = collapse(headText);
      const base = fold(flat).text.split(" ").slice(0, 2).join(" ");
      const starts: number[] = [];
      if (base) {
        const fl = fold(flat).text;
        let p = fl.indexOf(base);
        while (p >= 0) {
          starts.push(p);
          p = fl.indexOf(base, p + base.length);
        }
      }
      cells = starts.length
        ? starts
            .slice(0, n)
            .map((s, k) => flat.slice(s, starts[k + 1] ?? flat.length).trim())
        : flat
          ? [flat]
          : [];
    }
    const cs = clocks.filter((c) => c.at >= firstClock);
    const es = entryAt(cs, raw.length);
    const N = n;
    let columns: Entry[][] | undefined;
    if (es.length >= 2 * N && es.length % N === 0) {
      const groups: Entry[][] = [];
      for (let g = 0; g < es.length; g += N) groups.push(es.slice(g, g + N));
      const interleaved =
        groups.every((grp) => grp.every((e) => e.c.start === grp[0].c.start)) &&
        groups.length > 1 &&
        groups.some((grp) => grp[0].c.start !== groups[0][0].c.start);
      if (interleaved)
        columns = Array.from({ length: N }, (_, c) =>
          es.filter((_e, i) => i % N === c),
        );
    }
    if (!columns) {
      const split: Entry[][] = [];
      for (const e of es) {
        if (!split.length || e.c.start === es[0].c.start) split.push([e]);
        else split[split.length - 1].push(e);
      }
      if (split.length === N) columns = split;
      else if (es.length % N === 0) {
        const per = es.length / N;
        columns = Array.from({ length: N }, (_, c) =>
          es.slice(c * per, (c + 1) * per),
        );
      }
    }
    if (!columns) return undefined;
    columns.forEach((col, c) => {
      blocks.push({
        day: days[c],
        title: cells[c] ?? cells[cells.length - 1] ?? "",
        entries: col,
      });
    });
  } else {
    // row-major: each date starts a block and its cells follow
    const dates = [...raw.matchAll(DATE_RE)];
    if (dates.length < 2) return undefined;
    // a sentence break makes this prose or a grid of sentences, not a row-major schedule
    const prose = /[.!?;]\s+\S/.test(raw.replace(/\d+\.\d+/g, ""));
    if (prose) return undefined;
    dates.forEach((m, k) => {
      const from = (m.index ?? 0) + m[0].length;
      const to = dates[k + 1]?.index ?? raw.length;
      const cs = clocksIn(raw, from, to);
      if (!cs.length) return;
      const headEnd = cs[0].at;
      const title = collapse(raw.slice(from, headEnd));
      const mo = +m[2];
      const d = +m[1];
      blocks.push({
        day: [yearOf(mo, d, m[3]), mo, d],
        title,
        entries: entryAt(cs, to),
      });
    });
  }

  const items: ReaderItem[] = [];
  for (const b of blocks) {
    for (const e of b.entries) {
      const act = activityOf(e.act);
      if (!act.name) continue;
      const title = fixTitle(b.title ? `${b.title}, ${act.name}` : act.name);
      const [y, mo, d] = b.day;
      const dur = e.c.stop > e.c.start ? e.c.stop - e.c.start : 60;
      // a start rounds to the 15 minute grid: 9:10 is 9:15, 23:55 is midnight of the next day
      const t = round15(e.c.start);
      const day = addDays({ y, m: mo, d }, Math.floor(t / 1440));
      const h = Math.floor((t % 1440) / 60);
      const mi = t % 60;
      items.push({
        type: "BUSY",
        title: title.charAt(0).toUpperCase() + title.slice(1),
        note: act.note ?? null,
        startsAt: `${isoDate(day.y, day.m, day.d)} ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`,
        durationMinutes: lengthMin(dur),
        ...(act.place ? { location: act.place } : {}),
        confidence: 0.8,
        inferred: [],
        flags: ["ocr"],
        alternatives: [],
        evidence: collapse(`${raw.slice(e.c.at, e.c.end)} ${e.act}`).slice(
          0,
          300,
        ),
        checked: false,
      });
    }
  }
  if (!items.length) return undefined;
  return items.sort((x, y) =>
    (x.startsAt ?? "").localeCompare(y.startsAt ?? ""),
  );
}
