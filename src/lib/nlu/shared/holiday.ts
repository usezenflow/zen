/** Holiday kind, detected from an all-day event title. */
export type HolidayKind =
  | "TET"
  | "NEW_YEAR"
  | "NATIONAL"
  | "REUNIFICATION"
  | "LABOR"
  | "HUNG_KINGS"
  | "CHRISTMAS"
  | "VALENTINE"
  | "WOMEN"
  | "TEACHER"
  | "MID_AUTUMN"
  | "FAMILY"
  | "BIRTHDAY"
  | "OTHER";

/** Placement weight of a day. 0 is an ordinary day, 4 the most important. */
export type HolidayTier = 0 | 1 | 2 | 3 | 4;

export const HOLIDAY_TIER: Record<HolidayKind, HolidayTier> = {
  TET: 4,
  NEW_YEAR: 3,
  NATIONAL: 2,
  REUNIFICATION: 2,
  LABOR: 2,
  HUNG_KINGS: 2,
  CHRISTMAS: 1,
  VALENTINE: 1,
  WOMEN: 1,
  TEACHER: 1,
  MID_AUTUMN: 1,
  FAMILY: 1,
  BIRTHDAY: 1,
  OTHER: 1,
};

/** Kinds whose date follows the lunar calendar. */
export const LUNAR_KINDS: HolidayKind[] = ["TET", "MID_AUTUMN", "HUNG_KINGS"];

/**
 * First match wins, so specific rules come before the generic `tet`.
 * Patterns run on `normHoliday` output: lowercase ASCII words, no diacritics.
 */
const RULES: ReadonlyArray<readonly [HolidayKind, RegExp]> = [
  [
    "NEW_YEAR",
    /\btet duong lich\b|\bnam moi duong lich\b|(?<!(?:lunar|vietnamese|chinese) )\bnew year s? (?:day|eve)\b/,
  ],
  ["MID_AUTUMN", /\btrung thu\b|\bmid ?autumn\b|\bmoon festival\b/],
  [
    "TET",
    /\btet nguyen dan\b|\btet am lich\b|\bgiao thua\b|\bmung [1-9]\b|\bnghi tet\b|\b(?:lunar|vietnamese|chinese) new year\b|\btet holiday\b|\bspring festival\b|\btet\b/,
  ],
  ["REUNIFICATION", /\bgiai phong mien nam\b|\bthong nhat\b|\breunification\b|\bliberation day\b/],
  ["LABOR", /\bquoc te lao dong\b|\blabou?r day\b|\bmay day\b|\bworkers day\b/],
  ["HUNG_KINGS", /\bhung vuong\b|\bgio to\b|\bhung kings?\b/],
  ["NATIONAL", /\bquoc khanh\b|\bindependence day\b|\bnational day\b/],
  ["CHRISTMAS", /\bgiang sinh\b|\bnoel\b|\bchristmas\b|\bxmas\b/],
  ["VALENTINE", /\bvalentine\b|\btinh nhan\b/],
  ["WOMEN", /\bphu nu\b|\bwomen s? day\b/],
  ["TEACHER", /\bnha giao\b|\bteachers? day\b/],
  ["FAMILY", /\bgia dinh\b|\bfamily day\b/],
  ["BIRTHDAY", /\bsinh nhat\b|\bthoi noi\b|\bbirthday\b|\bb ?day\b/],
];

/** Lowercase ASCII words: diacritics and punctuation dropped. */
export function normHoliday(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function holidayKind(title: string): HolidayKind {
  const t = normHoliday(title);
  return RULES.find(([, re]) => re.test(t))?.[0] ?? "OTHER";
}

export function isLunarHoliday(title: string): boolean {
  return LUNAR_KINDS.includes(holidayKind(title));
}

/** Fixed solar dates of the built-in holidays, by month and day. */
export const SOLAR_HOLIDAYS: ReadonlyArray<{ kind: HolidayKind; month: number; day: number }> = [
  { kind: "NEW_YEAR", month: 1, day: 1 },
  { kind: "VALENTINE", month: 2, day: 14 },
  { kind: "WOMEN", month: 3, day: 8 },
  { kind: "REUNIFICATION", month: 4, day: 30 },
  { kind: "LABOR", month: 5, day: 1 },
  { kind: "FAMILY", month: 6, day: 28 },
  { kind: "NATIONAL", month: 9, day: 2 },
  { kind: "WOMEN", month: 10, day: 20 },
  { kind: "TEACHER", month: 11, day: 20 },
  { kind: "CHRISTMAS", month: 12, day: 24 },
  { kind: "CHRISTMAS", month: 12, day: 25 },
];

/** Solar dates (`YYYY-MM-DD`) of the fixed-date holidays in `year`. */
export function solarHolidayDates(year: number): Array<{ kind: HolidayKind; date: string }> {
  const pad = (n: number) => String(n).padStart(2, "0");
  return SOLAR_HOLIDAYS.map(({ kind, month, day }) => ({ kind, date: `${year}-${pad(month)}-${pad(day)}` }));
}
