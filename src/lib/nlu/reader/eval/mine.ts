// Candidate golden lines from a dev log: what the app heard and did ("[heard]"), and commands undone within 10s ("[undo-after-command]").
// Task ids are the device's own, so a candidate keeps only the ops; a person picks a fixture and the targets before it goes into commands.jsonl.
import type { Action } from "../../../types";

const VERB = /^(xo|huy|bo|doi|chuyen|lui|hoan|xong|them|rut|bot|mo lai|lam lai|chua xong|tam dung|delete|remove|move|done|cancel)/;
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();

export interface Candidate { text: string; from: "heard" | "undone"; ops?: { op: Action["op"]; when?: boolean; title?: string }[]; create?: boolean; wrong?: string[]; alts?: string[] }

/** Each logged line once (the newest wins): a command it made, a line that starts like a command but made only tasks (a miss or a true create), or a command undone (wrong). */
export function mine(log: string): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const m of log.matchAll(/\[(heard|undo-after-command)\]\s*(\{.*\})\s*$/gm)) {
    let v: { text?: string; alternatives?: string[]; actions?: Action[]; ones?: { label: string }[] };
    try { v = JSON.parse(m[2]); } catch { continue; }
    const text = v.text?.trim();
    if (!text) continue;
    const alts = v.alternatives?.filter((a) => a !== text);
    if (m[1] === "undo-after-command") { out.set(text, { text, from: "undone", wrong: (v.ones ?? []).map((o) => o.label), ...(alts?.length ? { alts } : {}) }); continue; }
    const ops = (v.actions ?? []).filter((a) => a.op !== "create").map((a) => ({ op: a.op, ...(a.when ? { when: true } : {}), ...(a.title ? { title: plain(a.title) } : {}) }));
    if (ops.length) out.set(text, { text, from: "heard", ops, ...(alts?.length ? { alts } : {}) });
    else if (VERB.test(plain(text))) out.set(text, { text, from: "heard", create: true, ...(alts?.length ? { alts } : {}) });
  }
  return [...out.values()];
}
