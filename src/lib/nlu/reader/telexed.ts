// What a Telex keyboard with no spell check writes for the keys of an English word ("web" is "ưeb"). Shared by the grids.
const VOWEL = "aeiouy";
const MOD: Record<string, string> = { a: "ă", o: "ơ", u: "ư" };
const HAT: Record<string, string> = { a: "â", e: "ê", o: "ô" };
const MARK: Record<string, string> = { s: "\u0301", f: "\u0300", r: "\u0309", x: "\u0303", j: "\u0323" };
/** What a Telex keyboard with no spell check writes for the keys of an English word: "web" is "ưeb", "meeting" "mêting". */
export function telexed(word: string): string {
  const out: string[] = []; // one entry per letter, marks included
  let tone: { at: number; key: string } | undefined;
  const plain = (i: number) => out[i].normalize("NFD")[0];
  const bare = (i: number) => out[i].normalize("NFD").length === 1 || (tone?.at === i && out[i].normalize("NFD").length === 2 && !/[\u0302\u0306\u031b]/.test(out[i].normalize("NFD")));
  for (const k of word) {
    const last = out.length - 1;
    if (MARK[k] && out.some((c) => VOWEL.includes(c.normalize("NFD")[0]))) {
      if (tone?.key === k) { out[tone.at] = out[tone.at].normalize("NFD").replace(MARK[k], "").normalize("NFC"); tone = undefined; out.push(k); continue; }
      if (tone) out[tone.at] = out[tone.at].normalize("NFD").replace(MARK[tone.key], "").normalize("NFC");
      let at = last; while (at >= 0 && !VOWEL.includes(plain(at))) at--;
      out[at] = (out[at].normalize("NFD") + MARK[k]).normalize("NFC");
      tone = { at, key: k };
    } else if (k === "w") {
      let at = last; while (at >= 0 && VOWEL.includes(plain(at)) && !(MOD[plain(at)] && bare(at))) at--;
      if (at >= 0 && MOD[plain(at)] && bare(at) && out.slice(at).every((c) => VOWEL.includes(c.normalize("NFD")[0]))) out[at] = (MOD[plain(at)].normalize("NFD") + out[at].normalize("NFD").slice(1)).normalize("NFC");
      else out.push("ư");
    } else if (HAT[k] && last >= 0 && plain(last) === k && bare(last)) out[last] = (HAT[k].normalize("NFD") + out[last].normalize("NFD").slice(1)).normalize("NFC");
    else if (k === "d" && out.includes("d")) out[out.lastIndexOf("d")] = "đ";
    else out.push(k);
  }
  return out.join("").normalize("NFC");
}
