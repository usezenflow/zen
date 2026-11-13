// S3i roles: the preposition before an anchor sets its role. Pure, on the raw text before the anchor.
// Hooks: a holiday anchor (3c2) arrives as the day `resolveDate` returns; rule bounds (3e) add an `until`
// to RoleCue and are read where the rule is built.
import { fold } from "./fold";

export type Role =
  | "at"
  | "before"
  | "after"
  | "from"
  | "within"
  | "between"
  | "until"
  | "around";

/** A role and, for an offset ("2 ngày trước 20/11"), the days it moves the anchor by. */
export interface RoleCue {
  role: Role;
  days?: number;
}

/** Folded role words at the end of the text before an anchor, longest first. */
const ROLES: [RegExp, Role][] = [
  [
    /(?<![a-z])(?:cham nhat|muon nhat|tre nhat|khong qua|han chot|truoc|trc|han|chot|by|before|due)\s*$/,
    "before",
  ],
  [/(?<![a-z])(?:sau khi|khong truoc|som nhat|sau|after)\s*$/, "after"],
  [/(?<![a-z])(?:ke tu|bat dau tu|tu|from|starting)\s*$/, "from"],
  [
    /(?<![a-z])(?:cho den het|cho den|den het|den|toi khi|until|through)\s*$/,
    "until",
  ],
  [/(?<![a-z])(?:khoang|tam|chung|gan|hon|around|about)\s*$/, "around"],
  [/(?<![a-z])(?:luc|vao|hom|ngay|at|on)\s*$/, "at"],
];
/** "tuần sau", "tháng trước" name a week or month, not a day: no role. */
const SPAN_WORD =
  /(?<![a-z])(?:tuan|thang|nam)\s+(?:sau|truoc|trc|nay|toi|nua)\s*$/;
/** "2 ngày trước", "1 tuần sau": the count before the role word. */
const OFFSET = /(?<![\d])(\d{1,2})\s*(ngay|tuan)\s+(truoc|trc|sau)\s*$/;

/** The role the words right before an anchor set. Undefined when none is named. */
export function roleOf(before: string): RoleCue | undefined {
  // "tới" (until) and "tối" (evening) fold alike, so the raw word decides
  if (/(?<![\p{L}])tới\s*$/u.test(before.normalize("NFC").toLowerCase()))
    return { role: "until" };
  const f = fold(before).text;
  const off = OFFSET.exec(f);
  if (off) {
    const days = +off[1] * (off[2] === "tuan" ? 7 : 1);
    // "trước" moves the anchor back and is its deadline; "sau" moves it forward and is the day itself
    return off[3] === "sau"
      ? { role: "at", days }
      : { role: "before", days: -days };
  }
  if (SPAN_WORD.test(f)) return undefined;
  // "thứ sáu" folds to "thu sau": the weekday, not the role
  if (/(?<![a-z])thu\s+sau\s*$/.test(f)) return undefined;
  for (const [re, role] of ROLES) if (re.test(f)) return { role };
  return undefined;
}

/** Days of a "trong vòng N ngày|tuần" phrase, a deadline from today. Undefined for a plain length ("trong 2 tiếng"). */
export function withinDays(folded: string): number | undefined {
  const m =
    /(?<![a-z])trong\s+(?:vong|khoang)\s+(\d{1,2})\s*(ngay|tuan)(?![a-z])/.exec(
      fold(folded).text,
    );
  return m ? +m[1] * (m[2] === "tuan" ? 7 : 1) : undefined;
}
