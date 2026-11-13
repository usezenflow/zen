import { describe, expect, it } from "vitest";
import type { ReaderWC } from "../shared";
import { affinityOf, examPreps, type Requirements } from "./assemble";

type ExamWindow = Parameters<typeof examPreps>[0];

const ref: ReaderWC = { y: 2026, m: 11, d: 5, h: 9, mi: 0 };
const exam: ExamWindow = {
  title: "Giải tích 2",
  at: "2026-11-20 09:00",
  day: { y: 2026, m: 11, d: 20, h: 0, mi: 0 },
  evidence: "thi giải tích 2",
};
const req: Requirements = {
  art: { report: true, slides: false, defense: false },
  dues: [],
  window: false,
};
const minutes = (affinity?: Map<string, number>) =>
  examPreps(exam, ref, req, affinity)[0].durationMinutes;

describe("affinityOf", () => {
  const map = new Map([
    ["giai tich", 1.2],
    ["giai tich 2", 1.5],
  ]);

  it("reads 1 without a map or a known course", () => {
    expect(affinityOf(undefined, "giải tích 2")).toBe(1);
    expect(affinityOf(map, "cơ sở dữ liệu")).toBe(1);
  });

  it("takes the longest course the text names", () => {
    expect(affinityOf(map, "Viết báo cáo: Giải tích 2")).toBe(1.5);
    expect(affinityOf(map, "Giải tích 1")).toBe(1.2);
  });

  it("matches whole words only", () => {
    expect(affinityOf(new Map([["toan", 1.4]]), "toan rời rạc")).toBe(1.4);
    expect(affinityOf(new Map([["toan", 1.4]]), "toannn")).toBe(1);
  });
});

describe("exam prep length by course affinity", () => {
  it("is longer for a course with a high multiplier", () => {
    const plain = minutes();
    const retake = minutes(new Map([["giai tich 2", 1.5]]));
    expect(retake).toBeGreaterThan(plain ?? 0);
  });

  it("stays at the default for another course", () => {
    expect(minutes(new Map([["cau truc du lieu", 1.5]]))).toBe(minutes());
  });
});
