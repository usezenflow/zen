import { describe, expect, it } from "vitest";
import { read } from "./reader";
import { repairWord } from "./repairs";
import { repair } from "./repair";

const ref = { y: 2026, m: 11, d: 5, h: 9, mi: 0 };
const run = (text: string, rejected?: Set<string>) =>
  read(text, { ref, source: "typed", rejected }).repairs;

describe("repairs", () => {
  it("is empty when nothing was fixed", () => {
    expect(run("nộp báo cáo 20/11")).toEqual([]);
  });

  it("points at the raw word and offers the fix", () => {
    const text = "nop bai 1O/11 lúc 8h";
    expect(run(text)).toEqual([{ start: 8, end: 13, to: "10/11" }]);
  });

  it("offsets survive earlier spacing and length changes", () => {
    const text = "  nộp   báo cáo\n  ngày hai mươi tháng mười";
    const reps = run(text);
    expect(reps.map((r) => [text.slice(r.start, r.end), r.to])).toEqual([
      ["hai mươi", "20"],
      ["mười", "10"],
    ]);
  });

  it("is not a repair when only spacing or markup changed", () => {
    expect(run("nộp **bài**  lúc 9 h 30")).toEqual([]);
  });

  it("does not offer a rejected word again", () => {
    const text = "nop bai 1O/11 lúc 8h";
    const words = new Set(run(text).map((r) => repairWord(text, r)));
    expect(run(text, words)).toEqual([]);
  });
});

describe("spoken numbers after an unaccented ambiguous word", () => {
  it("'sau mười một giờ' is after eleven, 'sáu mươi phút' is sixty", () => {
    expect(repair("học bài sau mười một giờ đêm", "voice").text).toBe("học bài sau 11 giờ đêm");
    expect(repair("sau mười giờ tối gọi mẹ", "voice").text).toBe("sau 10 giờ tối gọi mẹ");
    expect(repair("chạy sáu mươi phút", "voice").text).toBe("chạy 60 phút");
  });
});
