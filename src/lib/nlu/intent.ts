// Free-form commands on existing tasks ("xoá việc giặt đồ", "dời họp sang 3h", "đổi tên A thành B", "xong bài tập toán").
// A line is a command only when its verb leads and its target finds a task; anything else stays a new task.
// Typos and slang are folded to one form first (canon): "k cần", "ko cần", "khôg cần" read as "khong can".
import { found, matches, parse, type Query } from "../find";
import { fold, osa } from "./reader/fold";
import { findMentions } from "./reader/mentions";
import { telexed } from "./reader/telexed";
import { decodeCell } from "./reader/repair";
import { readActions } from "./adapt";
import type { Action, Task } from "../types";
import { addDays, mondayOf, startOfDay } from "../../components/cal";
import { t } from "../i18n";

export type Verb = "delete" | "move" | "rename" | "done" | "extend" | "reopen" | "shorten";
export const VERB_VI: Record<Verb, string> = { delete: "Xoá", move: "Dời", rename: "Đổi tên", done: "Xong", extend: "Thêm", reopen: "Mở lại", shorten: "Rút" };

const fold1 = (w: string) => fold(w).text.replace(/[^\p{L}\p{N}]/gu, "");
// Teencode and short forms, folded.
const SLANG: Record<string, string> = { k: "khong", ko: "khong", hok: "khong", khog: "khong", khum: "khong", hong: "khong", kg: "khong", r: "roi", rui: "roi", xog: "xong", dc: "duoc", vs: "va", n: "va", thn: "then", tmr: "mai", tmrw: "mai", h: "gio", g: "gio", tieng: "gio", ting: "gio", p: "phut", ph: "phut",
  lun: "luon", dum: "gium", nhen: "nhe", nghen: "nhe", ik: "di", nka: "nha", nhoa: "nha",
  ruoi: "ruoi" }; // "rưỡi" is half, never a typo of "rồi" (which orders)
// Function words a typo can land on (one edit away, from 4 letters, and only if that is the one word). No title word is in here.
const VOCAB = ["khong", "roi", "xong", "duoc", "mai", "khoi", "thoi", "thanh", "can", "cai", "nua", "nhe", "nha", "di", "luon", "giup", "gium", "voi", "pls", "plz", "please", "and", "va", "de", "sang", "lui", "som", "muon", "rac", "khoan", "tien", "chuyen", "da", "gio", "phut", "bo", "to", "sau", "do"];
/** The canonical form of a word: teencode, then a 1-edit typo of a function word. */
export const canon = (w: string): string => {
  const f = fold1(w);
  if (f in SLANG) return SLANG[f];
  if (VOCAB.includes(f) || f.length < 4) return f;
  const hit = VOCAB.filter((v) => osa(f, v) === 1);
  return hit.length === 1 ? hit[0] : f;
};
const canonText = (s: string) => s.trim().split(/\s+/).map(canon).join(" ");
// Trailing particles, dropped from the end of a line: "xoá gym nhé", "giặt đồ xong r đi".
const PARTICLES = ["nhe", "nha", "di", "luon", "gium", "giup", "voi", "nua", "a", "thoi", "pls", "plz", "please"]; // "xoá gym thôi": just do it
// "trở đi" keeps its "đi": "xoá gym từ T4 trở đi"
// A word as said, or its slang; no typo fix.
const plainOf = (w: string) => { const f = fold1(w); return SLANG[f] ?? f; };
// A trailing particle, typos forgiven ("nhaa"), except "thôi", which is said as it is: "huyền thoại" keeps its "thoại".
const particle = (w: string) => PARTICLES.includes(plainOf(w)) || (canon(w) !== "thoi" && PARTICLES.includes(canon(w)));
const strip = (toks: string[]) => { const out = [...toks]; while (out.length > 1 && particle(out.at(-1)!) && !(plainOf(out.at(-1)!) === "di" && fold1(out.at(-2)!) === "tro")) out.pop(); return out; };

// Folded verb words, phrases first. A word with one typo still counts ("xao", "remvoe", "doi tne"), as does Telex left in ("xoas", "dowfi").
// Heard forms too: "sóa" (s/x), "truyển" (tr/ch).
const VERBS: [string, Verb][] = [
  ["danh dau chua xong", "reopen"], ["bo danh dau", "reopen"], ["chua xong", "reopen"], ["mo lai", "reopen"], ["lam lai", "reopen"], ["reopen", "reopen"], ["undone", "reopen"], ["uncheck", "reopen"],
  ["rut ngan", "shorten"], ["rut", "shorten"], ["bot", "shorten"], ["giam", "shorten"], ["shorten", "shorten"],
  ["bo qua", "delete"], ["skip", "delete"], ["tam dung", "delete"], ["tam nghi", "delete"], ["pause", "delete"], ["de sau", "move"],
  ["doi ten", "rename"], ["rename", "rename"], ["doi gio", "move"], ["doi lich", "move"], ["chuyen lich", "move"], ["hoan lai", "move"], ["lui lai", "move"], ["day lui", "move"],
  ["dai them", "extend"], ["hoan thanh", "done"], ["mark", "done"],
  ["khong can", "delete"], ["thoi khoi", "delete"], ["xoa bo", "delete"], ["huy bo", "delete"], ["loai bo", "delete"], ["go bo", "delete"],
  ["khoi", "delete"], ["xoa", "delete"], ["soa", "delete"], ["huy", "delete"], ["bo", "delete"], ["delete", "delete"], ["remove", "delete"], ["erase", "delete"], ["cancel", "delete"],
  ["doi", "move"], ["chuyen", "move"], ["truyen", "move"], ["lui", "move"], ["day", "move"], ["hoan", "move"], ["move", "move"], ["reschedule", "move"], ["postpone", "move"], ["push", "move"],
  ["them", "extend"], ["extend", "extend"], ["xong roi", "done"], ["xong", "done"], ["done", "done"], ["finish", "done"], ["finished", "done"], ["complete", "done"], ["completed", "done"],
];
// First words of the verbs, as said: where a part may start inside a line with no separator
const LEADS = new Set(VERBS.map(([p]) => p.split(" ")[0]));
// A line led by a no is never a command: "đừng xoá gym", "không xoá nữa", "chưa xong bài tập", "don't delete gym" ("không cần" is a delete).
const NEG = ["dung", "khong", "chua", "chang", "dont", "never"];
// A shift said after the target ("lùi họp 1 tiếng", "dời họp sớm 30p", "lùi gym 1 tiếng rưỡi"): numbers in words too.
const NUMW: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10, nua: 0.5 };
const SHIFT = /^(.+?) (?:(som|muon|lui|tre|them) )?(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi|nua) (gio|phut)( ruoi)?$/;
const SHIFT_LEAD = ["lui", "som", "muon", "tre", "day", "hoan", "lui lai", "day lui", "hoan lai", "push", "postpone"];
/** Minutes of a shift match; the sign is the lead's or the word before the number's. */
const shiftOf = (m: RegExpExecArray, lead: string) => (m[2] === "som" || (!m[2] && lead === "som") ? -1 : 1) * (NUMW[m[3]] ?? +m[3]) * (m[4] === "gio" ? 60 : 1) + (m[5] ? (m[4] === "gio" ? 30 : 0) : 0);
const POLITE = ["giup minh", "giup", "hay", "xin", "vui long", "please", "pls", "cho minh", "minh muon", "can", "da"];
// Create sentences that start like a command: "bỏ rác" is a chore, not a delete. A guard hit needs a sure match.
const GUARD = [/\bbo rac\b/, /\bdo rac\b/, /\bchuyen (nha|khoan|tien|do)\b/, /\bdoi do\b/, /\bhuy dang ky\b/, /\bmove out\b/,
  /\bcancel subscription\b/, /\bdelete account\b/, /\bremove stains?\b/, /\bdone laundry\b/];
const ORDER = /\b(roi|then|sau do)\b/; // "làm X rồi Y" is an order of tasks, never a command
const BULK = /\b(het|tat ca|all|moi)\b/;
// A day said with no clock ("để mai", "t7"): the task keeps its own clock. A clock or a part of the day is said.
const CLOCK = /\d\s*(h|g|am|pm|p|gio|phut)\b|\d:\d|sang|chieu|toi|trua|dem/;
// The device's wall clock, written as the reader writes it (no zone suffix): the clock find.ts scopes days in and apply.ts reads a time back in.
const wall = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
const MIN = 0.5, MIN_SURE = 0.9, MARGIN = 0.25; // a match score (share of the title the words cover); a fuzzy verb or a guard needs MIN_SURE

export interface Intent { verb: Verb; lead: string; fuzzy: boolean; trailing: boolean; rest: string; /** A relative move, in minutes: "họp lùi 1 tiếng". */ delta?: number }

/** The verb a line starts with (after polite words), its typed form and the rest of the line. Undefined for a line with no verb. */
export function intentOf(raw: string): Intent | undefined {
  // "gym 45 phút thôi", "họp 1 tiếng là đủ": a length set from the end (before the particles go: "gym 45 phút" alone is a new task)
  const len = /^(.+?) ((?:\d+|mot|hai|ba|bon|nam|nua) ?(?:phut|p|ph|tieng|ting|h|gio)(?: ruoi)?) (?:thoi|la du|la duoc|only)(?: (?:nhe|nha|a))?$/.exec(fold(raw).text.trim().replace(/\s+/g, " "));
  if (len && !intentOfLead(raw)) {
    const ws = raw.trim().split(/\s+/), n = len[1].split(" ").length;
    return { verb: "shorten", lead: "thoi", fuzzy: false, trailing: true, rest: `${ws.slice(0, n).join(" ")} còn ${len[2]}` };
  }
  return intentOfLead(raw);
}

function intentOfLead(raw: string): Intent | undefined {
  const toks = strip(raw.trim().split(/\s+/).flatMap((w) => (/^\d+\p{L}+$/u.test(w) ? w.match(/\d+|\p{L}+/gu)! : [w]))); // "1h", "30p"
  const F = toks.map(canon);
  const at = (i: number, p: string) => { const ps = p.split(" "); return ps.every((w, k) => F[i + k] === w) ? ps.length : 0; };
  let i = 0, polite = 0;
  while ((polite = Math.max(0, ...POLITE.map((p) => at(i, p)))) > 0) i += polite;
  // "xong rồi" leading is a done ("xog r giặt đồ"); a "rồi" later in the line orders
  const ordered = ORDER.test(F.slice(at(i, "xong roi") ? i + 2 : 0).join(" "));
  // Telex left in a word ("xoas", "dowfi"): the word the keyboard meant
  const X = toks.map((w, k) => (/^[a-z]+$/i.test(w) ? fold1(telexed(w.toLowerCase())) : F[k])); // only a word typed with no marks
  // How a verb phrase sits at i: 2 as said (or slang, or Telex), 1 with one typo in one word of three letters or more
  // (canon's own typo fix counts as one: "huyền" is not a sure "chuyển"), 0 not there
  const E = toks.map(plainOf);
  const how = (p: string) => {
    const ps = p.split(" ");
    if (ps.every((w, k) => E[i + k] === w || X[i + k] === w)) return 2;
    const off = ps.filter((w, k) => E[i + k] !== w);
    return off.length === 1 && ps.every((w, k) => E[i + k] === w || F[i + k] === w || (w.length >= 3 && (E[i + k]?.length ?? 0) >= 3 && osa(E[i + k], w) === 1)) ? 1 : 0;
  };
  if ((NEG.includes(F[i]) && !how("khong can") && !how("chua xong")) || at(i, "do not")) return undefined;
  const made = (v: Verb, n: number, fuzzy: boolean, lead = toks.slice(i, i + n).join(" "), after = toks.slice(i + n)): Intent | undefined => {
    if (ordered) return undefined;
    // "xoá giúp mình gym", "xoá dùm gym", "xoá hộ em gym": a polite word after the verb is no part of the target
    let k = 0;
    while (k < after.length - 1 && ["giup", "gium", "ho"].includes(canon(after[k]))) k++;
    if (k && ["minh", "em", "tui", "toi", "anh", "chi"].includes(canon(after[k])) && k < after.length - 1) k++;
    after = after.slice(k);
    // "mark gym done", "xong bài tập": the word that says done is the verb, not part of the target
    let rest = after.join(" ").replace(v === "done" ? /\s+(as\s+)?(done|xong)$/i : "", "");
    const rs = rest.split(" ");
    if (canon(rs[0] ?? "") === "cai") rest = rs.slice(1).join(" "); // "bỏ cái gym"
    // "lùi họp nhóm 1 tiếng", "dời họp sớm 30p": a shift from its own start (a plain "dời họp 3 giờ" is a time)
    const sh = v === "move" ? SHIFT.exec(rest.split(" ").map(canon).join(" ")) : null;
    const unit = sh ? fold1(rest.split(" ").at(sh[5] ? -2 : -1)!) : "";
    if (sh && (SHIFT_LEAD.includes(canonText(lead)) || sh[2] || ["tieng", "ting", "phut", "p", "ph"].includes(unit)))
      return { verb: v, lead, fuzzy, trailing: false, rest: rest.split(" ").slice(0, sh[1].split(" ").length).join(" "), delta: shiftOf(sh, canonText(lead)) };
    return { verb: v, lead, fuzzy, trailing: false, rest };
  };
  for (const [p, v] of VERBS) {
    if (how(p) !== 2) continue;
    // "doi tne gym thanh boi": a phrase with a typo beats the one word it starts with
    const longer = p.includes(" ") ? undefined : VERBS.find(([q]) => q.startsWith(`${p} `) && how(q) === 1);
    return longer ? made(longer[1], longer[0].split(" ").length, true) : made(v, p.split(" ").length, false);
  }
  const tail = tailOf(toks, F);
  if (tail) return tail;
  const hit = VERBS.find(([p]) => p.length >= 3 && p !== "lam lai" && how(p) === 1); // "làm bài tập" is a task, not a typo of "làm lại"
  if (hit) return made(hit[1], hit[0].split(" ").length, true);
  // "xoagym", "xonggym": a verb glued to its target
  const glued = F[i] && VERBS.find(([p]) => !p.includes(" ") && p.length >= 3 && F[i].startsWith(p) && F[i].length - p.length >= 3);
  if (glued) return made(glued[1], 1, true, toks[i].slice(0, glued[0].length), [toks[i].slice(glued[0].length), ...toks.slice(i + 1)]);
  return undefined;
}

/** A command said after its target: "bài tập toán xong rồi", "họp nhóm lùi 1 tiếng", "gym để mai". Checked before a fuzzy lead verb, so "đọc sách lùi 1 tiếng" is not a "doi". */
function tailOf(toks: string[], F: string[]): Intent | undefined {
  // "bài tập toán xong rồi", "đã bài tập xong": a trailing done, when the words before it find a task
  const L = F[0] === "da" ? 1 : 0;
  const m = /^(.+?) (xong|hoan thanh|done)( roi)?$/.exec(F.slice(L).join(" "));
  // "bài tập chưa xong" says it is not done
  if (m && !ORDER.test(m[1]) && !NEG.includes(m[1].split(" ").at(-1)!)) return { verb: "done", lead: toks.at(-1)!, fuzzy: false, trailing: true, rest: toks.slice(L, L + m[1].split(" ").length).join(" ") };
  // "họp nhóm lùi 1 tiếng" (later) or "sớm" (earlier), relative to its current start
  // "họp nhóm lùi 1 tiếng rưỡi", "họp nhóm sớm nửa tiếng", "gym trễ 15p"
  const rel = /^(.+?) (lui|doi|som|muon|tre) (\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi|nua) (gio|phut)( ruoi)?$/.exec(F.join(" "));
  if (rel) return { verb: "move", lead: rel[2], fuzzy: false, trailing: true, rest: toks.slice(0, rel[1].split(" ").length).join(" "), delta: shiftOf({ ...rel, 2: undefined, 3: rel[3], 4: rel[4], 5: rel[5] } as unknown as RegExpExecArray, rel[2]) };
  // "gym để mai", "gym để T2": a move to a day
  if (/^.+ de (mai|t[2-7]|thu [2-7]|cn|chu nhat|tuan sau|sau)$/.test(F.join(" "))) return { verb: "move", lead: "de", fuzzy: false, trailing: true, rest: toks.join(" ") };
  return undefined;
}

/** A series delete by scope: the task it starts from, and "following" (it and later) or "all". */
export interface SeriesScope { id: string; scope: "following" | "all" }

/** What chip picks and undos taught, by the name words said (`keyOf`): the series (`kinOf`) they meant, or must not act on unasked.
 *  `last`: the tasks just made or changed, for "xoá nó", "dời cái đó sang 5h". */
export interface Learned { alias?: Record<string, string>; undone?: Record<string, string>; last?: string[] }
/** A pick teaches its words to mean that series; an undo right after a command makes them ask next time. */
export function learn(l: Learned, key: string, kin: string, how: "pick" | "undo"): Learned {
  const drop = (r: Record<string, string> = {}) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));
  const cap = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).slice(-200)); // the newest 200
  return how === "pick" ? { ...l, alias: cap({ ...drop(l.alias), [key]: kin }), undone: drop(l.undone) } : { ...l, undone: cap({ ...drop(l.undone), [key]: kin }), alias: drop(l.alias) };
}

/** `key`: the name words the target was found by, for `learn`. */
export type Command =
  | { kind: "one"; actions: Action[]; key?: string }
  /** "từ tuần sau gym chuyển sang T3, T5": the series `id` is in takes `rrule` from `from` on (reshapeSeries), after a confirm naming it. */
  | { kind: "rule"; id: string; from: number; rrule: string; label: string }
  /** "hoãn gym", "gym để sau": the planner finds each a later time (swipeLater). */
  | { kind: "later"; ids: string[]; label: string }
  /** An option's `series`: a delete of a whole series (or this session on), applied as a scope so top-up does not bring it back. */
  | { kind: "choose"; verb: Verb; ask?: string; key?: string; options: { label: string; actions: Action[]; series?: SeriesScope }[] }
  /** `label`: what the confirm says, naming the days when it is one task's sessions ("Xoá 3 buổi Gym: T2 16/11, T4 18/11, T6 20/11?"). */
  | { kind: "bulk"; verb: Verb; count: number; actions: Action[]; label?: string; series?: SeriesScope }
  /** One session added to a series: `actions` are the one-off (or, if weekly, the new weekday); `alt` makes it weekly. `days`: the series' weekdays after it. */
  | { kind: "session"; title: string; count: number; days: string; weekly: boolean; actions: Action[]; alt?: Action[] };

// One series: a lecture section, a said repeat (its id, else rule and title), a split task's sittings; else the task itself.
export const kinOf = (x: Task) => x.section ?? x.seriesId ?? x.parentId ?? (x.rrule ? `${x.rrule}|${x.title}` : x.id);
const scopedOf = (q: Query) => q.days.length > 0 || q.part !== undefined || q.at !== undefined || q.clock !== undefined;

/** Live tasks the target words find, best first, one per series (its next live one); the score is the share of the title the words cover.
 *  `all`: every member of that series the said days, part and clock keep ("gym tuần này": each session this week), by start. */
function rankIn(tasks: Task[], target: string, now: number, st?: Query["status"], adjust?: (q: Query) => Query) {
  const q0 = queryOf(tasks, target, now), q = adjust ? adjust(q0) : q0;
  const n = q.words.length;
  if (!n) return []; // no words left (all said were filler): nothing is named
  const lq = st ? { ...q, status: q.status ?? st } : q;
  // a set never takes a done one unless done was said ("xoá gym tuần này" leaves Monday's done session); a reopen only done ones
  const sq = { ...q, status: q.status ?? st ?? "live" }, parents = new Set(tasks.map((x) => x.parentId));
  const said = new Set(fold(target).text.match(/[\p{L}\p{N}]+/gu) ?? []);
  return found(tasks, lq, now).flatMap((g) => g.xs).map((x) => {
    const tw = fold(x.title).text.match(/[\p{L}\p{N}]+/gu) ?? [];
    // the share of the title said: its words said as they are ("buổi", a stop word, counts), or as many as the query's words
    return { x, score: Math.min(1, Math.max(n, tw.filter((w) => said.has(w)).length) / Math.max(1, tw.length)),
      all: tasks.filter((y) => kinOf(y) === kinOf(x) && !y.deletedAt && y.start !== undefined && !parents.has(y.id) && matches(y, sq, now)).sort((a, b) => a.start! - b.start!) };
  }).sort((a, b) => b.score - a.score);
}

/** The target read as a search; a part word a title holds is the title's ("Gym buổi tối"), not a part of the day to filter by. */
function queryOf(tasks: Task[], target: string, now: number): Query {
  const q = parse(target, now);
  if (!q.part) return q;
  const asWords = { ...q, part: undefined, words: [...q.words, ...q.part.key.split(" ")] };
  return found(tasks, asWords, now).length ? asWords : q;
}

const isSeries = (x: Task) => !!(x.section || x.rrule || x.seriesId);
const FROM_NOW = /(?<!\p{L})(?:kể từ|ke tu|từ|tu) (?:bây giờ|bay gio|giờ|gio|hôm nay|hom nay|nay)(?: (?:trở đi|tro di|về sau|ve sau))?(?!\p{L})/giu;
const DOW_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
/** "T2 16/11": a task's day on the app's wall clock, for a confirm that lists what it acts on. */
const dayLabel = (ms: number) => { const w = wall(ms); return `${DOW_VI[new Date(`${w.slice(0, 10)}T00:00:00Z`).getUTCDay()]} ${+w.slice(8, 10)}/${+w.slice(5, 7)}`; };
const BULKWORD = /(?<![\p{L}])(hết|het|tất cả|tat ca|all|mọi|moi)(?![\p{L}])/giu;

// Plural words that say a set ("các buổi gym", "mấy cái họp"); "mấy" only as said, or before "cái"/"buổi" ("máy giặt" is a name).
const PLURAL = new Set(["cac", "nhung"]);
// Pointing words: the tasks just made or changed ("xoá nó", "dời cái đó sang 5h").
const POINT = /^(?:(?:cai|viec) )?(?:do|nay|kia|vua roi|vua them|vua tao|vua sua|luc nay)$|^(?:no|it|that|this|that one)$/;
const LATER = ["hoan", "hoan lai", "de", "de sau", "postpone", "push"]; // with no new time, the planner finds a later one
const PAUSE = ["tam dung", "tam nghi", "pause"]; // "tạm dừng gym 2 tuần": every session in that span
const SKIP = ["bo qua", "skip"]; // one session, never the whole series
const DUE_W = ["han nop", "han", "deadline"];
const N_W = "(\\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi|nua)";
const ORD_W: [string, "next" | "first" | "last"][] = [["tiep theo", "next"], ["ke tiep", "next"], ["sap toi", "next"], ["gan nhat", "next"], ["next", "next"], ["toi", "next"],
  ["dau tien", "first"], ["dau", "first"], ["first", "first"], ["cuoi cung", "last"], ["cuoi", "last"], ["last", "last"]];
const numOf = (w: string) => (/^\d+$/.test(w) ? +w : ({ mot: 1, hai: 2, ba: 3, bon: 4, nam: 5 } as Record<string, number>)[w]);

/** "buổi gym tiếp theo", "2 buổi gym tới", "buổi cuối", "buổi thứ 2 tuần sau": which sessions of the ones found, and the target without those words. */
export function ordinalOf(rest: string): { rest: string; n: number; at: "next" | "first" | "last" | number } | undefined {
  const ws = rest.split(" "), f = ws.map(fold1);
  const b = f.findIndex((w) => ["buoi", "lan", "session", "sessions"].includes(w));
  if (b < 0) return undefined;
  const drop = new Set<number>();
  let n = 1, at: "next" | "first" | "last" | number | undefined;
  if (b > 0 && numOf(f[b - 1])) { n = numOf(f[b - 1]); drop.add(b - 1); }
  if (f[b + 1] === "thu" && numOf(f[b + 2] ?? "")) { at = numOf(f[b + 2]); drop.add(b + 1).add(b + 2); } // "buổi thứ 2": the second (a bare "thứ 2" is Monday)
  else for (let j = b + 1; j < f.length && at === undefined; j++) for (const [p, k] of ORD_W) {
    const ps = p.split(" ");
    if (!ps.every((x, m) => f[j + m] === x)) continue;
    const after = f[j + ps.length];
    if (["tuan", "thang", "nam", "ngay", "ky"].includes(after ?? "") || ["tuan", "thang", "nam", "ngay", "ky"].includes(f[j - 1])) continue; // "cuối tuần", "tuần tới" are days
    // "tới" is next; "tối" (or a bare "toi" right after "buổi") is the evening, and "tới T7" says where to
    if (p === "toi" && (ws[j].toLowerCase() === "tối" || (j === b + 1 && ws[j].toLowerCase() !== "tới") || (after !== undefined && !SLOT.includes(after) && after !== "de"))) continue;
    at = k; ps.forEach((_, m) => drop.add(j + m)); break;
  }
  if (at === undefined && n === 1) return undefined; // "buổi" alone is a word of the name
  return { rest: ws.filter((_, i) => !drop.has(i)).join(" "), n, at: at ?? "next" };
}

// The reader's read of a short tail, kept: a move tries every tail of the line, and splitOf, corrections and voice guesses read the same ones again.
const readMemo = new Map<string, Action[]>();
const readAt = (s: string, now: number): Action[] => {
  const k = `${now}|${s}`;
  let v = readMemo.get(k);
  if (!v) { if (readMemo.size > 500) readMemo.clear(); v = readActions(s, new Date(now)); readMemo.set(k, v); }
  return v;
};

/** One sure live task a name finds, or none. */
const sureOne = (tasks: Task[], name: string, now: number) => {
  const [a, b] = rankIn(tasks, name, now, "live");
  return a && a.score >= MIN && (!b || a.score - b.score >= MARGIN) ? a.x : undefined;
};

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]; // JS getDay order
const DOW_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const RULE_FROM = /(?<![\p{L}])(?:ke )?tu (tuan sau|tuan toi|thang sau|gio|nay|bay gio|hom nay|mai)(?: tro di)?(?![\p{L}])/u;
/** A series given new weekdays: "từ tuần sau gym chuyển sang T3, T5", "đổi lịch gym sang T3 và T5", "gym chuyển sang T2 T4 hằng tuần".
 *  One weekday with no "từ…" and no "hằng tuần" moves one session (a plain move), not the rule. */
function ruleOf(raw: string, now: number, tasks: Task[]): Command | undefined {
  const f = fold(raw).text.trim().replace(/\s+/g, " ");
  const fm = RULE_FROM.exec(f), weekly = /(?<![\p{L}])(hang tuan|moi tuan|every week|weekly)(?![\p{L}])/u.test(f);
  // the verb and "sang/to" that leads the new days
  const v = /(?<![\p{L}])(doi lich|chuyen lich|doi|chuyen|move)(?: (?:sang|qua|ve|to|thanh))? /u.exec(f.replace(RULE_FROM, " ").replace(/\s+/g, " "));
  if (!v) return undefined;
  const g = f.replace(RULE_FROM, " ").replace(/(?<![\p{L}])(hang tuan|moi tuan|every week|weekly)(?![\p{L}])/u, " ").replace(/\s+/g, " ").trim();
  const at = g.indexOf(v[0].trim()), name = g.slice(0, at).trim() || g.slice(at + v[1].length).split(/ (?:sang|qua|ve|to|thanh) /)[0].trim(), tail = g.slice(at + v[0].trim().length);
  const dows = findMentions(tail).flatMap((m) => (m.kind === "date" && (m.v as { k: string }).k === "dow" ? [(m.v as { dow: number }).dow, ...((m.v as { more?: number[] }).more ?? [])] : []));
  if (!dows.length || (dows.length < 2 && !fm && !weekly)) return undefined;
  const nameOnly = name.replace(/^(?:doi lich|chuyen lich|doi|chuyen|move) /, "");
  const x = sureOne(tasks.filter((t) => t.rrule && !t.section && t.source === "user"), nameOnly, now);
  if (!x) return undefined;
  const from = !fm ? now : fm[1] === "tuan sau" || fm[1] === "tuan toi" ? addDays(mondayOf(now), 7) : fm[1] === "thang sau" ? new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 1).getTime() : fm[1] === "mai" ? addDays(startOfDay(now), 1) : now;
  const days = [...new Set(dows)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const by = `BYDAY=${days.map((d) => BYDAY[d]).join(",")}`;
  const rrule = /BYDAY=[A-Z,]+/.test(x.rrule!) ? x.rrule!.replace(/BYDAY=[A-Z,]+/, by) : `FREQ=WEEKLY;${by}`;
  if (rrule === x.rrule) return undefined;
  return { kind: "rule", id: x.id, from, rrule, label: `${x.title}: ${days.map((d) => DOW_SHORT[d]).join(", ")} từ ${dayLabel(Math.max(from, now))}?` };
}

/** Edits said in their own shape: "đổi chỗ gym và yoga", "đổi phòng họp sang B2", "ghi chú gym: mang giày", "họp kết thúc lúc 5h". */
function specialOf(raw: string, now: number, tasks: Task[]): Command | undefined {
  const W = raw.trim().split(/\s+/), F = W.map(fold1);
  const at = (j: number, p: string) => p.split(" ").every((x, k) => F[j + k] === x);
  const idx = (from: number, ws: string[]) => F.findIndex((w, j) => j >= from && ws.includes(w));
  const sure = (name: string) => sureOne(tasks, name, now);
  // each takes the other's time
  const sw = at(0, "doi cho") || at(0, "hoan doi") ? 2 : F[0] === "swap" ? 1 : 0;
  if (sw) {
    const k = idx(sw + 1, ["va", "voi", "and", "with", "vs"]);
    const a = k > sw ? sure(W.slice(sw, k).join(" ")) : undefined, b = a && sure(W.slice(k + 1).join(" "));
    return a && b && a.id !== b.id && a.start !== undefined && b.start !== undefined
      ? { kind: "one", actions: [{ op: "edit", target: a.id, when: wall(b.start) }, { op: "edit", target: b.id, when: wall(a.start) }] } : undefined;
  }
  // the place: "đổi phòng họp sang B2", "họp đổi phòng sang B2", "chuyển địa điểm họp về A1"
  const r = F.findIndex((w, j) => (w === "doi" || w === "chuyen") && (F[j + 1] === "phong" || (F[j + 1] === "dia" && F[j + 2] === "diem")));
  if (r >= 0) {
    const n = F[r + 1] === "phong" ? 2 : 3, s = idx(r + n, ["sang", "thanh", "ve", "to", "qua"]);
    const name = s > 0 ? [...W.slice(0, r), ...W.slice(r + n, s)].join(" ") : "", place = s > 0 ? W.slice(s + 1).join(" ") : "";
    const x = name && place ? sure(name) : undefined;
    return x ? { kind: "one", actions: [{ op: "edit", target: x.id, location: place }] } : undefined;
  }
  // a note, added under the one it had: "ghi chú gym: mang giày"
  const c = raw.indexOf(":");
  if (c > 0 && (at(0, "ghi chu") || F[0] === "note")) {
    const name = raw.slice(0, c).trim().split(/\s+/).slice(F[0] === "note" ? 1 : 2).filter((w, k) => k || !["cho", "for", "to"].includes(fold1(w))).join(" ");
    const x = name ? sure(name) : undefined, note = raw.slice(c + 1).trim();
    return x && note ? { kind: "one", actions: [{ op: "edit", target: x.id, note: x.note ? `${x.note}\n${note}` : note }] } : undefined;
  }
  // its length, from its own start: "họp kết thúc lúc 5h", "meeting ends at 5pm"
  const e = F.findIndex((w, j) => j > 0 && ((w === "ket" && F[j + 1] === "thuc") || w === "end" || w === "ends"));
  if (e > 0) {
    const n = F[e] === "ket" ? 2 : 1, t0 = e + n + (["luc", "at", "vao"].includes(F[e + n]) ? 1 : 0);
    const x = t0 < W.length ? sure(W.slice(0, e).join(" ")) : undefined;
    const when = x?.start !== undefined ? readAt(W.slice(t0).join(" "), now)[0]?.when : undefined;
    if (x && when) {
      let end = new Date(`${wall(x.start!).slice(0, 10)}T${when.slice(11, 19)}`).getTime();
      if (end <= x.start!) end += 12 * 3600_000; // "5h" for a 3pm meeting is 17:00
      const mins = Math.round((end - x.start!) / 60_000);
      if (mins > 0 && mins <= 16 * 60) return { kind: "one", actions: [{ op: "edit", target: x.id, effortMinutes: mins }] };
    }
  }
  return undefined;
}

/** The command a line says about the user's tasks, if any: one clear match, several to choose from (chips), or bulk (a confirm).
 *  `l`: what picks and undos taught, and the tasks just touched ("xoá nó"). */
export function commandOf(raw: string, now: number, tasks: Task[], l: Learned = {}): Command | undefined {
  const s = sessionOf(raw);
  if (s) return sessionCommand(s, raw, now, tasks);
  const special = ruleOf(raw, now, tasks) ?? specialOf(raw, now, tasks);
  if (special) return special;
  // "hạn báo cáo dời sang T6": the deadline moves, read as "dời hạn báo cáo sang T6"
  const W0 = raw.trim().split(/\s+/), F0 = W0.map(fold1);
  if (F0[0] === "han" || F0[0] === "deadline") { const k = F0.findIndex((w, j) => j > 1 && ["doi", "lui", "chuyen", "move"].includes(w)); if (k > 0) raw = [W0[k], ...W0.slice(0, k), ...W0.slice(k + 1)].join(" "); }
  const it = intentOf(raw);
  if (!it) return undefined;
  const lead = it.lead.split(/\s+/).map(plainOf).join(" ");
  // A bare verb ("xoá", "xoá hết", "dời") asks which task: today's open tasks to delete, or none to move. Never a task called "Xoá".
  if (!it.fuzzy && !it.rest.replace(BULKWORD, " ").trim() && it.delta === undefined && (it.verb === "delete" || it.verb === "move") && !GUARD.some((g) => g.test(canonText(raw)))) {
    const today = wall(now).slice(0, 10);
    const opts = it.verb === "delete" ? tasks.filter((x) => x.source === "user" && x.start !== undefined && !x.doneAt && !x.deletedAt && wall(x.start).slice(0, 10) === today).slice(0, 5)
      .map((x) => ({ label: `${VERB_VI.delete} ${x.title}`, actions: [{ op: "delete" as const, target: x.id }] })) : [];
    return { kind: "choose", verb: it.verb, options: opts };
  }
  const guard = GUARD.some((g) => g.test(canonText(raw)));
  let verb: Verb = it.verb;
  const ord = ordinalOf(it.rest);
  let rest = ord ? ord.rest : it.rest;
  if (PAUSE.includes(lead)) {
    const f = fold(rest).text;
    if (!new RegExp(`(?<![\\p{L}\\p{N}])${N_W} (ngay|tuan)(?![\\p{L}\\p{N}])`, "u").test(f)) return undefined; // a pause says how long
    if (!/(toi|tiep theo|sap toi|nua)$/.test(f.trim())) rest += " tới";
  }
  const words = rest.split(" ");
  // "dời hạn báo cáo sang T6": the deadline, not the start
  const dueW = verb === "move" ? DUE_W.find((p) => p.split(" ").every((x, k) => fold1(words[k] ?? "") === x)) : undefined;
  if (dueW && words.length > dueW.split(" ").length) words.splice(0, dueW.split(" ").length);
  const due = !!dueW;
  const pl = PLURAL.has(fold1(words[0] ?? "")) || (fold1(words[0] ?? "") === "may" && (words[0].toLowerCase() === "mấy" || ["cai", "buoi"].includes(fold1(words[1] ?? ""))));
  if (pl && words.length > 1) { words.shift(); if (fold1(words[0]) === "cai" && words.length > 1) words.shift(); }
  // "đổi gym thành chạy bộ" renames; "đổi gym thành 4h" moves
  if (verb === "move" && it.delta === undefined && fold1(it.lead) === "doi") {
    const k = words.findIndex((w, j) => j > 0 && canon(w) === "thanh");
    if (k > 0 && k < words.length - 1 && !readAt(words.slice(k + 1).join(" "), now)[0]?.when) verb = "rename";
  }
  // "xong gym T2" said on a Friday is the Monday gone, not the one to come
  const past = verb === "done" && findMentions(words.join(" ")).some((f) => f.kind === "date" && (f.v as { k: string }).k === "dow") && !/(?<!\p{L})(tuần|tuan|sau|tới|next|từ|tu|đến|den|trước|truoc)(?!\p{L})/iu.test(words.join(" ")); // a range or a week says its own days ("tối" is a part, "tới" is next)
  const adjust = past ? (q: Query): Query => ({ ...q, days: q.days.map(([a, b]): [number, number] => (a > now ? [addDays(a, -7), addDays(b, -7)] : [a, b])) }) : undefined;
  const st = verb === "delete" ? undefined : verb === "reopen" ? "done" as const : "live" as const;
  const rank = (target: string) => rankIn(tasks, target, now, st, adjust);
  const parents = new Set(tasks.map((x) => x.parentId));
  // No name, only who: the tasks just touched ("xoá nó"), or a plural or "hết" with a scope ("xoá hết việc tối nay", "dời hết việc mai sang T7").
  const setOf = (t: string): Task[] | undefined => {
    const f = fold(t).text.replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
    if (POINT.test(f)) return (l.last ?? []).map((id) => tasks.find((x) => x.id === id)).filter((x): x is Task => !!x && !x.deletedAt && (st === "done") === !!x.doneAt);
    const q = parse(t.replace(BULKWORD, " "), now);
    // "xoá cái lúc 3h", "dời cái 9h mai sang 10h": the task at that clock (today on, when no day is said), either half of the day for a bare hour
    if (!pl && !BULK.test(f) && !q.words.length && q.at !== undefined && !q.types.length) {
      const ats = q.at % 720 < 60 * 12 && !/\b(sang|chieu|toi|trua|dem|khuya|am|pm)\b/.test(f) && q.at % 720 >= 60 ? [q.at, (q.at + 720) % 1440] : [q.at];
      return tasks.filter((x) => !x.deletedAt && x.start !== undefined && !parents.has(x.id) && (st === "done") === !!x.doneAt && (q.days.length || x.start >= startOfDay(now))
        && ats.some((m) => matches(x, { ...q, at: m }, now))).sort((a, b) => a.start! - b.start!).slice(0, 3);
    }
    if (!pl && !BULK.test(f)) return undefined;
    if (q.words.length || !(scopedOf(q) || q.types.length || q.status)) return undefined; // a name, or nothing to narrow by
    return tasks.filter((x) => !x.deletedAt && x.start !== undefined && !parents.has(x.id) && (q.types.length > 0 || !x.fixed) && matches(x, { ...q, status: q.status ?? st ?? "live" }, now)).sort((a, b) => a.start! - b.start!);
  };
  // The new value of a move or rename: the shortest tail that reads as a time, with the target before it; a rename says "thành"/"to".
  let target = words.join(" "), value = "", dur = 0, setLen: number | undefined, dayOnly = false, clockOnly = false, half = false;
  if (verb === "move" && it.delta === undefined) {
    for (let k = words.length - 1; k > 0; k--) {
      const when = readAt(words.slice(k).join(" "), now)[0]?.when;
      const head = words.slice(0, k);
      if (["de", "sang", "to", "thanh"].includes(fold1(head.at(-1) ?? ""))) head.pop();
      if (when && (rank(head.join(" ")).length || setOf(head.join(" "))?.length)) {
        target = head.join(" "); value = when;
        // "để mai": the task keeps its clock; "5pm" alone: the task keeps its day
        const said = words.slice(k).join(" "), f = fold(said).text, hasDay = parse(said, now).days.length > 0, hasClock = CLOCK.test(f);
        dayOnly = hasDay && !hasClock; clockOnly = !hasDay && hasClock;
        // "7h" with no part of the day: the task's own half of the day ("dời yoga sang 7h" keeps a 7am yoga in the morning)
        const h = /(?<![\d:])(\d{1,2})\s*(?:h|g|gio|:)/.exec(f);
        half = !!h && +h[1] >= 1 && +h[1] <= 12 && !/\b(sang|chieu|toi|trua|dem|khuya|am|pm)\b/.test(f);
        break;
      }
    }
    if (!value) {
      // "hoãn gym", "gym để sau": no new time, the planner finds a later one
      if (due || !LATER.includes(lead)) return undefined;
      const name = [...words];
      while (name.length > 1 && ["de", "sau", "lai"].includes(fold1(name.at(-1)!))) name.pop();
      const [a, b] = rank(name.join(" "));
      const xs = setOf(name.join(" ")) ?? (a && a.score >= (it.fuzzy || guard ? MIN_SURE : MIN) && (!b || a.score - b.score >= MARGIN) ? [a.x] : []);
      return xs.length ? { kind: "later", ids: xs.map((x) => x.id), label: `hoãn ${xs[0].title}` } : undefined;
    }
  } else if (verb === "rename") {
    const k = words.findIndex((w, j) => j > 0 && ["thanh", "to"].includes(canon(w)));
    if (k < 0 || k === words.length - 1) return undefined;
    target = words.slice(0, k).join(" "); value = words.slice(k + 1).join(" ");
  } else if (verb === "extend") {
    const m = /^(\d+)\s*(\p{L}*)\s*(?:(?:vào|vao|cho)\s+)?(.*)$/u.exec(words.join(" "));
    if (!m) return undefined;
    dur = +m[1] * (/^(tieng|h|gio|hour)/.test(fold1(m[2])) ? 60 : 1);
    target = m[3];
  } else if (verb === "shorten") {
    // "rút gym còn 30p" sets the length; "bớt 15p gym", "rút ngắn họp 15 phút" take that off
    const T = words.flatMap((w) => (/^\d+\p{L}+$/u.test(w) ? w.match(/\d+|\p{L}+/gu)! : [w])), C = T.map(plainOf).join(" ");
    const N = `${N_W} (gio|phut)( ruoi)?`;
    const mins = (m: RegExpExecArray, i: number) => (NUMW[m[i]] ?? +m[i]) * (m[i + 1] === "gio" ? 60 : 1) + (m[i + 2] && m[i + 1] === "gio" ? 30 : 0);
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^(.+?) (?:con|xuong|thanh|to|chi con|down to) ${N}$`).exec(C))) { setLen = mins(m, 2); target = T.slice(0, m[1].split(" ").length).join(" "); }
    else if ((m = new RegExp(`^${N} (?:(?:cho|o|of|tu) )?(.+)$`).exec(C))) { dur = mins(m, 1); target = T.slice(T.length - m[4].split(" ").length).join(" "); }
    else if ((m = new RegExp(`^(.+?) ${N}$`).exec(C))) { dur = mins(m, 2); target = T.slice(0, m[1].split(" ").length).join(" "); }
    else return undefined;
  }
  // "xoá gym từ giờ (trở đi)": this session and every later one, unless it opens a range ("từ nay đến T6")
  let onward = false;
  const later = target.replace(FROM_NOW, " ").replace(/\s+/g, " ").trim();
  if (later !== target && later && !scopedOf(queryOf(tasks, later, now))) { onward = true; target = later; }
  const bulk = pl || BULK.test(fold(target).text);
  // A set changes when each task keeps its own other half (its day, its clock, a shift from its own start); a rename or a length names one.
  const each = verb === "move" ? it.delta !== undefined || clockOnly || dayOnly : verb !== "rename" && verb !== "extend" && verb !== "shorten";
  const ex = setOf(target);
  target = target.replace(BULKWORD, " ").replace(/\s+/g, " ").trim();
  if (!ex && (!target || (bulk && !each))) return undefined; // an empty target would find every task
  const clockOf = (x: Task, clk: string) => {
    if (!half || x.start === undefined) return clk;
    const H = +clk.slice(0, 2), pm = new Date(x.start).getHours() >= 12;
    return `${String(pm && H < 12 ? H + 12 : !pm && H >= 12 ? H - 12 : H).padStart(2, "0")}${clk.slice(2)}`;
  };
  // A new time from the task's own (its start, or its deadline when the deadline moves): a shift, a day keeping its clock, a clock keeping its day.
  const moved = (x: Task) => {
    const base = due ? x.deadline ?? x.start : x.start;
    if (it.delta !== undefined) return wall(base! + it.delta * 60_000);
    if (base === undefined) return value;
    if (dayOnly) return `${value.slice(0, 10)}T${due && x.deadline === undefined ? "23:59:00" : wall(base).slice(11)}`;
    return `${clockOnly ? wall(base).slice(0, 10) : value.slice(0, 10)}T${clockOf(x, value.slice(11))}`;
  };
  const lenOf = (x: Task) => x.effort ?? (x.end !== undefined && x.start !== undefined ? Math.round((x.end - x.start) / 60_000) : 30);
  const act = (x: Task): Action =>
    verb === "delete" ? { op: "delete", target: x.id }
    : verb === "done" ? { op: "done", target: x.id }
    : verb === "reopen" ? { op: "edit", target: x.id, reopen: true }
    : verb === "rename" ? { op: "edit", target: x.id, title: value }
    : verb === "move" ? due ? { op: "edit", target: x.id, deadline: moved(x) } : { op: "edit", target: x.id, when: moved(x) }
    : verb === "shorten" ? { op: "edit", target: x.id, effortMinutes: setLen ?? Math.max(5, lenOf(x) - dur) }
    : { op: "edit", target: x.id, effortMinutes: (x.effort ?? 0) + dur };
  // More than one task asks first, naming them: one series by its days, several by count.
  const many = (xs: Task[]): Extract<Command, { kind: "bulk" }> => ({ kind: "bulk", verb, count: xs.length, actions: xs.map(act),
    label: new Set(xs.map(kinOf)).size === 1 && xs.length <= 8 ? `${VERB_VI[verb]} ${xs.length} buổi ${xs[0].title}: ${xs.map((x) => dayLabel(x.start!)).join(", ")}?` : undefined });
  const none = (what: string): Command => ({ kind: "choose", verb, ask: t("notFound", { what: what || it.rest }), options: [] });
  if (ex) {
    // pointed at ("xoá nó") acts at once; a set found by filters alone always asks
    if (!ex.length) return it.fuzzy ? undefined : none(target);
    const f = fold(target).text.trim(), named = POINT.test(f) || !bulk; // pointed at, or one clock
    if (ex.length === 1 && named) return { kind: "one", actions: [act(ex[0])] };
    if (named && !POINT.test(f)) return { kind: "choose", verb, options: ex.map((x) => ({ label: `${it.fuzzy ? VERB_VI[verb] : it.lead} ${x.title} · ${dayLabel(x.start!)}`, actions: [act(x)] })) };
    return many(ex);
  }
  // Said days, a part of the day or a clock narrow the tasks ("gym tuần này", "cái họp hôm qua", "gym T2 và T4");
  // a scope with no task in it says so ("Không thấy gym tuần này") with a "Tạo việc mới" chip, not a create.
  const q0 = queryOf(tasks, target, now), q = adjust ? adjust(q0) : q0, scoped = scopedOf(q);
  // a typo verb never asks: "thoi tiet hom nay" is the weather, not a delete
  const noneS = scoped && !it.fuzzy ? none(target) : undefined;
  if (!q.words.length) return q.types.length ? undefined : noneS;
  const key = q.words.join(" ");
  let cands = rank(target);
  // a name found nowhere is a create ("xoá nhóm zalo" is a thing to do), not "Không thấy"
  if (!cands.length) return rank(key).length ? noneS : undefined;
  // a pick of these words before: they mean that series
  const al = l.alias?.[key], pinned = al ? cands.filter((c) => kinOf(c.x) === al) : [];
  if (pinned.length) cands = pinned.map((c) => ({ ...c, score: 1 }));
  // A scope or "hết" takes every session of the series in it; a move to one new time moves one (a clock, a shift, or a day for a set moves each).
  const expand = (scoped || bulk) && !(verb === "move" && it.delta === undefined && !clockOnly && !(dayOnly && bulk));
  const ordPick = (xs: Task[]) => {
    const from = ord!.at === "last" || scoped ? xs : xs.filter((x) => x.start! >= now);
    return ord!.at === "last" ? from.slice(-ord!.n) : typeof ord!.at === "number" ? from.slice(ord!.at - 1, ord!.at) : from.slice(0, ord!.n);
  };
  const pick = (c: (typeof cands)[number]) => (ord ? ordPick(c.all.length ? c.all : [c.x]) : expand && c.all.length ? c.all : [c.x]);
  const whole = verb === "delete" && !scoped && !ord && !SKIP.includes(lead); // a delete with no days said may take a series as one
  if (bulk) {
    // "hết gym" takes every series every word finds ("Gym", "Gym buổi tối"); the confirm guards it. One series is deleted as a series.
    const xs = cands.flatMap(pick);
    const one = whole && cands.length === 1 && isSeries(cands[0].x);
    return xs.length ? { ...many(xs), ...(one ? { series: { id: cands[0].x.id, scope: "all" as const } } : {}) } : undefined;
  }
  const [top, next] = cands;
  // undone right after the last time these words acted on it: ask this time
  const taught = l.undone?.[key] === kinOf(top.x);
  const sure = !taught && top.score >= (it.fuzzy || guard ? MIN_SURE : MIN) && (!next || top.score - next.score >= MARGIN);
  if (onward && whole && (sure || cands.length === 1) && isSeries(top.x)) {
    const xs = top.all.filter((x) => x.start! >= top.x.start!);
    return { ...many(xs), series: { id: top.x.id, scope: "following" } };
  }
  if (sure) {
    const xs = pick(top);
    if (!xs.length) return none(target);
    // "xoá gym" on a weekly gym: the next session, or the whole series
    if (whole && !onward && isSeries(top.x) && top.all.length > 1 && !it.trailing)
      return { kind: "choose", verb, key, options: [
        { label: `${VERB_VI.delete} buổi ${dayLabel(top.x.start!)}`, actions: [act(top.x)] },
        { label: `${VERB_VI.delete} cả chuỗi ${top.x.title}`, actions: top.all.map(act), series: { id: top.x.id, scope: "all" } },
      ] };
    return xs.length > 1 ? many(xs) : { kind: "one", actions: [act(xs[0])], key };
  }
  if ((it.trailing || it.fuzzy) && !taught) return undefined; // a typo verb asks nothing: the line reads as a create
  return { kind: "choose", verb, key, options: cands.slice(0, 3).flatMap((c) => {
    const xs = pick(c);
    return xs.length ? [{ label: `${it.fuzzy ? VERB_VI[verb] : it.lead} ${xs.length > 1 ? `${xs.length} buổi ` : ""}${c.x.title}`, actions: xs.map(act) }] : [];
  }) };
}

// "thêm 1 buổi gym", "học thêm toán", "extra gym session", "one more gym": one more session in a series.
interface Session { rest: string; count: number; fuzzy: boolean; weekly: boolean }
const BY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]; // JS getDay order
const WEEK = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DAY_VI: Record<string, string> = { MO: "T2", TU: "T3", WE: "T4", TH: "T5", FR: "T6", SA: "T7", SU: "CN" };

function sessionOf(raw: string): Session | undefined {
  const W = strip(raw.trim().split(/\s+/)).map(fold1).filter(Boolean);
  let fuzzy = false;
  const is = (w: string | undefined, p: string) => { if (w === p) return true; if (w && w.length >= 3 && osa(w, p) === 1) { fuzzy = true; return true; } return false; };
  let i = 0, count = 1, extra = false, study = false;
  if (W[0] === "one" && W[1] === "more") i = 2;
  else if (W[0] === "extra") { i = 1; extra = true; }
  else {
    study = is(W[0], "hoc") || is(W[0], "tap");
    if (study) i = 1;
    if (!is(W[i], "them")) return undefined;
    i++;
    if (/^(\d+|mot)$/.test(W[i] ?? "")) { count = W[i] === "mot" ? 1 : +W[i]; i++; }
    if (is(W[i], "buoi") || is(W[i], "session")) i++;
    else if (!study) return undefined;
  }
  const rest = W.slice(i);
  if (extra && rest.at(-1) === "session") rest.pop();
  const weekly = /\b(hang tuan|moi tuan|every week)\b/.test(rest.join(" "));
  const text = rest.join(" ").replace(/\b(hang tuan|moi tuan|every week)\b/g, " ").replace(/\s+/g, " ").trim();
  return text ? { rest: text, count, fuzzy, weekly } : undefined;
}

/** A session said for a series: one series clearly named, several to choose from (chips), or none (the line stays a create). */
function sessionCommand(s: Session, raw: string, now: number, tasks: Task[]): Command | undefined {
  const pool = tasks.filter((x) => x.source === "user" && x.rrule && x.seriesId && !x.parentId && !x.deletedAt && !x.doneAt);
  const thr = s.fuzzy || GUARD.some((g) => g.test(canonText(raw))) ? MIN_SURE : MIN;
  const words = s.rest.split(" ");
  // The series' name is the longest head that finds one; the tail after it must read as a day, or be empty.
  for (let k = words.length; k > 0; k--) {
    const tail = words.slice(k).join(" ");
    const said = tail ? readAt(tail, now)[0] : undefined;
    const at = said?.when ?? said?.notBefore;
    if (tail && !at) continue;
    const seen = new Set<string>();
    const hits = rankIn(pool, words.slice(0, k).join(" "), now, "live")
      .filter((c) => c.score >= thr && !seen.has(c.x.seriesId!) && seen.add(c.x.seriesId!));
    if (!hits.length) continue;
    const dayMs = at ? new Date(at).getTime() : undefined;
    const plan = (x: Task) => {
      const members = pool.filter((m) => m.seriesId === x.seriesId);
      const base = { title: x.title, kind: x.kind, effortMinutes: x.effort, tods: x.tods, seriesId: x.seriesId };
      const code = BY[new Date(dayMs ?? now).getDay()];
      const have = members[0].rrule!.match(/BYDAY=([A-Z,]+)/)?.[1]?.split(",") ?? [];
      const days = WEEK.filter((d) => have.includes(d) || d === code).map((d) => DAY_VI[d]).join(", ");
      const perm: Action[] = [{ op: "create", ...base, repeat: `FREQ=WEEKLY;BYDAY=${code}` }];
      if (s.weekly) return { title: x.title, count: 1, days, weekly: true, actions: perm };
      const next = members.map((m) => m.start ?? m.notBefore).filter((v): v is number => v !== undefined && v > now).sort((a, b) => a - b)[0];
      const one: Action[] = Array.from({ length: s.count }, () => ({
        op: "create" as const, ...base,
        notBefore: new Date(dayMs ?? now).toISOString(),
        deadline: dayMs !== undefined ? new Date(new Date(dayMs).setHours(23, 59, 0, 0)).toISOString() : next !== undefined ? new Date(next).toISOString() : undefined,
      }));
      return { title: x.title, count: s.count, days, weekly: false, actions: one, alt: perm };
    };
    if (hits.length === 1) return { kind: "session", ...plan(hits[0].x) };
    return { kind: "choose", verb: "extend", ask: t("sessionAsk"), options: hits.slice(0, 3).map((c) => ({ label: `${VERB_VI.extend} buổi ${c.x.title}`, actions: plan(c.x).actions })) };
  }
  return undefined;
}

// Connectors that cut a line into parts (canonical forms; separators are handled by SEP).
const CONN = ["va", "and", "then", "roi"];
const SEP = /^[,;&+\/\n]$/;
// Filler that is no task on its own ("khỏi lo, mai nộp báo cáo"): dropped, never a create.
const FILLER = new Set(["khoi lo", "thoi", "ok", "oke", "nhe", "nha", "khong sao"]);

// Self-correction inside a command ("dời họp sang 3h à không 4h", "xoá gym à nhầm yoga") and taking one back ("xoá gym, à thôi").
const FIX = [["a", "khong"], ["a", "nham"], ["a", "quen"], ["a", "lon"], ["khong", "phai"], ["y", "minh", "la"], ["y", "la"], ["ma", "la"], ["sua", "lai"], ["nham"], ["i", "mean"], ["actually"], ["no", "wait"]];
const CANCEL = [["a", "thoi"], ["thoi", "khoi"], ["thoi", "bo", "di"], ["thoi", "bo", "qua"], ["thoi", "dung"], ["khoan", "da"], ["never", "mind"], ["nevermind"], ["cancel", "that"], ["forget", "it"]];
// Words before a new value that say which slot it fills: "à không, sang 4h", "à không thành bơi"
const SLOT = ["sang", "to", "thanh", "luc", "vao"];
const isDT = (f: { kind: string }) => f.kind === "date" || f.kind === "time";
const trimP = (x: string) => x.replace(/^[\s,.;…-]+|[\s,.;…-]+$/g, "");

/** The command `L` with its correction `R` in place: a new command replaces it; a day or clock replaces the one of its kind;
 *  a slot word ("sang 4h", "thành bơi") replaces that slot; else `R` names the task, and the said value and days stay. */
function fix(L: string, R: string): string {
  if (!R) return L;
  const r = intentOf(R);
  if (r && !r.fuzzy) return R;
  const lw = L.split(/\s+/), r0 = fold1(R.split(/\s+/)[0]);
  const slot = SLOT.includes(r0) ? lw.map(fold1).lastIndexOf(r0) : -1;
  if (slot > 0) return [...lw.slice(0, slot), R].join(" ");
  const lm = findMentions(L).filter(isDT), rm = findMentions(R).filter(isDT);
  if (rm.length && !trimP(R.slice(0, rm[0].start) + R.slice(rm.at(-1)!.end))) {
    const same = lm.filter((m) => m.kind === rm[0].kind).at(-1);
    return same ? L.slice(0, same.start) + R + L.slice(same.end) : `${L} ${R}`;
  }
  const it = intentOf(L)!;
  if (it.trailing) { const at = L.indexOf(it.rest); return at < 0 ? L : `${R} ${L.slice(at + it.rest.length).trim()}`; } // "gym xong rồi à nhầm yoga"
  // the target starts after the verb (`rest` splits "7h", so it is not searched for); "bỏ cái gym": after the "cái"
  let at = L.toLowerCase().indexOf(it.lead.toLowerCase());
  if (at < 0) return L;
  at += it.lead.length;
  const cai = /^\s*(cái|cai)\s+/i.exec(L.slice(at));
  if (cai) at += cai[0].length;
  // the value or days after the target stay: "dời gym sang 7h à nhầm yoga", "xoá gym tuần này à nhầm yoga"
  const rest = L.slice(at).trim(), rw = [...rest.matchAll(/\S+/g)];
  const v = Math.min(findMentions(rest).filter(isDT)[0]?.start ?? rest.length, rw.find((m) => m.index > 0 && SLOT.includes(fold1(m[0])))?.index ?? rest.length);
  return `${L.slice(0, at).trim()} ${R}${rm.length ? "" : ` ${rest.slice(v)}`}`.trim();
}

/** The line with each correction said inside a command applied, and each command taken back dropped; `cancelled` when one was. */
export function corrected(line: string): { line: string; cancelled: boolean } {
  let cancelled = false;
  for (let n = 0; n < 4; n++) {
    const T = [...line.matchAll(/[,;]|[^\s,;]+/g)].map((m) => ({ w: m[0], at: m.index, f: fold1(m[0]) }));
    const atP = (i: number, p: string[]) => p.every((x, k) => T[i + k]?.f === x);
    const link = (i: number) => /^[,;]$/.test(T[i].w) || CONN.includes(canon(T[i].w));
    const cmdAt = (a: number, b: number) => !!intentOf(trimP(line.slice(T[a].at, b)));
    let hit: { s: number; i: number; n: number; cancel: boolean } | undefined;
    for (let i = 1; i < T.length && !hit; i++) {
      const c = CANCEL.find((p) => atP(i, p)), f = c ? undefined : FIX.find((p) => atP(i, p));
      if (!c && !f) continue;
      // the command it fixes: the last part before it that a verb leads
      let s = 0;
      for (let k = 0; k < i - 1; k++) if (link(k) && cmdAt(k + 1, T[i].at)) s = k + 1;
      if (cmdAt(s, T[i].at)) hit = { s, i, n: (c ?? f)!.length, cancel: !!c };
    }
    if (!hit) break;
    // the correction runs to where a new command starts
    const j = hit.i + hit.n;
    let e = T.length;
    for (let k = j; k < T.length - 1; k++) if (link(k) && cmdAt(k + 1, line.length)) { e = k; break; }
    const end = e < T.length ? T[e].at : line.length;
    const L = trimP(line.slice(T[hit.s].at, T[hit.i].at)), R = j < T.length ? trimP(line.slice(T[j].at, end)) : "";
    if (hit.cancel) cancelled = true;
    line = [line.slice(0, T[hit.s].at), hit.cancel ? "" : fix(L, R), line.slice(end)].join(" ")
      .replace(/\s+/g, " ").replace(/\s+([,;])/g, "$1").replace(/([,;])\s*(?=[,;])/g, "").replace(/^[\s,;]+|[\s,;]+$/g, "");
  }
  return { line, cancelled };
}

export interface Split {
  /** A command was taken back ("xoá gym, à thôi"): nothing of it is made, not even a task. */
  cancelled?: boolean;
  /** The whole line is one session said for a series: the alt chip and the sub line are the session's own. */
  session?: Extract<Command, { kind: "session" }>;
  /** Clear commands, applied together with one undo. `key`: the name words, for `learn`. */
  ones: { label: string; actions: Action[]; key?: string }[];
  /** "hoãn gym": tasks the planner moves later (swipeLater), each on its own. */
  later?: { label: string; ids: string[] }[];
  /** A part with a command verb but no sure target: chips (or a bulk confirm) with the part's own text. */
  asks: { text: string; cmd: Command }[];
  /** The rest of the line, to be read as creates. A leading "thêm/add" is dropped. */
  rest: string;
}

const labelOf = (cmd: Extract<Command, { kind: "one" | "session" }>, tasks: Task[]): string => {
  if (cmd.kind === "session") return `thêm ${cmd.count} buổi ${cmd.title}`;
  const a = cmd.actions[0];
  const title = tasks.find((x) => x.id === a.target)?.title ?? "";
  const x = tasks.find((y) => y.id === a.target);
  const len = a.effortMinutes !== undefined && x?.effort !== undefined && a.effortMinutes < x.effort ? "rút" : "thêm";
  return `${a.op === "delete" ? "xoá" : a.op === "done" ? "xong" : a.reopen ? "mở lại" : a.title ? "đổi tên" : a.when ? "dời" : a.deadline ? "dời hạn" : a.location !== undefined ? "đổi phòng" : a.note !== undefined ? "ghi chú" : len} ${title}`;
};

/** Where the value or days of a command line start ("yoga sang 7h" at "sang", "gym tuần này" at "tuần"), or -1 when none is said. */
function tailAt(text: string): number {
  const m = findMentions(text).filter(isDT)[0]?.start ?? text.length;
  // exact words: canon would read "răng" as a typo of "sang"
  const w = [...text.matchAll(/\S+/g)].find((x) => x.index > 0 && SLOT.includes(fold1(x[0])))?.index ?? text.length;
  const v = Math.min(m, w);
  return v > 0 && v < text.length ? v : -1;
}

/** Tokens back to text with the spacing they were said with ("16/11" stays whole), a separator kept against the word before it ("a, b"). */
const joined = (ts: { w: string; at: number }[]) => ts.reduce((s, t, i) => (!i ? t.w : t.at === ts[i - 1].at + ts[i - 1].w.length || SEP.test(t.w) ? s + t.w : `${s} ${t.w}`), "");

/** The line cut at separators and connectors; each part a command reads as a command, the rest is creates. Undefined when no part is a command. */
export function splitOf(said: string, now: number, tasks: Task[], l: Learned = {}): Split | undefined {
  // a line typed with Telex or VNI left in, task name and all ("xoas giatj ddoof"): read decoded when it reads as nothing as typed
  // read both when it decodes, and keep the one that finds more commands
  const sp = splitLine(said, now, tasks, l), d = decodeCell(said);
  if (d === said) return sp;
  const dp = splitLine(d, now, tasks, l), n = (x?: Split) => (x ? x.ones.length + x.asks.length + (x.session ? 1 : 0) : -1);
  return n(dp) > n(sp) ? dp : sp;
}

function splitLine(said: string, now: number, tasks: Task[], l: Learned): Split | undefined {
  const { line, cancelled } = corrected(said);
  if (!line) return cancelled ? { cancelled, ones: [], asks: [], rest: "" } : undefined;
  // "đổi chỗ gym và yoga" is one command: its "và" joins the two it swaps
  if (/^(doi cho|hoan doi|swap)\b/.test(fold(line).text.trim())) {
    const c = commandOf(line, now, tasks, l);
    if (c?.kind === "one") return { ...(cancelled ? { cancelled } : {}), ones: [{ label: `đổi chỗ ${c.actions.map((a) => tasks.find((x) => x.id === a.target)?.title).join(" và ")}`, actions: c.actions }], asks: [], rest: "" };
  }
  // a link inside a date or clock is part of it: "gym T2 và T4", "15/12", "T2, T4"
  const dates = findMentions(line.trim()).filter((f) => f.kind === "date" || f.kind === "time");
  const toks = [...line.trim().matchAll(/[,;&+\/\n]|[^\s,;&+\/\n]+/g)].map((m) => ({ w: m[0], at: m.index, link: !dates.some((f) => m.index > f.start && m.index < f.end) && (SEP.test(m[0]) || CONN.includes(canon(m[0]))) }));
  // "xong rồi" / "xong r" stays in its part: a done at the end, or an order when words follow (tailOf)
  toks.forEach((t, i) => { if (i > 0 && canon(t.w) === "roi" && canon(toks[i - 1].w) === "xong") t.link = false; });
  toks.forEach((t, i) => { if (canon(t.w) === "sau" && fold1(toks[i + 1]?.w ?? "") === "do") { t.link = true; toks[i + 1].link = true; } });
  // "xoá yoga dời họp nhóm sang 3h" (a voice line has no commas): a sure verb opens a part when both sides read as commands with a target
  const full = (ts: typeof toks) => { const it = ts.length ? intentOf(joined(ts)) : undefined; return !!it && !it.fuzzy && !it.trailing && !!it.rest.trim(); };
  const cut = new Set<number>();
  for (let i = 1, from = 0; i < toks.length; i++) {
    if (toks[i].link) { from = i + 1; continue; }
    if (!LEADS.has(plainOf(toks[i].w))) continue;
    let to = i; while (to < toks.length && !toks[to].link) to++;
    if (full(toks.slice(from, i)) && full(toks.slice(i, to))) { cut.add(i); from = i; }
  }
  const runs: number[][] = [];
  let cur: number[] = [];
  toks.forEach((t, i) => { if (t.link) { if (cur.length) runs.push(cur); cur = []; } else { if (cut.has(i) && cur.length) { runs.push(cur); cur = []; } cur.push(i); } });
  if (cur.length) runs.push(cur);
  const ones: Split["ones"] = [], asks: Split["asks"] = [], later: NonNullable<Split["later"]> = [], used = new Set<number>();
  let dropped = false, carry: { lead: string; tail: string } | undefined;
  // a part a verb surely leads; "đọc sách" in a list is a name, not a "dời" with a typo
  const sureOf = (t: string) => { const i = intentOf(t); return i && !i.fuzzy ? i : undefined; };
  const textOf = (r: number) => joined(runs[r].map((i) => toks[i]));
  const take = (r: number, text: string, cmd: Command) => {
    runs[r].forEach((i) => used.add(i));
    if (cmd.kind === "choose" || cmd.kind === "bulk" || cmd.kind === "rule") asks.push({ text, cmd });
    else if (cmd.kind === "later") later.push({ label: cmd.label, ids: cmd.ids });
    else ones.push({ label: labelOf(cmd, tasks), actions: cmd.actions, ...(cmd.kind === "one" && cmd.key ? { key: cmd.key } : {}) });
  };
  for (let r = 0; r < runs.length; r++) {
    const text = textOf(r), it = sureOf(text);
    // "dời gym và yoga sang 7h", "xoá gym và yoga tuần này": a value or days said after the last of a list are each name's
    if (it && !it.trailing && it.delta === undefined && tailAt(text) < 0) {
      let g = r + 1;
      while (g < runs.length && !sureOf(textOf(g))) g++;
      const last = g - 1 > r ? textOf(g - 1) : "", v = last ? tailAt(last) : -1;
      if (v > 0) {
        const tail = last.slice(v), names = [it.rest, ...runs.slice(r + 1, g - 1).map((_, k) => textOf(r + 1 + k)), last.slice(0, v).trim()];
        const cmds = names.map((n) => commandOf(`${it.lead} ${n} ${tail}`, now, tasks, l));
        if (cmds.every((c) => c && c.kind !== "session")) {
          cmds.forEach((c, k) => take(r + k, k ? textOf(r + k) : text, c!));
          carry = undefined;
          r = g - 1;
          continue;
        }
      }
    }
    let cmd = commandOf(text, now, tasks, l);
    // "bỏ họp nhóm vs gym", "dời gym sang 7h và yoga": a bare name after a command carries its verb and its value, when it resolves on its own
    // the carried days are tried first, then none ("xoá gym T6 và yoga": yoga on its own day)
    if (!cmd && carry && !it) for (const tail of [...new Set([carry.tail, ""])]) { const c = commandOf(`${carry.lead} ${text} ${tail}`.trim(), now, tasks, l); if (c?.kind === "one" || c?.kind === "bulk") { cmd = c; break; } }
    else carry = undefined;
    if (!cmd) {
      if (FILLER.has(canonText(text))) { runs[r].forEach((i) => used.add(i)); dropped = true; }
      else if (canon(toks[runs[r][0]].w) === "thoi" && runs[r].length > 1) { used.add(runs[r][0]); dropped = true; }
      continue;
    }
    if (cmd.kind === "session" && runs[r].length === toks.length) return { session: cmd, ones, asks, rest: "" };
    take(r, text, cmd);
    if (it && !it.trailing && cmd.kind !== "session") { const v = tailAt(text); carry ??= { lead: it.lead, tail: v > 0 ? text.slice(v) : "" }; }
  }
  if (!ones.length && !asks.length && !later.length && !dropped && !cancelled && line === said.trim()) return undefined;
  // What is left, with the links that sit between two words kept as said ("Vật lý và Toán").
  const res: typeof toks = [];
  toks.forEach((t, i) => { if (!used.has(i) && !(t.link && (!res.length || res.at(-1)!.link))) res.push(t); });
  while (res.at(-1)?.link) res.pop();
  let rest = joined(res);
  const [first, ...more] = rest.split(" ");
  if (["them", "add"].includes(fold1(first ?? ""))) rest = more.join(" ");
  return { ...(cancelled ? { cancelled } : {}), ones, asks, ...(later.length ? { later } : {}), rest };
}

/** A rough sound of a word, as a recognizer mishears it: "gym", "jim", "dim", "zim" all sound "zim"; "yoga" and "y ô ga" (joined) "zoka".
 *  Initials d/gi/r/j/z/y and g before i/e/y read alike, as do s/x, ch/tr, c/k/q, ph/f, l/n; finals ng/nh/n, c/t; y is i, doubled letters one. */
export function soundKey(w: string): string {
  let k = fold1(w);
  k = k.replace(/^(gi|g(?=[iey])|d|r|j|z|y(?=[aeou]))/, "z").replace(/^(tr|ch)/, "c").replace(/^x/, "s").replace(/^(k|q)/, "c").replace(/^ph/, "f").replace(/^l/, "n");
  k = k.replace(/y/g, "i").replace(/(ng|nh)$/, "n").replace(/c$/, "t").replace(/g(?=a)/g, "k").replace(/(.)\1+/g, "$1");
  return k;
}

/** The heard line with each word, or run of 2–3 short syllables ("y ô ga"), that sounds like a word of a live task title written as that word. */
export function soundFix(line: string, tasks: Task[]): string {
  const known = new Map<string, string | null>();
  for (const x of tasks) if (!x.deletedAt && !x.doneAt) for (const w of x.title.split(/\s+/)) {
    const f = fold1(w), k = soundKey(w);
    if (f.length < 3) continue;
    known.set(k, known.has(k) && known.get(k) !== w ? null : w); // two words that sound alike: neither is guessed
  }
  const said = new Set(VERBS.flatMap(([p]) => p.split(" ")));
  const ws = line.trim().split(/\s+/), out: string[] = [];
  for (let i = 0; i < ws.length; i++) {
    let done = false;
    for (const n of [3, 2, 1]) {
      const run = ws.slice(i, i + n);
      if (run.length < n || (n > 1 && run.some((w) => fold1(w).length > 3))) continue;
      const hit = known.get(soundKey(run.join("")));
      if (!hit || (n === 1 && (said.has(fold1(run[0])) || fold1(run[0]) === fold1(hit)))) continue;
      out.push(hit); i += n - 1; done = true; break;
    }
    if (!done) out.push(ws[i]);
  }
  return out.join(" ");
}

/** The heard line, else the first of the recognizer's other guesses that makes a sure command ("sóa jim" heard, "xoá gym" in the n-best).
 *  Only when the heard line itself has a command verb: a guess never turns a create into a command. `alts` is set for a voice line only. */
export function splitHeard(said: string, alts: string[] | undefined, now: number, tasks: Task[], l: Learned = {}): Split | undefined {
  const top = splitOf(said, now, tasks, l);
  if (top?.ones.length || top?.session || top?.later?.length || !alts || (!intentOf(said) && !top?.asks.length)) return top;
  // then each guess with words that sound like a title written as it ("xoá dim" → "xoá Gym")
  const tries = [...alts.filter((a) => a.trim() !== said.trim()), ...[said, ...alts].map((a) => soundFix(a, tasks)).filter((a) => ![said, ...alts].includes(a))];
  for (const a of [...new Set(tries)]) {
    const sp = splitOf(a, now, tasks, l);
    if (sp && (sp.ones.length || sp.session) && !sp.asks.length) return sp;
  }
  return top;
}

// Asking, not telling: "mai có gì", "tối nay có gì không?", "tuần này còn mấy bài tập", "khi nào thi toán?". "khi nào rảnh thì dọn phòng" is a task.
const ASKING = [/(?:^|\s)co gi(?: khong| ko| k| nhi| vay| the| ha)?$/, /(?:^|\s)con (?:may|bao nhieu)(?:\s|$)/, /^(?:khi nao|bao gio|may gio|luc nao)\s.+\?$/];
const ASK_WORDS = /(?<![\p{L}])(?:có gì|co gi|không|khong|ko|nhỉ|nhi|vậy|vay|thế|the|hả|ha|còn mấy|con may|còn bao nhiêu|con bao nhieu|khi nào|khi nao|bao giờ|bao gio|mấy giờ|may gio|lúc nào|luc nao)(?![\p{L}])|\?/giu;
/** A question about the tasks, as the search to run ("mai có gì" → "mai"), or undefined for anything else. */
export function askOf(s: string): string | undefined {
  const f = fold(s).text.trim().replace(/\s+/g, " ");
  if (!ASKING.some((r) => r.test(f.replace(/\s*\?$/, "")) || (r.source.endsWith("\\?$") && r.test(f)))) return undefined;
  return s.replace(ASK_WORDS, " ").replace(/\s+/g, " ").trim();
}
