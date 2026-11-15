import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking, StyleSheet } from "react-native";
import { RichText } from "./richtext";

type J = { type: string; props: Record<string, any>; children: unknown[] | null };
const nodes = (j: unknown): J[] => (!j || typeof j === "string" ? [] : Array.isArray(j) ? j.flatMap(nodes) : [j as J, ...nodes((j as J).children)]);
const C = { color: "#111111", line: "#cccccc", link: "#0000ff" };
const show = (html: string) => render(<RichText html={html} {...C} />);
const style = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style) ?? {};
const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
beforeEach(() => open.mockClear());

it("styles each inline tag", async () => {
  await show("<p><strong>b</strong><b>bb</b><em>i</em><i>ii</i><u>u</u><s>s</s><del>d</del><span>plain</span></p>");
  expect(style("b").fontFamily).toBe(style("bb").fontFamily);
  expect(style("b").fontFamily).not.toBe(style("plain").fontFamily);
  expect([style("i").fontStyle, style("ii").fontStyle]).toEqual(["italic", "italic"]);
  expect(style("u").textDecorationLine).toBe("underline");
  expect([style("s").textDecorationLine, style("d").textDecorationLine]).toEqual(["line-through", "line-through"]);
  expect(style("plain").fontStyle).toBeUndefined(); // an unknown tag is plain
});

it("numbers ol items, bullets ul items, and restarts numbering in a nested list", async () => {
  await show("<ol><li>một</li><li>hai<ol><li>a</li></ol></li></ol><ul><li>x</li></ul>");
  const marks = nodes(screen.toJSON()).filter((n) => n.type === "Text").map((n) => (n.children ?? []).join("")).filter((x) => /^(\d+\.|•)$/.test(x));
  expect(marks).toEqual(["1.", "2.", "1.", "•"]);
});

it("a blockquote gets the line colour on its left edge", async () => {
  await show("<blockquote>trích</blockquote>");
  const q = nodes(screen.toJSON()).find((n) => StyleSheet.flatten(n.props.style)?.borderLeftColor === C.line);
  expect(q).toBeDefined();
});

it("opens a web link in the link colour", async () => {
  await show('<p>Xem <a href="https://lms.dlu.edu.vn/mod/assign/view.php?id=1">đề bài</a></p>');
  expect(style("đề bài")).toMatchObject({ color: C.link, textDecorationLine: "underline" });
  await fireEvent.press(screen.getByText("đề bài"));
  expect(open).toHaveBeenCalledWith("https://lms.dlu.edu.vn/mod/assign/view.php?id=1");
});

it.each([["javascript:alert(1)"], ["file:///etc/passwd"], ["/mod/x.php"], [""]])("does not open href %j", async (href) => {
  await show(href ? `<a href="${href}">l</a>` : "<a>l</a>");
  expect(screen.getByText("l").props.onPress).toBeUndefined();
  await fireEvent.press(screen.getByText("l"));
  expect(open).not.toHaveBeenCalled();
});

it("empty html renders nothing, and whitespace between blocks makes no blank line", async () => {
  await show("");
  expect(screen.toJSON()).toBeNull();
  await show("<p>a</p>\n   \n<p>b</p>");
  const texts = nodes(screen.toJSON()).filter((n) => n.type === "Text").map((n) => (n.children ?? []).join(""));
  expect(texts).toEqual(["a", "b"]);
});

it("decodes entities and keeps Vietnamese marks", async () => {
  await show("<p>Nộp &amp; trình bày &#273;&#7891; án&nbsp;cuối kỳ</p>");
  expect(screen.getByText("Nộp & trình bày đồ án cuối kỳ")).toBeOnTheScreen();
});
