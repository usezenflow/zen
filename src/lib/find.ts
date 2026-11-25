import { addDays, mondayOf, startOfDay } from "../components/cal";
import { dueOf } from "../planner/features";
import { typeOf } from "../planner/policy";
import { resolveDate, spanOf } from "./nlu/reader/assemble";
import { fold, osa } from "./nlu/reader/fold";
import { findMentions, type Found as Mention } from "./nlu/reader/mentions";
import { exceptSpans } from "./nlu/reader/rules";
import { PART, PART_ALIAS } from "./nlu/reader/parts";
import { STUDENT_ABBREVIATIONS } from "./nlu/shared/vi-abbrev";
import type { Task, TaskType } from "./types";

/** A search query read like a spoken line (views.html "Search, understood"): the reader's dates, times and parts of day,
 *  type and status words as filters, the rest as loose words. */
export interface Query {
  words: string[]; // folded; each must hit the title, course, room or teacher
  types: { type: TaskType; words: string[] }[]; // "thi": an exam (or its prep), or the cue's words in the text
  days: [number, number][]; // local [from, to); any
  except?: [number, number][]; // "trừ 20/11": local [from, to) the days leave out
  exceptDow?: number[]; // "trừ T6": weekdays (0 = Sunday) the days leave out
  clock?: [number, number]; // "từ 9h đến 11h", "sau 5h": minutes of the day the row starts in, [from, to)
  due: boolean; // "hạn": the days are the deadline's
  part?: { key: string; from: number; to: number }; // minutes of the day the row starts in
  at?: number; // minutes of the day the row runs at
  status?: "live" | "done" | "late";
  repeat: boolean; // "mỗi tuần": only series
}

// Folded cue phrases, longest first wins. A type word also counts as text, so "thi" keeps "Thi Giải tích" either way.
const TYPES: [string, TaskType][] = [["lich thi", "exam"], ["kiem tra", "exam"], ["thi", "exam"], ["thoi khoa bieu", "lecture"], ["lich hoc", "lecture"], ["len lop", "lecture"], ["tkb", "lecture"], ["tiet", "lecture"], ["bai tap", "assignment"], ["lich ban", "busy"], ["co dinh", "busy"]];
const DUE = ["han nop", "han", "deadline", "nop"];
const STATUS: [string, NonNullable<Query["status"]>][] = [["chua xong", "live"], ["chua lam", "live"], ["con lai", "live"], ["da xong", "done"], ["xong roi", "done"], ["hoan thanh", "done"], ["da lam", "done"], ["xong", "done"], ["qua han", "late"], ["bo lo", "late"], ["tre", "late"]];
const PARTS = [...Object.keys(PART), ...Object.keys(PART_ALIAS)];
// Scope words around dates and clocks (folded): "từ A đến B", "A-B", "trước/sau/từ A", "từ nay đến A", "3 ngày tới".
const RANGE_GAP = /^(?:den|toi|cho den|den het|-|–|~|to|until)$/;
const LEAD = /(?<![\p{L}\p{N}])(tu (?:nay|gio|bay gio|hom nay) (?:den|toi)|tu|ke tu|truoc|sau)\s*$/u;
const NEXT_N = /(?<![\p{L}\p{N}])(\d+|mot|hai|ba|bon|nam|sau|bay|muoi) (ngay|tuan) (?:toi|tiep theo|sap toi|nua)(?![\p{L}\p{N}])/gu;
const NUM: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7, muoi: 10 };
const YEAR = 366; // an open-ended "sau T6" reaches a year
// Words that carry no meaning in a search ("lịch môn web của mình"): dropped rather than required.
const STOP = new Set(["mon", "cua", "cac", "nhung", "co", "gi", "nao", "o", "luc", "vao", "ngay", "buoi", "viec", "tim", "xem", "lich", "cho", "voi", "va", "trong", "nhe", "la", "minh", "tui", "em"]);
/** Display names of PART keys, for the line saying what was understood. */
export const PART_VI: Record<string, string> = { "sang som": "sáng sớm", sang: "sáng", trua: "trưa", chieu: "chiều", "chieu toi": "chiều tối", toi: "tối", dem: "đêm", khuya: "khuya" };
const ABBR = new Map(Object.entries(STUDENT_ABBREVIATIONS).map(([k, v]) => [fold(k).text, words(v).map((x) => x.w)]));

type W = { w: string; a: number; b: number };
/** Folded words of `s` with their [a, b) span in `s`. */
function words(s: string): W[] {
  const { text, map } = fold(s);
  return [...text.matchAll(/[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)*/gu)].map((m) => {
    const e = m.index + m[0].length;
    return { w: m[0], a: map[m.index], b: e < map.length ? map[e] : s.length };
  });
}

/** Indices of `ws` that word `t` hits: a prefix (across joined words: "giaitich"), inside a word, an acronym ("csdl"),
 *  a known abbreviation ("oop"), or one typo off. */
function hit(t: string, ws: string[]): number[] {
  if (/^\d+$/.test(t)) return ws.flatMap((w, i) => (w === t ? [i] : [])); // a number names one thing: "bài 1" is never "Bài 12"
  const out = new Set<number>(), add = (i: number, j: number) => { for (let k = i; k <= j; k++) out.add(k); };
  const ab = ABBR.get(t);
  for (let i = 0; i < ws.length; i++) {
    let rest = t, j = i;
    while (j < ws.length - 1 && rest.length > ws[j].length && rest.startsWith(ws[j])) rest = rest.slice(ws[j++].length);
    if (ws[j].startsWith(rest)) add(i, j);
    else if (t.length >= 3 && ws[i].includes(t)) add(i, i);
    if (t.length >= 2 && i + t.length <= ws.length && [...t].every((c, k) => ws[i + k][0] === c)) add(i, i + t.length - 1);
    // an acronym one typo off, from four letters: "csld" for "Cơ sở dữ liệu"
    if (t.length >= 4 && i + t.length <= ws.length && osa(t, ws.slice(i, i + t.length).map((w) => w[0]).join("")) === 1) add(i, i + t.length - 1);
    if (ab && ab.every((p, k) => ws[i + k] === p)) add(i, i + ab.length - 1);
    // One typo from four letters, two from eight; a three-letter word only forgives a swap ("coa"), or "thi" would find "tai".
    const near = (w: string) => osa(t, w) <= (t.length >= 8 ? 2 : 1) && (t.length >= 4 || [...t].sort().join() === [...w].sort().join());
    if (t.length >= 3 && (near(ws[i]) || (ws[i].length > t.length && near(ws[i].slice(0, t.length))))) add(i, i);
  }
  return [...out];
}

/** A type word ("thi") counts only as a whole word: "thi" is not the start of "thiết kế". */
const whole = (t: string, ws: string[]) => ws.flatMap((w, i) => (w === t ? [i] : []));

/** Reads the query with the reader's own date words and parts of day. `now` anchors "mai", "T6", "tuần sau". */
export function parse(raw: string, now: number): Query {
  const d = new Date(now), ref = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes() };
  const ms = (w: { y: number; m: number; d: number }) => new Date(w.y, w.m - 1, w.d).getTime();
  const today = startOfDay(now), q: Query = { words: [], types: [], days: [], due: false, repeat: false };
  // Scope phrases are blanked out of `text` as they are read, so the mention pass and the words skip them (offsets stay).
  let text = raw;
  const blank = (a: number, b: number) => { text = text.slice(0, a) + " ".repeat(b - a) + text.slice(b); };
  const f0 = fold(raw), rawEnd = (i: number) => f0.map[i - 1] + 1;
  // "3 ngày tới", "2 tuần tới": from today, that many days (the reader reads "tới" as the evening)
  for (const m of f0.text.matchAll(NEXT_N)) {
    q.days.push([today, addDays(today, (NUM[m[1]] ?? +m[1]) * (m[2] === "tuan" ? 7 : 1))]);
    blank(f0.map[m.index], rawEnd(m.index + m[0].length));
  }
  // "từ T4 trở đi": the open end is said by "từ"; its tail is no word to find
  for (const m of f0.text.matchAll(/(?<![\p{L}])(?:tro di|tro ve sau|ve sau)(?![\p{L}])/gu)) blank(f0.map[m.index], rawEnd(m.index + m[0].length));
  // The days one date mention stands for. Search reads both ways in time ("hôm qua", "tuần trước"), a week or weekend is all its days,
  // "tháng này" the whole month, and "T2 và T4" each day said.
  const daysOf = (f: Mention): [number, number][] => {
    const v = f.v;
    if (v.k === "rel") return [[addDays(today, v.off), addDays(today, v.off + 1)]];
    if (v.k === "week") return [[addDays(mondayOf(now), 7 * v.off), addDays(mondayOf(now), 7 * v.off + 7)]];
    if (v.k === "month_end" && fold(text.slice(f.start, f.end)).text.trim() === "thang nay") return [[ms({ ...ref, d: 1 }), ms({ y: ref.y, m: ref.m + 1, d: 1 })]];
    const s = spanOf(v, ref);
    if (s) return [[ms(s.from), addDays(ms(s.to), 1)]];
    return [...(v.k === "dow" ? [v.dow, ...(v.more ?? [])] : [undefined])].flatMap((dow) => {
      const one = resolveDate(dow === undefined || v.k !== "dow" ? f : { ...f, v: { ...v, dow, more: undefined } }, ref);
      if (!one) return [];
      const day = ms(one.wc);
      return [[v.k === "weekend" || v.k === "weekend_next" ? addDays(day, -1) : day, addDays(day, 1)] as [number, number]];
    });
  };
  // "trừ T6": days the scope leaves out
  for (const [a, b] of exceptSpans(text)) {
    // a weekday is that weekday anywhere in the scope ("tuần sau trừ T6" is next week's Friday), a date is its day
    const ds = findMentions(text.slice(a, b)).filter((f) => f.kind === "date");
    const off = ds.flatMap((f) => (f.v.k === "dow" ? [] : daysOf(f))), dows = ds.flatMap((f) => (f.v.k === "dow" ? [f.v.dow, ...(f.v.more ?? [])] : []));
    if (off.length || dows.length) { (q.except ??= []).push(...off); if (dows.length) q.exceptDow = [...(q.exceptDow ?? []), ...dows]; blank(a, b); }
  }
  const M = findMentions(text);
  const lead = (a: number, b: number) => { const g = fold(text.slice(a, b)), m = LEAD.exec(g.text); return m ? { at: a + g.map[m.index], w: m[1] } : undefined; };
  const span = (r: [number, number][]) => [Math.min(...r.map((x) => x[0])), Math.max(...r.map((x) => x[1]))] as const;
  let prev = 0;
  for (let i = 0; i < M.length; i++) {
    const f = M[i], v = f.v;
    if (f.kind === "date" || (f.kind === "time" && v.k === "time")) {
      // "từ A đến B", "A-B": one range from the first to the last; "trước/sau/từ A": open on one side
      const g = M[i + 1], L = lead(prev, f.start), w = L?.w ?? "";
      const range = g && g.kind === f.kind && (g.kind === "date" || g.v.k === "time") && RANGE_GAP.test(fold(text.slice(f.end, g.start)).text.trim()) ? g : undefined;
      if (f.kind === "date") {
        const r = daysOf(f);
        if (r.length) {
          const [a, b] = span(r), to = range ? span(daysOf(range))[1] : b;
          if (range || w.startsWith("tu ")) q.days.push([w.startsWith("tu ") ? today : a, to]);
          else if (w === "truoc") q.days.push([today, a]);
          else if (w === "sau") q.days.push([b, addDays(b, YEAR)]);
          else if (w === "tu") q.days.push([a, addDays(a, YEAR)]);
          else q.days.push(...r);
        }
      } else if (v.k === "time") {
        const m = v.h * 60 + v.mi, e = range?.v.k === "time" ? range.v.h * 60 + range.v.mi : undefined;
        if (e !== undefined) q.clock = [m, e];
        else if (w === "truoc") q.clock = [0, m];
        else if (w === "sau" || w === "tu") q.clock = [m, 1440];
        else q.at = m;
      }
      if (L) blank(L.at, f.start);
      if (range) { blank(f.end, range.start); i++; }
      // a part word in a date stays ("tối nay"); in a clock it is the clock's own ("5h chiều")
      for (const h of range ? [f, range] : [f]) text = text.slice(0, h.start) + raw.slice(h.start, h.end).replace(/\S+/g, (x) => (f.kind === "date" && PARTS.includes(fold(x).text) ? x : " ".repeat(x.length))) + text.slice(h.end);
      prev = (range ?? f).end;
      continue;
    }
    if (f.kind === "recur") q.repeat = true;
    else if (f.kind !== "dur") continue; // places, courses, codes stay words
    // Part words inside a date ("tối nay") still count: blank only the rest of it.
    text = text.slice(0, f.start) + raw.slice(f.start, f.end).replace(/\S+/g, (x) => (PARTS.includes(fold(x).text) ? x : " ".repeat(x.length))) + text.slice(f.end);
    prev = f.end;
  }
  if (q.clock) q.at = undefined;
  const rest = text;
  const ws = words(rest).map((x) => x.w);
  const at = (i: number, p: string) => { const ps = p.split(" "); return ps.every((x, k) => ws[i + k] === x) ? ps.length : 0; };
  for (let i = 0; i < ws.length; ) {
    let n: number;
    const part = [...PARTS].sort((a, b) => b.length - a.length).find((p) => at(i, p));
    const st = STATUS.find(([p]) => at(i, p)), ty = TYPES.find(([p]) => at(i, p)), due = DUE.find((p) => at(i, p));
    if (st) { q.status = st[1]; n = at(i, st[0]); }
    else if (part) {
      // A search reaches wider than the reader's slots: "sáng" from 04:00 (a 06:45 class), "đêm"/"khuya" past midnight to 04:00 (to > 1440).
      const key = PART_ALIAS[part] ?? part, s = PART[key], small = 4 * 60;
      q.part = { key, from: key.startsWith("sang") ? small : Math.min(s.before[0], s.start[0]) * 60, to: key === "dem" || key === "khuya" ? 1440 + small : s.due[0] * 60 + s.due[1] };
      n = at(i, part);
    }
    else if (due) { q.due = true; n = at(i, due); }
    else if (ty) { q.types.push({ type: ty[1], words: ty[0].split(" ") }); n = at(i, ty[0]); }
    else { if (!STOP.has(ws[i])) q.words.push(ws[i]); n = 1; }
    i += n;
  }
  return q;
}

const minuteOf = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

/** Does `x` pass every filter and hit every word? */
export function matches(x: Task, q: Query, now: number): boolean {
  const hay = [x.title, x.course, x.location, x.teacher].filter(Boolean).flatMap((s) => words(s!).map((w) => w.w)), ty = typeOf(x);
  if (q.types.length && !q.types.some((c) => c.type === ty || (c.type === "exam" && x.forId) || c.words.every((w) => whole(w, hay).length))) return false;
  if (q.status === "live" && x.doneAt) return false;
  if (q.status === "done" && !x.doneAt) return false;
  if (q.status === "late" && (x.fixed || x.doneAt || (x.deadline ?? x.end ?? Infinity) >= now)) return false; // lectures, exams, busy blocks are never ticked, so never late
  if (q.repeat && !x.rrule && !x.section) return false;
  // A night part runs past midnight: "đêm mai" is tomorrow from its evening to the small hours after it.
  const late = q.part && q.part.to > 1440 ? (q.part.to - 1440) * 60_000 : 0;
  const inDay = (t: number, a: number, b: number) => (t >= a && t < b && (!late || minuteOf(t) >= q.part!.from)) || (late > 0 && t >= b && t < b + late);
  if (q.days.length) {
    const ts = q.due ? [x.deadline] : [x.start, x.deadline];
    if (!q.days.some(([a, b]) => ts.some((t) => t !== undefined && inDay(t, a, b)))) return false;
  } else if (q.due && x.deadline === undefined) return false;
  if (q.except?.length) { const t = q.due ? x.deadline : x.start; if (t !== undefined && q.except.some(([a, b]) => t >= a && t < b)) return false; }
  if (q.exceptDow?.length && x.start !== undefined && q.exceptDow.includes(new Date(x.start).getDay())) return false;
  if (q.clock) { const m = minuteOf(x.start!); if (m < q.clock[0] || m >= q.clock[1]) return false; }
  if (q.part) { const m = minuteOf(x.start!); if (late ? m < q.part.from && m >= q.part.to - 1440 : m < q.part.from || m >= q.part.to) return false; }
  if (q.at !== undefined) { const m = minuteOf(x.start!); if (q.at < m || q.at >= m + Math.max(60, (x.end! - x.start!) / 60_000)) return false; }
  return q.words.every((w) => hit(w, hay).length > 0);
}

/** Title spans to tint: whole words hit by the query's words or type words, neighbours merged ("Báo cáo"). */
export function hits(title: string, q: Query): [number, number][] {
  const ws = words(title), fw = ws.map((x) => x.w), on = new Set([...q.words.flatMap((w) => hit(w, fw)), ...q.types.flatMap((c) => c.words).flatMap((w) => whole(w, fw))]);
  const out: [number, number][] = [];
  ws.forEach((x, i) => {
    if (!on.has(i)) return;
    const last = out[out.length - 1];
    if (last && on.has(i - 1) && !title.slice(last[1], x.a).trim()) last[1] = x.b; else out.push([x.a, x.b]);
  });
  return out;
}

/** Anything to search by? An empty or all-stopword query lists nothing. */
export const asked = (q: Query) => !!(q.words.length || q.types.length || q.days.length || q.due || q.part || q.at !== undefined || q.clock || q.status || q.repeat);

// One row per series, the same kin as apply.ts scopeIds: a lecture section, a split task's sittings, a said repeat (rrule + title).
const seriesOf = (x: Task) => x.section ?? x.parentId ?? (x.rrule ? `${x.rrule}|${x.title}` : x.id);

/** views.html "Search": placed tasks that match, one per series (its next live time, else its latest),
 *  by day: today and later ascending, then past days newest first. */
export function found(tasks: Task[], q: Query, now: number): { day: number; xs: Task[] }[] {
  if (!asked(q)) return [];
  const today = startOfDay(now), parents = new Set(tasks.map((x) => x.parentId));
  const pick = new Map<string, Task>();
  for (const x of tasks) {
    if (x.deletedAt || x.start === undefined || parents.has(x.id) || !matches(x, q, now)) continue;
    const k = seriesOf(x), cur = pick.get(k);
    const next = (a: Task) => !a.doneAt && a.start! >= today;
    if (!cur || (next(x) ? !next(cur) || x.start < cur.start! : !next(cur) && x.start > cur.start!)) pick.set(k, x);
  }
  const days = new Map<number, Task[]>();
  for (const x of pick.values()) { const d = startOfDay(x.start!); days.set(d, [...(days.get(d) ?? []), x]); }
  return [...days].map(([day, xs]) => ({ day, xs: xs.sort((a, b) => a.start! - b.start!) }))
    .sort((a, b) => (a.day >= today) !== (b.day >= today) ? (a.day >= today ? -1 : 1) : a.day >= today ? a.day - b.day : b.day - a.day);
}

/** Puts `q` first among recent searches, accent variants counting as one; the newest 5. */
export function remember(list: string[], q: string): string[] {
  const k = fold(q.trim()).text;
  return k ? [q.trim(), ...list.filter((x) => fold(x).text !== k)].slice(0, 5) : list;
}

/** views.html "Search, first time": what the field understands, before there is anything to find. */
export const SAMPLES = ["thi tuần sau", "hạn T6 chưa xong", "tối mai", "csdl"];

// Phrases before a course name on an exam row ("Thi Mẫu thiết kế", "Kiểm tra giữa kỳ Triết", "Kỳ thi Toán"). Whole phrases, not single words:
// "Kiểm thử phần mềm" and "Kỹ thuật lập trình" are courses ("kiem", "ky" alone are not exam words). Not "học": "Học máy" is a course.
const EXAM_LEAD: string[][] = [["kiem", "tra"], ["giua", "ky"], ["cuoi", "ky"], ["ky", "thi"], ["thi"], ["on"]];
/** A course's whole name, as the timetable writes it, past exam words. Never cut: Vietnamese words span syllables ("thiết kế"). */
export function courseName(title: string): string {
  const ws = words(title);
  let from = 0;
  for (let hit = true; hit && from < ws.length;) {
    const p = EXAM_LEAD.find((ph) => ph.every((w, k) => ws[from + k]?.w === w));
    hit = !!p;
    if (p) from += p.length;
  }
  return from >= ws.length ? title.trim() : title.slice(ws[from].a, ws[ws.length - 1].b);
}
/** A long course name by its initials, the way students write it ("Kiểm thử phần mềm" is "KTPM", "Giải tích 2" is "GT2"); one or two words stay whole. */
export function courseAbbr(name: string): string {
  const ws = words(name);
  if (ws.length <= 2) return name.trim();
  return ws.map((w) => (/^\d+$/.test(w.w) ? w.w : name.slice(w.a, w.a + 1).toUpperCase())).join("");
}

export type Suggestion = { q: string; name?: string }; // name: the course a short query stands for, for the line under it

/** views.html "Search, suggestions": five searches drawn from the user's own tasks, each gathering a handful of them.
 *  A candidate counts when it finds 2 to 12 rows; single finds only fill what is left. */
export function suggest(tasks: Task[], now: number): Suggestion[] {
  const open = tasks.filter((x) => !x.deletedAt && !x.doneAt && x.start !== undefined && x.start >= startOfDay(now));
  const first = (xs: Task[], f: (x: Task) => number) => [...xs].sort((a, b) => f(a) - f(b))[0];
  const n = (q: string) => found(tasks, parse(q, now), now).reduce((a, g) => a + g.xs.length, 0);
  const mon = mondayOf(now);
  const week = (ms: number) => (ms < addDays(mon, 7) ? "tuần này" : "tuần sau");
  // Courses are named from timetable rows (lectures, exams), never from LMS course text, which teachers type and misspell.
  const names = new Map<string, string>();
  for (const x of open) if (x.fixed === "lecture" || x.fixed === "exam") { const c = courseName(x.title); names.set(fold(c).text, c); }
  // A long name goes by its initials, the way students write it ("ptudd"), when they find the same rows.
  const courses = [...names.values()].map((name) => {
    const ws = words(name), full = name.toLowerCase(), acr = ws.map((w) => w.w[0]).join("");
    return { q: ws.length > 4 && n(acr) === n(full) ? acr : full, name };
  }).sort((a, b) => n(b.q) - n(a.q)).slice(0, 2);
  const exam = first(open.filter((x) => x.fixed === "exam"), (x) => x.start!);
  const dueAt = first(open.filter((x) => (dueOf(x) ?? -1) >= now), (x) => x.deadline!)?.deadline;
  const room = first(open.filter((x) => (x.fixed === "lecture" || x.fixed === "exam") && x.location), (x) => x.start!)?.location;
  const cands: Suggestion[] = [
    ...courses.map((c) => (c.q === c.name.toLowerCase() ? { q: c.q } : c)),
    ...[exam ? `thi ${week(exam.start!)}` : undefined, "lịch thi", dueAt !== undefined ? `hạn ${week(dueAt)}` : undefined,
      "tối mai", "mai", "bài tập chưa xong", room?.toLowerCase(), "đã xong tuần này", "trễ", "mỗi tuần"]
      .filter((q): q is string => !!q).map((q) => ({ q })),
  ].filter((c, i, a) => a.findIndex((d) => d.q === c.q) === i);
  const sized = cands.map((c) => ({ c, k: n(c.q) }));
  return [...sized.filter((x) => x.k >= 2 && x.k <= 12), ...sized.filter((x) => x.k === 1 || x.k > 12)].slice(0, 5).map((x) => x.c);
}
