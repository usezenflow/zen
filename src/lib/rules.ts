// Standing rules ("lời dặn") have their own small language: days, a time window, maybe a kind of task.
// The Nhịp screen sends everything here; home sends only sentences that sound like a rule. The task NLU never sees them.
// Spoken shapes handled: numbers as words, self-corrections ("à không"), chains ("và"), exceptions ("trừ"), day ranges, past midnight.
import { kindsOf } from "./nlu/kind";
import { fold } from "./nlu/reader/fold";
import { CORRECTION } from "./nlu/reader/mentions";
import { repair } from "./nlu/reader/repair";
import { parseSpokenNumber } from "./nlu/reader/spoken";
import { KIND_VI } from "./reasons";
import type { Kind, Rule } from "./types";

export type RuleDraft = Omit<Rule, "id" | "at">;
export type Said = { add: RuleDraft[] } | { forget: Rule[] };

/** Home routes a sentence here when it sounds like a rule, not a task. */
export const RULE_CUE = /để trống|bỏ trống|giữ trống|đừng xếp|không xếp|đừng (?:đặt|lên lịch)|muốn nghỉ|lời dặn/i;
// "bỏ"/"thôi" forget only with a rule word nearby: "bỏ trống tối T6" is a new rule, not a forget
const FORGET = /(?:^|\s)(?:quên|xoá|xóa|huỷ|hủy)(?=\s|$)|(?:^|\s)(?:bỏ|thôi)(?!\s+trống)\s.*(?:lời dặn|dặn|nữa|không cần|cái|vụ)/i;
const ALL = /(?:^|\s)(?:hết|tất cả|mọi lời dặn)(?=\s|$)/;
// "riêng" is an exception only before a day, kind or time: "việc riêng" is a reason, not an exception
const EXCEPT = /(?:^|[\s,])(?:ngoại trừ|trừ|riêng(?=\s+(?:thứ|chủ nhật|cuối tuần|ngày|t[2-7]|việc|học|tập|\d)))\s/;
// a rule asks for time kept free; days alone ("nộp bài thứ sáu") are a task, not a rule
const INTENT = /trống|đừng|không|chẳng|nghỉ|ngủ|rảnh|bận|giữ|tránh|miễn|việc riêng/;
const CHAIN = /\s*(?:,|;|\svà\s|\svới\s|\scòn\s|\scả\s)\s*/;
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const ALL_KINDS: Kind[] = ["study", "exercise", "chores", "social", "other", "work", "errand", "finance", "self"];
const monFirst = (a: number, b: number) => ((a + 6) % 7) - ((b + 6) % 7);

const DAY_WORD = "thứ\\s+(?:hai|ba|tư|năm|sáu|bảy|[2-7])|t[2-7]|chủ nhật|cn";
// word edges by hand: JS \b treats "ư" as a non-letter, so /tư\b/ never matches "thứ tư"
const DAYS: [RegExp, number[]][] = ([
  ["cuối tuần", [6, 0]], ["ngày thường|trong tuần", [1, 2, 3, 4, 5]], ["chủ nhật|cn", [0]],
  ["thứ (?:hai|2)|t2", [1]], ["thứ (?:ba|3)|t3", [2]], ["thứ (?:tư|4)|t4", [3]],
  ["thứ (?:năm|5)|t5", [4]], ["thứ (?:sáu|6)|t6", [5]], ["thứ (?:bảy|7)|t7", [6]],
] as const).map(([w, d]) => [new RegExp(`(?<![\\p{L}\\d])(?:${w})(?![\\p{L}\\d])`, "u"), [...d]]);
const EVERY = /mỗi ngày|hằng ngày|hàng ngày|ngày nào|(?:sáng|trưa|chiều|tối|đêm) nào|mọi ngày/;
const DAY_RANGE = new RegExp(`(${DAY_WORD})\\s*(?:đến|tới|-)\\s*(${DAY_WORD})`);
const PARTS: [RegExp, number, number, string][] = [[/sáng/, 300, 720, "sáng"], [/trưa/, 690, 810, "trưa"], [/chiều/, 720, 1080, "chiều"], [/tối/, 1080, 1440, "tối"], [/đêm|khuya/, 1320, 1440, "đêm"]];
// a clock: digits, an optional minute, then maybe its part of day ("11 giờ đêm", "7h30 sáng")
const CLOCK = /(\d{1,2})(?:\s*(?:giờ|h|g|:)\s*(\d{1,2})?)?(?:\s*(sáng|trưa|chiều|tối|đêm|khuya))?/g;
// "từ 9 đến 11 giờ": the unit is often said once, after the second number
const RANGE = /(\d{1,2})(?:\s*(?:giờ|h|g|:)\s*(\d{1,2})?)?(?:\s*(sáng|trưa|chiều|tối|đêm|khuya))?\s*(?:đến|tới|-)\s*(\d{1,2})(?:\s*(?:giờ|h|g|:)\s*(\d{1,2})?)?(?:\s*(sáng|trưa|chiều|tối|đêm|khuya))?/;
// spoken numbers the shared reader leaves alone because no "giờ" follows them: "từ chín đến 11 giờ"
const SPOKEN = /(?<=(?:^|\s)(?:từ|đến|tới|sau|trước)\s+)((?:mười|(?:hai|ba|bốn|năm|sáu|bảy|tám|chín) mươi)(?:\s+(?:một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín))?|một|hai|ba|bốn|năm|sáu|bảy|tám|chín)(?=\s|$)/g;

interface Win { op: "range" | "after" | "before" | "part" | "bare"; from: number; to: number; label: string }
interface Bits { days: number[]; every: boolean; win?: Win; kinds: Kind[] }

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (m: number) => `${Math.floor(m / 60)}:${pad(m % 60)}`;
const dayOf = (w: string) => DAYS.slice(2).find(([re]) => re.test(w))?.[1][0];

/** Minutes after midnight; a part of day (said with the clock, else anywhere in the clause) makes 9 into 21.
 *  "12 giờ đêm/tối" is midnight (1440, the end of the day), "1 giờ đêm" is 01:00, "1 giờ trưa" is 13:00. */
function clock(h: string, m: string | undefined, part: string | undefined, clausePart: string | undefined): number {
  const n = Number(h), p = part ?? clausePart ?? "";
  const hr = n === 24 ? 24
    : /đêm|khuya/.test(p) ? (n === 12 ? 24 : n >= 6 && n < 12 ? n + 12 : n)
    : /tối/.test(p) ? (n === 12 ? 24 : n < 12 ? n + 12 : n)
    : /chiều/.test(p) ? (n < 12 ? n + 12 : n)
    : /trưa/.test(p) ? (n < 5 ? n + 12 : n)
    : n;
  return (hr === 24 ? 24 : hr % 24) * 60 + Math.min(59, Number(m ?? 0));
}
const EARLY = 300; // "sau 12 giờ đêm": the small hours run until morning (sáng), not to the end of the day

function bits(s: string): Bits {
  const days = new Set(DAYS.filter(([re]) => re.test(s)).flatMap(([, d]) => d));
  const dr = DAY_RANGE.exec(s);
  if (dr) { const a = dayOf(dr[1]), b = dayOf(dr[2]); if (a !== undefined && b !== undefined) for (let d = a; ; d = (d + 1) % 7) { days.add(d); if (d === b) break; } }
  const part = PARTS.find(([re]) => re.test(s));
  const pm = part?.[3];
  let win: Win | undefined;
  const r = RANGE.exec(s);
  const c = [...s.matchAll(CLOCK)].filter((m) => /giờ|h|g|:/.test(m[0]) || /(?:sau|trước)\s+\d/.test(s));
  if (r) { const from = clock(r[1], r[2], r[3], pm), to = clock(r[4], r[5], r[6] ?? r[3], pm); win = { op: "range", from, to, label: `${hm(from)} - ${hm(to)}` }; }
  else if (c.length && /sau\s+\d/.test(s)) { const at = clock(c[0][1], c[0][2], c[0][3], pm), from = at % 1440; win = { op: "after", from, to: from < EARLY ? EARLY : 1440, label: `sau ${hm(from)}` }; }
  else if (c.length && /trước\s+\d/.test(s)) { const to = clock(c[0][1], c[0][2], c[0][3], pm); win = { op: "before", from: 0, to, label: `trước ${hm(to)}` }; }
  else if (c.length) { const at = clock(c[0][1], c[0][2], c[0][3], pm); win = { op: "bare", from: at, to: at, label: hm(at) }; }
  else if (part) win = { op: "part", from: part[1], to: part[2], label: part[3] };
  const kinds = kindsOf(s);
  return { days: [...days].sort(monFirst), every: EVERY.test(s), win, kinds };
}

/** A self-correction keeps the earlier clause and replaces only what the words after the cue name. */
function corrected(a: Bits, b: Bits): Bits {
  let win = b.win ?? a.win;
  // "sau 10 giờ, à nhầm, 11 giờ": a bare clock takes the earlier operator
  if (b.win?.op === "bare" && a.win) {
    const at = b.win.from < 720 && (a.win.op === "after" ? a.win.from : a.win.to) >= 720 ? b.win.from + 720 : b.win.from; // "10 giờ tối, à nhầm, 11 giờ" stays evening
    win = a.win.op === "after" ? { op: "after", from: at, to: 1440, label: `sau ${hm(at)}` } : a.win.op === "before" ? { op: "before", from: 0, to: at, label: `trước ${hm(at)}` } : a.win;
  }
  return { days: b.days.length || b.every ? b.days : a.days, every: b.every || (!b.days.length && a.every), win, kinds: b.kinds.length ? b.kinds : a.kinds };
}

function textOf(d: RuleDraft, win: string, only: boolean): string {
  const ds = d.days;
  const dl = !ds.length ? "" : ds.length === 2 && ds.includes(0) && ds.includes(6) ? "cuối tuần" : ds.length === 5 && !ds.includes(0) && !ds.includes(6) ? "ngày thường"
    : ds.length === 6 ? `trừ ${WD[[0, 1, 2, 3, 4, 5, 6].find((x) => !ds.includes(x))!]}` : ds.map((x) => WD[x]).join(", ");
  const when = [win || "cả ngày", dl].filter(Boolean).join(" ");
  const kinds = d.kinds.length ? (only ? ALL_KINDS.filter((k) => !d.kinds.includes(k)) : d.kinds).map((k) => KIND_VI[k]).join(", ") : "";
  const t = !kinds ? `${when} để trống` : only ? `${when} chỉ ${kinds}` : `Không ${kinds} ${when}`;
  return t[0].toUpperCase() + t.slice(1);
}

/** Words the shared reader can't see as numbers (no "giờ" after them) and its own repairs: "từ chín đến mười một giờ". */
function clean(said: string): string {
  return repair(asr(said), "voice").text.normalize("NFC").toLowerCase().replace(SPOKEN, (w) => String(parseSpokenNumber(fold(w).text) ?? w));
}

// Whisper mishearings, fixed only in the shapes a rule uses so a real word elsewhere stays.
// Tones dropped or swapped ("thứ sau", "chủ nhựt"), tr/ch, s/x and d/r/gi swaps ("để chống", "đừng sếp", "10 dờ"),
// "tôi" (I) for "tối" (evening) before a day, and text with no diacritics at all.
const W = (src: string) => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}\\d])`, "gu");
const DAYFIX: [string, string][] = [["hai|hài|hại|hái", "hai"], ["ba|bà|bá|bả", "ba"], ["tư|tu|tứ|từ|tử", "tư"], ["năm|nam|nằm|nắm", "năm"], ["sáu|sau|sáo|xáu", "sáu"], ["bảy|bẩy|bay|bãi|bải|bậy|bẫy", "bảy"]];
const MISHEARD: [RegExp, string][] = [
  ...DAYFIX.map(([v, d]): [RegExp, string] => [W(`(?:thứ|thư|thử|thú|thu|thự)\\s+(?:${v})`), `thứ ${d}`]),
  [W("ch[ủuú]\\s+nh[ậạặấấ]t|chủ\\s+nh[ựứ]t|chủ\\s+nhặc"), "chủ nhật"],
  [W("(?:cuối|quối|cúi|cuoi)\\s+(?:tuần|tuầng|tuan)"), "cuối tuần"],
  [W("để\\s+(?:chống|chóng|chông|trông|trong)"), "để trống"],
  [W("(?:đừng|đứng|dừng|đừn|đùng)\\s+(?:xếp|sếp|xép|xết|sệp)"), "đừng xếp"],
  [W("không\\s+(?:sếp|xép|xệp)"), "không xếp"],
  [/(\d)\s*(?:dờ|rờ|giơ|giở|giời)(?![\p{L}])/gu, "$1 giờ"],
  [/(giờ|\dh?)\s*(?:đếm|đem|đém|đểm)(?![\p{L}])/gu, "$1 đêm"],
  [W("buổi\\s+tôi"), "buổi tối"],
  [/(?<![\p{L}])tôi(?=\s+(?:thứ|chủ nhật|cuối tuần|nào|t[2-7](?![\p{L}\d])))/gu, "tối"],
  [/(?<![\p{L}])(?:chừ|trư|trữ)(?=\s+(?:thứ|chủ|việc|ngày|cuối|t[2-7]))/gu, "trừ"],
  [/(?<![\p{L}])(?:sao|xau)(?=\s+\d)/gu, "sau"],
  [W("chước|trứơc|trươc|trúc"), "trước"],
];
// No diacritics anywhere (typed fast, or Whisper dropped them): put back the marks of the rule words.
const BARE: [RegExp, string][] = [
  ...DAYFIX.map(([v, d]): [RegExp, string] => [W(`thu\\s+(?:${v.split("|").filter((x) => !/[^a-z]/.test(x)).join("|") || d})`), `thứ ${d}`]),
  [W("thu\\s+([2-7])"), "thứ $1"], [W("chu nhat"), "chủ nhật"], [W("cuoi tuan"), "cuối tuần"], [W("ngay thuong"), "ngày thường"],
  [/(\d)\s*(?:gio|h)?\s+(?:toi|den)\s+(?=\d)/gu, "$1 tới "], [W("sang"), "sáng"], [W("trua"), "trưa"], [W("chieu"), "chiều"], [W("toi"), "tối"], [W("dem"), "đêm"],
  [W("gio"), "giờ"], [W("ruoi"), "rưỡi"], [W("de trong"), "để trống"], [W("dung xep"), "đừng xếp"], [W("khong"), "không"], [W("xep"), "xếp"],
  [W("hoc"), "học"], [W("on"), "ôn"], [W("tap"), "tập"], [W("the duc"), "thể dục"], [W("don"), "dọn"], [W("giat"), "giặt"], [W("nau"), "nấu"], [W("gap"), "gặp"], [W("hen"), "hẹn"], [W("di choi"), "đi chơi"],
  [W("ngoai tru"), "ngoại trừ"], [W("tru"), "trừ"], [W("rieng"), "riêng"], [W("truoc"), "trước"], [/(?<![\p{L}])tu(?=\s+\d)/gu, "từ"], [W("den"), "đến"], [W("va"), "và"],
  [W("moi ngay"), "mỗi ngày"], [W("nao"), "nào"], [W("ngay"), "ngày"], [W("quen"), "quên"], [W("bo"), "bỏ"], [W("xoa"), "xoá"], [W("thoi"), "thôi"], [W("loi dan"), "lời dặn"], [W("muon nghi"), "muốn nghỉ"],
];
export function asr(said: string): string {
  let s = said.normalize("NFC").toLowerCase();
  if (fold(s).text === s) for (const [re, to] of BARE) s = s.replace(re, to);
  for (const [re, to] of MISHEARD) s = s.replace(re, to);
  return s;
}

/** Home: a sentence goes to the rule reader when it sounds like a rule, heard right or not. */
export const isRule = (said: string) => RULE_CUE.test(asr(said));

/** Parses rule sentences into drafts; empty when nothing names days or a time window. */
export function parseRules(said: string): RuleDraft[] {
  let s = clean(said);
  if (!INTENT.test(s)) return [];
  // the correction cue: the words after it replace what they name in the last clause before it
  const f = fold(s).text;
  let fix: Bits | undefined;
  const cues = [...f.matchAll(CORRECTION)];
  if (cues.length) {
    const c = cues[cues.length - 1], cut = (c.index ?? 0) + c[0].length;
    fix = bits(s.slice(cut));
    s = s.slice(0, c.index ?? 0);
  }
  // the exception: days, kinds or a time after "trừ" come off the whole sentence; it runs to the next comma, so it may come first
  const ex = EXCEPT.exec(s);
  let exc: Bits | undefined;
  if (ex) {
    const at = ex.index + ex[0].length, stop = s.slice(at).search(/[,;.]/), end = stop < 0 ? s.length : at + stop;
    exc = bits(s.slice(at, end));
    s = `${s.slice(0, ex.index)} ${s.slice(end + 1)}`;
  }
  // chains: a clause with its own window stands alone; day-only or kind-only clauses join their neighbour
  const parts = s.split(CHAIN).map((x) => x.trim()).filter(Boolean).map(bits);
  const groups: Bits[] = [];
  let pending: Bits[] = [];
  const join = (a: Bits, b: Bits): Bits => ({ days: [...new Set([...a.days, ...b.days])].sort(monFirst), every: a.every || b.every, win: a.win ?? b.win, kinds: [...new Set([...a.kinds, ...b.kinds])] });
  for (const p of parts) {
    if (p.win && p.win.op !== "bare") { groups.push([...pending, p].reduce(join)); pending = []; }
    else if (groups.length) groups[groups.length - 1] = join(groups[groups.length - 1], p);
    else pending.push(p);
  }
  if (pending.length) groups.push(pending.reduce(join));
  if (fix && groups.length) groups[groups.length - 1] = corrected(groups[groups.length - 1], fix);
  else if (fix) groups.push(fix);

  const out: RuleDraft[] = [];
  for (const g of groups) {
    let days = g.days;
    let kinds = g.kinds, only = false;
    if (exc?.days.length) days = (days.length ? days : [0, 1, 2, 3, 4, 5, 6]).filter((d) => !exc.days.includes(d)).sort(monFirst);
    if (exc?.kinds.length) { kinds = ALL_KINDS.filter((k) => !exc.kinds.includes(k) && (!g.kinds.length || g.kinds.includes(k))); only = !g.kinds.length; }
    const w = g.win && g.win.op !== "bare" ? g.win : undefined;
    if (!w && !days.length) continue; // "mỗi ngày" alone, or nothing: not a rule
    if (days.length === 7) days = [];
    const from = w?.from ?? 0, to = w?.to ?? 1440;
    let label = w?.label ?? "";
    const cut = exc?.win && exc.win.op !== "bare" ? exc.win : undefined;
    if (cut && from < to) {
      // "tối nào cũng trống trừ 8 đến 9 giờ": an hour said without its part takes the window's ("8" in the evening is 20)
      const shift = cut.to <= from && cut.from + 720 >= from ? 720 : 0, a = cut.from + shift, b = cut.to + shift;
      label = `${label || "cả ngày"} trừ ${hm(a)} - ${hm(b)}`;
      for (const [x, y] of [[from, Math.min(to, a)], [Math.max(from, b), to]]) if (x < y) { const d = { text: "", days, from: x, to: y, kinds }; d.text = textOf(d, label, only); out.push(d); }
      continue;
    }
    if (from < to) { const d = { text: "", days, from, to, kinds }; d.text = textOf(d, label, only); out.push(d); continue; }
    if (from === to) continue;
    // past midnight ("từ 23 giờ đến 6 giờ sáng"): the evening on these days, the early hours on the next ones
    const a = { text: "", days, from, to: 1440, kinds }, b = { text: "", days: days.map((d) => (d + 1) % 7).sort(monFirst), from: 0, to, kinds };
    a.text = b.text = textOf(a, label, only);
    if (from < 1440) out.push(a); // "từ 12 giờ đêm": nothing left of the evening
    out.push(b);
  }
  return out;
}

/** The rules a "forget" sentence points at, scored by the days, clock and kinds it names plus shared words. A tie between different rules is ambiguous: forget nothing. A split rule goes whole. */
function pick(said: string, rules: Rule[]): Rule[] {
  const c = clean(said), b = bits(c);
  if (ALL.test(c)) return rules;
  const w = new Set(c.split(/[^\p{L}\d]+/u).filter((x) => x.length > 1 && !["để", "trống", "lời", "dặn", "quên", "bỏ", "thôi"].includes(x)));
  const score = (r: Rule) => (b.days.some((d) => r.days.includes(d)) ? 2 : 0) + (b.win && [r.from, r.to].includes(b.win.op === "before" ? b.win.to : b.win.from) ? 2 : 0)
    + (b.kinds.some((k) => r.kinds.includes(k)) ? 1 : 0) + 0.5 * r.text.toLowerCase().split(/[^\p{L}\d]+/u).filter((x) => w.has(x)).length;
  const ranked = rules.map((r) => ({ r, n: score(r) })).sort((x, y) => y.n - x.n);
  const top = ranked[0];
  if (!top?.n && !(rules.length === 1 && /dặn/.test(c))) return [];
  if (ranked.some((x) => x.n === top.n && x.r.text !== top.r.text)) return [];
  return rules.filter((r) => r.text === top.r.text);
}

/** The local reader: no model needed for the common shapes. */
export function readRule(said: string, rules: Rule[]): Said | undefined {
  if (FORGET.test(asr(said))) { const r = pick(said, rules); return r.length ? { forget: r } : undefined; }
  const add = parseRules(said);
  return add.length ? { add } : undefined;
}
