// Order between tasks: connector phrases cut a clause into a time-ordered chain; false positives stay whole.
import { describe, expect, it } from "vitest";
import type { ReaderItem } from "../shared";
import type { Clause } from "./segment";
import { joinConnectors, linkOrder, ORDINAL, splitOrdered } from "./order";
import { read } from "./reader";

const clause = (text: string): Clause => ({ text, start: 0, hint: false });
const parts = (text: string) =>
  splitOrdered(clause(text)).parts.map((p) => p.text);
const REF = { y: 2026, m: 11, d: 5, h: 9, mi: 0 };
const item = (title: string): ReaderItem => ({
  type: "PLAN",
  title,
  confidence: 1,
  inferred: [],
  flags: [],
  alternatives: [],
  evidence: "",
  checked: false,
});

describe("order: forward connectors", () => {
  it("cuts at then, roi and xong roi", () => {
    expect(parts("study then write essay")).toEqual(["study", "write essay"]);
    expect(parts("hoc toan roi lam bai tap")).toEqual([
      "hoc toan",
      "lam bai tap",
    ]);
    expect(parts("hoc xong roi lam bai")).toEqual(["hoc", "lam bai"]);
    expect(parts("A->B").length).toBe(1);
    expect(parts("study -> write essay")).toEqual(["study", "write essay"]);
  });

  it("cuts at before and after that", () => {
    expect(parts("study before write essay")).toEqual(["study", "write essay"]);
    expect(parts("study after that write essay")).toEqual([
      "study",
      "write essay",
    ]);
  });

  it("makes a list one chain in written order", () => {
    expect(parts("study then write and clean")).toEqual([
      "study",
      "write",
      "clean",
    ]);
  });
});

describe("order: backward connectors and prefixes", () => {
  it("puts the second clause first in time", () => {
    expect(parts("write essay but first study")).toEqual([
      "study",
      "write essay",
    ]);
    expect(parts("write essay after study")).toEqual(["study", "write essay"]);
    expect(parts("hoc toan sau khi lam bai")).toEqual(["lam bai", "hoc toan"]);
    expect(parts("nop bai nhung truoc do hoc toan")).toEqual([
      "hoc toan",
      "nop bai",
    ]);
  });

  it("reads after A, B as A then B", () => {
    expect(parts("after study, write essay")).toEqual(["study", "write essay"]);
    expect(parts("sau khi hoc, lam bai")).toEqual(["hoc", "lam bai"]);
  });

  it("reads after A and B, C as one chain", () => {
    expect(parts("after study and write, do exercise")).toEqual([
      "study",
      "write",
      "do exercise",
    ]);
  });

  it("reads before X and Y, A as A then X then Y", () => {
    expect(parts("before clean and cook, study")).toEqual([
      "study",
      "clean",
      "cook",
    ]);
  });
});

describe("order: not an edge", () => {
  it("keeps a deadline or a clock on the other side", () => {
    expect(parts("nop bai truoc thu 6")).toHaveLength(1);
    expect(parts("after 3pm, call mom")).toHaveLength(1);
    expect(parts("before friday, submit report")).toHaveLength(1);
  });

  it("keeps a fixed item on the other side", () => {
    expect(parts("study after class")).toHaveLength(1);
    expect(parts("after exam, study")).toHaveLength(1);
  });

  it("keeps a connector with no task after it", () => {
    expect(parts("lam roi")).toHaveLength(1);
    expect(parts("ok then")).toHaveLength(1);
    expect(parts("toan roi rac")).toHaveLength(1);
  });

  it("drops the edge when both sides have their own clock", () => {
    expect(parts("hoc toan 9h roi lam bai 10h")).toHaveLength(1);
    expect(parts("hoc toan 9h roi lam bai")).toHaveLength(2);
  });

  it("keeps a list of non-tasks whole", () => {
    expect(parts("then study math and physics")).toHaveLength(1);
  });
});

describe("linkOrder", () => {
  it("links a chain and gives each item one predecessor", () => {
    const [a, b, c] = [item("a"), item("b"), item("c")];
    const items = [a, b, c];
    linkOrder(items, [
      [a, b],
      [b, c],
    ]);
    expect([a.ref, b.ref, c.ref]).toEqual(["i0", "i1", "i2"]);
    expect([a.after, b.after, c.after]).toEqual([undefined, "i0", "i1"]);
  });

  it("drops a link that closes a cycle, the later one wins", () => {
    const [a, b] = [item("a"), item("b")];
    const items = [a, b];
    linkOrder(items, [
      [a, b],
      [b, a],
    ]);
    expect(a.after).toBe("i1");
    expect(b.after).toBeUndefined();
  });

  it("ignores a link to an item not in the result", () => {
    const [a, b] = [item("a"), item("b")];
    const items = [a];
    linkOrder(items, [[a, b]]);
    expect(a.ref).toBeUndefined();
    expect(a.after).toBeUndefined();
  });
});

describe("read: ordered items", () => {
  it("links two tasks with a then in the message", () => {
    const res = read("học toán rồi làm bài tập", { ref: REF, source: "typed" });
    expect(res.items).toHaveLength(2);
    const [first, second] = res.items.map((it) => it.title);
    const pre = res.items.find((it) => it.title.includes(first));
    const post = res.items.find((it) => it.title.includes(second));
    expect(pre?.ref).toBeDefined();
    expect(post?.after).toBe(pre?.ref);
  });

  it("leaves a plain task unlinked", () => {
    const res = read("hoc toan 30 phut", { ref: REF, source: "typed" });
    expect(
      res.items.every((it) => it.ref === undefined && it.after === undefined),
    ).toBe(true);
  });
});

describe("order: messy speech", () => {
  it("cuts a comma after a connector: the comma is a voice pause", () => {
    expect(parts("hoc toan roi, lam bai tap")).toEqual([
      "hoc toan",
      "lam bai tap",
    ]);
  });

  it("joins a clause that ends with a connector to the next clause", () => {
    const joined = joinConnectors([
      clause("học toán rồi"),
      clause("làm bài tập"),
    ]);
    expect(joined.map((c) => c.text)).toEqual(["học toán rồi làm bài tập"]);
  });

  it("keeps two clauses apart when joining them makes no chain", () => {
    const joined = joinConnectors([
      clause("gửi email rồi"),
      clause("nghe nhạc"),
    ]);
    expect(joined.map((c) => c.text)).toEqual(["gửi email rồi", "nghe nhạc"]);
  });

  it("keeps only the order after a correction cue", () => {
    expect(
      parts("hoc toan roi lam bai tap a khong lam bai tap roi hoc toan"),
    ).toEqual(["lam bai tap", "hoc toan"]);
  });
});

describe("order: markers across clauses", () => {
  // each item's title and the title of the item it follows
  const chain = (text: string) => {
    const items = read(text, { ref: REF, source: "typed" }).items;
    const byRef = new Map(items.map((it) => [it.ref, it.title]));
    return items.map((it) => [it.title, it.after ? byRef.get(it.after) : undefined]);
  };
  it("links a numbered list one line after the other, in written order", () => {
    const out = chain("1. học toán\n2. làm bài tập\n3. nộp bài");
    expect(out.find(([t]) => t === "Làm bài tập")?.[1]).toBe("Học toán");
    expect(out.find(([t]) => t === "Nộp bài")?.[1]).toBe("Làm bài tập");
  });
  it("links a clause that opens with then to the one before, Vietnamese and English mixed", () => {
    expect(chain("học toán, then làm bài tập")).toEqual([
      ["Học toán", undefined],
      ["Làm bài tập", "Học toán"],
    ]);
  });
  it("links đầu tiên … sau đó across a line break", () => {
    expect(chain("đầu tiên học toán\nsau đó làm bài tập")[1]).toEqual(["Làm bài tập", "Học toán"]);
  });
  it("keeps a weekday after a comma a date, not an order", () => {
    expect(chain("học toán, thứ hai làm bài tập").every(([, a]) => a === undefined)).toBe(true);
  });
  it("matches the marker regex at the start of a folded clause only", () => {
    expect(ORDINAL.test("then go")).toBe(true);
    expect(ORDINAL.test("dau tien hoc")).toBe(true);
    expect(ORDINAL.test("2. go")).toBe(true);
    expect(ORDINAL.test("go then")).toBe(false);
    expect(ORDINAL.test("thenceforth go")).toBe(false);
  });
});
