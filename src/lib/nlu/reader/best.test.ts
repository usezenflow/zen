// readBest: the best-read voice transcript wins, a tie keeps the main text, and at most five transcripts are read.
import { describe, expect, it } from "vitest";
import { read, readBest, readScore } from "./reader";

const opts = {
  ref: { y: 2026, m: 11, d: 5, h: 9, mi: 0 },
  source: "voice" as const,
};

describe("readBest", () => {
  it("keeps the main text on a tie", () => {
    const text = "họp nhóm 9 giờ sáng mai";
    expect(readBest([text, text], opts)).toEqual(read(text, opts));
  });

  it("keeps the read with more resolved mentions", () => {
    const alt = "nộp bài thứ sáu lúc 6 giờ chiều";
    expect(readBest(["nộp bài thứ sáu", alt], opts)).toEqual(read(alt, opts));
  });

  it("never lets another hearing move the day the main text read", () => {
    const main = "báo cáo môn web thứ 7 tuần sau 8 giờ sáng";
    // more mentions, another day: the user saw the main text, so it stands
    const alt = "báo cáo môn web thứ 7 tuần sau 8 giờ sáng ngày 20 tháng 6 lúc 9 giờ";
    expect(readBest([main, alt], opts)).toEqual(read(main, opts));
  });

  it("reads at most five transcripts", () => {
    const weak = "nộp bài";
    const strong = "họp nhóm 9 giờ sáng mai";
    expect(readBest([weak, weak, weak, weak, weak, strong], opts)).toEqual(
      read(weak, opts),
    );
  });

  it("scores each unread digit as minus one", () => {
    const text = "nộp bài số 7";
    expect(readScore(text, read(text, opts))).toBe(-1);
  });
});
