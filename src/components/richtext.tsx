import { Linking, StyleSheet, Text, View, type TextStyle } from "react-native";
import { font, ff } from "@/lib/theme";
import { parseHtml, type Node } from "@/components/detail-html";

const BLOCK = new Set(["p", "div", "ul", "ol", "li", "blockquote"]);
const isBlock = (n: Node) => typeof n !== "string" && BLOCK.has(n.tag);

function Inline({ nodes, color, link }: { nodes: Node[]; color: string; link: string }) {
  return nodes.map((n, i) => {
    if (typeof n === "string") return n;
    const st: TextStyle | undefined =
      n.tag === "strong" || n.tag === "b" ? { fontFamily: ff("600") } :
      n.tag === "em" || n.tag === "i" ? { fontStyle: "italic" } :
      n.tag === "u" ? { textDecorationLine: "underline" } :
      n.tag === "s" || n.tag === "del" ? { textDecorationLine: "line-through" } :
      n.tag === "a" ? { color: link, textDecorationLine: "underline" } : undefined;
    // only web links open; anything else (javascript:, file:) stays plain text
    const go = n.tag === "a" && n.href && /^https?:\/\//i.test(n.href) ? () => Linking.openURL(n.href!) : undefined;
    return <Text key={i} style={st} onPress={go}><Inline nodes={n.kids} color={color} link={link} /></Text>;
  });
}

function Blocks({ nodes, color, line, link, ordered }: { nodes: Node[]; color: string; line: string; link: string; ordered?: boolean }) {
  const out: React.ReactNode[] = [];
  let run: Node[] = [], n = 0;
  const flush = () => {
    if (run.some((x) => typeof x !== "string" || x.trim())) out.push(<Text key={out.length} style={[s.t, { color }]}><Inline nodes={run} color={color} link={link} /></Text>);
    run = [];
  };
  for (const x of nodes) {
    if (!isBlock(x)) { run.push(x); continue; }
    flush();
    const b = x as Exclude<Node, string>;
    const kids = <Blocks nodes={b.kids} color={color} line={line} link={link} />;
    if (b.tag === "ul" || b.tag === "ol") out.push(<View key={out.length} style={s.gap}><Blocks nodes={b.kids} color={color} line={line} link={link} ordered={b.tag === "ol"} /></View>);
    else if (b.tag === "li") out.push(
      <View key={out.length} style={s.li}><Text style={[s.t, { color }]}>{ordered ? `${++n}.` : "•"}</Text><View style={{ flex: 1 }}>{kids}</View></View>);
    else if (b.tag === "blockquote") out.push(<View key={out.length} style={[s.gap, s.q, { borderLeftColor: line }]}>{kids}</View>);
    else out.push(<View key={out.length} style={s.gap}>{kids}</View>);
  }
  flush();
  return out;
}

/** Sanitized LMS HTML as native text: no WebView. */
export function RichText({ html, color, line, link }: { html: string; color: string; line: string; link: string }) {
  return <Blocks nodes={parseHtml(html)} color={color} line={line} link={link} />;
}

const s = StyleSheet.create({
  t: { fontFamily: ff(), fontSize: font.meta, lineHeight: 24 },
  gap: { marginBottom: 6 },
  li: { flexDirection: "row", gap: 6 },
  q: { borderLeftWidth: 2, paddingLeft: 10 },
});
