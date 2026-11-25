// The one place a toast's words are chosen: a title, at most one sub, at most one alt, the undo, and "Xem" (the story of what moved).
import type { Result } from "./apply";
import type { TypeName } from "./theme";
import { lenW, partAt, plain, t } from "./i18n";
import { day } from "./when";
import type { Action } from "./types";

export interface Alt { label: string; run: () => void; plain?: boolean }
/** What the caller knows beyond the engine's result. compose() picks one sub from it, by the order it lists. */
export interface Ctx {
  title?: string; // overrides r.toast
  name?: string; // the task's name when the title already says it: a sub naming it again adds nothing
  sub?: string; // the caller's own line: said first
  clash?: string; // a time that clashes with a class or exam (kept anyway)
  stuck?: string; // no free time for what was asked
  reason?: string; // the top reason for where it landed ("Hợp buổi học")
  understood?: string; // inferred(): only what was worked out beyond the words
  where?: string; // whereOf(): the day and part it landed in
  notes?: string; // reader repairs, dropped clauses, flags
  far?: string; // a deadline past the 30-day horizon
  alt?: Alt; // the other choice: one pill (another time, shrink, split)
  see?: () => void; // opens the story of what moved; offered only when something did
  art?: TypeName; // the task's palette for the toast tile (artOf); none for a toast with no task
}
export interface Toast { title: string; sub?: string; alt?: Alt; more?: Alt; undo?: () => Promise<void> }

const CLOCK = /\d{1,2}(?::\d{2}|h\d{0,2})/g;
const words = (s: string) => plain(s).toLocaleLowerCase("vi");
/** A line that repeats the title, or a clock the title already holds, says nothing new. */
export const repeats = (title: string, line: string, name?: string) => {
  const a = words(title), b = words(line), n = name ? words(name) : "";
  return (!!a && b.includes(a)) || (!!n && b.includes(n)) || (b.match(CLOCK) ?? []).some((c) => a.includes(c));
};

/** One title, one sub, one alt, the undo. Sub priority: the caller's own, the engine's (a drag's "Hiểu rồi" or a pull), a clash, no room, the reason, what was inferred, the place, notes, far. */
export function compose(r: Result | undefined, c: Ctx = {}): Toast {
  const title = c.title ?? r?.toast ?? "";
  const sub = [c.sub, r?.sub, c.clash, c.stuck, c.reason, c.understood, c.where, c.notes, c.far].find((x) => !!x && !repeats(title, x, c.name));
  const moved = (r?.moves?.length ?? 0) > 1 || !!r?.moves?.some((m) => m.cause);
  // a drag that taught a hypothesis offers "Chỉ lần này" as its one alt (the caller's own alt wins)
  const once = r?.once;
  const alt = c.alt ?? (once ? { label: t("onceOnly"), run: () => void once().catch(() => {}) } : undefined);
  return { title, sub: sub || undefined, alt, more: !alt && c.see && moved ? { label: t("briefSee"), plain: true, run: c.see } : undefined, undo: r?.undo };
}

/** "Mình hiểu": only what Zen inferred beyond the words, a length it guessed and the sittings or due it worked out. */
export function inferred(acts: Action[], sized?: string): string | undefined {
  const guess = acts.find((a) => a.effortGuessed && a.effortMinutes);
  const what = [guess && lenW(guess.effortMinutes!), sized].filter(Boolean).join(", ");
  return what ? t("understood", { what }) : undefined;
}

/** The day and part a task landed in, in words: "T3, buổi chiều". Exact clocks stay in the row. */
export const whereOf = (at: number, now: number) => t("whereWhen", { day: day(at, now), part: partAt(new Date(at).getHours()) });
