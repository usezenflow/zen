// Shared contract for zen modules. Times are epoch ms.
export type Kind = "study" | "exercise" | "chores" | "social" | "other" | "work" | "errand" | "finance" | "self";
export type Source = "user" | "dlu";
export type TaskType = "plan" | "lecture" | "exam" | "busy" | "assignment";
export type Fixed = "lecture" | "exam" | "busy";

export interface Task {
  id: string;
  title: string;
  vec?: Float32Array; // embed(title) (nlu/embed.ts), DIM 96; stored vectors are versioned (store.ts)
  kind: Kind;
  source: Source;
  upstreamKey?: string; // dlu item key
  fixed?: Fixed; // set = immovable at start..end
  effort: number; // minutes
  location?: string; // room only, upstream-owned
  note?: string; // the user's own note
  section?: string; // lecture: ScheduleStudyUnitID, upstream-owned
  teacher?: string; // upstream-owned
  course?: string; // LMS course full name, upstream-owned
  url?: string; // LMS link, upstream-owned
  content?: string; // LMS assignment description, sanitized HTML, upstream-owned
  forId?: string; // prep: the exam it prepares for
  format?: string; // exam format; names what its prep does
  credits?: number; // exam: course credits (portal); its prep scales by credits / 3
  retake?: boolean; // exam: a retake (LanThi); its prep is 1.3 times longer
  maxSitting?: number; // longest sitting in minutes when split
  effortGuessed?: boolean; // the length was guessed, not said
  cls?: string; // the reader's frame class of a guessed length ("code"): its guesses are learned per class
  guessMin?: number; // that guess before the class multiplier: a done task's real minutes are compared to it
  deadline?: number;
  notBefore?: number;
  notAfter?: number; // end of a said window ("tối thứ 5"): the planner keeps the whole task inside notBefore..notAfter
  tods?: [number, number][]; // minutes of the day a flexible task runs in, any one of them ("sáng hoặc tối"); every occurrence of a repeat keeps them
  rrule?: string;
  seriesId?: string; // one repeat said once: its occurrences, so renaming one keeps it in the series
  parentId?: string; // sitting of a split task
  start?: number;
  end?: number;
  doneAt?: number;
  deletedAt?: number;
  userEdited?: string[]; // fields the user changed, upstream never overwrites; "deleted" = user removed it, never revived
  pinned?: boolean; // "Đừng dời việc này nữa": the planner treats it as busy at start..end
  createdAt: number;
}


export type EventType = "placed" | "kept" | "done" | "drag" | "later" | "delete" | "edit";
export interface TaskEvent {
  id: string;
  taskId: string;
  type: EventType;
  at: number;
  data?: Record<string, unknown>; // drag: { fromStart, toStart }, placed: { policy, arm, x }
}

export type Op = "create" | "edit" | "done" | "delete"; // standing rules have their own reader (lib/rules.ts)
export interface Action {
  op: Op;
  target?: string;
  title?: string;
  when?: string; // ISO
  from?: { start?: number; end?: number }; // edit: where the task was before a live edit's held values (what the move teaches)
  effortMinutes?: number;
  effortGuessed?: boolean; // the length is a guess (inferred), not said
  cls?: string; // the frame class of a guessed length
  guessMin?: number; // the guess before the class multiplier
  maxSitting?: number; // longest sitting in minutes: the task is split into sittings of at most this
  anchor?: string; // "YYYY-MM-DD": an exam this prep is due the day before
  deadline?: string; // ISO
  repeat?: string; // rrule
  note?: string; // the task's note: create sets it, edit replaces it
  kind?: Kind;
  fixed?: Fixed; // an exact said time ("6 giờ chiều thứ 4 đi gym"): a busy block at `when`, never a flexible plan
  notAfter?: string; // ISO; end of a said part of day or day, for a flexible plan
  // What the reader knew beyond the one start: all its days, clocks and parts of the day, a place, an "after" clock,
  // its place in an order chain (`ref`, `after` = the ref it follows), how sure it was, and what it flagged.
  notBefore?: string; // ISO
  location?: string;
  days?: string[];
  clocks?: { from: string; to: string }[];
  windows?: string[];
  tods?: [number, number][]; // the said parts of the day as minutes of the day, for a flexible plan: one of them holds the task
  ref?: string;
  after?: string;
  confidence?: number;
  checked?: boolean;
  flags?: string[];
  alternatives?: string[];
}

export type Policy = "linucb" | "heuristic" | "tie";
export interface Placement {
  id: string;
  start: number;
  end: number;
  policy: Policy;
  arm?: number; // hour arm of start, logged for learning
  x?: number[]; // linucb context of the placed cell
  alt?: number; // second-best start at least 1 h away
  from?: number; // start before this plan, when it moved
  why?: Reason[]; // top reasons for this start over the runner-up, strongest first, at most 4
  explore?: boolean; // picked for the UCB bonus, not the mean: "thử giờ mới"
}

/** One reason in model terms; src/lib/reasons.ts words it. `w` is the signed share of the score gap over the runner-up start. */
export type ReasonKey =
  | "hour" | "after" | "similar" | "energy" | "weekend" | "busy" | "kind" // linucb features
  | "deadline" | "pace" | "load" | "gap" | "stable" | "late" // solver terms (value.ts, place.ts dayCost)
  | "explore" | "rule" | "missed" | "pinned"
  | "chose" // the user set this time by hand: zen keeps it
  | "said" // placed inside the window the user said
  | "packed" | "fit" | "over" // what came of what was asked: the window was full, the guessed length shrunk, the day ran past 22:00
  | "guess"; // nothing learned yet speaks for this time: an honest default
export interface Reason { key: ReasonKey; w: number; vars?: Record<string, string | number> }

/** One accepted solver move, for the narrated "thinking" lines. */
export interface Step { key: "read" | "place" | "series" | "move" | "lighten" | "swap" | "chain" | "rule" | "missed"; vars: Record<string, string | number>; id?: string; ids?: string[] } // id: the task a place or move line is about; ids: every occurrence a series line places

/** A deadline the plan cannot meet in free time; fixes push one other flexible task past the deadline. */
export interface Warn { id: string; title: string; deadline: number; need: number; free: number; fixes: { id: string; title: string; start: number }[] } // need/free in minutes

/** A standing rule the user said: no flexible task of `kinds` (empty = any) overlaps from..to (minutes after midnight) on `days` (0 = Sunday; empty = every day). */
export interface Rule { id: string; text: string; days: number[]; from: number; to: number; kinds: Kind[]; at: number }

/** A move the user has not seen yet: drives the brief, the trail dot and the ghost row. */
export interface Move { id: string; title: string; from: number; to: number; why?: Reason[]; cause?: string; at: number; seen?: boolean; self?: boolean; briefed?: boolean } // self: from the user's own action just now, so it shows the trail but not the brief; briefed: a brief showed it once, never again (the trail stays)

export interface Diff {
  placed: Placement[];
  displaced: { id: string; from: number; to: number }[];
  split: { parentId: string; ids: string[] }[];
  insight?: { template: string; sub: string; vars: Record<string, string | number> }; // Vietnamese title and second line, {vars} filled by the caller
  steps?: Step[]; // accepted solver moves, in order, at most 6
  warn?: Warn[];
  unplaced?: { id: string; effort: number }[]; // no free, awake slot: left without a time
}

/** Tombstones that keep deleted series from coming back: name to cutoff start, 0 = the whole series. */
export interface Gone { sections: Record<string, number>; series: Record<string, number> }

/** A campus change to tell the student about; route is "/marks", "/task/<id>" or "day:<epoch ms>". */
export interface Notice { title: string; sub?: string; route?: string }
