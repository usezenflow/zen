import { lunarToSolar } from "./nlu/shared";
import type { Hols } from "@/components/cal";

const DAY = 86400_000;
const local = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
const solar = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

/** Vietnamese public holidays of a year, by local day start. Observances (8/3, 20/11, 1/6, 14/2, 25/12...) are not public holidays. shortcut: no bridge days, which the government moves yearly. */
function year(y: number): [number, string][] {
  const tet = lunarToSolar({ year: y, month: 1, day: 1, leap: false });
  const gio = lunarToSolar({ year: y, month: 3, day: 10, leap: false });
  const out: [number, string][] = [
    [solar(y, 1, 1), "Tết Dương lịch"],
    [solar(y, 4, 30), "Giải phóng miền Nam"],
    [solar(y, 5, 1), "Quốc tế Lao động"],
    [solar(y, 9, 2), "Quốc khánh"],
  ];
  if (tet) {
    const t = local(tet), d = new Date(t);
    out.push([new Date(y, d.getMonth(), d.getDate() - 1).getTime(), "Giao thừa"]);
    for (let i = 0; i < 4; i++) out.push([new Date(y, d.getMonth(), d.getDate() + i).getTime(), i ? `Tết mùng ${i + 1}` : "Tết Nguyên đán"]);
  }
  if (gio) out.push([local(gio), "Giỗ Tổ Hùng Vương"]);
  return out;
}

/** Holidays in [from, to) as day start → title. */
export function holidays(from: number, to: number): Hols {
  const m: Hols = new Map();
  const y0 = new Date(from).getFullYear(), y1 = new Date(to).getFullYear();
  for (let y = y0; y <= y1; y++) for (const [d, t] of year(y)) if (d >= from && d < to) m.set(d, t);
  return m;
}
