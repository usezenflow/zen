import type { TypeName } from "./theme";
import type { Kind, Task } from "./types";
import { typeOf } from "../planner/policy";

// One palette per task type everywhere (NowCard, week, month, day rows): timetable and exam/assignment types keep their own look, prep has its own, and personal tasks follow their kind.
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const seedOf = (id: string) => (hash(id) % 997) + 1;
const KIND_ART: Record<Kind, TypeName> = { study: "plan", work: "night", exercise: "lecture", chores: "exam", social: "assignment", self: "clay", errand: "exam", finance: "night", other: "clay" };
export function artOf(t: Task): TypeName {
  const ty = typeOf(t);
  return ty === "plan" ? KIND_ART[t.kind] : ty; // personal tasks keep their kind's palette, deadline or not
}
