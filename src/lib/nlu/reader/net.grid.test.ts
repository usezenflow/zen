// "4g" / "5g" are the mobile networks, not clocks, unless a time cue is beside them ("4g chiều", "4g30", "lúc 4g"); an unaccented
// "ram" is the memory unless a lunar word is in the line. `pnpm vitest run net.grid` runs it.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

// Mon 16/11/2026 09:46
const REF = { y: 2026, m: 11, d: 16, h: 9, mi: 46 };
const acts = (said: string) => read(said, { ref: REF, source: "typed" }).items.map(itemAction);

const NETS = ["4g", "5g", "4G", "5G"];
const NET_FRAMES = [
  "làm %X% cho team", "viết %X% cho dự án", "đăng ký gói %X%", "sim %X% viettel", "mạng %X% chậm", "bật sóng %X%",
  "đổi router %X%", "mua data %X%", "%X% cho dự án ngày mai", "kiểm tra wifi và %X%", "test %X% ở nhà", "nghiên cứu %X% trước thứ 6",
];

it("4g and 5g beside no time cue are the term, never a clock", () => {
  const miss: string[] = [];
  let n = 0;
  for (const x of NETS) for (const f of NET_FRAMES) {
    n++;
    const said = f.replace("%X%", x);
    const a = acts(said);
    const t = a.map((i) => i.title).join("|");
    // a clock would make a fixed start at 04:00 or 16:00 and eat the word
    if (a.some((i) => /T(?:04|05|16|17):00:00$/.test(i.when ?? "")) || !t.includes(x.toUpperCase())) miss.push(`${said} -> ${t} ${a.map((i) => i.when)}`);
  }
  expect(miss.slice(0, 30)).toEqual([]);
  expect(n).toBe(NETS.length * NET_FRAMES.length);
});

it("4g and 5g with a time cue stay clocks", () => {
  const miss: string[] = [];
  for (const [said, hh] of [
    ["họp 4g chiều", 16], ["họp 5g chiều", 17], ["họp 4g30", 16], ["họp 5g30", 17], ["họp lúc 4g", 16], ["họp lúc 5g", 17], ["họp 4g sáng", 4],
    ["họp 5g sáng", 5], ["họp mai 4g chiều", 16], ["gặp thứ 6 5g chiều", 17], ["họp 4g chiều mai", 16], ["họp vào lúc 5g30 chiều", 17], ["chiều 4g30 họp", 16],
  ] as [string, number][]) {
    const w = acts(said).map((i) => i.when).join("");
    if (!new RegExp(`T0?${hh}:\\d\\d:00$`).test(w)) miss.push(`${said} -> ${w}`);
  }
  expect(miss).toEqual([]);
});

const RAM_FRAMES = ["nâng cấp %X%", "mua %X% 16gb", "mua %X% mới cho laptop", "thay %X% máy tính", "cắm thêm %X% vào pc", "%X% laptop bị lỗi", "xem lại %X% trước thứ 6", "cài thêm %X% cho máy ảo"];

it("an unaccented ram stays in the title as RAM", () => {
  const miss: string[] = [];
  for (const f of RAM_FRAMES) {
    const said = f.replace("%X%", "ram");
    const a = acts(said);
    if (a.length !== 1 || !a[0].title?.includes("RAM")) miss.push(`${said} -> ${a.map((i) => i.title)}`);
  }
  expect(miss).toEqual([]);
});

it("ram beside a lunar word stays the full moon, not RAM", () => {
  for (const said of ["cúng ram tháng giêng", "ram âm lịch đi chùa", "ram tháng 3 cúng"])
    expect(acts(said).map((i) => i.title).join("|"), said).not.toContain("RAM");
});
