/** Lowercase, diacritic-folded copy of `s` plus the original index of every folded char. */
export function fold(s: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of s) {
    const f = ch
      .normalize("NFKC")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[đð]/g, "d");
    // One map entry per UTF-16 unit, so an emoji (two units) keeps later offsets aligned.
    text += f;
    for (let k = 0; k < f.length; k++) map.push(i);
    i += ch.length;
  }
  return { text, map };
}
