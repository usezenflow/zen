import { describe, expect, it } from "vitest";
import { DEFAULT_AREAS, addWord, areaOf, areaShare, foldWord, ownerOf, underServed, weekCount, type Area } from "./area";
import type { Task } from "./types";

const MIN = 60_000;
const now = new Date(2026, 10, 25, 12, 0).getTime();
const T = (over: Partial<Task>): Task => ({ id: "x", title: "Việc", kind: "study", source: "user", effort: 60, createdAt: 0, ...over });
// A task worked and ticked `ago` minutes before now, lasting an hour.
const worked = (id: string, title: string, kind: Task["kind"], ago: number): Task => {
  const doneAt = now - ago * MIN;
  return T({ id, title, kind, start: doneAt - 60 * MIN, end: doneAt, doneAt });
};

describe("areaOf", () => {
  it("matches a folded keyword in the title", () => {
    expect(areaOf(T({ title: "Ôn thi giữa kỳ", kind: "self" }), DEFAULT_AREAS)?.id).toBe("study");
  });

  it("matches a keyword in the course too", () => {
    expect(areaOf(T({ title: "Nộp file", course: "Báo cáo tài chính", kind: "self" }), DEFAULT_AREAS)?.id).toBe("work");
  });

  it("falls back to the task kind when no keyword matches", () => {
    expect(areaOf(T({ title: "Abc", kind: "exercise" }), DEFAULT_AREAS)?.id).toBe("health");
    expect(areaOf(T({ title: "Abc", kind: "finance" }), DEFAULT_AREAS)?.id).toBe("work");
  });

  it("is undefined when neither keyword nor kind maps", () => {
    expect(areaOf(T({ title: "Abc", kind: "errand" }), [DEFAULT_AREAS[0]])).toBeUndefined();
  });
});

describe("areaShare and underServed", () => {
  it("shares sum to 1 over the worked areas", () => {
    const tasks = [worked("a", "Ôn thi", "study", 60), worked("b", "Chạy bộ", "exercise", 120)];
    const share = areaShare(tasks, DEFAULT_AREAS, now);
    expect(share.study).toBeCloseTo(0.5);
    expect(share.health).toBeCloseTo(0.5);
  });

  it("ranks the neglected area highest", () => {
    const tasks = [
      worked("1", "Ôn thi", "study", 60), worked("2", "Ôn thi", "study", 180), worked("3", "Ôn thi", "study", 300),
      worked("4", "Báo cáo", "work", 400), worked("5", "Báo cáo", "work", 500),
      worked("6", "Gặp bạn", "social", 600), worked("7", "Giặt đồ", "chores", 700), worked("8", "Đọc sách", "self", 800),
    ];
    const d = underServed(tasks, DEFAULT_AREAS, now);
    expect(d.health).toBe(1);
    for (const id of ["study", "work", "people", "home", "self"]) expect(d.health).toBeGreaterThan(d[id]);
    for (const v of Object.values(d)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });

  it("is all zero with no worked time", () => {
    expect(Object.values(underServed([], DEFAULT_AREAS, now)).every((v) => v === 0)).toBe(true);
  });
});

describe("keyword normalisation and dedupe", () => {
  it("folds diacritics, case and spacing for comparison", () => {
    expect(foldWord("  Ôn   THI ")).toBe("on thi");
    expect(foldWord("Đọc sách")).toBe("doc sach");
  });

  it("stores the trimmed, space-collapsed word", () => {
    expect(addWord([], "  chạy   bộ ")).toEqual(["chạy bộ"]);
  });

  it("refuses a word shorter than 2 characters", () => {
    expect(addWord([], " a ")).toBeNull();
    expect(addWord([], "   ")).toBeNull();
  });

  it("dedupes within an area by folded form", () => {
    expect(addWord(["ôn thi"], "ON THI")).toBeNull();
    expect(addWord(["ôn thi"], "on  thi")).toBeNull();
  });

  it("refuses the 21st word", () => {
    const full = Array.from({ length: 20 }, (_, i) => `từ ${i}`);
    expect(addWord(full, "thêm")).toBeNull();
    expect(addWord(full.slice(1), "thêm")).toHaveLength(20);
  });
});

describe("cross-area keyword conflict", () => {
  const areas: Area[] = [
    { id: "health", name: "Sức khoẻ", kinds: ["exercise"], words: ["gym"] },
    { id: "study", name: "Học tập", kinds: ["study"], words: ["bài tập"] },
  ];

  it("names the other area that owns a word", () => {
    expect(ownerOf("GYM", areas, "study")?.id).toBe("health");
  });

  it("does not flag a word against its own area", () => {
    expect(ownerOf("gym", areas, "health")).toBeUndefined();
  });

  it("is undefined for a word nobody owns", () => {
    expect(ownerOf("sách", areas, "study")).toBeUndefined();
  });

  it("the longest match wins when both areas hold a matching word", () => {
    const both: Area[] = [
      { id: "a", name: "A", kinds: [], words: ["lab"] },
      { id: "b", name: "B", kinds: [], words: ["lab report"] },
    ];
    expect(areaOf({ id: "x", title: "Lab report", kind: "self", source: "user", effort: 60, createdAt: 0 }, both)?.id).toBe("b");
  });
});

describe("weekCount", () => {
  it("counts tasks done in the last 7 days per matching area", () => {
    const day = 24 * 60 * 60_000;
    const base = { source: "user" as const, effort: 60, createdAt: 0, kind: "self" as const };
    const tasks = [
      { ...base, id: "1", title: "Gym sáng", doneAt: now - 1 * day },
      { ...base, id: "2", title: "Gym tối", doneAt: now - 2 * day },
      { ...base, id: "3", title: "Gym cũ", doneAt: now - 30 * day },
      { ...base, id: "4", title: "Ôn thi", doneAt: now - 3 * day },
    ];
    expect(weekCount(tasks, DEFAULT_AREAS, now)).toEqual({ health: 2, study: 1 });
  });
});
