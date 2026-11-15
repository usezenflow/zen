// Phase 0.10: where an utterance goes. `route` composes today's entry points: a standing rule (rules.ts), a command on an
// existing task (commands.ts), otherwise a task. Nothing returns "question" yet (6.9), so those cases wait for phase 6.
import { think } from "../../commands";
import { isRule } from "../../../rules";

export type Route = "task" | "command" | "rule" | "question";
export const TASKS = [{ id: "t1", title: "nộp báo cáo" }, { id: "t2", title: "họp nhóm" }];

export function route(text: string, now = new Date("2026-11-14T02:00:00Z")): Route {
  if (isRule(text)) return "rule";
  const ops = think(text, now, TASKS).map((a) => a.op);
  return ops.length && ops.every((o) => o !== "create") ? "command" : "task";
}

export const ROUTING: { text: string; route: Route; phase?: number; why?: string }[] = [
  { text: "mai nộp báo cáo", route: "task" },
  { text: "9h họp nhóm thứ 2", route: "task" },
  { text: "học toán 2 tiếng", route: "task" },
  { text: "xong báo cáo rồi", route: "command" },
  { text: "xóa họp nhóm", route: "command" },
  { text: "ghi chú mua sữa", route: "command" },
  { text: "để trống tối thứ 7", route: "rule" },
  { text: "đừng xếp việc sáng chủ nhật", route: "rule" },
  { text: "mai có gì?", route: "question", phase: 6, why: "6.9 intent before parsing: a question becomes a task today" },
  { text: "tuần này mình bận không?", route: "question", phase: 6, why: "6.9 intent before parsing" },
];
