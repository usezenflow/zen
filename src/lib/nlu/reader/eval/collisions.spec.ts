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
    { type: "PLAN", noDeadline: true },
  ],
  [
    "chị Mai is a name, not tomorrow",
    "mua quà cho chị Mai",
    { type: "PLAN", noDeadline: true },
  ],
  [
    "mãi mãi is not tomorrow",
    "ghi nhớ mãi mãi",
    { type: "PLAN", noDeadline: true },
  ],
  [
    "thử hai cái is not Monday",
    "thử hai cái",
    { type: "PLAN", noDeadline: true },
  ],
  [
    "thử lại app is not Monday",
    "thử lại app",
    { type: "PLAN", noDeadline: true },
  ],
  [
    "thì is not an exam",
    "đi chợ thì mua rau",
    { type: "PLAN", noDeadline: true },
  ],
  [
    "kiểm tra lại app is not an exam",
    "kiểm tra lại app",
    { type: "PLAN", noDeadline: true },
  ],
  [
    "tiếc is not a party block",
    "mua sữa tiếc quá",
    { type: "PLAN", noDeadline: true },
  ],
  [
    "lễ phép is not a holiday block",
    "dạy con lễ phép",
    { type: "PLAN", noDeadline: true },
  ],
  [
    "gặp lại app is not a meeting",
    "gặp lại app",
    { type: "PLAN", noDeadline: true },
  ],
  ["app is not ap", "mở app", { type: "PLAN", title: "app" }],
  ["tôi is not evening", "tôi mua trà", { type: "PLAN", noDeadline: true }],
  ["đếm is not night", "đếm tiền", { type: "PLAN", noDeadline: true }],
  [
    "sang is not morning",
    "mang đồ sang nhà bạn",
    { type: "PLAN", noDeadline: true },
  ],
  [
    "chiếu is not afternoon",
    "mua vé phim chiếu sớm",
    { type: "PLAN", noDeadline: true },
  ],
  ["hộp is not a meeting", "mua hộp bút", { type: "PLAN", noDeadline: true }],
  ["gấp is not a meeting", "giặt đồ gấp", { type: "PLAN", noDeadline: true }],
  [
    "hẳn is not a deadline",
    "hẳn là đi chợ",
    { type: "PLAN", noDeadline: true },
  ],
  ["thu is not Thursday", "thu dọn phòng", { type: "PLAN", noDeadline: true }],
  ["năm is not five", "bạn nam trong lớp", { type: "PLAN", noDeadline: true }],
  ["sau is not six", "rửa xe sau bữa ăn", { type: "PLAN", noDeadline: true }],
  ["bay is not seven", "ra sân bay đón mẹ", { type: "PLAN", noDeadline: true }],
  [
    "ăn is a task verb only as a title",
    "ăn trưa ở nhà",
    { type: "PLAN", noDeadline: true },
  ],
  [
    "dì is not a task verb",
    "dì Hoa gọi điện",
    { type: "PLAN", noDeadline: true },
  ],
  ["ơn is not a task verb", "cảm ơn mẹ", { type: "PLAN", noDeadline: true }],
  ["vẽ is not a task verb", "về nhà sớm", { type: "PLAN", noDeadline: true }],
  ["đất is not a task verb", "mua đất", { type: "PLAN", noDeadline: true }],
  ["sữa is not a task verb", "mua sữa", { type: "PLAN", noDeadline: true }],
  [
    "rên flow is a title only",
    "rên flow",
    { type: "PLAN", noDeadline: true, title: "flow" },
  ],
];

describe("reader: accent collisions", () => {
  it.each(ROWS)("%s", (name, text, item) => {
    const c: Case = { name, text, ref: REF, source: "typed", items: [item] };
    expect(runCase(c)).toEqual([]);
  });
});
