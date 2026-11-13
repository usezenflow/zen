import { describe, expect, it } from "vitest";
import { RULES_VI } from "./rules-brief";
import { brief, readFull, repaired } from "./adapt";

const now = new Date("2026-11-13T10:00:00Z");

describe("RULES_VI", () => {
  it("carries the reader's tables and stays short", () => {
    expect(RULES_VI).toContain("tiết 1=07:30");
    expect(RULES_VI).toContain("tối 19:00 (trước 18:00, hạn 22:00)");
    expect(RULES_VI).toContain("3 buổi/tuần=BYDAY=MO,WE,FR");
    expect(RULES_VI.length).toBeLessThan(1600); // cached prefix, but n_ctx is shared with the volatile part
  });
});

describe("brief", () => {
  it("keeps only the fields the reader set", () => {
    const [it] = readFull("hop nhom mai 9h", now).items;
    expect(brief(it)).toMatchObject({ title: "Hop nhom", startsAt: "2026-11-14 09:00" });
    expect(brief(it)).not.toHaveProperty("windows");
    expect(brief(it)).not.toHaveProperty("evidence");
  });
  it("applies repairs right to left", () => {
    expect(repaired("ab cd", { items: [], dropped: [], mentions: [], repairs: [{ start: 0, end: 2, to: "xyz" }, { start: 3, end: 5, to: "q" }] })).toBe("xyz q");
  });
});
