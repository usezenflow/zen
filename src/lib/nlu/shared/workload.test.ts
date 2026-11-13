import { describe, expect, it } from "vitest";
import {
  classifyWorkload,
  detectArtifacts,
  WORKLOAD_CONFIGS,
} from "./workload";

describe("detectArtifacts", () => {
  it("flags a report, slides and a defense from accent-free or accented text", () => {
    expect(detectArtifacts("Viết báo cáo Word và slide")).toEqual({
      report: true,
      slides: true,
      defense: false,
    });
    expect(detectArtifacts("bao cao word, slides")).toEqual({
      report: true,
      slides: true,
      defense: false,
    });
    expect(detectArtifacts("Trả lời câu hỏi vấn đáp, demo sản phẩm")).toEqual({
      report: false,
      slides: false,
      defense: true,
    });
  });

  it("matches whole words only", () => {
    expect(detectArtifacts("keyword deckchair")).toEqual({
      report: false,
      slides: false,
      defense: false,
    });
  });
});

describe("classifyWorkload", () => {
  it("classifies typical titles", () => {
    expect(classifyWorkload("Nộp lab tuần 3")).toBe("LAB");
    expect(classifyWorkload("Viết bài thu hoạch tiểu luận Triết")).toBe(
      "ESSAY",
    );
    expect(classifyWorkload("Thi cuối kỳ Kiến trúc máy tính")).toBe(
      "FINAL_EXAM",
    );
    expect(classifyWorkload("Bảo vệ khóa luận tốt nghiệp CNTT")).toBe("THESIS");
    expect(classifyWorkload("Nộp báo cáo")).toBe("REPORT");
  });
});

describe("WORKLOAD_CONFIGS", () => {
  it("keeps lead days ordered and gives slides their own row", () => {
    for (const c of Object.values(WORKLOAD_CONFIGS)) {
      expect(c.leadDaysMin).toBeLessThanOrEqual(c.leadDaysMax);
    }
    expect(WORKLOAD_CONFIGS.SLIDES).toMatchObject({
      baseMinutes: 90,
      defaultSittings: 1,
      leadDaysMin: 3,
      leadDaysMax: 5,
    });
    expect(WORKLOAD_CONFIGS.REPORT).toMatchObject({
      baseMinutes: 270,
      defaultSittings: 3,
    });
  });
});
