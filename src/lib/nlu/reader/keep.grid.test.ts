// Every task a user lists becomes an item: a list of 2-4 titles joined by ", ", " ; ", a newline or " rồi ", with no date,
// a lead date or a trailing date, and each part of the day as its lead or trail. A modifier piece ("sáng mai", "lúc 8h",
// "ở thư viện") is no item of its own. The cases are generated here; `pnpm vitest run keep.grid` runs the set.
import { expect, it } from "vitest";
import { fold } from "./fold";
import { hasTaskWord } from "./order";
import { read } from "./reader";
import type { ReaderItem } from "../shared";

const REF = { y: 2026, m: 11, d: 16, h: 10, mi: 0 };
const TITLES = [
  "b-tree code", "lsm code", "code api login", "đọc chương 3", "giặt đồ",
  "mua sữa", "gọi mẹ", "báo cáo web", "ôn giải tích", "tập gym",
];
// lists of 2 to 4 titles, three starts, so the titles meet each other
const LISTS: string[][] = [2, 3, 4].flatMap((n) =>
  [0, 3, 6].map((s) => Array.from({ length: n }, (_, i) => TITLES[(s + i) % TITLES.length])),
);
const SEPS = [", ", " ; ", "\n", " rồi "];
const DATES = ["mai", "thứ 6", "tuần sau"];
const PARTS = ["sáng", "trưa", "chiều", "tối"];

interface Case { text: string; titles: string[] }
const cases: Case[] = [];
for (const titles of LISTS)
  for (const sep of SEPS) {
    // shortcut: "A rồi B" keeps one item when only one side has a task word ("gửi email rồi nghe nhạc", order.test), so mixed lists are not generated
    if (sep === " rồi " && new Set(titles.map((t) => hasTaskWord(t))).size > 1) continue;
    const list = titles.join(sep);
    cases.push({ text: list, titles });
    if (sep === "\n") {
      // a newline ends a span, so each line names its own date
      for (const d of DATES) cases.push({ text: titles.map((t) => `${t} ${d}`).join("\n"), titles });
      continue;
    }
    for (const d of DATES) {
      cases.push({ text: `${d} ${list}`, titles });
      cases.push({ text: `${list} ${d}`, titles });
    }
  }
// each part of the day as the lead or the trail of a list of 2 or 3 titles
for (const titles of LISTS.filter((l) => l.length <= 3))
  for (const p of PARTS) {
    cases.push({ text: `${p} mai ${titles.join(", ")}`, titles });
    cases.push({ text: `${titles.join(", ")} ${p} mai`, titles });
  }

/** Why `text` does not read as the wanted titles, one item each, or undefined. */
function miss(text: string, titles: string[]): string | undefined {
  const res = read(text, { ref: REF, source: "typed" });
  if (res.items.length !== titles.length)
    return `${JSON.stringify(text)}: ${res.items.length} items, want ${titles.length}`;
  const got = res.items.map((it) => fold(it.title).text);
  for (const t of titles)
    if (!got.some((g) => g.includes(fold(t).text)))
      return `${JSON.stringify(text)}: no item for "${t}"`;
  return undefined;
}

it("keep grid: every listed title is one item, with or without a date, a part or a newline", () => {
  const misses = cases.map((c) => miss(c.text, c.titles)).filter((x): x is string => !!x);
  expect(misses, `${misses.length} misses, first: ${misses.slice(0, 10).join(" | ")}`).toEqual([]);
});

// a modifier piece attaches to the task before it: it is no item of its own
const MODIFIERS: [string, string][] = [
  ["học toán, sáng mai", "hoc toan"],
  ["họp nhóm, lúc 8h", "hop nhom"],
  ["đọc sách, ở thư viện", "doc sach"],
];
it("keep grid: a modifier piece is no item of its own", () => {
  const misses: string[] = [];
  for (const [text, title] of MODIFIERS) {
    const res = read(text, { ref: REF, source: "typed" });
    if (res.items.length !== 1) misses.push(`${JSON.stringify(text)}: ${res.items.length} items, want 1`);
    else if (!fold(res.items[0].title).text.includes(title)) misses.push(`${JSON.stringify(text)}: title ${res.items[0].title}`);
  }
  expect(misses).toEqual([]);
});

// the lines the user typed: a trailing date ends the list, and a date after a comma gives its own task
it("keep grid: the reported lines keep every task", () => {
  const cases: Case[] = [
    { text: "b-tree code, lsm code mai", titles: ["b-tree code", "lsm code"] },
    { text: "từ mai đi khám, dọn phòng", titles: ["đi khám", "dọn phòng"] },
  ];
  const misses = cases.map((c) => miss(c.text, c.titles)).filter((x): x is string => !!x);
  expect(misses).toEqual([]);
});

// a time word on one piece of a list: its own day, window or clock from REF (Mon 16/11/2026 10:00). "9h" is past 10:00, so the next 9 o'clock is 21:00 today
interface Own { day?: string; window?: string; clock?: string }
const TIMES: [string, Own][] = [
  ["mai", { day: "2026-11-17" }],
  ["sáng mai", { day: "2026-11-17", window: "MORNING" }],
  ["tối nay", { day: "2026-11-16", window: "NIGHT" }],
  ["sáng sớm", { day: "2026-11-16", window: "MORNING" }],
  ["chiều", { day: "2026-11-16", window: "AFTERNOON" }],
  ["thứ 6", { day: "2026-11-20" }],
  ["9h", { clock: "2026-11-16 21:00" }],
  ["lúc 8h tối", { clock: "2026-11-16 20:00" }],
];
// a line that ends with its own date: the day it names
const LINE_DATES: [string, string][] = [["mai", "2026-11-17"], ["thứ 6", "2026-11-20"]];
// open: an untimed piece of a comma list may take the day of a time word at the list's edge ("sáng mai A, B", "A, B mai")
interface Piece { title: string; text: string; own?: Own; day?: string; open?: string; avoid?: string }

const dayOf = (it: ReaderItem) => (it.deadline ?? it.startsAt ?? it.notBefore)?.slice(0, 10);
const loneCache = new Map<string, string>();
/** The reading of a title alone: what an untimed piece of a list must keep. */
function loneOf(title: string): string {
  let s = loneCache.get(title);
  if (s === undefined) {
    const it = read(title, { ref: REF, source: "typed" }).items[0];
    s = JSON.stringify([it?.notBefore, it?.deadline, it?.startsAt, it?.windows]);
    loneCache.set(title, s);
  }
  return s;
}

/** Why the list does not read as one item per piece with its own time, or undefined. */
function ownMiss(text: string, pieces: Piece[]): string | undefined {
  const res = read(text, { ref: REF, source: "typed" });
  if (res.items.length !== pieces.length)
    return `${JSON.stringify(text)}: ${res.items.length} items, want ${pieces.length}`;
  for (const p of pieces) {
    const hit = res.items.filter((it) => fold(it.title).text.includes(fold(p.title).text));
    if (hit.length !== 1) return `${JSON.stringify(text)}: ${hit.length} items for "${p.title}"`;
    const it = hit[0];
    const win = JSON.stringify(it.windows ?? []);
    if (p.own?.clock) {
      if (it.startsAt !== p.own.clock) return `${JSON.stringify(text)}: "${p.title}" at ${it.startsAt}, want ${p.own.clock}`;
    } else if (p.own) {
      if (dayOf(it) !== p.own.day) return `${JSON.stringify(text)}: "${p.title}" on ${dayOf(it)}, want ${p.own.day}`;
      const want = p.own.window ? [p.own.window] : [];
      if (win !== JSON.stringify(want)) return `${JSON.stringify(text)}: "${p.title}" windows ${win}, want ${JSON.stringify(want)}`;
    } else if (p.day) {
      if (dayOf(it) !== p.day || it.windows?.length) return `${JSON.stringify(text)}: "${p.title}" on ${dayOf(it)} ${win}, want ${p.day} with no window`;
    } else {
      const got = JSON.stringify([it.notBefore, it.deadline, it.startsAt, it.windows]);
      // alone or on the edge's day, or no window and not the timed piece's day
      const ok = got === loneOf(p.title) || (!!p.open && dayOf(it) === p.open) || (!it.windows?.length && dayOf(it) !== p.avoid);
      if (!ok) return `${JSON.stringify(text)}: "${p.title}" ${got}, alone ${loneOf(p.title)}`;
    }
  }
  return undefined;
}

// "báo cáo" due on a day is a report to prepare the day before ("Chuẩn bị báo cáo web"), its own rule with its own tests: left out of the timed lists
const TIMED = TITLES.filter((t) => !t.includes("báo cáo"));
const LISTS2 = TIMED.map((_, s) => [0, 1].map((i) => TIMED[(s + i) % TIMED.length]));
const LISTS3 = TIMED.map((_, s) => [0, 1, 2].map((i) => TIMED[(s + i) % TIMED.length]));
const GEN: { text: string; pieces: Piece[] }[] = [];
for (const titles of [...LISTS2, ...LISTS3])
  for (const sep of [", ", "\n"])
    titles.forEach((_, p) =>
      TIMES.forEach(([w, own]) =>
        [true, false].forEach((pre) => {
          // the day of a time word at the edge of a comma list carries to its untimed pieces; a newline ends the span
          const edge = sep === ", " && ((p === 0 && pre) || (p === titles.length - 1 && !pre));
          const timed = titles.map((t, i): Piece => (i === p
            ? { title: t, text: pre ? `${w} ${t}` : `${t} ${w}`, own }
            : { title: t, text: t, open: edge ? (own.day ?? own.clock?.slice(0, 10)) : undefined, avoid: own.day ?? own.clock?.slice(0, 10) }));
          GEN.push({ text: timed.map((x) => x.text).join(sep), pieces: timed });
          if (sep !== "\n") return;
          // each line may end with its own date: the untimed lines keep that day, not the timed one's
          const dated = titles.map((t, i): Piece => {
            if (i === p) return { title: t, text: pre ? `${w} ${t}` : `${t} ${w}`, own };
            const [d, day] = LINE_DATES[i % LINE_DATES.length];
            return { title: t, text: `${t} ${d}`, day };
          });
          GEN.push({ text: dated.map((x) => x.text).join(sep), pieces: dated });
        }),
      ),
    );

it("keep grid: a timed piece of a list keeps its own day, window or clock; an untimed piece reads as alone", () => {
  const misses = GEN.map((g) => ownMiss(g.text, g.pieces)).filter((x): x is string => !!x);
  expect(misses, `${GEN.length} cases, ${misses.length} misses, first: ${misses.slice(0, 10).join(" | ")}`).toEqual([]);
});
