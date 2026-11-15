// Phase 0.10: where an utterance goes: a standing rule (rules.ts), otherwise tasks (commands.ts always creates).
import { isRule } from "../../../rules";

export type Route = "task" | "rule";
export const route = (text: string): Route => (isRule(text) ? "rule" : "task");

export const ROUTING: { text: string; route: Route; phase?: number; why?: string }[] = [
  { text: "mai nộp báo cáo", route: "task" },
  { text: "9h họp nhóm thứ 2", route: "task" },
  { text: "học toán 2 tiếng", route: "task" },
  { text: "xong bài tập toán", route: "task" },
  { text: "để trống tối thứ 7", route: "rule" },
  { text: "đừng xếp việc sáng chủ nhật", route: "rule" },
];
