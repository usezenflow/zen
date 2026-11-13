// Shared contract for zen modules. Times are epoch ms.
export type Kind = "study" | "exercise" | "chores" | "social" | "other";
export type Source = "user" | "dlu";
export type TaskType = "plan" | "lecture" | "exam" | "busy" | "assignment";
export type Fixed = "lecture" | "exam" | "busy";

export interface Task {
  id: string;
  title: string;
  vec?: Float32Array; // e5-small, 384
  kind: Kind;
  source: Source;
  upstreamKey?: string; // dlu item key
  fixed?: Fixed; // set = immovable at start..end
  effort: number; // minutes
  format?: string; // exam format; a report gets no preps
  maxSitting?: number; // longest sitting in minutes when split
  deadline?: number;
  notBefore?: number;
  rrule?: string;
  parentId?: string; // sitting of a split task
  start?: number;
  end?: number;
  doneAt?: number;
  deletedAt?: number;
  userEdited?: string[]; // fields the user changed, upstream never overwrites
  calendarEventId?: string;
  createdAt: number;
}

export interface Note { id: string; text: string; at: number }

export type EventType = "placed" | "kept" | "done" | "drag" | "later" | "delete" | "edit";
export interface TaskEvent {
  id: string;
  taskId: string;
  type: EventType;
  at: number;
  data?: Record<string, unknown>; // drag: { fromStart, toStart }, placed: { policy, arm, x, otherStart }
}

export type Op = "create" | "edit" | "done" | "delete" | "note";
export interface Action {
  op: Op;
  target?: string;
  title?: string;
  when?: string; // ISO
  effortMinutes?: number;
  deadline?: string; // ISO
  repeat?: string; // rrule
  kind?: Kind;
}

export type Policy = "linucb" | "heuristic" | "tie";
export interface Placement {
  id: string;
  start: number;
  end: number;
  policy: Policy;
  arm?: number; // hour arm of start, logged for learning
  x?: number[]; // linucb context of the placed cell
  otherStart?: number; // start the other policy chose
  alt?: number; // otherStart when it differs, else the second-best start
}

export interface Diff {
  placed: Placement[];
  displaced: { id: string; from: number; to: number }[];
  split: { parentId: string; ids: string[] }[];
  insight?: { template: string; vars: Record<string, string | number> };
}
