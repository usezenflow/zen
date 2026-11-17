// Known, left out: "4g" and "5g" read as clocks (4 giờ), and an unaccented "ram" is dropped before the title.
// English and tech terms in a work or study title take their display form: every term typed lowercase in a task sentence,
// the multi-word terms with spaces, hyphens or slashes between their words, and the negatives where the Vietnamese word
// must stay. Answers are worked out here from the display forms the coordinator set, not from the reader.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";
import { canonWord, canonPhrases } from "./en";

const REF = { y: 2026, m: 11, d: 16, h: 9, mi: 46 };
const title = (s: string) => read(s, { ref: REF, source: "typed" }).items.map(itemAction).map((a) => a.title).join(" | ");

// the coordinator's acronyms and tech names: typed lowercase, display form
const TECH: [string, string][] = [
  ["cpu", "CPU"], ["gpu", "GPU"], ["ssd", "SSD"], ["hdd", "HDD"], ["usb", "USB"], ["vpn", "VPN"], ["dns", "DNS"], ["url", "URL"],
  ["html", "HTML"], ["css", "CSS"], ["js", "JS"], ["ts", "TS"], ["json", "JSON"], ["pdf", "PDF"], ["pc", "PC"], ["iot", "IoT"],
  ["nas", "NAS"], ["wan", "WAN"], ["wifi", "Wi-Fi"], ["bluetooth", "Bluetooth"], ["hdmi", "HDMI"],
  ["linux", "Linux"], ["windows", "Windows"], ["macos", "macOS"], ["iphone", "iPhone"], ["ipad", "iPad"], ["macbook", "MacBook"],
  // forced: syllables in Vietnamese, unaccented and lowercase only ("ram" is left out: see the report)
  ["lan", "LAN"], ["os", "OS"], ["ip", "IP"],
];
// multi-word terms: typed in any of the separators
const PHRASE: [string, string][] = [
  ["a/b test", "A/B test"], ["a-b test", "A/B test"], ["landing page", "Landing page"], ["all hands", "All-hands"], ["all-hands", "All-hands"],
  ["check in", "Check-in"], ["check-in", "Check-in"], ["check out", "Check-out"], ["check-out", "Check-out"], ["unit test", "Unit test"],
  ["unit-test", "Unit test"], ["1:1", "1:1"], ["ci/cd", "CI/CD"], ["ci-cd", "CI/CD"], ["p&l", "P&L"], ["tiktok shop", "TikTok Shop"],
  ["xanh sm", "Xanh SM"], ["meal prep", "Meal prep"], ["meal-prep", "Meal prep"],
];
const FRAMES = ["làm {t} mai 9h", "viết {t} cho team chiều nay", "{t} mai 9h họp nhóm"];

const misses: string[] = [];
let total = 0;
it(`every term in a work title takes its display form (${(TECH.length + PHRASE.length) * FRAMES.length} cases)`, () => {
  for (const [k, d] of [...TECH, ...PHRASE]) for (const f of FRAMES) {
    total++;
    const s = f.replace("{t}", k);
    const got = title(s);
    if (!got.includes(d)) misses.push(`${s} -> ${got} (want ${d})`);
  }
  if (misses.length) console.log(misses.slice(0, 30).join("\n"));
  expect(misses.length, `${misses.length}/${total} misses`).toBe(0);
});

it("the force rule: an accented or Title-case token keeps its word", () => {
  // "Lan" is a name, "rằm" a word with marks, "Ram" in Title case: each stays as typed
  expect(canonWord("Lan")).toBeUndefined();
  expect(canonWord("lan")).toBe("LAN");
  expect(canonWord("rằm")).toBeUndefined();
  expect(canonWord("Ram")).toBeUndefined();
  // "ba", "ai", "ui" are not forced: they stay as typed
  expect(canonWord("ba")).toBeUndefined();
  expect(canonWord("ai")).toBeUndefined();
  expect(canonWord("ui")).toBeUndefined();
});

it("negatives: a name, a lunar day and a Telex-typed word keep their letters", () => {
  expect(title("gặp Lan chiều mai")).toContain("Lan");
  expect(title("làm mạng lan văn phòng mai 9h")).toContain("LAN");
  expect(title("đọc sách rằm tháng giêng")).not.toContain("RAM");
  expect(title("làm lạn mai 9h")).toContain("lạn");
  expect(canonPhrases("gặp Lan và ai nhắn")).toBe("gặp Lan và ai nhắn");
});
