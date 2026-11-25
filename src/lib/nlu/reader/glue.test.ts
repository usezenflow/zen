// Dictation writes a clock glued ("0800"); with a cue it reads as a time, without one the number stays text.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };
const title = (s: string) => read(s, { ref: REF, source: "voice" }).items.map(itemAction)[0]?.title;

it("a glued clock after a cue or before a part of day is stripped like 08:00", () => {
  for (const s of ["họp nhóm ngày mai lúc 0800", "họp nhóm ngày mai 1430 chiều", "họp nhóm ngày mai từ 0800 đến 0930", "họp nhóm ngày mai lúc 800", "họp nhóm ngày mai lúc 2030", "họp nhóm ngày mai 0800", "họp nhóm ngày mai 0800 đến 0930"])
    expect(title(s), s).toBe(title(s.replace(/\b(\d{1,2})(\d{2})\b/g, "$1:$2")));
  expect(title("họp nhóm ngày mai lúc 0800")).toBe("Họp nhóm");
});

it("numbers without a cue and a leading zero stay text", () => {
  expect(title("họp nhóm phòng 1430")).toContain("1430");
  expect(title("gọi 0912345678")).toContain("0912345678");
});
