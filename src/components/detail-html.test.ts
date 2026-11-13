import { describe, expect, it } from "vitest";
import { parseHtml, repeatText } from "./detail-html";

describe("parseHtml", () => {
  it("nests tags, decodes entities, keeps hrefs, tolerates junk", () => {
    const n = parseHtml('<p>a &amp; <strong>b</strong><br>c</p><ul><li>x</li></ul><script>no</script><a href="https://e.co">l</a></b>');
    expect(n).toEqual([
      { tag: "p", href: undefined, kids: ["a & ",{ tag: "strong", href: undefined, kids: ["b"] }, "\n", "c"] },
      { tag: "ul", href: undefined, kids: [{ tag: "li", href: undefined, kids: ["x"] }] },
      { tag: "a", href: "https://e.co", kids: ["l"] },
    ]);
  });
  it("closes unclosed tags on a parent close", () => {
    expect(parseHtml("<div><p>a</div>b")).toEqual([{ tag: "div", href: undefined, kids: [{ tag: "p", href: undefined, kids: ["a"] }] }, "b"]);
  });
});

describe("repeatText", () => {
  it("names the day", () => {
    expect(repeatText("FREQ=DAILY", 0)).toBe("Mỗi ngày");
    expect(repeatText("FREQ=WEEKLY;BYDAY=TU", 0)).toBe("Mỗi T3");
    expect(repeatText("FREQ=WEEKLY", Date.UTC(2026, 10, 18))).toBe("Mỗi T4");
  });
});
