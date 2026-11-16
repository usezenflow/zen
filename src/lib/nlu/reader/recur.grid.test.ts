// Generated repeat sentences, each with the rule worked out here: every day, weekdays, weekends, a set of weekdays,
// once every n days/weeks/months, n times a week, and days left out. Each phrase is said before and after the title,
// with and without a clock: a clock makes a fixed block, no clock a flexible plan. GRID_OUT=<file> writes the misses.
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

// Sat 14/11/2026 06:00
const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };
const WK = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
const WE = "FREQ=WEEKLY;BYDAY=SA,SU";
// [phrase, rule, may a clock follow it (false when the phrase ends in a part of day that would change the clock's read)]
const PHRASES: [string, string][] = [
  // every day
  ["mỗi ngày", "FREQ=DAILY"], ["hàng ngày", "FREQ=DAILY"], ["hằng ngày", "FREQ=DAILY"], ["ngày nào cũng", "FREQ=DAILY"], ["hôm nào cũng", "FREQ=DAILY"],
  ["ngày nào mình cũng", "FREQ=DAILY"], ["mỗi tối", "FREQ=DAILY"], ["hàng tối", "FREQ=DAILY"], ["tối nào cũng", "FREQ=DAILY"], ["sáng nào cũng", "FREQ=DAILY"],
  ["chiều nào cũng", "FREQ=DAILY"], ["đêm nào cũng", "FREQ=DAILY"], ["mỗi sáng", "FREQ=DAILY"], ["hằng đêm", "FREQ=DAILY"], ["every day", "FREQ=DAILY"], ["daily", "FREQ=DAILY"],
  // weekdays
  ["ngày thường", WK], ["các ngày trong tuần", WK], ["mỗi ngày trong tuần", WK], ["thứ 2 đến thứ 6", WK], ["từ thứ 2 đến thứ 6", WK], ["thứ hai đến thứ sáu", WK],
  ["T2-T6", WK], ["t2 đến t6", WK], ["từ thứ 2 tới thứ 6", WK], ["every weekday", WK], ["weekdays", WK], ["ngày thường nào cũng", WK],
  // weekends
  ["mỗi cuối tuần", WE], ["cuối tuần nào cũng", WE], ["hàng cuối tuần", WE], ["thứ 7 và chủ nhật hàng tuần", WE], ["mỗi thứ 7 và chủ nhật", WE], ["every weekend", WE],
  // one weekday
  ["mỗi thứ 2", "FREQ=WEEKLY;BYDAY=MO"], ["thứ 2 hàng tuần", "FREQ=WEEKLY;BYDAY=MO"], ["thứ hai nào cũng", "FREQ=WEEKLY;BYDAY=MO"], ["mỗi chủ nhật", "FREQ=WEEKLY;BYDAY=SU"],
  ["chủ nhật nào cũng", "FREQ=WEEKLY;BYDAY=SU"], ["thứ 6 hàng tuần", "FREQ=WEEKLY;BYDAY=FR"], ["every friday", "FREQ=WEEKLY;BYDAY=FR"], ["mỗi T4", "FREQ=WEEKLY;BYDAY=WE"],
  // a set of weekdays
  ["mỗi thứ 2, 4, 6", "FREQ=WEEKLY;BYDAY=MO,WE,FR"], ["thứ 2, thứ 4, thứ 6 hàng tuần", "FREQ=WEEKLY;BYDAY=MO,WE,FR"], ["thứ 2 4 6 hàng tuần", "FREQ=WEEKLY;BYDAY=MO,WE,FR"],
  ["mỗi thứ 3 và thứ 5", "FREQ=WEEKLY;BYDAY=TU,TH"], ["thứ 3 và thứ 5 hàng tuần", "FREQ=WEEKLY;BYDAY=TU,TH"], ["thứ 3, thứ 5 nào cũng", "FREQ=WEEKLY;BYDAY=TU,TH"],
  ["T3 T5 hàng tuần", "FREQ=WEEKLY;BYDAY=TU,TH"], ["mỗi T2 T4", "FREQ=WEEKLY;BYDAY=MO,WE"], ["every mon and wed", "FREQ=WEEKLY;BYDAY=MO,WE"], ["mỗi thứ 2 và thứ 7", "FREQ=WEEKLY;BYDAY=MO,SA"],
  // once every n
  ["cách ngày", "FREQ=DAILY;INTERVAL=2"], ["2 ngày 1 lần", "FREQ=DAILY;INTERVAL=2"], ["mỗi 2 ngày", "FREQ=DAILY;INTERVAL=2"], ["3 ngày một lần", "FREQ=DAILY;INTERVAL=3"], ["hai ngày một lần", "FREQ=DAILY;INTERVAL=2"],
  ["mỗi tuần", "FREQ=WEEKLY"], ["hàng tuần", "FREQ=WEEKLY"], ["tuần nào cũng", "FREQ=WEEKLY"], ["mỗi tuần một lần", "FREQ=WEEKLY"], ["tuần 1 lần", "FREQ=WEEKLY"], ["một tuần một lần", "FREQ=WEEKLY"], ["1 tuần 1 lần", "FREQ=WEEKLY"],
  ["cách tuần", "FREQ=WEEKLY;INTERVAL=2"], ["2 tuần 1 lần", "FREQ=WEEKLY;INTERVAL=2"], ["mỗi 2 tuần", "FREQ=WEEKLY;INTERVAL=2"], ["hai tuần một lần", "FREQ=WEEKLY;INTERVAL=2"],
  ["mỗi tháng", "FREQ=MONTHLY"], ["mỗi 2 tháng", "FREQ=MONTHLY;INTERVAL=2"], ["2 tháng 1 lần", "FREQ=MONTHLY;INTERVAL=2"], ["cách tháng", "FREQ=MONTHLY;INTERVAL=2"],
  ["hai tháng một lần", "FREQ=MONTHLY;INTERVAL=2"], ["mỗi 3 tháng", "FREQ=MONTHLY;INTERVAL=3"], ["hàng tháng", "FREQ=MONTHLY"], ["tháng nào cũng", "FREQ=MONTHLY"], ["tháng 1 lần", "FREQ=MONTHLY"], ["mỗi tháng một lần", "FREQ=MONTHLY"], ["một tháng một lần", "FREQ=MONTHLY"],
  // n a week
  ["3 buổi một tuần", "FREQ=WEEKLY;BYDAY=MO,WE,FR"], ["ba buổi một tuần", "FREQ=WEEKLY;BYDAY=MO,WE,FR"], ["mỗi tuần 3 buổi", "FREQ=WEEKLY;BYDAY=MO,WE,FR"], ["tuần 3 buổi", "FREQ=WEEKLY;BYDAY=MO,WE,FR"],
  ["2 lần/tuần", "FREQ=WEEKLY;BYDAY=MO,TH"], ["mỗi tuần 2 lần", "FREQ=WEEKLY;BYDAY=MO,TH"], ["1 tuần 2 lần", "FREQ=WEEKLY;BYDAY=MO,TH"], ["hai lần một tuần", "FREQ=WEEKLY;BYDAY=MO,TH"],
  // days left out
  ["mỗi ngày trừ chủ nhật", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR,SA"], ["hàng ngày trừ CN", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR,SA"], ["ngày nào cũng trừ thứ 7", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR,SU"],
  ["mỗi ngày trừ thứ 7 và CN", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"], ["mỗi ngày trừ cuối tuần", WK], ["tối nào cũng trừ thứ 7", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR,SU"],
  ["mỗi tối trừ chủ nhật", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR,SA"], ["ngày thường trừ thứ 4", "FREQ=WEEKLY;BYDAY=MO,TU,TH,FR"], ["mỗi ngày trừ thứ 2 và thứ 5", "FREQ=DAILY;BYDAY=TU,WE,FR,SA,SU"],
  ["every day except sunday", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR,SA"],
];
const TITLES = ["Giải code", "Đọc sách", "Chạy bộ", "Học tiếng Anh", "Tập gym"];
const PART = /(sáng|chiều|tối|đêm|trưa)/;
interface Case { p: string; said: string; title: string; rule: string; fixed: boolean }
function cases(): Case[] {
  const out: Case[] = [];
  for (const [p, rule] of PHRASES)
    for (const t of TITLES) {
      // a part of day in the phrase sets the clock's half: "tối nào cũng ... 9h" is 21:00
      const clock = PART.exec(p)?.[1] === "sáng" ? "6h" : PART.test(p) ? "9h" : "lúc 19h";
      const cap = (s: string) => s[0].toLocaleUpperCase("vi") + s.slice(1);
      out.push({ p, said: cap(`${p} ${t.toLowerCase()}`), title: t, rule, fixed: false });
      out.push({ p, said: `${t} ${p}`, title: t, rule, fixed: false });
      out.push({ p, said: cap(`${p} ${t.toLowerCase()} ${clock}`), title: t, rule, fixed: true });
      out.push({ p, said: `${t} ${clock} ${p}`, title: t, rule, fixed: true });
    }
  return out;
}
const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").trim();

function miss(c: Case): string | undefined {
  const all = read(c.said, { ref: REF, source: "typed" }).items.map(itemAction);
  const shown = () => all.map((a) => `${a.title} when=${a.when ?? ""} fx=${a.fixed ?? ""} rp=${a.repeat ?? ""}`).join(" ; ");
  const fail = (why: string) => `${why} | ${c.said} | want ${c.rule} | ${shown()}`;
  // a recurring task may be one row per day; every row must carry the rule
  if (!all.length) return fail("none");
  if (all.some((a) => strip(a.title ?? "") !== strip(c.title))) return fail("title");
  if (all.some((a) => (a.repeat ?? "").replace(/;(?:UNTIL|COUNT)=[^;]*/g, "") !== c.rule)) return fail("rule");
  if (all.some((a) => !!a.fixed !== c.fixed)) return fail(c.fixed ? "not-fixed" : "fixed");
  return undefined;
}

it("recur grid: every repeat phrase reads to its rule, title clean, fixed only with a clock", () => {
  const res = cases().map(miss).filter((x): x is string => !!x);
  if (process.env.GRID_OUT) writeFileSync(process.env.GRID_OUT, res.join("\n"));
  expect(res.slice(0, 15)).toEqual([]);
});

// Repeats combined with the rest of a sentence: a part of day, a clock or a clock range, a start ("từ" is the first day),
// an end ("đến" is the series' UNTIL), a place and a length. The first row is the first matching day on or after the start.
const CREP: [string, string, string?][] = [
  ["mỗi ngày", "FREQ=DAILY"], ["tối nào cũng", "FREQ=DAILY", "tối"], ["ngày thường", WK], ["mỗi thứ 2, 4, 6", "FREQ=WEEKLY;BYDAY=MO,WE,FR"],
  ["thứ 3 và thứ 5 hàng tuần", "FREQ=WEEKLY;BYDAY=TU,TH"], ["cách ngày", "FREQ=DAILY;INTERVAL=2"], ["mỗi cuối tuần", WE],
  ["mỗi ngày trừ chủ nhật", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR,SA"], ["3 buổi một tuần", "FREQ=WEEKLY;BYDAY=MO,WE,FR"], ["sáng nào cũng", "FREQ=DAILY", "sáng"],
];
const CPART: [string, string?][] = [["", undefined], ["buổi sáng", "sáng"], ["vào buổi tối", "tối"], ["buổi chiều", "chiều"]];
const CCLOCK: [string, string?, number?][] = [["", undefined], ["lúc 7h", "07:00"], ["từ 18h đến 19h30", "18:00", 90]];
const CFROM: [string, string?][] = [["", undefined], ["từ thứ 2 tuần sau", "2026-11-16"], ["từ 1/12", "2026-12-01"], ["bắt đầu từ ngày 1/12", "2026-12-01"]];
const CUNTIL: [string, string?][] = [["", undefined], ["đến 20/12", "20261220"], ["đến hết tháng 12", "20261231"], ["tới ngày 31/12", "20261231"], ["trong 120 ngày", "120"]];
const CEXTRA: [string, { loc?: string; eff?: number }][] = [["", {}], ["ở thư viện", { loc: "thư viện" }], ["mất 30 phút", { eff: 30 }]];
const WINDOW: Record<string, [string, string]> = { sáng: ["05:00", "11:00"], chiều: ["13:00", "18:00"], tối: ["18:00", "22:00"] };
const BY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayAdd = (s: string, n: number) => iso(new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n)));
function firstDay(rule: string, from: string): string {
  const days = /BYDAY=([A-Z,]+)/.exec(rule)?.[1].split(",");
  let d = from;
  while (days && !days.includes(BY[new Date(`${d}T00:00:00Z`).getUTCDay()])) d = dayAdd(d, 1);
  return d;
}
interface Combo { said: string; title: string; rule: string; until?: string; first: string; clock?: string; mins?: number; part?: string; loc?: string; eff?: number }
function combos(): Combo[] {
  const out: Combo[] = [];
  // a meeting with no clock is as flexible as a task
  const titles = ["Giải code", "Chạy bộ", "Họp nhóm"];
  for (const [rp, rule, rpart] of CREP)
    for (const [pt, part] of CPART) {
      if (rpart && part) continue;
      for (const [ck, clock, mins] of CCLOCK) {
        // "sáng nào cũng ... lúc 7h" is 07:00; an evening repeat with "lúc 7h" is 19:00
        const at = clock === "07:00" && (rpart ?? part) && (rpart ?? part) !== "sáng" ? "19:00" : clock;
        for (const [fr, from] of CFROM)
          for (const [un, until] of CUNTIL)
            for (const [ex, extra] of CEXTRA) {
              if (extra.eff && mins) continue;
              const start = from ?? "2026-11-14";
              const first = firstDay(rule, start);
              const end = until === "120" ? dayAdd(start, 119).replace(/-/g, "") : until;
              for (const t of [titles[out.length % 3]]) {
                const said = [t, rp, pt, ck, ex, fr, un].filter(Boolean).join(" ");
                out.push({ said, title: t, rule, until: end, first, clock: at, mins, part: rpart ?? part, loc: extra.loc, eff: extra.eff });
              }
            }
      }
    }
  return out;
}
function comboMiss(c: Combo): string | undefined {
  const all = read(c.said, { ref: REF, source: "typed" }).items.map(itemAction);
  const shown = () => all.map((a) => `${a.title} when=${a.when ?? ""} na=${a.notAfter ?? ""} nb=${a.notBefore ?? ""} dl=${a.deadline ?? ""} fx=${a.fixed ?? ""} eff=${a.effortMinutes ?? ""} loc=${a.location ?? ""} rp=${a.repeat ?? ""}`).join(" ; ");
  const fail = (why: string) => `${why} | ${c.said} | ${shown()}`;
  if (all.length !== 1) return fail("count");
  const a = all[0];
  if (strip(a.title ?? "") !== strip(c.title)) return fail("title");
  const rp = a.repeat ?? "";
  if (rp.replace(/;(?:UNTIL|COUNT)=[^;]*/g, "") !== c.rule) return fail("rule");
  if ((/UNTIL=(\d{8})/.exec(rp)?.[1]) !== c.until) return fail("until");
  if (a.when?.slice(0, 10) !== c.first) return fail("first");
  if (c.clock) {
    if (!a.fixed) return fail("not-fixed");
    if (a.when.slice(11, 16) !== c.clock) return fail("clock");
    if (c.mins && a.effortMinutes !== c.mins) return fail("length");
  } else {
    if (a.fixed) return fail("fixed");
    const w = c.part ? WINDOW[c.part] : undefined;
    const hm = a.when.slice(11, 16);
    if (w && (hm < w[0] || hm > w[1] || a.notAfter?.slice(0, 10) !== c.first || (a.notAfter ?? "").slice(11, 16) > w[1])) return fail("part");
  }
  if (c.loc && strip(a.location ?? "") !== strip(c.loc)) return fail("place");
  if (c.eff && a.effortMinutes !== c.eff) return fail("effort");
  return undefined;
}
it("recur grid: repeats with a part of day, clock, start, end, place and length all read together", () => {
  const all = combos();
  const run = process.env.GRID === "full" || process.env.GRID_OUT ? all : all.filter((_, i) => i % 7 === 0);
  const res = run.map(comboMiss).filter((x): x is string => !!x);
  if (process.env.GRID_OUT) writeFileSync(`${process.env.GRID_OUT}.combo`, res.join("\n"));
  expect(res.slice(0, 15)).toEqual([]);
}, 120_000);

// No repeat cue, no repeat: one row, one time. A guessed repeat fills months of the calendar.
it("recur grid: a sentence with no repeat cue never repeats", () => {
  // practice classes are not here: they repeat with no day said (next test), and a said day keeps them one task
  const said = [
    "Giải code tối nay", "Giải code tối mai", "Họp nhóm sáng thứ 2", "Nộp báo cáo thứ 6",
    "Giải code từ 1/12 đến 20/12", "Ôn thi từ thứ 2 đến thứ 6 tuần sau", "Nghỉ từ 15 đến 22/11", "Thứ 2 nào cũng được, họp nhóm", "Bài nào cũng khó, làm bài tập toán tối nay",
    "Giải code 2 tiếng tối nay", "Mai 9 giờ ôn Giải tích", "T6 nộp báo cáo nhóm", "Đến hết tháng 12 nộp đồ án",
    "Đi cà phê thứ 7 tuần sau", "Họp nhóm thứ 4 đến 20/12", "Giải code trong 3 ngày",
  ];
  const repeated = said.filter((s) => read(s, { ref: REF, source: "typed" }).items.map(itemAction).some((a) => a.repeat));
  expect(repeated).toEqual([]);
});

// Practice classes (language, skill, workouts, habits) repeat with no day said; a said day, clock or due keeps one task.
it("recur grid: a practice repeats with no day said, and stays one task with a day, clock or due", () => {
  const REPEAT: [string, string][] = [
    ["Tập gym", "FREQ=WEEKLY;BYDAY=MO,WE,FR"], ["Học tiếng Anh", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"], ["Đọc sách", "FREQ=DAILY"], ["Chạy bộ", "FREQ=WEEKLY;BYDAY=MO,WE,FR"], ["Đi bơi", "FREQ=WEEKLY;BYDAY=TU,FR"],
  ];
  const ONCE = ["Đọc sách sáng thứ 2", "Chạy bộ chiều chủ nhật 5h", "Đọc sách trước 15/11", "Học tiếng Anh hạn 10h sáng mốt", "Tập gym tối nay"];
  const misses: string[] = [];
  for (const [t, rule] of REPEAT) {
    const all = read(t, { ref: REF, source: "typed" }).items.map(itemAction);
    if (all.length !== 1 || all[0].repeat !== rule || all[0].deadline) misses.push(`repeat | ${t} | ${all.map((a) => `${a.repeat} ${a.deadline ?? ""}`).join(" ; ")}`);
  }
  // a range end ("tới ngày 20/11") repeats until that day; a deadline cue ("trước 15/11") keeps one task
  const ranged = read("Học tiếng Anh tới ngày 20/11", { ref: REF, source: "typed" }).items.map(itemAction);
  if (ranged.length !== 1 || ranged[0].repeat !== "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261120" || ranged[0].deadline) misses.push(`range | Học tiếng Anh tới ngày 20/11 | ${ranged.map((a) => `${a.repeat} ${a.deadline ?? ""}`).join(" ; ")}`);
  for (const s of ONCE) {
    const all = read(s, { ref: REF, source: "typed" }).items.map(itemAction);
    if (all.length !== 1 || all[0].repeat) misses.push(`once | ${s} | ${all.map((a) => `${a.repeat ?? ""} ${a.deadline ?? ""}`).join(" ; ")}`);
  }
  expect(misses).toEqual([]);
});

// Several parts of the day with one repeat: one series per part, each kept in its own window.
it("recur grid: a repeat over several parts of the day is one series per part", () => {
  const LISTS: [string, string[]][] = [["sáng và tối", ["sáng", "tối"]], ["sáng, chiều", ["sáng", "chiều"]], ["sáng tối", ["sáng", "tối"]], ["chiều và tối", ["chiều", "tối"]], ["sáng, chiều và tối", ["sáng", "chiều", "tối"]]];
  const REPS: [(l: string) => string, string][] = [
    [(l) => `${l} nào cũng`, "FREQ=DAILY"], [(l) => `mỗi ${l}`, "FREQ=DAILY"], [(l) => `mỗi ngày buổi ${l.replace(/ và /, " và buổi ")}`, "FREQ=DAILY"],
    [(l) => `ngày thường ${l}`, WK], [(l) => `mỗi thứ 2, 4 ${l}`, "FREQ=WEEKLY;BYDAY=MO,WE"], [(l) => `mỗi cuối tuần ${l}`, WE],
  ];
  const MORE: [string, string?, string?][] = [["", undefined, undefined], ["đến 20/12", "20261220", undefined], ["từ 1/12", undefined, "2026-12-01"], ["ở thư viện", undefined, undefined]];
  const misses: string[] = [];
  for (const [l, parts] of LISTS) for (const [mk, rule] of REPS) for (const [more, until, from] of MORE) for (const t of ["Chạy bộ", "Học tiếng Anh", "Họp nhóm"]) {
    const said = `${t} ${mk(l)} ${more}`.trim();
    const all = read(said, { ref: REF, source: "typed" }).items.map(itemAction);
    const first = firstDay(rule, from ?? "2026-11-14");
    const why =
      all.length !== parts.length ? "count"
      : all.some((a) => strip(a.title ?? "") !== strip(t)) ? "title"
      : all.some((a) => (a.repeat ?? "").replace(/;UNTIL=[^;]*/, "") !== rule || /UNTIL=(\d{8})/.exec(a.repeat ?? "")?.[1] !== until) ? "rule"
      : all.some((a) => a.fixed || a.when?.slice(0, 10) !== first) ? "first"
      : parts.some((p, i) => { const hm = all[i].when?.slice(11, 16) ?? ""; return hm < WINDOW[p][0] || hm > WINDOW[p][1]; }) ? "part"
      : undefined;
    if (why) misses.push(`${why} | ${said} | ${all.map((a) => `${a.title} ${a.when} ${a.fixed ?? ""} ${a.repeat ?? ""}`).join(" ; ")}`);
  }
  expect(misses.slice(0, 15)).toEqual([]);
});

// "no fixed time without an exact time": an event with only a day or a part of it is a plan in that day or part
it("an event with no clock is never fixed; with one it is", () => {
  const misses: string[] = [];
  for (const t of ["Họp nhóm", "Đi khám răng", "Cà phê với Lan", "Đá bóng", "Họp lớp", "Gặp thầy"]) for (const d of ["sáng thứ 2", "tối mai", "chiều thứ 6", "thứ 2", "mai", "20/11", "mỗi thứ 2", "tối nào cũng"]) {
    const loose = read(`${t} ${d}`, { ref: REF, source: "typed" }).items.map(itemAction);
    if (loose.some((a) => a.fixed)) misses.push(`fixed | ${t} ${d}`);
    const firm = read(`${t} ${d} lúc 8h`, { ref: REF, source: "typed" }).items.map(itemAction);
    if (!firm.length || firm.some((a) => !a.fixed)) misses.push(`not-fixed | ${t} ${d} lúc 8h`);
  }
  expect(misses).toEqual([]);
});

// Several clocks with one repeat: one fixed series per clock, all with the repeat's rule, start and end.
it("recur grid: a repeat over several clocks is one fixed series per clock", () => {
  const CLOCKS: [string, string[]][] = [["7h sáng và 9h tối", ["07:00", "21:00"]], ["lúc 7h và 19h", ["07:00", "19:00"]], ["6h30 sáng và 5h chiều", ["06:30", "17:00"]], ["8h, 14h và 20h", ["08:00", "14:00", "20:00"]]];
  const REPS: [string, string][] = [["mỗi ngày", "FREQ=DAILY"], ["ngày thường", WK], ["mỗi thứ 2", "FREQ=WEEKLY;BYDAY=MO"], ["mỗi cuối tuần", WE], ["thứ 3 và thứ 5 hàng tuần", "FREQ=WEEKLY;BYDAY=TU,TH"]];
  const MORE: [string, string?, string?][] = [["", undefined, undefined], ["đến 20/12", "20261220", undefined], ["từ 1/12", undefined, "2026-12-01"], ["đến hết tháng 12", "20261231", undefined]];
  const misses: string[] = [];
  for (const [ck, at] of CLOCKS) for (const [rp, rule] of REPS) for (const [more, until, from] of MORE) for (const t of ["Uống thuốc", "Họp nhóm"])
    for (const said of [`${t} ${ck} ${rp} ${more}`, `${rp} ${t} ${ck} ${more}`]) {
      const all = read(said.trim(), { ref: REF, source: "typed" }).items.map(itemAction);
      const first = firstDay(rule, from ?? "2026-11-14");
      const why =
        all.length !== at.length ? "count"
        : all.some((a) => strip(a.title ?? "") !== strip(t)) ? "title"
        : all.some((a) => (a.repeat ?? "").replace(/;UNTIL=[^;]*/, "") !== rule || /UNTIL=(\d{8})/.exec(a.repeat ?? "")?.[1] !== until) ? "rule"
        : all.some((a) => !a.fixed) ? "not-fixed"
        : at.some((c, i) => all[i].when !== `${first}T${c}:00`) ? "when"
        : undefined;
      if (why) misses.push(`${why} | ${said.trim()} | ${all.map((a) => `${a.title} ${a.when} ${a.repeat ?? ""}`).join(" ; ")}`);
    }
  expect(misses.slice(0, 15)).toEqual([]);
});

// A weekday list with no repeat said is those days, once each; with one it is a weekly rule.
it("a weekday list repeats only with a said repeat; alone it is one item per day", () => {
  const LISTS: [string, string[], string][] = [["t2, t4", ["2026-11-16", "2026-11-18"], "MO,WE"], ["thứ 2 và thứ 4", ["2026-11-16", "2026-11-18"], "MO,WE"], ["thứ 2, 4, 6", ["2026-11-16", "2026-11-18", "2026-11-20"], "MO,WE,FR"], ["thứ 3, thứ 5", ["2026-11-17", "2026-11-19"], "TU,TH"]];
  const misses: string[] = [];
  for (const [l, days, by] of LISTS) for (const t of ["Họp nhóm", "Đọc sách"]) for (const ck of ["", " lúc 9h"]) {
    const once = read(`${t} ${l}${ck}`, { ref: REF, source: "typed" }).items.map(itemAction);
    if (once.length !== days.length || once.some((a, i) => a.repeat || a.when?.slice(0, 10) !== days[i] || !!a.fixed !== !!ck)) misses.push(`once | ${t} ${l}${ck} | ${once.map((a) => `${a.when} ${a.repeat ?? ""}`).join(" ; ")}`);
    for (const cue of ["hàng tuần", "mỗi tuần"]) {
      const weekly = read(`${t} ${l}${ck} ${cue}`, { ref: REF, source: "typed" }).items.map(itemAction);
      if (weekly.length !== 1 || weekly[0].repeat !== `FREQ=WEEKLY;BYDAY=${by}`) misses.push(`weekly | ${t} ${l}${ck} ${cue} | ${weekly.map((a) => `${a.when} ${a.repeat ?? ""}`).join(" ; ")}`);
    }
  }
  expect(misses).toEqual([]);
});

// "sáng hoặc tối": one item that may run in either part (tods); "sáng và tối": one item per part.
it("parts joined by hoặc are one item with both as options; joined by và, one item each", () => {
  const MORNING: [number, number] = [300, 660], NIGHT: [number, number] = [1080, 1320], AFTERNOON: [number, number] = [780, 1080];
  const CASES: [string, [number, number][][], string | undefined][] = [
    ["Chạy bộ sáng hoặc tối mai", [[MORNING, NIGHT]], undefined],
    ["Mỗi ngày chạy bộ sáng hoặc tối", [[MORNING, NIGHT]], "FREQ=DAILY"],
    ["Sáng hoặc tối nào cũng chạy bộ", [[MORNING, NIGHT]], "FREQ=DAILY"],
    ["Mỗi sáng hoặc tối chạy bộ", [[MORNING, NIGHT]], "FREQ=DAILY"],
    ["Ngày thường chạy bộ sáng hoặc chiều đến 20/12", [[MORNING, AFTERNOON]], "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261220T235959"],
    ["Sáng và tối nào cũng chạy bộ", [[MORNING], [NIGHT]], "FREQ=DAILY"],
    ["Tối nào cũng giải code", [[NIGHT]], "FREQ=DAILY"],
  ];
  const misses: string[] = [];
  for (const [said, tods, rule] of CASES) {
    const all = read(said, { ref: REF, source: "typed" }).items.map(itemAction);
    if (JSON.stringify(all.map((a) => a.tods)) !== JSON.stringify(tods) || all.some((a) => a.repeat !== rule || a.fixed)) misses.push(`${said} | ${all.map((a) => `${JSON.stringify(a.tods)} ${a.repeat ?? ""} ${a.fixed ?? ""}`).join(" ; ")}`);
  }
  expect(misses).toEqual([]);
});

// No clock said: an exam starts at 7:30, 9:30, 13:00 or 15:00, a makeup class at 7:30, 13:00 or 16:45, the first one in the
// said part that the user's classes and exams leave free; every one taken, the first of the part still.
it("an exam or a makeup class with no clock takes the first free usual start", () => {
  const calendar = [
    { date: "2026-11-16", classes: [{ title: "Toán", start: 450, end: 670 }], exams: [] }, // Monday morning taken
    { date: "2026-11-17", classes: [{ title: "Lý", start: 780, end: 1000 }], exams: [{ title: "Hóa", start: 450 }] }, // Tuesday 7:30 exam, afternoon class
  ];
  const CASES: [string, string][] = [
    ["Thi toán thứ 4", "2026-11-18T07:30:00"], ["Thi toán thứ 2", "2026-11-16T13:00:00"], ["Thi toán chiều thứ 4", "2026-11-18T13:00:00"],
    ["Thi lý thứ 3", "2026-11-17T09:30:00"], ["Thi toán sáng thứ 2", "2026-11-16T07:30:00"], ["Thi lý chiều thứ 3", "2026-11-17T13:00:00"],
    ["Học bù môn web thứ 4", "2026-11-18T07:30:00"], ["Học bù môn web thứ 2", "2026-11-16T13:00:00"], ["Học bù môn web chiều thứ 3", "2026-11-17T16:45:00"],
    ["Học bù môn web tối thứ 4", "2026-11-18T16:45:00"], ["Thi toán 9h thứ 2", "2026-11-16T09:00:00"],
  ];
  const misses: string[] = [];
  for (const [said, when] of CASES) {
    const a = read(said, { ref: REF, source: "typed", calendar }).items.map(itemAction).find((x) => x.fixed);
    if (a?.when !== when) misses.push(`${said} | want ${when} | got ${a?.when} ${a?.fixed ?? ""}`);
  }
  // two exams on one day: the second takes the next free start
  const two = read("Thi toán thứ 4, thi lý thứ 4", { ref: REF, source: "typed", calendar }).items.map(itemAction).filter((x) => x.fixed).map((x) => x.when);
  if (JSON.stringify(two) !== JSON.stringify(["2026-11-18T07:30:00", "2026-11-18T09:30:00"])) misses.push(`two exams | ${two.join(" ; ")}`);
  expect(misses).toEqual([]);
});

// "Tập thể dục mỗi buổi sáng": every morning, flexible inside the morning, and the morning's end is no deadline ("Hạn 12:00").
// Every way of saying a part-of-day repeat, with and without tone marks, before and after the title, with and without a clock.
it("recur grid: a part-of-day repeat is daily, kept in its part, and has no deadline", () => {
  const SAY = [(p: string) => `mỗi ${p}`, (p: string) => `mỗi buổi ${p}`, (p: string) => `hàng ${p}`, (p: string) => `${p} nào cũng`, (p: string) => `buổi ${p} nào cũng`, (p: string) => `hằng buổi ${p}`];
  const CK: Record<string, [string, string]> = { sáng: ["6h", "06:00"], chiều: ["5h", "17:00"], tối: ["9h", "21:00"] };
  const misses: string[] = [];
  for (const part of ["sáng", "chiều", "tối"]) for (const say of SAY) for (const t of ["Tập thể dục", "Đọc sách", "Chạy bộ"]) for (const ck of [false, true]) for (const plain of [false, true]) {
    const p = say(part), c = ck ? ` ${CK[part][0]}` : "";
    const said0 = [`${t} ${p}${c}`, `${p} ${t.toLowerCase()}${c}`];
    for (const s0 of said0) {
      const said = plain ? strip(s0) : s0;
      const all = read(said, { ref: REF, source: "typed" }).items.map(itemAction);
      const a = all[0];
      const hm = a?.when?.slice(11, 16) ?? "";
      const why =
        all.length !== 1 ? "count"
        : strip(a.title ?? "") !== strip(t) ? "title"
        : a.repeat !== "FREQ=DAILY" ? "rule"
        : a.deadline ? "deadline"
        : !!a.fixed !== ck ? (ck ? "not-fixed" : "fixed")
        : ck ? (hm !== CK[part][1] ? "clock" : undefined)
        : hm < WINDOW[part][0] || hm > WINDOW[part][1] ? "part"
        : undefined;
      if (why) misses.push(`${why} | ${said} | ${all.map((x) => `${x.title} when=${x.when} dl=${x.deadline ?? ""} fx=${x.fixed ?? ""} rp=${x.repeat ?? ""}`).join(" ; ")}`);
    }
  }
  expect(misses.slice(0, 15)).toEqual([]);
});

// "Tập thể dục mỗi sáng cuối tuần": weekend mornings, never every morning.
it("recur grid: a part of the day on weekends is a weekend repeat in that part, no deadline", () => {
  const SAY = [(p: string) => `mỗi ${p} cuối tuần`, (p: string) => `mỗi buổi ${p} cuối tuần`, (p: string) => `${p} cuối tuần nào cũng`, (p: string) => `mỗi cuối tuần buổi ${p}`, (p: string) => `hàng ${p} cuối tuần`,
    (p: string) => `các buổi ${p} cuối tuần`, (p: string) => `mỗi ${p}, cuối tuần`, (p: string) => `vào ${p} cuối tuần hàng tuần`, (p: string) => `${p} thứ bảy chủ nhật hàng tuần`, (p: string) => `${p} thứ 7 và chủ nhật hàng tuần`, (p: string) => `mỗi ${p} thứ bảy và chủ nhật`];
  const misses: string[] = [];
  for (const part of ["sáng", "chiều", "tối"]) for (const say of SAY) for (const t of ["Tập thể dục", "Đọc sách", "Chạy bộ"]) for (const plain of [false, true])
    for (const s0 of [`${t} ${say(part)}`, `${say(part)} ${t.toLowerCase()}`]) {
      const said = plain ? strip(s0) : s0;
      const all = read(said, { ref: REF, source: "typed" }).items.map(itemAction);
      const a = all[0], hm = a?.when?.slice(11, 16) ?? "";
      const why = all.length !== 1 ? "count" : strip(a.title ?? "") !== strip(t) ? "title" : a.repeat !== WE ? "rule" : a.deadline ? "deadline" : a.fixed ? "fixed"
        : hm < WINDOW[part][0] || hm > WINDOW[part][1] ? "part" : undefined;
      if (why) misses.push(`${why} | ${said} | ${all.map((x) => `${x.title} when=${x.when} dl=${x.deadline ?? ""} rp=${x.repeat ?? ""}`).join(" ; ")}`);
    }
  expect(misses.slice(0, 15)).toEqual([]);
});
