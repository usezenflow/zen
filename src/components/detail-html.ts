// Tiny parser for the sanitized LMS HTML (p, br, strong, em, u, s, ul, ol, li, a[href], blockquote, span, div).
export type Node = string | { tag: string; href?: string; kids: Node[] };

const VOID = new Set(["br", "hr", "img"]);
const DROP = new Set(["script", "style"]);
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));

export function parseHtml(html: string): Node[] {
  const root: Node[] = [];
  const stack: { tag: string; href?: string; kids: Node[] }[] = [];
  const out = () => (stack.length ? stack[stack.length - 1].kids : root);
  let skip = 0;
  for (const m of html.matchAll(/<(\/?)([a-z][a-z\d]*)([^>]*)>|([^<]+|<)/gi)) {
    if (m[4] !== undefined) { if (!skip) out().push(decode(m[4])); continue; }
    const tag = m[2].toLowerCase();
    if (DROP.has(tag)) { skip += m[1] ? -1 : 1; skip = Math.max(0, skip); continue; }
    if (skip) continue;
    if (VOID.has(tag)) { if (tag === "br") out().push("\n"); continue; }
    if (!m[1]) {
      const href = m[3].match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const el = { tag, href: href ? decode(href[1] ?? href[2]) : undefined, kids: [] as Node[] };
      out().push(el); stack.push(el);
    } else {
      const i = stack.map((x) => x.tag).lastIndexOf(tag);
      if (i >= 0) stack.length = i; // a stray close tag is ignored
    }
  }
  return root;
}

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const BY: Record<string, string> = { MO: "T2", TU: "T3", WE: "T4", TH: "T5", FR: "T6", SA: "T7", SU: "CN" };
/** "Mỗi ngày" / "Mỗi T3" from a simple rrule; `ref` (epoch ms, UTC+7) names the weekday when BYDAY is absent. */
export function repeatText(rrule: string, ref: number): string {
  const p = Object.fromEntries(rrule.split(";").map((kv) => kv.split("=")));
  if (p.FREQ !== "WEEKLY") return "Mỗi ngày";
  return `Mỗi ${BY[(p.BYDAY ?? "").split(",")[0]] ?? WD[new Date(ref + 7 * 3600_000).getUTCDay()]}`;
}
