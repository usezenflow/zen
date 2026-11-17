// Every phrase that once had an activity length (ACTIVITIES, now size.ts's classes) keeps the length the reader gives it,
// as typed, without accents, with a one-letter typo, and after an object. The lengths are the ones the reader gave before the move.
import { describe, expect, it } from "vitest";
import { itemAction } from "../adapt";
import type { ReaderItem } from "../shared";
import { fold } from "./fold";
import { read } from "./reader";

const ref = { y: 2026, m: 11, d: 12, h: 9, mi: 0 };

/** Phrase and the length the reader gave it before the activity table moved into size.ts. */
const FORMER: [string, number][] = [
  ["ăn sáng", 30], ["bữa sáng", 30], ["breakfast", 30],
  ["ăn trưa", 60], ["bữa trưa", 60], ["lunch", 60],
  ["ăn tối", 60], ["bữa tối", 60], ["dinner", 60],
  ["cà phê", 60], ["cafe", 60], ["coffee", 60], ["cf", 60],
  ["gym", 60], ["chạy bộ", 30], ["gọi điện", 30], ["call", 30],
  ["đọc", 60], ["read", 60], ["giặt đồ", 60], ["laundry", 60],
  ["dọn nhà", 60], ["clean", 60], ["họp", 60], ["meeting", 60],
];

/** One letter doubled in the longest word: a 1-letter typo the reader can fix. */
const typo = (s: string): string | undefined => {
  const w = s.split(" ").sort((a, b) => b.length - a.length)[0];
  if (w.length < 3) return undefined;
  return s.replace(w, w[0] + w[1] + w.slice(1));
};

describe("a former activity phrase keeps its length in every spelling", () => {
  for (const [phrase, mins] of FORMER) {
    const variants: [string, string | undefined][] = [
      ["accents", phrase],
      ["no accents", fold(phrase).text],
      ["typo", typo(fold(phrase).text)],
      ["object first", `cho mẹ ${phrase}`],
    ];
    for (const [kind, text] of variants) {
      if (text === undefined) continue;
      it(`${phrase} (${kind}: "${text}") is ${mins} minutes`, () => {
        const [it] = read(text, { ref, source: "typed" }).items;
        expect(it?.durationMinutes).toBe(mins);
      });
    }
  }
});

describe("an unsized guess is split, not capped", () => {
  it("a 270 minute guess with no class keeps its length and splits into sittings of at most 120", () => {
    const item: ReaderItem = {
      type: "ASSIGNMENT", title: "Nộp", note: null, durationMinutes: 270, confidence: 0.8,
      inferred: ["durationMinutes"], flags: [], alternatives: [], evidence: "nộp", checked: false,
    };
    expect(itemAction(item)).toMatchObject({ effortMinutes: 270, effortGuessed: true, maxSitting: 120 });
  });
});
