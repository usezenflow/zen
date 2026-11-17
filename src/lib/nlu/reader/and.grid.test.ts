import { describe, expect, it } from "vitest";
import { readActions } from "../adapt";
import type { Action } from "../../types";

// "và" (and ",") splits a clause into one task per side when every side has its own task verb
const now = new Date("2026-11-17T09:00:00+07:00");
const SIDES = ["học toán", "đọc sách", "viết báo cáo", "làm slide", "giặt đồ", "mua sữa", "gọi điện cho mẹ", "nộp thuế", "chạy bộ", "sửa bug login"];
const TIMES = ["", "mai", "chiều nay", "trong tháng này", "trước 20/11", "tuần sau"];
const cap = (s: string) => s[0].toLocaleUpperCase("vi") + s.slice(1);
const fields = (a: Action | undefined) => a && { when: a.when, deadline: a.deadline, notBefore: a.notBefore, notAfter: a.notAfter, repeat: a.repeat };
const join = (sides: string[], how: "und" | "comma" | "comma-va") =>
  how === "und"
    ? sides.join(" và ")
    : how === "comma"
      ? sides.join(", ")
      : sides.slice(0, -1).join(", ") + " và " + sides.at(-1);

/** Pairs, and triples, of sides joined three ways. */
const cases: { sides: string[]; how: "und" | "comma" | "comma-va" }[] = [];
for (let i = 0; i < SIDES.length; i++)
  for (let j = i + 1; j < SIDES.length; j++) {
    cases.push({ sides: [SIDES[i], SIDES[j]], how: "und" });
    cases.push({ sides: [SIDES[i], SIDES[j]], how: "comma" });
    for (let k = j + 1; k < SIDES.length; k += 3) cases.push({ sides: [SIDES[i], SIDES[j], SIDES[k]], how: "comma-va" });
  }

describe("và splits tasks that each name their own verb", () => {
  for (const { sides, how } of cases)
    for (const time of TIMES)
      for (const edge of ["trailing", "leading"] as const) {
        if (!time && edge === "leading") continue;
        const at = (s: string) => (!time ? s : edge === "trailing" ? `${s} ${time}` : `${time} ${s}`);
        it(at(join(sides, how)), () => {
          const acts = readActions(at(join(sides, how)), now);
          expect(acts.map((a) => a.title?.toLowerCase()).sort()).toEqual(sides.map((s) => cap(s).toLowerCase()).sort());
          // each side read alone with the same time is its expected task
          for (const s of sides) {
            const want = readActions(at(s), now)[0];
            // a span over a list is from today, as the reader reads any list of tasks: "trong tháng này" is from today to month end
            if (time === "trong tháng này" && sides.length > 1) want.notBefore ??= "2026-11-17T00:00:00";
            const got = acts.find((a) => a.title?.toLowerCase() === cap(s).toLowerCase());
            expect(fields(got)).toEqual(fields(want));
          }
        });
      }
});

describe("a shared verb over objects stays one task", () => {
  it("gặp Lan và Minh tối nay", () => {
    expect(readActions("gặp Lan và Minh tối nay", now).map((a) => a.title)).toEqual(["Gặp Lan và Minh"]);
  });
  it("gặp Minh tối nay keeps the name", () => {
    expect(readActions("gặp Minh tối nay", now).map((a) => a.title)).toEqual(["Gặp Minh"]);
  });
  it("mua sữa và trứng", () => {
    expect(readActions("mua sữa và trứng", now).map((a) => a.title)).toEqual(["Mua sữa và trứng"]);
  });
  it("code b-tree và lsm keeps its two titles", () => {
    expect(readActions("code b-tree và lsm", now).map((a) => a.title)).toEqual(["Code b-tree", "Code lsm"]);
  });
});

describe("existing part, clock and weekday lists", () => {
  it("chạy bộ sáng và tối mai: one series, two parts", () => {
    const acts = readActions("chạy bộ sáng và tối mai", now);
    expect(acts).toHaveLength(2);
    expect(new Set(acts.map((a) => a.title))).toEqual(new Set(["Chạy bộ"]));
  });
  it("họp 9h và 14h mai: two clocks", () => {
    expect(readActions("họp 9h và 14h mai", now).map((a) => a.when)).toEqual(["2026-11-18T09:00:00", "2026-11-18T14:00:00"]);
  });
  it("thứ 3 và thứ 5 hàng tuần học tiếng anh: one repeat", () => {
    const acts = readActions("thứ 3 và thứ 5 hàng tuần học tiếng anh", now);
    expect(acts).toHaveLength(1);
    expect(acts[0].repeat).toContain("BYDAY=TU,TH");
  });
});

describe("title words that are not cues", () => {
  it("rửa xe chiều nay keeps xe", () => {
    expect(readActions("rửa xe chiều nay", now).map((a) => a.title)).toEqual(["Rửa xe"]);
  });
  it("dọn nhà, nấu cơm và rửa xe chiều nay: three tasks, one time", () => {
    const acts = readActions("dọn nhà, nấu cơm và rửa xe chiều nay", now);
    expect(acts.map((a) => a.title).sort()).toEqual(["Dọn nhà", "Nấu cơm", "Rửa xe"]);
    expect(new Set(acts.map((a) => a.when))).toEqual(new Set(["2026-11-17T13:00:00"]));
  });
});

describe("a time inside one side stays with it", () => {
  it("học toán mai và đọc sách thứ 6", () => {
    const acts = readActions("học toán mai và đọc sách thứ 6", now);
    expect(acts.find((a) => a.title === "Học toán")?.when?.slice(0, 10)).toBe("2026-11-18");
    expect(acts.find((a) => a.title === "Đọc sách")?.when?.slice(0, 10)).toBe("2026-11-20");
  });
  it("học toán và đọc sách trong tháng này: toán is no daily repeat", () => {
    const toan = readActions("học toán và đọc sách trong tháng này", now).find((a) => a.title === "Học toán");
    expect(toan?.repeat).toBeUndefined();
    expect(toan?.deadline?.slice(0, 10)).toBe("2026-11-30");
  });
});
