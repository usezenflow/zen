import type { Kind } from "../types";
import { fold } from "./reader/fold";
import { frameOf, type Domain } from "./frame";

// The frame's domain as a kind. An appointment is an errand, whatever its domain says.
const BY_DOMAIN: Record<Domain, Kind> = {
  study: "study", work: "work", home: "chores", finance: "finance", health: "exercise", growth: "self", social: "social", admin: "errand", errand: "errand",
};

// One lexicon over folded text, first match wins ("bài tập" is study before "tập" is exercise). Order is the priority.
const LEX: [RegExp, Kind][] = [
  [/\b(hoc|on|on tap|bai tap|doc|luan|luan van|bao cao|de cuong|thi|kiem tra|tu vung|slide|do an|thuc hanh|lam bai|nop bai|viet (?:luan|bao cao|bai|de cuong|code|slide))\b/, "study"],
  [/\b(gym|chay bo|boi|da bong|yoga|the duc|tap the|workout|cardio|dap xe|cau long)\b|(?<!bai )\btap\b(?! trung)/, "exercise"],
  [/\b(viec nha|don|don nha|giat|giat do|nau|nau an|nau com|di cho|rua bat|clean|laundry|mua|rut tien|nop tien|sua|tuoi cay)\b|(?<!uong |pha )\btra\b/, "chores"],
  [/\b(cafe|ca phe|cf|coffee|hen|gap|di choi|goi|goi dien|call|sinh nhat|an voi)\b/, "social"],
];

/** Every kind a text names: the frame's first (its class decides), then the lexicon's, in lexicon order. "thì" is dropped first: folded it would read as "thi" (exam). */
export const kindsOf = (title: string): Kind[] => {
  const text = title.replace(/thì/gi, " ");
  const f = fold(text).text;
  const fr = frameOf(text);
  const byFrame = fr.cls === "appointment" ? "errand" : fr.cls === "language" ? "study" : fr.domain && BY_DOMAIN[fr.domain]; // a language is learnt: study
  return [...new Set([...(byFrame ? [byFrame] : []), ...LEX.filter(([re]) => re.test(f)).map(([, k]) => k)])];
};

/** The kind a title's words say; undefined when they say none. */
export const kindOf = (title: string): Kind | undefined => kindsOf(title)[0];
