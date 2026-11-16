import { describe, expect, it } from "vitest";
import type { ReaderWC } from "../shared";
import { read } from "./reader";

const ref: ReaderWC = { y: 2026, m: 11, d: 16, h: 10, mi: 0 };

const WORDS = [
  "tree", "b-tree", "lsm", "os", "api", "sql", "git", "pr", "free", "see", "feed", "need", "keep", "sleep", "coffee",
  "book", "cms", "ios", "macos", "redis", "kafka", "docker", "node", "react", "vue", "css", "html", "jwt", "oauth", "csv",
];
const TEMPLATES = ["code {w} và test", "đọc tài liệu {w} mai", "học {w} tối nay"];

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleOf(text: string): string {
  return read(text, { ref, source: "typed" }).items[0]?.title ?? "";
}

describe("English words on a line with Vietnamese marks stay as typed", () => {
  for (const w of WORDS)
    for (const t of TEMPLATES) {
      const said = t.replace("{w}", w);
      it(`keeps "${w}" in "${said}"`, () => {
        const title = titleOf(said);
        const word = new RegExp(`(^|[^\\p{L}\\d])${escape(w)}(?=$|[^\\p{L}\\d])`, "iu");
        expect(title).toMatch(word);
      });
    }
});

describe("real Telex still decodes", () => {
  it("decodes a typed line", () => {
    expect(titleOf("hocj baif mai").toLowerCase()).toContain("học bài");
  });

  it("decodes a typed line with a đ and a tone", () => {
    expect(titleOf("ddi chowj").toLowerCase()).toContain("đi chợ");
  });

  it("reads a typed English term back", () => {
    expect(titleOf("làm ưeb mai").toLowerCase()).toContain("làm web");
    expect(titleOf("họp mêting mai").toLowerCase()).toContain("họp meeting");
  });

  it("decodes a typed tone on an accented line", () => {
    expect(titleOf("đọc sách hocj mai").toLowerCase()).toContain("đọc sách học");
  });
});
