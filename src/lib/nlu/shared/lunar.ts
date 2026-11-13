/**
 * Vietnamese lunar calendar, Ho Ngoc Duc's algorithm (https://www.informatik.uni-leipzig.de/~duc/amlich/).
 * Dates are `YYYY-MM-DD` strings. The time zone is UTC+7, which is what separates it from the Chinese calendar.
 */
import type { HolidayKind } from "./holiday";

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  leap: boolean;
}

const TZ = 7;
const INT = Math.floor;
const DR = Math.PI / 180;
const SYNODIC = 29.530588853;
const EPOCH = 2415021.076998695;

function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  const jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  return jd < 2299161 ? dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083 : jd;
}

function jdToDate(jd: number): [number, number, number] {
  let b = 0;
  let c = jd + 32082;
  if (jd > 2299160) {
    const a = jd + 32044;
    b = INT((4 * a + 3) / 146097);
    c = a - INT((b * 146097) / 4);
  }
  const d = INT((4 * c + 3) / 1461);
  const e = c - INT((1461 * d) / 4);
  const m = INT((5 * e + 2) / 153);
  return [e - INT((153 * m + 2) / 5) + 1, m + 3 - 12 * INT(m / 10), b * 100 + d - 4800 + INT(m / 10)];
}

/** Julian day number of the k-th new moon after 1900-01-01, at local midnight. */
function newMoonDay(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * DR);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let c1 = (0.1734 - 0.000393 * T) * Math.sin(M * DR) + 0.0021 * Math.sin(2 * DR * M);
  c1 += -0.4068 * Math.sin(Mpr * DR) + 0.0161 * Math.sin(DR * 2 * Mpr) - 0.0004 * Math.sin(DR * 3 * Mpr);
  c1 += 0.0104 * Math.sin(DR * 2 * F) - 0.0051 * Math.sin(DR * (M + Mpr)) - 0.0074 * Math.sin(DR * (M - Mpr));
  c1 += 0.0004 * Math.sin(DR * (2 * F + M)) - 0.0004 * Math.sin(DR * (2 * F - M)) - 0.0006 * Math.sin(DR * (2 * F + Mpr));
  c1 += 0.001 * Math.sin(DR * (2 * F - Mpr)) + 0.0005 * Math.sin(DR * (2 * Mpr + M));
  const deltat =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return INT(jd1 + c1 - deltat + 0.5 + TZ / 24);
}

/** Sector 0..11 (30 degrees each) of the sun's longitude at local midnight of day `jdn`. */
function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.5 - TZ / 24) / 36525;
  const T2 = T * T;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let dl = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(DR * M);
  dl += (0.019993 - 0.000101 * T) * Math.sin(DR * 2 * M) + 0.00029 * Math.sin(DR * 3 * M);
  let l = (L0 + dl) * DR;
  l -= Math.PI * 2 * INT(l / (Math.PI * 2));
  return INT((l / Math.PI) * 6);
}

/** Start of lunar month 11 (the one holding the winter solstice) of solar year `yy`. */
function lunarMonth11(yy: number): number {
  const k = INT((jdFromDate(31, 12, yy) - 2415021) / SYNODIC);
  const nm = newMoonDay(k);
  return sunLongitude(nm) >= 9 ? newMoonDay(k - 1) : nm;
}

/** Offset after month 11 of the leap month: the first month with no major solar term. */
function leapMonthOffset(a11: number): number {
  const k = INT((a11 - EPOCH) / SYNODIC + 0.5);
  let i = 1;
  let arc = sunLongitude(newMoonDay(k + i));
  let last: number;
  do {
    last = arc;
    i++;
    arc = sunLongitude(newMoonDay(k + i));
  } while (arc !== last && i < 14);
  return i - 1;
}

const iso = (d: number, m: number, y: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function solarToLunar(date: string): LunarDate {
  const [yy, mm, dd] = date.split("-").map(Number);
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - EPOCH) / SYNODIC);
  let monthStart = newMoonDay(k + 1);
  if (monthStart > dayNumber) monthStart = newMoonDay(k);
  let a11 = lunarMonth11(yy);
  let b11 = a11;
  let year: number;
  if (a11 >= monthStart) {
    year = yy;
    a11 = lunarMonth11(yy - 1);
  } else {
    year = yy + 1;
    b11 = lunarMonth11(yy + 1);
  }
  const diff = INT((monthStart - a11) / 29);
  let month = diff + 11;
  let leap = false;
  if (b11 - a11 > 365) {
    const leapDiff = leapMonthOffset(a11);
    if (diff >= leapDiff) {
      month = diff + 10;
      leap = diff === leapDiff;
    }
  }
  if (month > 12) month -= 12;
  if (month >= 11 && diff < 4) year -= 1;
  return { year, month, day: dayNumber - monthStart + 1, leap };
}

/** The solar date of a lunar date, or null for a leap month that year does not have. */
export function lunarToSolar({ year, month, day, leap }: LunarDate): string | null {
  const a11 = month < 11 ? lunarMonth11(year - 1) : lunarMonth11(year);
  const b11 = month < 11 ? lunarMonth11(year) : lunarMonth11(year + 1);
  const k = INT(0.5 + (a11 - EPOCH) / SYNODIC);
  let off = month - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = leapMonthOffset(a11);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (leap && month !== leapMonth) return null;
    if (leap || off >= leapOff) off += 1;
  } else if (leap) return null;
  const [d, m, y] = jdToDate(newMoonDay(k + off) + day - 1);
  return iso(d, m, y);
}

/** Lunar holidays as month and day of the lunar year. */
export const LUNAR_HOLIDAYS: ReadonlyArray<{ kind: HolidayKind; month: number; day: number }> = [
  { kind: "TET", month: 1, day: 1 },
  { kind: "HUNG_KINGS", month: 3, day: 10 },
  { kind: "MID_AUTUMN", month: 8, day: 15 },
];

/** Solar dates of the lunar holidays of lunar year `year`. Giao thừa is the day before Tết. */
export function lunarHolidayDates(year: number): Array<{ kind: HolidayKind; date: string }> {
  return LUNAR_HOLIDAYS.map(({ kind, month, day }) => ({
    kind,
    date: lunarToSolar({ year, month, day, leap: false }) as string,
  }));
}
