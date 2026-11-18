// Phase 0.9: direct tests for modules that had none. Each pins current, intended behavior with a few rows.
import { describe, expect, it } from "vitest";
import { blankParens, fallbackTask, hashText, isBoilerplateTitle } from "../assemble";
import { clockRun } from "../clocks";
import { fold } from "../fold";
import { correctionOf, findMentions, mentionsOf } from "../mentions";
import { partRuns, runParts } from "../parts";
import { resolvePeriods } from "../periods";
import { seriesTexts } from "../series";
import { parseSpokenNumber, spokenEdits } from "../spoken";
import { gridEdits, isScheduleText, ocrSchedule } from "../table";

describe("fold", () => {
  it("drops marks and lowercases, with a per-char map into the original", () => {
    const f = fold("Đặt Thứ 6");
    expect(f.text).toBe("dat thu 6");
    expect(f.map).toHaveLength(f.text.length);
    expect(f.map[0]).toBe(0);
  });
});

describe("mentions", () => {
  const raw = "họp nhóm 9h sáng mai ở A24.1 trong 2 tiếng";
  it("finds time, date, place and duration with offsets inside the text", () => {
    const kinds = findMentions(raw).map((f) => f.kind);
    expect(kinds).toEqual(["time", "date", "place", "dur"]);
    for (const m of mentionsOf(raw)) {
      expect(m.start).toBeGreaterThanOrEqual(0);
      expect(m.end).toBeLessThanOrEqual(raw.length);
      expect(m.start).toBeLessThan(m.end);
    }
  });
  it("finds nothing in a plain sentence", () => expect(findMentions("mua sữa")).toEqual([]));
  it("reads a correction: the later clock replaces the earlier", () => {
    expect(correctionOf("họp 9h à không 10h")?.text).toContain("10h");
    expect(correctionOf("họp 9h")).toBeUndefined();
  });
});

describe("clocks", () => {
  it("reads two clock ranges joined by or", () => {
    const r = clockRun("9h-11h hoặc 19h-21h");
    expect(r?.kind).toBe("or");
    expect(r?.clocks).toEqual([{ from: "09:00", to: "11:00" }, { from: "19:00", to: "21:00" }]);
  });
  it("is undefined without a run", () => expect(clockRun("hôm nay")).toBeUndefined());
});

describe("series", () => {
  it("splits parts of the day joined by and", () =>
    expect(seriesTexts("học tiếng anh sáng và tối", false)).toEqual(["học tiếng anh sáng", "học tiếng anh tối"]));
  it("is undefined for a single task", () => expect(seriesTexts("học tiếng anh", false)).toBeUndefined());
});

describe("parts", () => {
  it("groups part words joined by and into one run", () => {
    const runs = partRuns("hoc sang va toi");
    expect(runs).toHaveLength(1);
    expect(runs[0].and).toBe(true);
    expect(runParts(runs[0]).length).toBe(2);
  });
  it("finds no run without a part word", () => expect(partRuns("hoc bai")).toEqual([]));
});

describe("periods", () => {
  it("resolves a range of periods to a start and a length", () => {
    expect(resolvePeriods(1, 3)).toEqual({ h: 7, mi: 30, durationMinutes: 180 });
    expect(resolvePeriods(3, 1)).toEqual(resolvePeriods(1, 3));
  });
  it("uses the portal's table: tiết 1-4 is 07:30-11:10, tiết 9 starts 14:50, 5 and 6 continue after 4 by user decision (1.14)", () => {
    expect(resolvePeriods(1, 4)).toEqual({ h: 7, mi: 30, durationMinutes: 210 });
    expect(resolvePeriods(9)).toMatchObject({ h: 14, mi: 50 });
    expect(resolvePeriods(11)).toMatchObject({ h: 16, mi: 40 });
    expect(resolvePeriods(5)).toEqual({ h: 11, mi: 10, durationMinutes: 60 });
    expect(resolvePeriods(5, 6)).toEqual({ h: 11, mi: 10, durationMinutes: 90 });
    expect(resolvePeriods(15)).toBeNull();
    expect(resolvePeriods(14, 15)).toBeNull();
  });
  it("is null for a period outside the table", () => {
    expect(resolvePeriods(99)).toBeNull();
  });
});

describe("spoken", () => {
  it("parses folded spoken numbers", () => {
    expect(parseSpokenNumber("hai muoi lam")).toBe(25);
    expect(parseSpokenNumber("chin")).toBe(9);
    expect(parseSpokenNumber("xyz")).toBeUndefined();
  });
  it("edits a spoken clock to digits, offsets in the raw text", () => {
    const raw = "họp chín giờ ba mươi";
    const edits = spokenEdits(raw);
    expect(edits.map((e) => e.text)).toEqual(["9", "30"]);
    for (const e of edits) expect(raw.slice(e.start, e.end).length).toBe(e.end - e.start);
  });
});

describe("table", () => {
  it("turns a pasted grid with a header into one sentence per row", () => {
    const edits = gridEdits("Thứ\tTiết\tMôn\n2\t1-3\tToán\n3\t4-6\tLý");
    expect(edits).toHaveLength(1);
    expect(edits[0].text).toBe("Toán ngày 2 tiết 1-3.\nLý ngày 3 tiết 4-6.");
  });
  it("leaves a plain line alone", () => expect(gridEdits("mua sữa")).toEqual([]));
  it("tells schedule text from a sentence", () => {
    expect(isScheduleText("7h-9h Toán\n9h-11h Lý")).toBe(true);
    expect(isScheduleText("mua sữa")).toBe(false);
  });
  it("ocrSchedule is undefined with fewer than two clocks", () =>
    expect(ocrSchedule("Toán 7h", { y: 2026, m: 11, d: 14 })).toBeUndefined());
});

describe("assemble helpers", () => {
  it("fallbackTask keeps the text as the title", () => expect(fallbackTask("làm gì đó").title).toBe("Làm gì đó"));
  it("recognises boilerplate titles", () => {
    expect(isBoilerplateTitle("Kính gửi các em")).toBe(true);
    expect(isBoilerplateTitle("họp nhóm")).toBe(false);
  });
  it("blanks parentheses and hashes deterministically", () => {
    expect(blankParens("a (b) c")).toHaveLength(7);
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});
