// A title as a small static embedding: accent-folded words matched to distilled teacher vectors (longest phrase first),
// unknown words through a char-trigram table, SIF-weighted sum, L2-normalised. Model: ./model/embed.json (built by
// scripts/embed). Pure TS, no model runtime: the tables are int8 and decoded once on first use.
import { fold } from "./reader/fold";
import model from "./model/embed.json";

export const DIM: number = model.D;
const B: number = model.B;
const MAX_SPAN = 3;

interface Tables {
  index: Map<string, number>;
  rows: Int8Array;
  rowScale: Float32Array;
  weight: Float32Array;
  tri: Int8Array;
  triScale: Float32Array;
}

let tables: Tables | undefined;

// Base64 by lookup table into one pre-sized buffer: atob + Uint8Array.from over 2.7 MB cost hundreds of ms on Hermes.
const B64 = new Uint8Array(128);
"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("").forEach((c, i) => (B64[c.charCodeAt(0)] = i));
const bytes = (b64: string): Uint8Array => {
  const out = new Uint8Array((b64.length / 4) * 3 - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0));
  for (let i = 0, o = 0; o < out.length; i += 4) {
    const n = (B64[b64.charCodeAt(i)] << 18) | (B64[b64.charCodeAt(i + 1)] << 12) | (B64[b64.charCodeAt(i + 2)] << 6) | B64[b64.charCodeAt(i + 3)];
    for (let k = 0; k < 3 && o < out.length; k++) out[o++] = (n >> (16 - 8 * k)) & 0xff;
  }
  return out;
};
const floats = (b64: string): Float32Array => new Float32Array(bytes(b64).buffer);

function load(): Tables {
  const index = new Map<string, number>();
  model.keys.forEach((k, i) => index.set(k, i));
  const codes = bytes(model.w);
  const weight = new Float32Array(codes.length);
  for (let i = 0; i < codes.length; i++) weight[i] = 2 ** (-codes[i] / 16);
  return {
    index,
    rows: new Int8Array(bytes(model.q).buffer),
    rowScale: floats(model.s),
    weight,
    tri: new Int8Array(bytes(model.t).buffer),
    triScale: floats(model.ts),
  };
}

// FNV-1a over UTF-16 code units, as in vec.ts, into B trigram buckets.
function bucket(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0) % B;
}

/** Adds the word's trigram vector (mean of its trigram rows) to `out`. Used for words the vocabulary does not have. */
function addTrigrams(out: Float32Array, word: string, t: Tables): void {
  const p = `^${word}$`;
  const n = p.length - 2;
  for (let i = 0; i < n; i++) {
    const row = bucket(p.slice(i, i + 3)) * DIM;
    for (let j = 0; j < DIM; j++) out[j] += (t.tri[row + j] * t.triScale[j]) / n;
  }
}

/** Folded title as its letter words; digits and punctuation separate words and are not embedded. */
export function words(title: string): string[] {
  return fold(title).text.match(/\p{L}+/gu) ?? [];
}

/** Decodes the tables now, so the first capture does not pay for it. */
export function warm(): void {
  tables ??= load();
}

/** Embeds a title: 1 x DIM, L2-normalised, all zeros when the title has no letters. */
export function embed(title: string): Float32Array {
  tables ??= load();
  const t = tables;
  const out = new Float32Array(DIM);
  const ws = words(title);
  for (let i = 0; i < ws.length; ) {
    let span = 0;
    let row = -1;
    // Longest vocabulary phrase first ("tap the duc" before "tap"); a word with no entry goes to the trigram table.
    for (let k = Math.min(MAX_SPAN, ws.length - i); k >= 1 && row < 0; k--) {
      const hit = t.index.get(ws.slice(i, i + k).join(" "));
      if (hit !== undefined) {
        row = hit;
        span = k;
      }
    }
    if (row >= 0) {
      const w = t.weight[row];
      for (let j = 0; j < DIM; j++) out[j] += w * t.rows[row * DIM + j] * t.rowScale[j];
    } else {
      addTrigrams(out, ws[i], t);
      span = 1;
    }
    i += span;
  }
  let n = 0;
  for (let j = 0; j < DIM; j++) n += out[j] * out[j];
  n = Math.sqrt(n);
  if (n) for (let j = 0; j < DIM; j++) out[j] /= n;
  return out;
}

export function cos(a: Float32Array, b: Float32Array): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let j = 0; j < a.length; j++) {
    d += a[j] * b[j];
    na += a[j] * a[j];
    nb += b[j] * b[j];
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

// Idle pre-warm: decode after the first frames, so the first capture does not stall on it.
setTimeout(warm, 2000);
