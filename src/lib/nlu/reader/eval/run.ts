// Golden runner: checks each reader case against its expectations. Shared by the golden, mutation and speed tests.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fold } from "../fold";
import { PLAYFUL_TITLES } from "../assemble";
import { read, readBest } from "../reader";
import type { ReaderResult, ReaderItem } from "../../shared";
import type { CalDay } from "../daypick";

export type Exp = {
  type?: ReaderItem["type"];
  /** Folded words the title must contain. */
  title?: string;
  startsAt?: string;
  startsDay?: string;
  deadline?: string;
  deadlineDay?: string;
  notBefore?: string;
  /** The item's parts of the day, in any order. */
  windows?: ReaderItem["windows"];
  /** The item's clock ranges, in any order. */
  clocks?: { from: string; to: string }[];
  /** The item's days, in any order. */
  days?: string[];
  durationMinutes?: number;
  /** Folded text the location must contain. */
  location?: string;
  checked?: boolean;
  flag?: string;
  /** The item has no parts of the day. */
  noWindow?: boolean;
  /** The item has no deadline (a title-only task). */
  noDeadline?: boolean;
  /** Field names the item must list as inferred. */
  inferred?: string[];
  rrule?: string;
  /** The title is one of the playful defaults. */
  titlePlayful?: boolean;
  /** The timetable phrase that picked the item's days: its day part. */
  daypick?: string;
  /** The item has no location. */
  noLocation?: boolean;
  /** The folded title is exactly this. */
  titleIs?: string;
  /** The item comes after an item whose folded title contains this: the order edge. */
  after?: string;
};

/** The plan phases that have landed: every case whose `phase` is in here must pass. Phases run in parallel worktrees, so each adds only its own number; a merge is the union. */
export const DONE_PHASES = new Set([0, 1]);
export const held = (phase = 0) => DONE_PHASES.has(phase);

export interface Case {
  name: string;
  /** The plan phase whose work makes this case pass; 0 or absent = passes now. */
  phase?: number;
  /** One line: why a later phase owns this case. */
  why?: string;
  /** A blend: the name of the golden case it was derived from. */
  from?: string;
  text: string;
  ref: [number, number, number, number, number];
  source?: "typed" | "voice" | "paste" | "ocr";
  hint?: string;
  items?: Exp[];
  count?: number;
  noChecked?: boolean;
  allUnchecked?: boolean;
  dropped?: string[];
  /** Items come from comma-separated pieces; the asr family strips commas and skips the case. */
  commaPieces?: boolean;
  /** The items are one task in sittings: all carry the same planKey. */
  samePlan?: boolean;
  /** Other speech transcripts of a voice case; the best-read one is checked. */
  alternatives?: string[];
  /** The user's timetable, for cases a timetable changes. */
  calendar?: CalDay[];
}

/** Every golden/*.jsonl: the reference corpus, the audit probes, the blends, and one file per later phase (phase-N.jsonl), so parallel phases never edit the same file. */
const FILES = readdirSync(join(__dirname, "golden")).filter((f) => f.endsWith(".jsonl")).sort();

/** Golden cases of the landed phases (all of them with `all`). */
export function loadCases(all = false): Case[] {
  const cases = FILES.flatMap((f) =>
    readFileSync(join(__dirname, "golden", f), "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Case),
  );
  return all ? cases : cases.filter((c) => held(c.phase));
}

const folded = (s: string) => fold(s).text;
const clockKey = (c: { from: string; to: string }) => `${c.from}-${c.to}`;

/** Same members, ignoring order and repeats. */
function sameSet<T>(
  got: T[],
  want: T[],
  key: (x: T) => string = String,
): boolean {
  const g = new Set(got.map(key));
  const w = new Set(want.map(key));
  return g.size === w.size && [...w].every((x) => g.has(x));
}

export function matches(it: ReaderItem, e: Exp): boolean {
  if (e.type && it.type !== e.type) return false;
  if (e.title && !folded(it.title).includes(e.title)) return false;
  if (e.startsAt && it.startsAt !== e.startsAt) return false;
  if (e.startsDay && !it.startsAt?.startsWith(e.startsDay)) return false;
  if (e.deadline && it.deadline !== e.deadline) return false;
  if (e.deadlineDay && !it.deadline?.startsWith(e.deadlineDay)) return false;
  if (e.notBefore && it.notBefore !== e.notBefore) return false;
  if (e.windows && !sameSet(it.windows ?? [], e.windows)) return false;
  if (e.clocks && !sameSet(it.clocks ?? [], e.clocks, clockKey)) return false;
  if (e.days && !sameSet(it.days ?? [], e.days)) return false;
  if (
    e.durationMinutes !== undefined &&
    it.durationMinutes !== e.durationMinutes
  )
    return false;
  if (e.location && !folded(it.location ?? "").includes(e.location))
    return false;
  if (e.checked !== undefined && it.checked !== e.checked) return false;
  if (e.flag && !it.flags.includes(e.flag)) return false;
  if (e.noWindow && it.windows?.length) return false;
  if (e.noDeadline && it.deadline) return false;
  if (e.noLocation && it.location) return false;
  if (e.titleIs !== undefined && folded(it.title) !== e.titleIs) return false;
  if (
    e.titlePlayful &&
    !(PLAYFUL_TITLES as readonly string[]).includes(it.title)
  )
    return false;
  if (e.inferred && !e.inferred.every((f) => it.inferred.includes(f)))
    return false;
  if (e.rrule && it.rrule !== e.rrule) return false;
  if (e.daypick && it.daypick?.day !== e.daypick) return false;
  return true;
}

/** Failures of one case against a result. Empty when the case passes. */
export function check(c: Case, res: ReaderResult): string[] {
  const fails: string[] = [];
  if (c.count !== undefined && res.items.length !== c.count)
    fails.push(`count ${res.items.length} != ${c.count}`);
  for (const e of c.items ?? []) {
    const { after, ...shape } = e;
    const hit = res.items.filter((it) => matches(it, shape));
    if (!hit.length) fails.push(`missing ${JSON.stringify(e)}`);
    else if (
      after !== undefined &&
      !hit.some((it) =>
        res.items.some(
          (p) =>
            p.ref !== undefined &&
            p.ref === it.after &&
            folded(p.title).includes(after),
        ),
      )
    )
      fails.push(`no order after ${after}: ${JSON.stringify(e)}`);
  }
  if (c.samePlan) {
    const keys = new Set(res.items.map((it) => it.planKey));
    if (keys.size !== 1 || !res.items[0]?.planKey)
      fails.push(`planKey not shared: ${[...keys].join(",")}`);
  }
  if (c.noChecked && res.items.some((it) => it.checked))
    fails.push("some item checked");
  if (c.allUnchecked && res.items.some((it) => it.checked))
    fails.push("some item checked");
  for (const r of c.dropped ?? []) {
    if (!res.dropped.some((d) => d.reason === r)) fails.push(`no drop ${r}`);
  }
  return fails;
}

/** Runs one case on `text` (the case's own text by default). */
export function runCase(
  c: Case,
  text: string = c.text,
  alternatives: string[] | undefined = c.alternatives,
): string[] {
  const opts = {
    ref: { y: c.ref[0], m: c.ref[1], d: c.ref[2], h: c.ref[3], mi: c.ref[4] },
    source: c.source ?? "typed",
    hint: c.hint,
    calendar: c.calendar,
  };
  const res = alternatives?.length
    ? readBest([text, ...alternatives], opts)
    : read(text, opts);
  return check(c, res);
}

/** The reference corpus alone (no audit probes, no blends), so the mutation gates compare with zenflow like for like. */
export const loadReference = () => loadCases().filter((c) => !c.from && !c.name.startsWith("probe "));
