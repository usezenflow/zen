import { describe, expect, it } from "vitest";
import { decodeTyped, repair } from "./repair";
import { isSyllable } from "./syllables";

describe("S0 step 5, spaced digits", () => {
  it("joins a spaced date", () => {
    expect(repair("Nộp trước 1 5 / 1 1 / 2 0 2 6 nhé", "paste").text).toContain(
      "15/11/2026",
    );
  });

  it("leaves a short run of digits alone", () => {
    expect(repair("lab 3 và 4", "typed").text).toBe("lab 3 và 4");
  });
});

describe("S0 step 6, kerning", () => {
  it("joins split syllables on a line with three or more", () => {
    expect(repair("Nộ p bài t ập báo c áo", "paste").text).toBe(
      "Nộp bài tập báo cáo",
    );
  });

  it("leaves typed split letters alone", () => {
    expect(repair("Nộ p bài t ập báo c áo", "typed").text).toBe(
      "Nộ p bài t ập báo c áo",
    );
  });

  it("leaves a line with fewer than three valid joins", () => {
    expect(repair("Nộ p ngày mai", "paste").text).toBe("Nộ p ngày mai");
  });
});

describe("S0 step 8, telex and VNI", () => {
  it("decodes a telex tone key", () => {
    expect(decodeTyped("thuws")).toBe("thứ");
    expect(decodeTyped("noopj")).toBe("nộp");
  });

  it("decodes VNI marks and tone digits", () => {
    expect(decodeTyped("ho5c")).toBe("học");
    expect(decodeTyped("tie6ng1")).toBe("tiếng");
  });

  it("decodes the typed words in a Vietnamese line", () => {
    expect(repair("Hạn nộp thuws bài", "typed").text).toBe("Hạn nộp thứ bài");
    expect(repair("Hạn nộp ho5c tie6ng1", "typed").text).toBe(
      "Hạn nộp học tiếng",
    );
  });

  it("keeps the raw origin of a decoded word", () => {
    const raw = "Hạn nộp thuws";
    const r = repair(raw, "typed");
    expect(
      raw.slice(r.map[r.text.indexOf("thứ")], r.map[r.text.indexOf("thứ")] + 5),
    ).toBe("thuws");
  });

  it("does not touch a word that is already a syllable", () => {
    expect(repair("Hạn nộp hoc", "typed").text).toBe("Hạn nộp hoc");
  });
});

describe("isSyllable", () => {
  it.each(["nop", "thu", "ngay", "nghi", "hoa", "bai", "tap"])(
    "accepts %s",
    (w) => {
      expect(isSyllable(w)).toBe(true);
    },
  );

  it.each(["ho5c", "thuws", "xyz", "nnn"])("rejects %s", (w) => {
    expect(isSyllable(w)).toBe(false);
  });
});
