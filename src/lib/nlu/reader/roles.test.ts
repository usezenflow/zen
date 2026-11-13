// Section 3i: a preposition before an anchor sets its role. Pure, on the raw text before the anchor.
import { describe, expect, it } from "vitest";
import { roleOf, withinDays } from "./roles";

describe("roles: prepositions before an anchor", () => {
  it("reads each role word", () => {
    expect(roleOf("nộp bài trước ")).toEqual({ role: "before" });
    expect(roleOf("nộp bài hạn chót ")).toEqual({ role: "before" });
    expect(roleOf("nộp bài chậm nhất ")).toEqual({ role: "before" });
    expect(roleOf("ôn bài sau ")).toEqual({ role: "after" });
    expect(roleOf("ôn bài sau khi ")).toEqual({ role: "after" });
    expect(roleOf("ôn bài từ ")).toEqual({ role: "from" });
    expect(roleOf("ôn bài kể từ ")).toEqual({ role: "from" });
    expect(roleOf("làm bài đến ")).toEqual({ role: "until" });
    expect(roleOf("làm bài cho đến hết ")).toEqual({ role: "until" });
    expect(roleOf("họp lúc ")).toEqual({ role: "at" });
    expect(roleOf("họp khoảng ")).toEqual({ role: "around" });
  });

  it("reads an offset before the role word", () => {
    expect(roleOf("nộp bài 2 ngày trước ")).toEqual({
      role: "before",
      days: -2,
    });
    expect(roleOf("ôn bài 1 tuần sau ")).toEqual({ role: "at", days: 7 });
  });

  it("reads nothing when no role word is before the anchor", () => {
    expect(roleOf("nộp bài ")).toBeUndefined();
    expect(roleOf("")).toBeUndefined();
  });

  it("reads tới as until and tối as no role", () => {
    expect(roleOf("nộp bài tới ")).toEqual({ role: "until" });
    expect(roleOf("nộp bài tối ")).toBeUndefined();
  });

  it("reads tuần sau as a span, not a day after", () => {
    expect(roleOf("nộp bài tuần sau ")).toBeUndefined();
  });
});

describe("roles: within offsets with no anchor", () => {
  it("reads trong vòng N ngày and tuần", () => {
    expect(withinDays("nộp bài trong vòng 3 ngày")).toBe(3);
    expect(withinDays("nộp bài trong vòng 1 tuần")).toBe(7);
  });

  it("does not read a plain length as an offset", () => {
    expect(withinDays("học bài trong 2 tiếng")).toBeUndefined();
    expect(withinDays("nộp bài trong 3 ngày")).toBeUndefined();
  });
});

describe("roles: anchors of section 3i", () => {
  it("reads an offset before a holiday or a date", () => {
    expect(roleOf("nộp bài 2 ngày sau ")).toEqual({ role: "at", days: 2 });
  });

  it("reads around, from and after on a holiday name", () => {
    expect(roleOf("họp tầm ")).toEqual({ role: "around" });
    expect(roleOf("họp gần ")).toEqual({ role: "around" });
    expect(roleOf("mua quà từ ")).toEqual({ role: "from" });
    expect(roleOf("nộp bài sau ")).toEqual({ role: "after" });
  });
});
