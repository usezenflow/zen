// The rule reader's contract: `POST /nlu/read` turns text into items. Times are wall clock in the user's zone.
import type { Clock } from "./constants";

export type ReaderItemType = "PLAN" | "ASSIGNMENT" | "EXAM" | "LECTURE" | "BUSY";
export type ReaderWindow = "EARLY_MORNING" | "DAWN" | "MORNING" | "NOON" | "AFTERNOON" | "EVENING" | "NIGHT" | "MIDNIGHT";
export type ReaderSource = "typed" | "voice" | "paste" | "ocr";
export type ReaderFlag = "weekday_mismatch" | "date_past" | "menu" | (string & {});

/** A wall-clock date, optional time. */
export interface ReaderWC {
  y: number;
  m: number;
  d: number;
  h?: number;
  mi?: number;
}

/** Which of the user's days a timetable phrase picks. */
export type ReaderDayPickDay =
  | "class"
  | "free"
  | "morning"
  | "afternoon"
  | "evening"
  | "course"
  | "exam"
  | "exam_eve"
  | "lightest"
  | "busiest";
/** Where on the picked day. */
export type ReaderDayPickTime = "after_class" | "after_course" | "before_class" | "between";

export interface ReaderDayPick {
  day?: ReaderDayPickDay;
  /** `true` for "days without": the days the predicate does not hold. */
  not?: boolean;
  /** The course as the timetable names it, for `course` and `after_course`. */
  course?: string;
  time?: ReaderDayPickTime;
  /** Matching days left in the semester. */
  count: number;
}

export interface ReaderItem {
  type: ReaderItemType;
  title: string;
  note?: string | null;
  /** "YYYY-MM-DD HH:mm" for EXAM, LECTURE and BUSY. */
  startsAt?: string;
  /** "YYYY-MM-DD HH:mm" for PLAN and ASSIGNMENT. */
  deadline?: string;
  notBefore?: string;
  /** Parts of the day; the task goes in any of them. */
  windows?: ReaderWindow[];
  /** Clock ranges; the task goes in any of them. */
  clocks?: Clock[];
  /** Local `YYYY-MM-DD` days; the task goes on any of them. */
  days?: string[];
  /** Absent for a free task: placement picks the length. */
  durationMinutes?: number;
  location?: string;
  reminderMinutes?: number[];
  rrule?: string;
  /** Rows of one recurring task share a key: one plan on the server. */
  planKey?: string;
  /** This item's key in the result, "i0", "i1"; set on every flexible item in an order chain. */
  ref?: string;
  /** The `ref` of the item that must finish first. Chains only: at most one each, no cycles. */
  after?: string;
  /** The timetable phrase that picked the days and time, for the read only chips. */
  daypick?: ReaderDayPick;
  confidence: number;
  /** Fields the reader filled from a default, not from the text. */
  inferred: string[];
  flags: ReaderFlag[];
  /** Other stamps the user can pick, for a weekday mismatch. */
  alternatives: string[];
  evidence: string;
  /** Pre-checked: confident and with no defaulted date or time. */
  checked: boolean;
}

export type ReaderDropReason = "not_mine" | "optional" | "expired";

export interface ReaderDropped {
  quote: string;
  reason: ReaderDropReason;
}

/** A phrase underlined in the input. Offsets point into the raw text. */
export interface ReaderMention {
  kind: "date" | "time" | "dur" | "place" | "course";
  start: number;
  end: number;
}

/** A fix the reader applied to the input: `to` replaces the raw text in `start`..`end`. */
export interface ReaderRepair {
  start: number;
  end: number;
  to: string;
}

/**
 * A word in the raw text the reader marks. A typo has one option; an ask (a reading the reader had to guess)
 * lists readings best first. `to` replaces `start`..`end`; the text is re-read after it is applied.
 */
export interface ReaderHint {
  start: number;
  end: number;
  kind: "typo" | "ask";
  /** Short title for the card, e.g. the guessed word. */
  label: string;
  options: { label: string; /** What the option means, e.g. a length or a start. */ caption?: string; to: string }[];
}

export interface ReaderResult {
  items: ReaderItem[];
  dropped: ReaderDropped[];
  mentions: ReaderMention[];
  /** Offsets point into the raw text. */
  repairs: ReaderRepair[];
  /** Typos and unsure readings with ranked options, offsets into the raw text. Fixed rules, never learned. */
  hints?: ReaderHint[];
  /** Set when the request had `commit: true`; send it back on `POST /sessions/bulk`. */
  captureId?: string;
}

/** Body of `POST /nlu/read`. `ref` defaults to now in the user's zone. */
export interface ReadRequest {
  text: string;
  source: ReaderSource;
  hint?: string;
  ref?: ReaderWC;
  /** Other transcripts of the same voice input; the server reads each and keeps the best. */
  alternatives?: string[];
  /** The text is being sent, not typed: the server stores the read to learn from. */
  commit?: boolean;
}
