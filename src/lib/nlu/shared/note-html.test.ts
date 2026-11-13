import { describe, expect, it } from "vitest";
import { NOTE_TAGS, sanitizeNoteHtml } from "./note-html";

describe("sanitizeNoteHtml", () => {
  it("keeps every tag of the editor's set and its attributes", () => {
    const html =
      '<p>Read <strong>ch 4</strong> <em>now</em> <u>x</u> <s>z</s> <mark>y</mark></p>' +
      '<blockquote><p>Q</p></blockquote><ol><li><p>a</p></li></ol>' +
      '<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Print</p></div></li></ul>' +
      '<p><a href="https://example.com/a?b=1&amp;c=2">link</a><br></p>';
    expect(sanitizeNoteHtml(html)).toBe(html);
  });

  it("keeps the allowlist's keys as the tags the prompt may use", () => {
    expect(Object.keys(NOTE_TAGS)).toEqual(
      expect.arrayContaining(["p", "strong", "em", "u", "s", "mark", "blockquote", "ul", "ol", "li", "a", "br"]),
    );
  });

  it("drops script and style with their content", () => {
    expect(sanitizeNoteHtml("<p>Hi</p><script>alert(1)</script><style>p{}</style>")).toBe("<p>Hi</p>");
    expect(sanitizeNoteHtml("<p>Hi</p><script>alert(1)")).toBe("<p>Hi</p>");
  });

  it("drops unknown tags and keeps their text", () => {
    expect(sanitizeNoteHtml("<h1>Title</h1><table><tr><td>x</td></tr></table>")).toBe("Titlex");
    expect(sanitizeNoteHtml("<iframe src='https://x'></iframe><p>ok</p>")).toBe("<p>ok</p>");
  });

  it("drops event handlers and attributes outside the list", () => {
    expect(sanitizeNoteHtml('<p onclick="x()" style="color:red">Hi</p>')).toBe("<p>Hi</p>");
    expect(sanitizeNoteHtml('<a href="https://x/a" onclick="x()">a</a>')).toBe('<a href="https://x/a">a</a>');
  });

  it("drops links that are not http(s) and media tags", () => {
    expect(sanitizeNoteHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeNoteHtml('<a href="java&#115;cript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeNoteHtml('<a href="data:text/html,hi">x</a>')).toBe("<a>x</a>");
    expect(sanitizeNoteHtml('<a href="/api/v1/files/abc?sig=1">x</a>')).toBe("<a>x</a>");
    expect(sanitizeNoteHtml('<img src="https://x/a.png" alt="a"><video src="https://x/a.mp4" controls></video>')).toBe("");
  });

  it("drops an input that is not a checkbox and a task list of another type", () => {
    expect(sanitizeNoteHtml('<input type="text">')).toBe("");
    expect(sanitizeNoteHtml('<ul data-type="other"><li>x</li></ul>')).toBe("<ul><li>x</li></ul>");
  });

  it("escapes stray angle brackets and does not treat unknown names as inherited keys", () => {
    expect(sanitizeNoteHtml("<p>a < b &amp; c</p>")).toBe("<p>a &lt; b &amp; c</p>");
    expect(sanitizeNoteHtml("<constructor>x</constructor>")).toBe("x");
  });

  it("renders a plain note with no tag as one paragraph per line", () => {
    expect(sanitizeNoteHtml("Bring pen\n\nRoom 3 < 4 & 5")).toBe("<p>Bring pen</p><p>Room 3 &lt; 4 &amp; 5</p>");
  });

  it("is empty for an empty note and idempotent", () => {
    expect(sanitizeNoteHtml("  \n ")).toBe("");
    expect(sanitizeNoteHtml(null)).toBe("");
    const once = sanitizeNoteHtml('<p onclick="x">a <b>b</b></p><ul data-type="taskList"><li data-checked="false"><div><p>c</p></div></li></ul>');
    expect(sanitizeNoteHtml(once)).toBe(once);
  });
});
