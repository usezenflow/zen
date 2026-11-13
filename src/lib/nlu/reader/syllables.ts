// Valid Vietnamese syllables, toneless, from phonotactics (docs/nlu/robustness.md).
import { fold } from "./fold";

// shortcut: no tone rules per final (c ch p t take only sắc and nặng), upgrade when a golden sample needs it
const SYLLABLE =
  /^(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnprstvx])?([aeiouy]{1,3})(?:ch|ng|nh|[cmnpt])?$/;
// The three-vowel nuclei Vietnamese spells ("iêu", "ươi", "oai"). Other runs ("iei") are not syllables.
const TRIPLE = new Set([
  "ieu",
  "yeu",
  "uou",
  "uoi",
  "oai",
  "oay",
  "uay",
  "uya",
  "uye",
  "uyu",
  "oeo",
]);

// The repair stage asks about the same words many times in one pass; the cap keeps memory flat.
const memo = new Map<string, boolean>();
const MEMO_MAX = 4096;

/** A word that reads as one Vietnamese syllable, tones and marks ignored. */
export function isSyllable(word: string): boolean {
  const hit = memo.get(word);
  if (hit !== undefined) return hit;
  const m = SYLLABLE.exec(fold(word).text);
  const ok = !!m && (m[1].length < 3 || TRIPLE.has(m[1]));
  if (memo.size >= MEMO_MAX) memo.clear();
  memo.set(word, ok);
  return ok;
}
