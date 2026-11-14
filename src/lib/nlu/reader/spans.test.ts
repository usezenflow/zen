import { expect, it } from "vitest";
import { read } from "./reader";

// The photo card lights up these spans, so each must cover the whole phrase, not its first char.
it("mention spans cover tokens the repair step touched", () => {
  const raw = "thi Xác suất 8g00 thứ Sáu 27/11, phòng B1.201";
  const got = read(raw, { ref: { y: 2026, m: 11, d: 14, h: 9, mi: 0 }, source: "ocr" }).mentions.map((m) => raw.slice(m.start, m.end));
  expect(got).toEqual(expect.arrayContaining(["8g00", "thứ Sáu", "27/11", "B1.201"]));
});
