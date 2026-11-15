// S3c2 holidays: a holiday name is a date. Dates come from packages/shared (solar and lunar tables), no second table here.
import {
  holidayKind,
  lunarHolidayDates,
  lunarToSolar,
  solarHolidayDates,
  type HolidayKind,
  type ReaderWC,
} from "../shared";
import { addDays, dayNo } from "./calendar";
import { fold } from "./fold";

/** Folded holiday phrases the reader reads, longest first. `mùng n tết` is the n-th day of Tết. */
const PHRASES = [
  "tet duong lich",
  "nam moi duong lich",
  "giao thua",
  "mung [1-9] tet",
  "tet nguyen dan",
  "tet am lich",
  "tet",
  "trung thu",
  "ram(?: thang (?:\\d{1,2}|gieng))?",
  "(?:mung|mong) [1-9] thang gieng",
  "gio to",
  "hung vuong",
  "quoc khanh",
  "giai phong mien nam",
  "thong nhat",
  "quoc te lao dong",
  "quoc te phu nu",
  "phu nu viet nam",
  "ngay phu nu",
  "ngay nha giao",
  "nha giao",
  "ngay gia dinh",
  "le tinh nhan",
  "valentine",
  "dem giang sinh",
  "dem noel",
  "giang sinh",
  "noel",
  "christmas",
  "halloween",
  "quoc te thieu nhi",
  "nam moi",
  "new year",
];

/** Holidays the shared set does not name, as fixed folded dates (MM-DD). */
const FIXED: Record<string, string> = {
  halloween: "10-31",
  "quoc te thieu nhi": "06-01",
  "nam moi": "01-01",
  "new year": "01-01",
};

/** Matches one holiday phrase on folded text: `m[1]` is the phrase. */
export const HOLIDAY_RE = new RegExp(
  `(?<![a-z])(${[...PHRASES].sort((a, b) => b.length - a.length).join("|")})(?![a-z])`,
  "g",
);

/** The next occurrence on or after ref: a holiday named in a plan is the coming one, never one already past. */
function nearest(
  yearDate: (y: number) => ReaderWC | null,
  ref: ReaderWC,
): ReaderWC | null {
  for (const y of [ref.y - 1, ref.y, ref.y + 1]) {
    const w = yearDate(y);
    if (w && dayNo(w) >= dayNo(ref)) return w;
  }
  return null;
}

const ymd = (s: string): ReaderWC => {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
};

/** The lunar day `day` of lunar `month` (any month when none) on or after ref. */
function nextLunar(
  month: number | undefined,
  day: number,
  ref: ReaderWC,
): ReaderWC | null {
  // from last lunar year: its months 11-12 fall in this solar January-February
  for (const y of [ref.y - 1, ref.y, ref.y + 1])
    for (let m = month ?? 1; m <= (month ?? 12); m++) {
      const s = lunarToSolar({ year: y, month: m, day, leap: false });
      if (s && dayNo(ymd(s)) >= dayNo(ref)) return ymd(s);
    }
  return null;
}

/** The date of a holiday phrase, next occurrence from ref. Null for a phrase with no date (or none the shared set holds). */
export function holidayOf(phrase: string, ref: ReaderWC): ReaderWC | null {
  const f = fold(phrase).text.trim();
  const ram = /^ram(?: thang (\d{1,2}|gieng))?$/.exec(f);
  if (ram) {
    if (!ram[1]) return nextLunar(undefined, 15, ref);
    const month = ram[1] === "gieng" ? 1 : +ram[1];
    return nearest((y) => {
      const s = lunarToSolar({ year: y, month, day: 15, leap: false });
      return s ? ymd(s) : null;
    }, ref);
  }
  const mung = /^(?:mung|mong) ([1-9]) thang gieng$/.exec(f);
  if (mung)
    return nearest((y) => {
      const hit = lunarHolidayDates(y).find((x) => x.kind === "TET");
      return hit ? addDays(ymd(hit.date), +mung[1] - 1) : null;
    }, ref);
  const fixed = FIXED[f];
  if (fixed) return nearest((y) => ymd(`${y}-${fixed}`), ref);
  const kind: HolidayKind = holidayKind(f);
  if (kind === "OTHER") return null;
  // mùng n tết, giao thừa: an offset from the lunar new year
  const offset = /^mung (\d) tet$/.exec(f);
  const shift = offset ? +offset[1] - 1 : /giao thua/.test(f) ? -1 : 0;
  if (kind === "TET" || kind === "MID_AUTUMN" || kind === "HUNG_KINGS")
    return nearest((y) => {
      const hit = lunarHolidayDates(y).find((x) => x.kind === kind);
      return hit ? addDays(ymd(hit.date), shift) : null; // shifted before the pick: giao thừa on Tết day is next year's
    }, ref);
  // two solar dates share a kind: the 20/10 Vietnamese day and the 24/12 eve
  const pick = (k: HolidayKind): string | undefined => {
    if (k === "WOMEN") return /viet nam/.test(f) ? "10-20" : "03-08";
    if (k === "CHRISTMAS") return /dem|eve/.test(f) ? "12-24" : "12-25";
    return undefined;
  };
  const want = pick(kind);
  const hits = (y: number) =>
    solarHolidayDates(y).filter(
      (x) =>
        x.kind === kind && (want === undefined || x.date.slice(5) === want),
    );
  return nearest((y) => {
    const h = hits(y)[0];
    return h ? ymd(h.date) : null;
  }, ref);
}

/** Whether a date is a holiday in the shared solar or lunar set. */
export function isHolidayDate(w: ReaderWC): boolean {
  const s = `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
  return [...solarHolidayDates(w.y), ...lunarHolidayDates(w.y)].some(
    (x) => x.date === s,
  );
}
