// Augmentations shared by the training generator (gen.ts) and the eval test: diacritics off, a 1-letter typo.
// Deterministic for a seed, so the same held-out copy comes out every run.

/** Strips marks and folds đ/Đ to d, keeping case (the fold() of the reader lowercases; training keeps case). */
export function noDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFC");
}

/** Small seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One typo in one word of 4+ letters: a dropped, doubled or swapped letter. Returns s unchanged if there is no such word. */
export function typo(s: string, rand: () => number): string {
  const spans = [...s.matchAll(/\p{L}{4,}/gu)];
  if (!spans.length) return s;
  const m = spans[Math.floor(rand() * spans.length)];
  const w = m[0];
  const at = 1 + Math.floor(rand() * (w.length - 2));
  const op = Math.floor(rand() * 3);
  const next =
    op === 0 ? w.slice(0, at) + w.slice(at + 1) : op === 1 ? w.slice(0, at) + w[at] + w.slice(at) : w.slice(0, at - 1) + w[at] + w[at - 1] + w.slice(at + 1);
  return s.slice(0, m.index) + next + s.slice(m.index + w.length);
}

/** The noised copy the eval measures: diacritics off, then one typo. */
export function noised(s: string, seed: number): string {
  return typo(noDiacritics(s), rng(seed));
}
