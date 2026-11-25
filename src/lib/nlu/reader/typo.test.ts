import { describe, expect, it } from "vitest";
import { readActions } from "../adapt";
import { fold, osa } from "./fold";
import { canonWord } from "./en";

const now = new Date("2026-11-13T03:00:00Z"); // 10:00 Fri, UTC+7
const titles = (text: string) => readActions(text, now).filter((a) => a.op === "create").map((a) => a.title);

describe("osa", () => {
  it("counts an insert, delete, substitute or swap once", () => {
    expect([osa("csld", "csdl"), osa("truoc", "truoc"), osa("tuan", "tuaan"), osa("sau", "sua"), osa("mail", "mai")]).toEqual([1, 0, 1, 1, 1]);
    expect(osa("gym", "gim")).toBe(1);
  });
});

describe("typo tolerance in the reader", () => {
  it("repairs one insert or delete in a cue word", () => {
    expect(titles("họp nhóm truoc chieu mai")[0]).not.toMatch(/truoc/i);
    expect(titles("tuaan sau nop bai")[0]).toBeDefined();
  });
  it("repairs the teencode and syllable-shaped typos", () => {
    expect(titles("ko quên nộp bài")[0]).toMatch(/không/i);
    expect(titles("nhưg bài tập")[0]).toMatch(/nhưng/i);
  });
  it("a canon English term is not a cue word", () => {
    expect(canonWord("moel")).toBe("model");
    expect(titles("moel cho dự án")[0]).toMatch(/model/i);
  });
  it("an English word is kept as typed", () => {
    expect(fold("mail").text).toBe("mail");
    expect(titles("gửi mail cho thầy")[0]).toMatch(/mail/i);
  });
});
