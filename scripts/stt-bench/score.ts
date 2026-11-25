// STT bake-off scoring. Clips and expected results are recorded on the device; the run file is that engine's output for each clip.
// manifest.json: [{ "clip": "001.wav", "text": "reference transcript", "action": { ...partial expected Action } }]
// run.json:      { "001.wav": { "text": "hypothesis", "firstPartialMs": 900 } }
import { think } from "../../src/lib/nlu/commands";

export interface Clip { clip: string; text: string; action?: Record<string, unknown> }
export interface Hyp { text: string; firstPartialMs?: number }

const words = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** Word edit distance and the reference length: corpus WER is the sum of edits over the sum of lengths. */
export function edits(ref: string, hyp: string): { edits: number; n: number } {
  const r = words(ref), h = words(hyp);
  const d = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    let diag = d[0];
    d[0] = i;
    for (let j = 1; j <= h.length; j++) {
      const up = d[j];
      d[j] = Math.min(up + 1, d[j - 1] + 1, diag + (r[i - 1] === h[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return { edits: d[h.length], n: r.length };
}

/** True when every field the expectation names equals the actual action's (deep JSON equality); extra fields are ignored. */
export function matches(expected: Record<string, unknown>, actual: unknown): boolean {
  const a = actual as Record<string, unknown> | undefined;
  return !!a && Object.entries(expected).every(([k, v]) => JSON.stringify(a[k]) === JSON.stringify(v));
}

export function score(manifest: Clip[], run: Record<string, Hyp>, now = new Date("2026-11-24T08:00:00+07:00")) {
  let e = 0, n = 0, acted = 0, actedOk = 0;
  const first: number[] = [];
  const rows = manifest.map((c) => {
    const h = run[c.clip] ?? { text: "" };
    const w = edits(c.text, h.text);
    e += w.edits; n += w.n;
    if (h.firstPartialMs != null) first.push(h.firstPartialMs);
    let ok: boolean | undefined;
    if (c.action) { acted++; ok = matches(c.action, think(h.text, now)[0]); if (ok) actedOk++; }
    return { clip: c.clip, wer: w.n ? w.edits / w.n : 0, ok };
  });
  first.sort((x, y) => x - y);
  return {
    wer: n ? e / n : 0,
    firstPartialMsMedian: first.length ? first[first.length >> 1] : null,
    e2e: acted ? actedOk / acted : null,
    rows,
  };
}
