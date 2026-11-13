/**
 * The tags and attributes of a session note: what the rich note editor writes.
 * Notes the agent writes and notes the app renders are both cut down to these.
 */
export const NOTE_TAGS: Readonly<Record<string, readonly string[]>> = {
  p: [],
  br: [],
  strong: [],
  em: [],
  u: [],
  s: [],
  mark: [],
  blockquote: [],
  ul: ["data-type"],
  ol: [],
  li: ["data-checked"],
  label: [],
  input: ["type", "checked"],
  span: [],
  div: [],
  a: ["href"],
};

const VOID = new Set(["br", "input"]);
// Dropped with everything inside them, not just the tag.
const DROP_BLOCK = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?(<\/\1\s*>|$)/gi;
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const escapeText = (s: string) => s.replace(/&(?!#?[a-zA-Z0-9]+;)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Accepts one attribute value, or null to drop the attribute. Entities in a value stay as written. */
function valueOf(name: string, v: string | undefined): string | null | true {
  if (v === undefined) return name === "checked" ? true : null;
  const raw = v.replace(/["<>]/g, "");
  if (name === "href") return /^https?:\/\//i.test(raw) ? raw : null;
  if (name === "data-type") return raw === "taskList" ? raw : null;
  if (name === "data-checked") return raw === "true" || raw === "false" ? raw : null;
  if (name === "type") return raw === "checkbox" ? raw : null;
  return raw;
}

/**
 * A note's HTML cut down to `NOTE_TAGS`: unknown tags are dropped (their text
 * stays), scripts and styles go with their content, attributes outside the
 * list and links that are not http(s) are dropped.
 * A text with no tag is plain text: each line becomes a paragraph. Idempotent.
 */
export function sanitizeNoteHtml(html: string | null | undefined): string {
  const input = html ?? "";
  if (!/<[a-zA-Z\/!]/.test(input))
    return input
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `<p>${escapeText(l)}</p>`)
      .join("");
  const src = input.replace(DROP_BLOCK, "");
  let out = "";
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    const [token, close, nameRaw, attrs = ""] = m;
    out += escapeText(src.slice(last, m.index));
    last = m.index + token.length;
    if (token.startsWith("<!--")) continue;
    const name = nameRaw.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(NOTE_TAGS, name)) continue;
    const allowed = NOTE_TAGS[name];
    if (close) {
      if (!VOID.has(name)) out += `</${name}>`;
      continue;
    }
    const kept: string[] = [];
    for (const a of attrs.matchAll(ATTR)) {
      const aname = a[1].toLowerCase();
      if (!allowed.includes(aname)) continue;
      const v = valueOf(aname, a[2] ?? a[3] ?? a[4]);
      if (v === null) continue;
      kept.push(v === true ? aname : `${aname}="${v}"`);
    }
    if (name === "input" && !kept.includes('type="checkbox"')) continue;
    out += `<${[name, ...kept].join(" ")}>`;
  }
  out += escapeText(src.slice(last));
  return out;
}
