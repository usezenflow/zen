// Phase 0.7: texts that must NOT read as dated tasks (the 29 collision rows live in collisions.spec.ts). Ref: Sat 14 Nov 2026, 09:00.
import type { Case } from "./run";

export interface Negative {
  text: string;
  source?: Case["source"];
  ref?: Case["ref"];
  /** The plan phase that makes this row pass; absent = passes now. */
  phase?: number;
  why?: string;
}

export const NEGATIVES: Negative[] = [
  { text: "không phải nộp bài" },
  { text: "học mà không ngủ" },
  { text: "nhắm mắt nghỉ chút" },
  { text: "đọc lá thư số 6 của mẹ" },
  { text: "thi công nhà bếp" },
  { text: "[10:32, 14/11/2026] Lan: mua sữa", source: "paste", phase: 5, why: "5.7 chat export timestamps are not the task's date" },
  { text: "[21:05, 13/11/2026] Nam: ok", source: "paste", phase: 5, why: "5.7 chat export timestamps are not the task's date" },
  { text: "mua áo 200k" },
  { text: "ví còn 5tr" },
  { text: "được 8.5 điểm môn toán" },
  { text: "gọi 0901234567 hỏi bài" },
  { text: "gọi 0283 123 4567 hỏi bài" },
  { text: "bỏ rác" },
  { text: "chuyển khoản học phí" },
];
