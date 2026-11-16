// Accent collisions: a word that folds onto another word must read as the one the user typed. Ref: Thu 5 Nov 2026, 09:00.
import { describe, expect, it } from "vitest";
import { type Case, runCase } from "./run";
import type { Exp } from "./run";

const REF: Case["ref"] = [2026, 11, 5, 9, 0];
const TODAY = "2026-11-05";

/** One row per collision: the input, and the item it must read as. */
const ROWS: [name: string, text: string, item: Exp][] = [
  [
    "the reported mishearing lands today",
    "Tết lại rên flow cho hôm nay",
    { type: "PLAN", deadlineDay: TODAY },
  ],
  [
    "tết for test is not a holiday",
    "tết hôm nay",
    { type: "PLAN", deadlineDay: TODAY },
  ],
  [
    "sát giờ is not Saturday",
    "sát giờ đi chợ",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "chị Mai is a name, not tomorrow",
    "mua quà cho chị Mai",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "mãi mãi is not tomorrow",
    "ghi nhớ mãi mãi",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "thử hai cái is not Monday",
    "thử hai cái",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "thử lại app is not Monday",
    "thử lại app",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "thì is not an exam",
    "đi chợ thì mua rau",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "kiểm tra lại app is not an exam",
    "kiểm tra lại app",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "tiếc is not a party block",
    "mua sữa tiếc quá",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "lễ phép is not a holiday block",
    "dạy con lễ phép",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "gặp lại app is not a meeting",
    "gặp lại app",
    { type: "PLAN", deadlineInferred: true },
  ],
  ["app is not ap", "mở app", { type: "PLAN", title: "app" }],
  ["tôi is not evening", "tôi mua trà", { type: "PLAN", deadlineInferred: true }],
  ["đếm is not night", "đếm tiền", { type: "PLAN", deadlineInferred: true }],
  [
    "sang is not morning",
    "mang đồ sang nhà bạn",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "chiếu is not afternoon",
    "mua vé phim chiếu sớm",
    { type: "PLAN", deadlineInferred: true },
  ],
  ["hộp is not a meeting", "mua hộp bút", { type: "PLAN", deadlineInferred: true }],
  ["gấp is not a meeting", "giặt đồ gấp", { type: "PLAN", deadlineInferred: true }],
  [
    "hẳn is not a deadline",
    "hẳn là đi chợ",
    { type: "PLAN", deadlineInferred: true },
  ],
  ["thu is not Thursday", "thu dọn phòng", { type: "PLAN", deadlineInferred: true }],
  ["năm is not five", "bạn nam trong lớp", { type: "PLAN", deadlineInferred: true }],
  ["sau is not six", "rửa xe sau bữa ăn", { type: "PLAN", deadlineInferred: true }],
  ["bay is not seven", "ra sân bay đón mẹ", { type: "PLAN", deadlineInferred: true }],
  [
    "ăn is a task verb only as a title",
    "ăn trưa ở nhà",
    { type: "PLAN", deadlineInferred: true },
  ],
  [
    "dì is not a task verb",
    "dì Hoa gọi điện",
    { type: "PLAN", deadlineInferred: true },
  ],
  ["ơn is not a task verb", "cảm ơn mẹ", { type: "PLAN", deadlineInferred: true }],
  ["vẽ is not a task verb", "về nhà sớm", { type: "PLAN", deadlineInferred: true }],
  ["đất is not a task verb", "mua đất", { type: "PLAN", deadlineInferred: true }],
  ["sữa is not a task verb", "mua sữa", { type: "PLAN", deadlineInferred: true }],
  [
    "rên flow is a title only",
    "rên flow",
    { type: "PLAN", deadlineInferred: true, title: "flow" },
  ],
];

describe("reader: accent collisions", () => {
  it.each(ROWS)("%s", (name, text, item) => {
    const c: Case = { name, text, ref: REF, source: "typed", items: [item] };
    expect(runCase(c)).toEqual([]);
  });
});
