// Marks for the typing box: typos from the repairs, and bare hours or clocks the reader had to guess. Pure; fixed rules.
import type {
  ReaderHint,
  ReaderRepair,
  ReaderWC,
  ReaderWindow,
} from "../shared";
import { LENGTH_CUE, TASK_VERB } from "./assemble";
import { activityOf, activityPm } from "./implied";
import { fold } from "./fold";

export interface HintCtx {
  /** Now, in the user's zone. */
  ref: ReaderWC;
  /** The reader's repairs of the raw text, rejected ones already dropped. */
  repairs: ReaderRepair[];
}

/** A clock: "2h", "15h30", "2 giờ" (folded). Not a date like "2/11" or a time with a day after it. */
const CLOCK = /(?<![\d/.:])(\d{1,2})(?:h|\s?gio)(?:\s?(\d{2}))?(?![\d/a-z])/g;
const EVENT_VERB = /^(hop|gap|hen|lop|thi|kham|meeting|call)(?![a-z])/;
const PART_WORD = /\b(sang|chieu|toi|dem|khuya|trua|am|pm|sau|truoc)\b/;
const DATE_WORD =
  /\b(hom|mai|ngay|thu|cn|chu nhat|t[2-7]|nay|kia|tuan|thang)\b|\d{1,2}[/.-]\d{1,2}/;
const AM_WINDOWS: ReaderWindow[] = ["EARLY_MORNING", "DAWN", "MORNING"];

/** Waking hours score 0; the small hours sink below any other reading. */
function wakingHours(h: number): number {
  if (h >= 7 && h <= 22) return 0;
  if (h === 6 || h === 23) return -10;
  return -100;
}

/** Part of the day an activity names: "ăn tối" is PM, "cà phê" (morning to evening) names none. */
function activityPart(folded: string): "AM" | "PM" | undefined {
  if (activityPm(folded)) return "PM";
  const w = activityOf(folded)?.windows;
  if (!w) return undefined;
  if (w.every((x) => AM_WINDOWS.includes(x))) return "AM";
  if (w.every((x) => !AM_WINDOWS.includes(x))) return "PM";
  return undefined;
}

const partLabel = (h24: number) =>
  h24 === 12 ? "trưa" : h24 < 12 ? "sáng" : h24 < 18 ? "chiều" : "tối";

const pad = (n: number) => String(n).padStart(2, "0");

/** The guessed hour, ranked best first: a length, then the PM and AM clocks. */
function hourReadings(
  folded: string,
  before: string,
  hour: number,
  now: { min: number },
): ReaderHint["options"] {
  const head = before.trimStart();
  const taskLed = TASK_VERB.test(head);
  const eventLed = EVENT_VERB.test(head);
  const want = activityPart(folded);
  const fit = (part: "AM" | "PM") => (eventLed || want === part ? 10 : 0);
  const scored: { score: number; option: ReaderHint["options"][number] }[] = [];
  if (!LENGTH_CUE.test(before))
    scored.push({
      score: taskLed ? 10 : 0,
      option: { label: `mất ${hour} tiếng`, to: `mất ${hour} tiếng` },
    });
  for (const h24 of [(hour % 12) + 12, hour % 12]) {
    const label = `${h24 % 12 || 12} giờ ${partLabel(h24)}`;
    const future = h24 * 60 > now.min ? 0 : -50;
    scored.push({
      score: fit(h24 >= 12 ? "PM" : "AM") + wakingHours(h24) + future,
      option: { label, caption: `${pad(h24)}:00`, to: label },
    });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.option);
}

/** Hints for `text`: a typo per repair, and an ask per bare clock with more than one reading. */
export function hintsOf(text: string, ctx: HintCtx): ReaderHint[] {
  const typos: ReaderHint[] = ctx.repairs.map((r) => ({
    start: r.start,
    end: r.end,
    kind: "typo",
    label: r.to,
    options: [{ label: r.to, to: r.to }],
  }));
  const f = fold(text);
  const now = { min: (ctx.ref.h ?? 0) * 60 + (ctx.ref.mi ?? 0) };
  const asks: ReaderHint[] = [];
  for (const m of f.text.matchAll(CLOCK)) {
    const at = m.index ?? 0;
    const start = f.map[at];
    const end = f.map[at + m[0].length - 1] + 1;
    if (typos.some((t) => t.start < end && start < t.end)) continue;
    const hour = +m[1];
    const minute = m[2] ? +m[2] : 0;
    if (hour > 23 || minute > 59) continue;
    const raw = text.slice(start, end);
    const before = f.text.slice(0, at);
    const around = f.text.slice(Math.max(0, at - 12), at + m[0].length + 12);
    // a part of the day already names the clock
    if (PART_WORD.test(around)) continue;
    let options: ReaderHint["options"];
    if (hour >= 13) {
      // a 24 hour clock: today if it is still ahead, else the reader moves it to tomorrow
      if (DATE_WORD.test(f.text) || hour * 60 + minute <= now.min) continue;
      options = [
        { label: `hôm nay ${raw}`, to: `hôm nay ${raw}` },
        { label: `ngày mai ${raw}`, to: `ngày mai ${raw}` },
      ];
    } else if (hour >= 1 && minute === 0) {
      options = hourReadings(f.text, before, hour, now);
    } else continue;
    asks.push({ start, end, kind: "ask", label: raw, options });
  }
  return [...typos, ...asks].sort((a, b) => a.start - b.start);
}
