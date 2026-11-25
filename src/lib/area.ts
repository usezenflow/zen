// Life/work areas: which area a task belongs to, how much worked time each got over the last 7 days, and how far each is behind its target.
import { addDays, startOfDay } from "../components/cal";
import { fold } from "./nlu/reader/fold";
import { worked } from "./rest";
import type { Kind, Task } from "./types";

const DAY = 24 * 60 * 60_000;

export interface Area { id: string; name: string; kinds: Kind[]; words: string[]; targetPct?: number }

export const KINDS: Kind[] = ["study", "exercise", "chores", "social", "other", "work", "errand", "finance", "self"];
export const WORD_MIN = 2, WORDS_MAX = 20;

/** The comparison form of a keyword: lowercase, diacritics folded, spaces collapsed. "Ôn  Thi" and "on thi" are one word. */
export const foldWord = (w: string) => fold(w).text.replace(/\s+/g, " ").trim();

/** Adds a typed keyword to an area's list. Refused (null) when it is too short, the list is full, or it is already there (by folded form). */
export function addWord(words: string[], raw: string): string[] | null {
  const w = raw.replace(/\s+/g, " ").trim();
  const k = foldWord(w);
  if ([...k].length < WORD_MIN || words.length >= WORDS_MAX || words.some((x) => foldWord(x) === k)) return null;
  return [...words, w];
}

/** The other area that already holds this keyword, if any. The longest match wins in areaOf, so the owner keeps its word and the chip is only flagged. */
export function ownerOf(word: string, areas: Area[], selfId: string): Area | undefined {
  const k = foldWord(word);
  return areas.find((a) => a.id !== selfId && a.words.some((w) => foldWord(w) === k));
}

/** Tasks worked in the last 7 days (doneAt in the window) per area: the "N việc tuần này khớp" count. */
export function weekCount(tasks: Task[], areas: Area[], now: number): Record<string, number> {
  const first = startOfDay(now - 7 * DAY), n: Record<string, number> = {};
  for (const t of tasks) {
    const a = t.doneAt !== undefined && t.doneAt >= first && t.doneAt <= now ? areaOf(t, areas) : undefined;
    if (a) n[a.id] = (n[a.id] ?? 0) + 1;
  }
  return n;
}

// The six core domains. Kinds map each Task kind to one area: finance joins work, errand joins home, other joins self.
export const DEFAULT_AREAS: Area[] = [
  { id: "study", name: "Học tập", kinds: ["study"], words: ["bài tập", "ôn thi", "kiểm tra", "essay", "lab"], targetPct: 25 },
  { id: "work", name: "Công việc", kinds: ["work", "finance"], words: ["báo cáo", "họp", "dự án", "deadline"], targetPct: 25 },
  { id: "health", name: "Sức khoẻ", kinds: ["exercise"], words: ["gym", "chạy bộ", "bơi", "thiền"], targetPct: 15 },
  { id: "people", name: "Mọi người", kinds: ["social"], words: ["gia đình", "bạn bè", "gặp", "sinh nhật"], targetPct: 15 },
  { id: "home", name: "Việc nhà", kinds: ["chores", "errand"], words: ["giặt", "dọn", "nấu", "chợ"], targetPct: 10 },
  { id: "self", name: "Bản thân", kinds: ["self", "other"], words: ["đọc sách", "sở thích"], targetPct: 10 },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A keyword matches a whole folded word or phrase, so "bơi" does not hit inside another word.
const hits = (text: string, word: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, "u").test(text);

/** The area of a task: the most specific keyword (longest folded word) in its title or course; else the first area holding its kind. */
export function areaOf(task: Task, areas: Area[]): Area | undefined {
  const text = fold(`${task.title} ${task.course ?? ""}`).text;
  let best: Area | undefined, bestLen = 0;
  for (const a of areas) for (const word of a.words) {
    const w = fold(word).text.trim();
    if (w && w.length > bestLen && hits(text, w)) { best = a; bestLen = w.length; }
  }
  return best ?? areas.find((a) => a.kinds.includes(task.kind));
}

/** Each area's share (0..1) of worked minutes over the last 7 days. Whole days from worked(), so the first day counts in full. */
export function areaShare(tasks: Task[], areas: Area[], now: number): Record<string, number> {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const a = areaOf(t, areas);
    if (a) groups.set(a.id, [...(groups.get(a.id) ?? []), t]);
  }
  const first = startOfDay(now - 7 * DAY), minutes: Record<string, number> = {};
  let total = 0;
  for (const [id, ts] of groups) {
    let ms = 0;
    for (let d = first; d <= now; d = addDays(d, 1)) ms += worked(ts, d, now);
    minutes[id] = ms;
    total += ms;
  }
  return Object.fromEntries(areas.map((a) => [a.id, total > 0 ? (minutes[a.id] ?? 0) / total : 0]));
}

/** Normalized deficit 0..1 per area id: (target - share) / target, clamped. Areas without a target, or no worked time at all, are 0. */
export function underServed(tasks: Task[], areas: Area[], now: number): Record<string, number> {
  const share = areaShare(tasks, areas, now);
  const none = Object.values(share).every((s) => s === 0);
  return Object.fromEntries(areas.map((a) => {
    const target = (a.targetPct ?? 0) / 100;
    if (none || target <= 0) return [a.id, 0];
    return [a.id, Math.min(1, Math.max(0, (target - share[a.id]) / target))];
  }));
}
