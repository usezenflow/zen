import { describe, expect, it } from "vitest";
import { cleanTitle, itemAction, kindOf, readActions, readErrors, readFull, readNotes } from "./adapt";
import type { ReaderItem } from "./shared";

// 2026-11-13 is a Friday; 10:00Z is 17:00 in UTC+7.
const now = new Date("2026-11-13T10:00:00Z");

describe("readActions", () => {
  it("maps a dated task to create with a deadline or start", () => {
    const a = readActions("nop bao cao mon toan 20/11 23h", now);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((x) => x.op === "create" && x.title)).toBe(true);
    expect(a.some((x) => x.deadline?.startsWith("2026-11-20") || x.when?.startsWith("2026-11-20"))).toBe(true);
  });
  it("returns nothing for empty text", () => {
    expect(readActions("", now)).toEqual([]);
  });
});

describe("repeats", () => {
  it("keeps repeat words out of the title and in the rule", () => {
    for (const [said, title, rule] of [
      ["viết nhật ký hằng đêm", "Viết nhật ký", "FREQ=DAILY"],
      ["tập yoga mỗi ngày trừ chủ nhật", "Tập yoga", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR,SA"],
      ["chạy bộ hằng ngày trừ thứ 7 và CN", "Chạy bộ", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"],
    ] as const) {
      const [a] = readActions(said, now);
      expect(a).toMatchObject({ op: "create", title, repeat: rule });
    }
  });
  it("cleanTitle drops leftovers but not the word hàng on its own", () => {
    expect(cleanTitle("Mỗi ngày đọc sách")).toBe("Đọc sách");
    expect(cleanTitle("Viết nhật ký hằng")).toBe("Viết nhật ký");
    expect(cleanTitle("Mua hàng")).toBe("Mua hàng");
    expect(cleanTitle("iPhone")).toBe("iPhone");
  });
});

describe("itemAction carries what the reader knew (1.7)", () => {
  const item: ReaderItem = {
    type: "PLAN", title: "Họp nhóm", days: ["2026-11-17", "2026-11-19"], clocks: [{ from: "09:00", to: "10:00" }, { from: "14:00", to: "15:00" }],
    windows: ["MORNING", "AFTERNOON"], location: "A2.304", notBefore: "2026-11-17 09:00", ref: "i1", after: "i0",
    confidence: 0.7, inferred: [], flags: ["weekday_mismatch"], alternatives: ["2026-11-18 09:00"], evidence: "", checked: false,
  };
  it("keeps every day, clock and part of day, the place, the order link, confidence and flags", () => {
    expect(itemAction(item)).toMatchObject({
      days: item.days, clocks: item.clocks, windows: item.windows, location: "A2.304", notBefore: "2026-11-17T09:00:00",
      ref: "i1", after: "i0", confidence: 0.7, checked: false, flags: ["weekday_mismatch"], alternatives: ["2026-11-18 09:00"],
    });
  });
  it("sets none of them when the item has none", () => {
    const a = itemAction({ ...item, days: undefined, clocks: undefined, windows: undefined, location: undefined, notBefore: undefined, ref: undefined, after: undefined, flags: [], alternatives: [] });
    for (const k of ["days", "clocks", "windows", "location", "notBefore", "ref", "after", "flags", "alternatives"]) expect(a).not.toHaveProperty(k);
  });
});

describe("kinds (1.8)", () => {
  it("maps the type first, then the words of the title", () => {
    expect(kindOf("EXAM", "Thi toán")).toBe("study");
    for (const [title, kind] of [["Chạy bộ", "exercise"], ["Tập gym", "exercise"], ["Đi bơi", "exercise"], ["Giặt đồ", "chores"], ["Dọn nhà", "chores"], ["Cà phê với Quang", "social"], ["Gọi điện cho mẹ", "social"], ["Viết nhật ký", undefined]] as const)
      expect(kindOf("PLAN", title)).toBe(kind);
  });
  it("reaches the action", () => {
    expect(readActions("chạy bộ mỗi sáng", now)[0].kind).toBe("exercise");
    expect(readActions("nop bao cao mon toan 20/11 23h", now)[0].kind).toBe("study");
  });
});

describe("readFull (1.1, 1.2, 1.9)", () => {
  it("applies the voice repairs only for a voice source", () => {
    expect(readFull("nộp bài đét lai thứ 6", now, "voice").items[0].title).toBe("Nộp bài");
    expect(readFull("nộp bài đét lai thứ 6", now).items[0].title).toBe("Nộp bài đét lai");
  });
  it("reads the best of the other transcripts of a voice take, and only a voice take", () => {
    const alt = { alternatives: ["nộp bài mai"] };
    expect(readFull("nộp bài", now, "voice", alt).items[0].deadline?.startsWith("2026-11-14")).toBe(true);
    expect(readFull("nộp bài", now, "typed", alt).items[0].deadline?.startsWith("2026-11-14")).toBeFalsy();
  });
  it("records a crash without throwing, and without the user's text", () => {
    const boom = { get calendar(): never { throw new Error("boom"); } };
    expect(readFull("mai họp", now, "typed", boom)).toEqual({ items: [], dropped: [], mentions: [], repairs: [] });
    expect(readErrors.at(-1)).toBe("boom");
  });
});

describe("readNotes (1.13)", () => {
  it("offers the other reading of a guessed hour as a chip that re-reads the text", () => {
    const text = "họp nhóm 3 giờ mai";
    const { alt } = readNotes(text, readFull(text, now));
    expect(alt?.label).toBeTruthy();
    expect(alt?.text).toContain(alt!.label);
    expect(alt?.text).toMatch(/^họp nhóm .+ mai$/);
  });
  it("asks nothing for a period: tiết 5 has a clock, tiết 15 has none and no question", () => {
    for (const text of ["học bù toán thứ 2 tiết 5", "học bù toán thứ 2 tiết 15"]) expect(readNotes(text, readFull(text, now)).alt).toBeUndefined();
  });
  it("lists a repair the reader made", () => {
    const text = "nộp bài đét lai thứ 6";
    expect(readNotes(text, readFull(text, now, "voice")).sub).toBe("“đét lai” → deadline");
  });
  it("lists a dropped clause with its reason, and says nothing when there is nothing to say", () => {
    const r = { items: [], dropped: [{ quote: "nếu rảnh", reason: "optional" as const }], mentions: [], repairs: [] };
    expect(readNotes("x", r).sub).toBe("bỏ “nếu rảnh” (tùy chọn)");
    expect(readNotes("nộp bài 20/11", readFull("nộp bài 20/11", now))).toEqual({ sub: undefined, alt: undefined });
  });
});
