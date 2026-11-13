import { fold } from "./reader/fold";

export const DIM = 256;

// FNV-1a, folded into DIM buckets.
const bucket = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return (h >>> 0) % DIM; };

/**
 * A title as a hashed bag of accent-folded words and character trigrams, L2-normalised: no model, same cosine.
 * Words catch repeats ("Ôn Giải tích" ~ "Ôn Giải tích 2"); trigrams catch near-spellings ("Giai tich" ~ "Giải tích").
 */
export function titleVec(title: string): Float32Array {
  const v = new Float32Array(DIM);
  for (const w of fold(title).text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    v[bucket(`w:${w}`)] += 1;
    const p = `^${w}$`;
    for (let i = 0; i + 3 <= p.length; i++) v[bucket(p.slice(i, i + 3))] += 0.5;
  }
  const n = Math.hypot(...v);
  if (n) for (let i = 0; i < DIM; i++) v[i] /= n;
  return v;
}
