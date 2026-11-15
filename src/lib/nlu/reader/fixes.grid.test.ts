// Generated grids for the reader fixes of the Nov 2026 review: every case's answer is worked out here, not by the reader,
// and each checks fixed (a said clock is a block) and flexible (a day, a part, a deadline) outputs both.
import { describe, expect, it } from "vitest";
import { itemAction } from "../adapt";
import { think } from "../commands";
import type { ReaderWC } from "../shared";
import { lengthMin } from "./calendar";
import { read } from "./reader";

type WC = Required<Pick<ReaderWC, "y" | "m" | "d">> & { h: number; mi: number };
const SUN = { y: 2026, m: 11, d: 15, h: 10, mi: 0 }; // Sun 15/11/2026 10:00
const pad = (n: number) => String(n).padStart(2, "0");
const day = (w: { y: number; m: number; d: number }, add = 0) => {
  const t = new Date(Date.UTC(w.y, w.m - 1, w.d + add));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const hm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const items = (s: string, ref: WC = SUN) => read(s, { ref, source: "typed" }).items;
const acts = (s: string, ref: WC = SUN) => items(s, ref).map(itemAction);
/** Each failing case as one line, so a grid shows every miss at once. */
const check = (rows: [string, unknown, unknown][]) =>
  expect(rows.filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want)).map(([s, g, w]) => `${s}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`)).toEqual([]);

describe("grid: commands need their words with accents and a strong match", () => {
  const now = new Date("2026-11-15T03:00:00Z");
  const tasks = [{ id: "a", title: "Báo cáo nhóm" }, { id: "b", title: "Tài liệu môn web" }, { id: "c", title: "Đề cương" }, { id: "d", title: "Họp phòng 302" }];
  it("each verb, accented or typed bare, acts on the task it names", () => {
    const rows: [string, unknown, unknown][] = [];
    for (const [verbs, op] of [[["xoá", "xóa", "xoa", "huỷ", "hủy", "huy", "bỏ", "bo"], "delete"], [["xong", "hoàn thành", "hoan thanh"], "done"]] as const)
      for (const v of verbs) for (const t of tasks) { const s = `${v} ${t.title.toLowerCase()}`; rows.push([s, think(s, now, tasks).map((a) => [a.op, a.target]), [[op, t.id]]]); }
    for (const v of ["dời", "đổi", "chuyển", "đẩy", "lùi", "doi", "chuyen"]) for (const sep of ["sang", "qua", "tới", "đến", "toi", "den"]) for (const t of tasks) {
      const s = `${v} ${t.title.toLowerCase()} ${sep} mai 9h`;
      rows.push([s, think(s, now, tasks).map((a) => [a.op, a.target, a.when]), [["edit", t.id, "2026-11-16T09:00:00"]]]);
    }
    check(rows);
  });
  it("a look-alike word, a weak match or a due time is a create", () => {
    const rows: [string, unknown, unknown][] = [];
    const creates = [
      "bổ sung tài liệu môn web mai", "bỗ sung tài liệu môn web", "đề cương nộp vào thứ 6", "đề cương nộp sang tuần", "dọn phòng tối nay", "dọn phòng 302 tối nay", "để sách lên phòng tối nay",
      "dời lịch tối nay", "hoàn thành báo cáo môn toán trước thứ 6", "hoàn thành báo cáo nhóm trước thứ 6", "hoàn thành báo cáo nhóm vào thứ 6", "hoàn thành tài liệu môn web hạn mai",
    ];
    for (const s of creates) rows.push([s, think(s, now, tasks).every((a) => a.op === "create") && think(s, now, tasks).length > 0, true]);
    // a command whose words name no task is not understood, not a guess at the nearest one
    for (const s of ["xong báo cáo môn toán thứ 6", "xoá họp lớp", "xong tài liệu môn toán", "xong báo cáo môn toán"]) rows.push([s, think(s, now, tasks), []]);
    // a short name the title holds whole still names it
    for (const [s, id] of [["xong báo cáo rồi", "a"], ["xong tài liệu", "b"], ["xoá họp 302 đi", "d"]]) rows.push([s, think(s, now, tasks).map((a) => a.target), [id]]);
    check(rows);
  });
  it("a note keeps every line", () => {
    expect(think("ghi chú: dòng 1\ndòng 2", now, tasks)).toEqual([{ op: "note", title: "dòng 1\ndòng 2" }]);
  });
});

describe("grid: a said start snaps to the 15-minute grid", () => {
  it("every hh:mm at 5-minute steps, fixed and as a deadline", () => {
    const rows: [string, unknown, unknown][] = [];
    for (let t = 0; t < 1440; t += 5) {
      const h = Math.floor(t / 60), mi = t % 60;
      if (h === 0 && mi === 0) continue; // 0:00 ends its day, see the midnight grid
      const said = `${pad(h)}:${pad(mi)}`;
      const q = Math.round(t / 15) * 15;
      const want = q === 1440 ? `${day(SUN, 2)}T00:00:00` : `${day(SUN, 1)}T${hm(q)}:00`;
      const a = acts(`họp ${said} mai`)[0];
      rows.push([`họp ${said} mai`, [a?.when, a?.fixed], [want, "busy"]]);
      // a deadline keeps its minute and stays flexible
      const d = acts(`nộp bài trước ${said} mai`)[0];
      rows.push([`nộp bài trước ${said} mai`, [d?.deadline, d?.fixed], [`${day(SUN, 1)}T${said}:00`, undefined]]);
    }
    check(rows);
  });
});

describe("grid: a said day keeps today; midnight ends the day it names", () => {
  it("hôm nay / nay with every clock: today, flagged when past", () => {
    const rows: [string, unknown, unknown][] = [];
    for (let h = 5; h <= 23; h++) for (const [w, said] of [["hôm nay", `${h}h`], ["hôm nay", `lúc ${h}h`], ["", `${h}h hôm nay`]] as const) {
      const s = `họp ${w} ${said}`.replace(/\s+/g, " ");
      const it0 = items(s)[0];
      const past = h * 60 < 600;
      rows.push([s, [it0?.startsAt, it0?.flags.includes("date_past")], [`${day(SUN)} ${pad(h)}:00`, past]]);
    }
    for (const [part, hs] of [["sáng", [5, 6, 7, 8, 9, 10, 11]], ["chiều", [1, 2, 3, 4, 5]], ["tối", [6, 7, 8, 9, 10, 11]]] as const)
      for (const h of hs) {
        const s = `họp ${h}h ${part} nay`;
        const H = part === "sáng" ? h : h + 12;
        const it0 = items(s)[0];
        rows.push([s, [it0?.startsAt, it0?.flags.includes("date_past")], [`${day(SUN)} ${pad(H)}:00`, H * 60 < 600]]);
      }
    // a day already gone is no tomorrow either
    for (const h of [8, 9, 14, 20]) rows.push([`họp hôm qua ${h}h`, items(`họp hôm qua ${h}h`)[0]?.startsAt?.slice(0, 10) !== day(SUN, 1), true]);
    check(rows);
  });
  it("small hours of tonight are after midnight", () => {
    const rows: [string, unknown, unknown][] = [];
    for (const h of [1, 2, 3, 4]) for (const s of [`họp ${h}h đêm nay`, `đêm nay ${h}h họp`]) rows.push([s, items(s)[0]?.startsAt, `${day(SUN, 1)} ${pad(h)}:00`]);
    for (const s of ["họp 12h đêm nay", "họp 0h hôm nay", "họp 0h đêm nay", "họp lúc nửa đêm", "họp 12h đêm"]) rows.push([s, items(s)[0]?.startsAt, `${day(SUN, 1)} 00:00`]);
    // as a deadline, midnight is the day's last minute: tonight, not tomorrow night
    for (const s of ["submit by midnight tonight", "nộp bài trước nửa đêm", "nộp bài trước 24h", "nộp bài 24h hôm nay", "nộp bài trước 23h59", "nộp bài trước 0h hôm nay", "nộp bài trước 0h mai"]) rows.push([s, items(s)[0]?.deadline, `${day(SUN)} 23:59`]);
    for (const [d, n] of [["thứ 6", 5], ["mai", 1], ["20/11", 5]] as const) rows.push([`nộp bài trước 24h ${d}`, items(`nộp bài trước 24h ${d}`)[0]?.deadline, `${day(SUN, n)} 23:59`]);
    check(rows);
  });
  it("a guessed start is never in the past; a meeting with no clock has no start, it is a plan in its day", () => {
    const rows: [string, unknown, unknown][] = [];
    for (let h = 0; h < 23; h++) for (const s of ["thi cuối tuần", "họp hôm nay", "họp ngày 15"]) {
      const ref = { ...SUN, h, mi: 20 };
      const it = items(s, ref)[0];
      const at = it?.startsAt;
      rows.push([`${s} @${h}:20`, at ? at >= `${day(SUN)} ${pad(h)}:20` : s.startsWith("họp") && it?.type === "PLAN", true]);
    }
    check(rows);
  });
});

describe("grid: clock ranges and until-clocks", () => {
  it("a part of the day after the end clock is the end's", () => {
    const rows: [string, unknown, unknown][] = [];
    for (let s = 7; s <= 11; s++) for (let e = 1; e <= 5; e++) for (const fmt of [`họp từ ${s}h đến ${e}h chiều`, `họp ${s}h đến ${e}h chiều`, `họp ${s}h-${e}h chiều`]) {
      const a = acts(fmt)[0];
      const end = (e + 12) * 60;
      const startDay = end <= 600 ? day(SUN, 1) : day(SUN); // under way at 10:00 stays today
      rows.push([fmt, [a?.when, a?.effortMinutes, a?.fixed], [`${startDay}T${pad(s)}:00:00`, end - s * 60, "busy"]]);
    }
    // both in the afternoon or evening: the part names both clocks
    for (const [s, e, p, off] of [[1, 5, "chiều", 12], [2, 4, "chiều", 12], [7, 9, "tối", 12], [8, 10, "tối", 12]] as const) {
      const fmt = `họp ${s}h đến ${e}h ${p}`;
      const a = acts(fmt)[0];
      rows.push([fmt, [a?.when, a?.effortMinutes], [`${day(SUN)}T${pad(s + off)}:00:00`, (e - s) * 60]]);
    }
    check(rows);
  });
  it("a lone clock after đến/tới ends the block", () => {
    const rows: [string, unknown, unknown][] = [];
    // shortcut: "học bài tới 1h" still reads "1h" as a length; "đến" and other verbs carry the until
    for (const [v, t] of [["tới", "chơi game"], ["tới", "thức"], ["đến", "chơi game"], ["đến", "học bài"], ["đến", "xem phim"]]) {
      for (const h of [1, 2, 3, 4]) {
        const it0 = items(`${t} ${v} ${h}h`)[0];
        const end = it0?.startsAt && new Date(Date.parse(`${it0.startsAt.replace(" ", "T")}:00Z`) + (it0.durationMinutes ?? 0) * 60000).toISOString().slice(0, 16).replace("T", " ");
        rows.push([`${t} ${v} ${h}h`, end, `${day(SUN, 1)} ${pad(h)}:00`]);
      }
      for (const h of [11, 15, 22, 23]) {
        const it0 = items(`${t} ${v} ${h}h`)[0];
        const end = it0?.startsAt && new Date(Date.parse(`${it0.startsAt.replace(" ", "T")}:00Z`) + (it0.durationMinutes ?? 0) * 60000).toISOString().slice(0, 16).replace("T", " ");
        rows.push([`${t} ${v} ${h}h`, end, `${day(SUN)} ${pad(h)}:00`]);
      }
    }
    check(rows);
  });
});

describe("grid: relative and month days", () => {
  it("mai and mốt stay a day apart through the small hours", () => {
    const rows: [string, unknown, unknown][] = [];
    for (let h = 0; h < 24; h++) {
      const ref = { y: 2026, m: 11, d: 16, h, mi: 30 };
      const mai = items("họp mai 9h", ref)[0]?.startsAt?.slice(0, 10);
      const mot = items("họp mốt 9h", ref)[0]?.startsAt?.slice(0, 10);
      const base = h < 4 ? 0 : 1;
      rows.push([`mai/mốt @${h}:30`, [mai, mot], [day(ref, base), day(ref, base + 1)]]);
    }
    check(rows);
  });
  it("ngày N is the next date with that day number; a day past its month is flagged", () => {
    const rows: [string, unknown, unknown][] = [];
    for (const [y, m, refD] of [[2026, 11, 15], [2026, 11, 30], [2026, 12, 31], [2027, 1, 31], [2027, 2, 1], [2027, 2, 28]] as const)
      for (let d = 1; d <= 31; d++) {
        const ref = { y, m, d: refD, h: 10, mi: 0 };
        let w: { y: number; m: number; d: number } = { y, m, d };
        // this month while the day is still to come and the month has it, else the next month that does
        for (let k = 0; (k === 0 && d < refD) || d > new Date(Date.UTC(w.y, w.m, 0)).getUTCDate(); k++) w = w.m === 12 ? { y: w.y + 1, m: 1, d } : { y: w.y, m: w.m + 1, d };
        const a = acts(`dọn phòng ngày ${d}`, ref)[0];
        rows.push([`ngày ${d} @${y}-${m}-${refD}`, [a?.when?.slice(0, 10), a?.fixed], [day(w), undefined]]);
      }
    for (const s of ["họp 31/11", "nộp bài 31/4", "thi 30/2 9h", "họp 31/6"]) rows.push([s, items(s)[0]?.flags.includes("date_clamped"), true]);
    for (const s of ["họp 30/11", "nộp bài 30/4", "thi 28/2 9h"]) rows.push([s, items(s)[0]?.flags.includes("date_clamped"), false]);
    check(rows);
  });
});

describe("grid: lengths in hours and minutes", () => {
  it("1h30p and 2 tiếng 15 phút are one length; with a part of the day it is a clock", () => {
    const rows: [string, unknown, unknown][] = [];
    for (let h = 1; h <= 3; h++) for (const m of [10, 15, 20, 30, 45]) {
      for (const f of [`${h}h${m}p`, `${h}h ${m}p`, `${h} tiếng ${m} phút`, `${h}h${m} phút`]) {
        const a = acts(`học ${f}`)[0];
        rows.push([`học ${f}`, [a?.effortMinutes, a?.fixed], [lengthMin(h * 60 + m), undefined]]);
      }
      // a said clock: fixed at the quarter-hour
      const q = Math.round(m / 15) * 15;
      const c = acts(`họp ${h}h${m}p chiều mai`)[0];
      rows.push([`họp ${h}h${m}p chiều mai`, [c?.when, c?.fixed], [`${day(SUN, 1)}T${hm((h + 12) * 60 + q)}:00`, "busy"]]);
      const l = acts(`họp lúc ${h}h${m}p chiều mai`)[0];
      rows.push([`họp lúc ${h}h${m}p chiều mai`, l?.when, `${day(SUN, 1)}T${hm((h + 12) * 60 + q)}:00`]);
    }
    check(rows);
  });
});

describe("grid: holidays with an activity, and vague spans", () => {
  it("an activity on a holiday is an item on that day", () => {
    const rows: [string, unknown, unknown][] = [];
    const HOL: [string, string][] = [["tết", "2027-02-06"], ["noel", "2026-12-25"], ["giáng sinh", "2026-12-25"], ["trung thu", "2027-09-15"], ["quốc khánh", "2027-09-02"], ["halloween", "2027-10-31"]];
    for (const [hn, d] of HOL) for (const t of ["họp lớp", "đi chơi", "về quê", "thi"]) {
      const a = acts(`${t} ${hn}`).filter((x) => !/^Ôn tập/.test(x.title ?? ""))[0];
      rows.push([`${t} ${hn}`, [(a?.when ?? a?.deadline)?.slice(0, 10), a?.title?.toLowerCase().startsWith(t)], [d, true]]);
    }
    check(rows);
  });
  it("an exam in a vague week or month blocks no days", () => {
    const rows: [string, unknown, unknown][] = [];
    for (const sp of ["tuần sau", "tuần tới", "tháng sau", "tuần sau nữa"]) for (const t of ["thi", "thi cuối kỳ", "bảo vệ"]) {
      const r = items(`${t} ${sp}`);
      rows.push([`${t} ${sp}`, r.some((x) => x.type === "BUSY" && (x.durationMinutes ?? 0) >= 1440), false]);
    }
    // written dates still block their days
    rows.push(["thi từ 20/11 đến 25/11", items("thi từ 20/11 đến 25/11").some((x) => x.type === "BUSY" && x.durationMinutes === 6 * 1440), true]);
    check(rows);
  });
});

describe("grid: titles keep their own words", () => {
  it("look-alike cue words stay in the title", () => {
    const rows: [string, unknown, unknown][] = [];
    for (const [t, when] of [["Dọn hàng", "tối nay"], ["Đề cương", "thứ 6"], ["Rửa chén sau khi ăn trưa", ""], ["Bán hàng", "tối mai"], ["Đề thi thử", "mai"]] as const)
      for (const s of [`${t} ${when}`, `${when} ${t}`].map((x) => x.trim())) rows.push([s, items(s)[0]?.title, t]);
    // a repeat word before a part and a weekday still repeats, and leaves the title
    for (const s of ["học tiếng anh mỗi tối thứ 2 4 6 lúc 8h", "học tiếng anh hàng tối", "học tiếng anh mỗi tối 1 tiếng"]) rows.push([s, [items(s)[0]?.title, !!items(s)[0]?.rrule], ["Học tiếng anh", true]]);
    check(rows);
  });
});
