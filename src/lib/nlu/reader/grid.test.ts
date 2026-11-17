// Generated everyday sentences, each with the answer worked out here and not by the reader: the day, the clock, and whether the
// time is fixed (a clock was said) or flexible (a day, a part of it, a deadline or a span). `pnpm vitest run grid` reads a
// spread of them; GRID=full reads every one, GRID_OUT=<file> writes the misses.
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import type { Action } from "../../types";
import { read } from "./reader";
import { TELEX_TERMS, untelex } from "./telex";

// Sat 14/11/2026 06:00: every clock below is still ahead today
const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };

type Want =
  | { k: "fixed"; at: string; mins?: number }
  | { k: "due"; at: string }
  | { k: "day"; day: string }
  | { k: "part"; day: string; from: string; to: string }
  | { k: "span"; from: string; to: string }
  | { k: "from"; at: string }
  /** The clock is read, as a fixed start or as a deadline: an English term may make the task a submission. */
  | { k: "at"; at: string };
interface Case { area: string; said: string; src: "typed" | "voice"; title: string; want: Want; n?: number; place?: string; repeat?: string }

const EVENTS = ["Họp nhóm", "Đi khám răng", "Học tiếng Anh", "Báo cáo môn web", "Thi toán", "Thuyết trình marketing", "Cà phê với Lan", "Đá bóng"];
const TASKS = ["Giặt đồ", "Mua sách", "Đọc tài liệu", "Dọn phòng", "Làm slide marketing"];
const DUES = ["Nộp bài tập toán", "Nộp báo cáo thực tập", "Deadline đồ án"];
const DAYS: [string, string][] = [
  ["hôm nay", "2026-11-14"], ["mai", "2026-11-15"], ["ngày mai", "2026-11-15"], ["mốt", "2026-11-16"], ["ngày kia", "2026-11-16"], ["ngày mốt", "2026-11-16"],
  ["thứ 2", "2026-11-16"], ["thứ hai", "2026-11-16"], ["thứ 3", "2026-11-17"], ["thứ ba", "2026-11-17"], ["thứ 4", "2026-11-18"], ["thứ tư", "2026-11-18"],
  ["thứ 5", "2026-11-19"], ["thứ năm", "2026-11-19"], ["thứ 6", "2026-11-20"], ["thứ sáu", "2026-11-20"], ["chủ nhật", "2026-11-15"],
  ["thứ 2 tuần sau", "2026-11-16"], ["thứ 7 tuần sau", "2026-11-21"], ["thứ 4 tuần tới", "2026-11-18"], ["chủ nhật tuần sau", "2026-11-22"], ["thứ 3 tuần sau nữa", "2026-11-24"],
  ["tuần sau", "2026-11-16"], ["tuần tới", "2026-11-16"], ["tuần sau nữa", "2026-11-23"], ["2 tuần nữa", "2026-11-28"], ["3 ngày nữa", "2026-11-17"],
  ["20/11", "2026-11-20"], ["ngày 20/11", "2026-11-20"], ["ngày 20 tháng 11", "2026-11-20"], ["ngày 20", "2026-11-20"], ["20 tháng 11", "2026-11-20"], ["5/12", "2026-12-05"], ["mùng 5 tháng 12", "2026-12-05"], ["20/11/2026", "2026-11-20"],
];
const CLOCKS: [string, string][] = [
  ["8h sáng", "08:00"], ["lúc 8h sáng", "08:00"], ["8 giờ sáng", "08:00"], ["8h", "08:00"], ["lúc 8h", "08:00"], ["10h", "10:00"], ["8h30 sáng", "08:30"], ["8 rưỡi sáng", "08:30"], ["8 giờ rưỡi sáng", "08:30"], ["8h rưỡi", "08:30"], ["8 giờ 30 sáng", "08:30"], ["8:30", "08:30"],
  ["3h chiều", "15:00"], ["3 giờ chiều", "15:00"], ["15h", "15:00"], ["15:00", "15:00"], ["2h30 chiều", "14:30"], ["3 rưỡi chiều", "15:30"], ["7h tối", "19:00"], ["7 giờ tối", "19:00"], ["19h", "19:00"], ["9h tối", "21:00"], ["12h trưa", "12:00"], ["9h kém 15 sáng", "08:45"],
];
// the same clocks and days as a recognizer or a speaker spells them
const SPOKEN_CLOCKS: [string, string][] = [
  ["tám giờ sáng", "08:00"], ["lúc tám giờ sáng", "08:00"], ["tám giờ rưỡi sáng", "08:30"], ["tám rưỡi sáng", "08:30"], ["tám giờ ba mươi sáng", "08:30"], ["tám giờ mười lăm sáng", "08:15"], ["chín giờ kém mười lăm sáng", "08:45"],
  ["mười giờ sáng", "10:00"], ["mười một giờ trưa", "11:00"], ["mười hai giờ trưa", "12:00"], ["một giờ chiều", "13:00"], ["hai giờ rưỡi chiều", "14:30"], ["ba giờ chiều", "15:00"], ["ba rưỡi chiều", "15:30"], ["bốn giờ chiều", "16:00"], ["năm giờ chiều", "17:00"],
  ["sáu giờ tối", "18:00"], ["bảy giờ tối", "19:00"], ["bảy giờ rưỡi tối", "19:30"], ["tám giờ tối", "20:00"], ["chín giờ tối", "21:00"], ["mười giờ đêm", "22:00"], ["mười lăm giờ", "15:00"], ["hai mươi giờ", "20:00"], ["mười chín giờ ba mươi", "19:30"],
];
const SPOKEN_DAYS: [string, string][] = [
  ["mai", "2026-11-15"], ["thứ hai", "2026-11-16"], ["thứ ba", "2026-11-17"], ["thứ tư", "2026-11-18"], ["thứ năm", "2026-11-19"], ["thứ sáu", "2026-11-20"], ["thứ sáu tuần sau", "2026-11-20"], ["thứ bảy tuần sau", "2026-11-21"], ["chủ nhật tuần sau", "2026-11-22"],
  ["ngày hai mươi tháng mười một", "2026-11-20"], ["ngày hai mươi", "2026-11-20"], ["hai mươi tháng mười một", "2026-11-20"], ["mùng năm tháng mười hai", "2026-12-05"], ["ngày mười lăm tháng mười hai", "2026-12-15"], ["ngày hai mươi mốt tháng mười một", "2026-11-21"],
  ["ba ngày nữa", "2026-11-17"], ["hai tuần nữa", "2026-11-28"], ["tuần sau", "2026-11-16"],
];
const PARTS: [string, string, string, string][] = [
  ["sáng mai", "2026-11-15", "05:00", "12:00"], ["trưa mai", "2026-11-15", "11:00", "14:00"], ["chiều mai", "2026-11-15", "12:00", "18:00"], ["tối mai", "2026-11-15", "17:00", "23:59"], ["tối nay", "2026-11-14", "17:00", "23:59"], ["chiều nay", "2026-11-14", "12:00", "18:00"],
  ["sáng thứ 6", "2026-11-20", "05:00", "12:00"], ["chiều thứ 6", "2026-11-20", "12:00", "18:00"], ["tối thứ 6", "2026-11-20", "17:00", "23:59"], ["tối chủ nhật", "2026-11-15", "17:00", "23:59"], ["sáng chủ nhật tuần sau", "2026-11-22", "05:00", "12:00"], ["chiều 20/11", "2026-11-20", "12:00", "18:00"],
];
const SPANS: [string, string, string][] = [["tuần sau", "2026-11-16", "2026-11-22"], ["tuần tới", "2026-11-16", "2026-11-22"], ["trong tuần sau", "2026-11-16", "2026-11-22"], ["tháng sau", "2026-12-01", "2026-12-31"], ["tuần sau nữa", "2026-11-23", "2026-11-29"]];
type Mk = (t: string, d: string, c: string) => string;
const ORDERS: Mk[] = [(t, d, c) => `${t} ${d} ${c}`, (t, d, c) => `${t} ${c} ${d}`, (t, d, c) => `${d} ${c} ${t}`, (t, d, c) => `${c} ${d} ${t}`, (t, d, c) => `${d} ${t} ${c}`];
const SRC = ["typed", "voice"] as const;
const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
const cap = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase("vi"));

/** A fixed start is planned on the quarter-hour grid (planner STEP): 8:45 and 8:15 stay, 8:10 is 8:15. A deadline keeps its minute. */
const snap = (hm: string) => { const t = Math.round((+hm.slice(0, 2) * 60 + +hm.slice(3)) / 15) * 15; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

import { telexed } from "./telexed";

function cases(): Case[] {
  const out: Case[] = [];
  const add = (area: string, said: string, title: string, w: Want, more: Partial<Case> = {}, srcs: readonly ("typed" | "voice")[] = SRC) => {
    const want: Want = w.k === "fixed" ? { ...w, at: `${w.at.slice(0, 11)}${snap(w.at.slice(11, 16))}:00` } : w;
    for (const src of srcs) out.push({ area, said, src, title, want, ...more });
  };
  // 1. basic: a day and a clock, in every order. An event is fixed at the clock; a submission is due at it.
  for (const [d, day] of DAYS) for (const [c, clock] of CLOCKS) for (const mk of ORDERS) {
    for (const t of EVENTS) add("basic", mk(t, d, c), t, { k: "fixed", at: `${day}T${clock}:00` });
    for (const t of DUES) add("basic-due", mk(t, d, c), t, { k: "due", at: `${day}T${clock}:00` });
  }
  // 2. fixed or flexible: no clock is never a fixed block
  for (const t of [...TASKS, "Đi khám răng", "Học tiếng Anh"]) {
    // with no clock "tuần sau" and "2 tuần nữa" are a whole week (flex-span), every other day word is that day
    for (const [d, day] of DAYS) if (!/tuần (sau|tới|nữa)$|tuần sau nữa/.test(d) || /^(thứ|chủ)/.test(d)) for (const said of [`${t} ${d}`, `${d} ${t}`]) add("flex-day", said, t, { k: "day", day });
    for (const [p, day, from, to] of PARTS) for (const said of [`${t} ${p}`, `${p} ${t}`]) add("flex-part", said, t, { k: "part", day, from, to });
    for (const [sp, from, to] of SPANS) for (const said of [`${t} ${sp}`, `${sp} ${t}`]) add("flex-span", said, t, { k: "span", from, to });
    for (const [d, day] of DAYS.slice(1, 22)) for (const [c, clock] of [["5h chiều", "17:00"], ["17h", "17:00"], ["10h sáng", "10:00"], ["9h tối", "21:00"]]) {
      for (const cue of ["trước", "hạn", "deadline", "hạn chót", "chậm nhất"]) add("flex-before", `${t} ${cue} ${c} ${d}`, t, { k: "due", at: `${day}T${clock}:00` });
      for (const cue of ["từ", "sau"]) if (!/^tuần/.test(d)) add("flex-from", `${t} ${d} ${cue} ${c}`, t, { k: "from", at: `${day}T${clock}:00` });
    }
  }
  // 3. spoken numbers: clocks and days spelled out
  for (const t of EVENTS.slice(0, 5)) {
    for (const [d, day] of SPOKEN_DAYS) for (const [c, clock] of SPOKEN_CLOCKS) for (const mk of ORDERS.slice(0, 4)) add("spoken", mk(t, d, c), t, { k: "fixed", at: `${day}T${clock}:00` });
    for (const [d, day] of DAYS) for (const [c, clock] of SPOKEN_CLOCKS) add("spoken-clock", `${t} ${d} ${c}`, t, { k: "fixed", at: `${day}T${clock}:00` });
    for (const [d, day] of SPOKEN_DAYS) for (const [c, clock] of CLOCKS) add("spoken-day", `${t} ${d} ${c}`, t, { k: "fixed", at: `${day}T${clock}:00` });
  }
  // 4. typing: no marks, capitals, short forms, clock spellings, stray spaces and punctuation
  const SHORT: [RegExp, string][] = [[/thứ ([2-7])/g, "t$1"], [/chủ nhật/g, "cn"], [/(\d+) giờ (\d+)/g, "$1h$2"], [/(\d+) giờ(?! rưỡi| kém)/g, "$1g"], [/(\d+)h(\d\d)/g, "$1g$2"], [/(\d+)h(?!\d| rưỡi| kém)/g, "$1 h"], [/(\d+)h(?!\d)/g, "$1H"], [/(\d+)h(?!\d| rưỡi| kém)/g, "$1h00"], [/(\d+)h(?!\d| rưỡi| kém)/g, "$1:00"], [/(?<![\d/])(\d+)\/(\d+)(?![\d/])/g, "$1-$2"], [/(?<![\d/])(\d+)\/(\d+)(?![\d/])/g, "$1.$2"], [/ /g, "  "], [/$/g, " nha"], [/$/g, " nhé"], [/$/g, " ạ"], [/$/g, "."], [/$/g, " !!!"], [/^/g, "nhắc tôi "], [/^/g, "nhớ "], [/^/g, "tạo lịch "]];
  for (const t of EVENTS) for (const [d, day] of DAYS) for (const [c, clock] of CLOCKS) {
    const said = `${t} ${d} ${c}`, want: Want = { k: "fixed", at: `${day}T${clock}:00` };
    // unmarked text cannot tell "tư" from "từ" or "sáu" from "sau": those days are left to the marked grid
    if (!/thứ (tư|sáu|năm|bảy)|mốt|kém/.test(d + c)) add("typing-nomarks", strip(said).toLowerCase(), strip(t), want, {}, ["typed"]);
    add("typing-lower", said.toLowerCase(), t, want, {}, ["typed"]);
    add("typing-caps", cap(said), t, want);
    add("typing-upper", said.toLocaleUpperCase("vi"), t, want, {}, ["typed"]);
    for (const [re, to] of SHORT) { const v = `${t} ${`${d} ${c}`.replace(re, to)}`; if (v !== said) add("typing-short", re.source === "^" ? `${to}${said}` : re.source === "$" ? `${said}${to}` : v, t, want, {}, ["typed"]); }
  }
  // 5. self-correction: the words after the cue replace the ones before
  const FIX = ["à không", "à nhầm", "ý là", "nhầm", "à quên", "không phải"];
  for (const t of EVENTS.slice(0, 4)) for (const fx of FIX) {
    for (const [[d1], [d2, day2]] of [[DAYS[1], DAYS[14]], [DAYS[14], DAYS[1]], [DAYS[6], DAYS[10]], [DAYS[27], DAYS[32]], [DAYS[1], DAYS[18]], [DAYS[16], DAYS[20]]] as [[string, string], [string, string]][])
      for (const [c, clock] of [CLOCKS[0], CLOCKS[12], CLOCKS[18]]) {
        add("fix-day", `${t} ${d1} ${fx} ${d2} ${c}`, t, { k: "fixed", at: `${day2}T${clock}:00` });
        add("fix-day", `${t} ${d1} ${c} ${fx} ${d2}`, t, { k: "fixed", at: `${day2}T${clock}:00` });
        add("fix-day", `${d1} ${fx} ${d2} ${c} ${t}`, t, { k: "fixed", at: `${day2}T${clock}:00` });
      }
    for (const [d, day] of [DAYS[1], DAYS[14], DAYS[18], DAYS[27]]) for (const [[c1], [c2, clock2]] of [[CLOCKS[0], CLOCKS[12]], [CLOCKS[12], CLOCKS[0]], [CLOCKS[6], CLOCKS[18]], [CLOCKS[2], CLOCKS[19]], [CLOCKS[14], CLOCKS[5]]] as [[string, string], [string, string]][]) {
      add("fix-clock", `${t} ${d} ${c1} ${fx} ${c2}`, t, { k: "fixed", at: `${day}T${clock2}:00` });
      add("fix-clock", `${t} ${c1} ${fx} ${c2} ${d}`, t, { k: "fixed", at: `${day}T${clock2}:00` });
      add("fix-clock", `${d} ${c1} ${fx} ${c2} ${t}`, t, { k: "fixed", at: `${day}T${clock2}:00` });
    }
  }
  // 6. mis-hearing: what a recognizer writes for the same words (fillers, capitals, look-alike syllables)
  const HEARD: [RegExp, string][] = [[/^/, "ờ "], [/^/, "à "], [/^/, "ừm "], [/^/, "ok "], [/$/, " nha"], [/$/, " nhé"], [/$/, " ạ"], [/$/, " nhá"], [/rưỡi/g, "rưởi"], [/rưỡi/g, "dưỡi"], [/giờ/g, "giời"], [/thứ bảy/g, "thứ bẩy"], [/chủ nhật/g, "chủ nhựt"], [/thứ tư/g, "thứ 4"], [/thứ ([2-7])/g, "Thứ $1"], [/chủ nhật/g, "Chủ Nhật"], [/tuần sau/g, "tuần xau"], [/tuần sau/g, "tuần sao"], [/sáng/g, "sán"], [/(\d+)h(?!\d)/g, "$1 giờ"], [/(\d+)h(\d\d)/g, "$1 giờ $2"], [/(\d+)h(\d\d)/g, "$1:$2"], [/(\d+) giờ(?! \d| rưỡi| kém)/g, "$1:00"], [/mai/g, "Mai"], [/ngày mai/g, "ngày may"], [/hôm nay/g, "hôm này"], [/tối/g, "tói"], [/chiều/g, "chìu"], [/tuần/g, "tuầng"]];
  for (const t of EVENTS) for (const [d, day] of DAYS) for (const [c, clock] of [...CLOCKS, ...SPOKEN_CLOCKS.slice(0, 8)]) {
    const said = `${t} ${d} ${c}`;
    for (const [re, to] of HEARD) { const v = re.source === "^" ? to + said : re.source === "$" ? said + to : `${t} ${`${d} ${c}`.replace(re, to)}`; if (v !== said) add("heard", v, t, { k: "fixed", at: `${day}T${clock}:00` }, {}, ["voice"]); }
    if (!c.startsWith("lúc")) add("heard", `${t} ${d} vào ${c}`, t, { k: "fixed", at: `${day}T${clock}:00` }, {}, ["voice"]);
  }
  // 7. more in one sentence: a place, a length, a range, a repeat, two items
  for (const [d, day] of DAYS.filter((_, i) => i % 3 === 1)) for (const [c, clock] of CLOCKS.filter((_, i) => i % 4 === 0)) {
    const at = `${day}T${clock}:00`;
    for (const t of EVENTS.slice(0, 3)) {
      for (const [p, place] of [["ở phòng A1", "phòng A1"], ["tại quán Highlands", "quán Highlands"], ["ở thư viện", "thư viện"]]) for (const said of [`${t} ${d} ${c} ${p}`, `${t} ${p} ${d} ${c}`, `${d} ${c} ${t} ${p}`]) add("place", said, t, { k: "fixed", at }, { place });
      for (const [l, mins] of [["trong 2 tiếng", 120], ["trong 90 phút", 90], ["1 tiếng rưỡi", 90], ["trong 30 phút", 30], ["2 tiếng", 120]] as [string, number][]) for (const said of [`${t} ${d} ${c} ${l}`, `${t} ${l} ${d} ${c}`]) add("length", said, t, { k: "fixed", at, mins });
    }
    for (const [t1, t2] of [["Họp nhóm", "Đi khám răng"], ["Đá bóng", "Học tiếng Anh"]]) for (const [c2, clock2] of [["4h chiều", "16:00"], ["8h tối", "20:00"]]) if (clock2 > clock) {
      for (const said of [`${d} ${c} ${t1}, ${c2} ${t2}`, `${t1} ${d} ${c}, ${t2} ${c2}`, `${t1} ${d} ${c} rồi ${c2} ${t2}`, `${t1} ${d} ${c} và ${t2} ${d} ${c2}`]) { add("two", said, t1, { k: "fixed", at }, { n: 2 }); add("two", said, t2, { k: "fixed", at: `${day}T${clock2}:00` }, { n: 2 }); }
    }
  }
  for (const t of EVENTS.slice(0, 3)) for (const [d, day] of DAYS.filter((_, i) => i % 3 === 1)) for (const [r, from, mins] of [["từ 8h đến 10h sáng", "08:00", 120], ["8h-10h sáng", "08:00", 120], ["từ 2h đến 4h chiều", "14:00", 120], ["từ 14h đến 15h30", "14:00", 90], ["7h tới 9h tối", "19:00", 120], ["8h30 đến 11h sáng", "08:30", 150]] as [string, string, number][])
    for (const said of [`${t} ${d} ${r}`, `${t} ${r} ${d}`, `${d} ${r} ${t}`]) add("range", said, t, { k: "fixed", at: `${day}T${from}:00`, mins });
  for (const t of ["Đá bóng", "Học tiếng Anh", "Họp nhóm"]) for (const [c, clock] of [["7h tối", "19:00"], ["6h sáng", "06:00"], ["lúc 20h", "20:00"]]) for (const [r, rule, day] of [["mỗi thứ 2", "FREQ=WEEKLY;BYDAY=MO", "2026-11-16"], ["thứ 4 hàng tuần", "FREQ=WEEKLY;BYDAY=WE", "2026-11-18"], ["mỗi chủ nhật", "FREQ=WEEKLY;BYDAY=SU", "2026-11-15"], ["thứ 3 và thứ 5 hàng tuần", "FREQ=WEEKLY;BYDAY=TU,TH", "2026-11-17"]])
    for (const said of [`${t} ${r} ${c}`, `${r} ${t} ${c}`, `${t} ${c} ${r}`]) add("repeat", said, t, { k: "fixed", at: `${day}T${clock}:00` }, { repeat: rule });
  // 8. Telex left on while typing an English word: every term, as the keyboard mangles it. A form that is a real
  // Vietnamese syllable ("tét", "lít") cannot be told from the word and is left out.
  // day words ("weekend", "tomorrow") read back as the day they name, not as part of a title
  // and words the reader already acts on are no title words: "deadline" is the due cue, "zoom" and "meet" are the place
  const DAY_TERMS = new Set(["week", "weekend", "weekly", "daily", "wednesday", "tomorrow", "today", "now", "deadline", "zoom", "meet", "teams", "google", "online"]);
  for (const term of TELEX_TERMS) {
    if (DAY_TERMS.has(term)) continue;
    const forms = new Set([telexed(term), term.startsWith("w") ? `ư${term.slice(1)}` : term, term.replace(/w/g, "ư")]);
    const shown = term === "wifi" ? "Wi-Fi" : term; // the canon display form (en.ts)
    for (const form of forms) if (form !== term && untelex(form) === term) for (const [d, day] of [DAYS[1], DAYS[14], DAYS[22], DAYS[27]]) for (const [c, clock] of [CLOCKS[0], CLOCKS[12], CLOCKS[18]])
      for (const [said, title] of [[`Làm ${form} ${d} ${c}`, `Làm ${shown}`], [`${d} ${c} họp ${form}`, `Họp ${shown}`], [`Xem ${form} toán ${d} ${c}`, `Xem ${shown} toán`]]) add("telex", said, title, { k: "at", at: `${day}T${clock}:00` }, {}, ["typed"]);
  }
  return out;
}

it("telex: every term's keyboard form reads back, except the ones that are real Vietnamese words", () => {
  const lost = [...TELEX_TERMS].filter((t) => telexed(t) !== t && untelex(telexed(t)) !== t).map((t) => `${t}=${telexed(t)}`);
  // "tét" and "dóc" are rare, so untelex reads them back to "test" and "docs" now; "nơ" and "hơ" are real words
  expect(lost).toEqual(["now=nơ", "how=hơ"]);
});

const fold = (s: string) => strip(s).toLowerCase().trim();
const isPrep = (a: Action) => /^(Chuẩn bị|Ôn tập)/.test(a.title ?? "");
/** Why the read is wrong, or undefined. */
function miss(c: Case): string | undefined {
  const all = read(c.said, { ref: REF, source: c.src }).items.map(itemAction);
  const mains = all.filter((a) => !isPrep(a));
  const shown = () => all.map((a) => `${a.title} when=${a.when ?? ""} dl=${a.deadline ?? ""} nb=${a.notBefore ?? ""} na=${a.notAfter ?? ""} fx=${a.fixed ?? ""} eff=${a.effortMinutes ?? ""} rp=${a.repeat ?? ""} loc=${a.location ?? ""}`).join(" ; ");
  const fail = (why: string) => `${why} | ${c.said} | ${shown()}`;
  const w = c.want;
  const titles = [fold(c.title), fold(c.title).replace(/^deadline /, "")];
  if (w.k === "at") {
    const hit = all.filter((x) => titles.includes(fold(x.title ?? "").replace(/^chuan bi /, "")));
    if (!hit.length) return fail("title");
    return hit.some((x) => x.when === `${w.at.slice(0, 11)}${snap(w.at.slice(11, 16))}:00` || x.deadline === w.at) ? undefined : fail("time");
  }
  if (mains.length !== (c.n ?? 1)) return fail("count");
  const a = mains.find((x) => titles.includes(fold(x.title ?? "")));
  if (!a) return fail("title");
  if (w.k === "fixed") {
    if (!a.fixed) return fail("not-fixed");
    if (a.when !== w.at) return fail("time");
    if (w.mins !== undefined && a.effortMinutes !== w.mins) return fail("length");
  } else if (a.fixed) return fail("fixed");
  else if (w.k === "due") { if (a.deadline !== w.at) return fail("time"); }
  else if (w.k === "day") { if (a.when?.slice(0, 10) !== w.day || a.notAfter?.slice(0, 10) !== w.day) return fail("time"); }
  else if (w.k === "part") { const hm = a.when?.slice(11, 16) ?? ""; if (a.when?.slice(0, 10) !== w.day || hm < w.from || hm > w.to || !a.notAfter || a.notAfter.slice(0, 10) !== w.day || a.notAfter.slice(11, 16) > w.to) return fail("time"); }
  // a practice over a span of two weeks or more ("Học tiếng Anh tháng sau") is a habit through it: the span's end is its UNTIL
  else if (w.k === "span") { const habit = a.repeat?.endsWith(`UNTIL=${w.to.replace(/-/g, "")}`) && dayN(w.to) - dayN(w.from) >= 13; if (a.notBefore?.slice(0, 10) !== w.from || (a.deadline?.slice(0, 10) !== w.to && !habit)) return fail("time"); }
  else if (w.k === "from") { if ((a.notBefore ?? a.when) !== w.at) return fail("time"); }
  if (c.place !== undefined && fold(a.location ?? "") !== fold(c.place)) return fail("place");
  if (c.repeat !== undefined && a.repeat !== c.repeat) return fail("repeat");
  return undefined;
}

const ALL = cases();
const dayN = (d: string) => Date.parse(d) / 86_400_000;
const full = process.env.GRID === "full" || !!process.env.GRID_OUT;
const AREAS = [...new Set(ALL.map((c) => c.area))];
for (const area of AREAS)
  it(`grid: ${area}`, () => {
    const mine = ALL.filter((c) => c.area === area);
    // the default run reads a spread; a prime stride walks every title, day, clock and order
    const run = full ? mine : mine.filter((_, i) => i % 37 === 0);
    const res = run.map(miss);
    const bad = res.filter((x): x is string => !!x);
    if (process.env.GRID_OUT) {
      // which words go wrong most: the share of misses per word and word pair outside the title
      const tot = new Map<string, [number, number]>();
      run.forEach((c, i) => {
        const w = c.said.replace(c.title, " ").split(/\s+/).filter(Boolean);
        for (const g of new Set([...w, ...w.slice(1).map((x, k) => `${w[k]} ${x}`)])) { const t = tot.get(g) ?? [0, 0]; t[0]++; if (res[i]) t[1]++; tot.set(g, t); }
      });
      const hot = [...tot].filter(([, [n, b]]) => b >= 3 && b / n >= 0.3).sort((x, y) => y[1][1] / y[1][0] - x[1][1] / x[1][0] || y[1][1] - x[1][1]).slice(0, 40).map(([g, [n, b]]) => `${g}: ${b}/${n}`);
      const why = new Map<string, number>();
      for (const b of bad) why.set(b.split(" | ")[0], (why.get(b.split(" | ")[0]) ?? 0) + 1);
      writeFileSync(`${process.env.GRID_OUT}.${area}`, `${run.length} read, ${bad.length} wrong ${JSON.stringify([...why])}\nHOT ${hot.join(" · ")}\n${bad.join("\n")}\n`);
    }
    expect(bad.slice(0, 15)).toEqual([]);
  }, 600_000);
