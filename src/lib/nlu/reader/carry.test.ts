import { describe, expect, it } from "vitest";
import type { ReaderWC } from "../shared";
import { fold } from "./fold";
import { read } from "./reader";

const ref: ReaderWC = { y: 2026, m: 11, d: 12, h: 10, mi: 41 };

describe("leading day carries to later clauses", () => {
  it("gives the later clause on the same line the day of 'mai'", () => {
    const res = read("mai test feature mới 1.5h, đọc code zf 2 tiếng", {
      ref,
      source: "typed",
    });
    expect(res.items).toHaveLength(2);
    for (const it of res.items)
      expect(it.deadline?.startsWith("2026-11-13")).toBe(true);
  });

  it("does not carry the day across a newline", () => {
    // a full stop keeps the two lines as two clauses; without it repair joins them into one
    const res = read("mai test feature.\nđọc code zf", {
      ref,
      source: "typed",
    });
    const second = res.items.find((it) =>
      fold(it.title).text.includes("doc code zf"),
    );
    expect(second).toBeDefined();
    // the implied due of its class is inferred; the day of 'mai' is not carried to it
    expect(second?.deadline === undefined || second.inferred.includes("deadline")).toBe(true);
    expect(second?.deadline?.startsWith("2026-11-13")).toBe(false);
    expect(second?.notBefore?.startsWith("2026-11-12")).toBe(true);
  });
});
