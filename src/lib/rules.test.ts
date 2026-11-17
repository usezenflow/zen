import { describe, expect, it } from "vitest";
import { isRule, parseRules, readRule, RULE_CUE } from "./rules";
import type { Rule } from "./types";

const one = (s: string) => { const r = parseRules(s); expect(r).toHaveLength(1); return r[0]; };

describe("plain shapes", () => {
  it("days, parts of day, clocks, kinds", () => {
    expect(one("tối thứ sáu để trống nhé")).toEqual({ text: "Tối T6 để trống", days: [5], from: 1080, to: 1440, kinds: [] });
    expect(one("đừng xếp việc học sau 11 giờ đêm")).toEqual({ text: "Không học sau 23:00", days: [], from: 1380, to: 1440, kinds: ["study"] });
    expect(one("sáng cuối tuần cho mình ngủ")).toMatchObject({ text: "Sáng cuối tuần để trống", days: [6, 0], from: 300, to: 720 });
    expect(one("chủ nhật mình muốn nghỉ")).toMatchObject({ text: "Cả ngày CN để trống", days: [0], from: 0, to: 1440 });
    expect(one("không tập thể dục trước 7h")).toMatchObject({ kinds: ["exercise"], from: 0, to: 420 });
    expect(one("thứ ba từ 9 đến 11 giờ để trống")).toMatchObject({ days: [2], from: 540, to: 660 });
    expect(parseRules("bài tập toán")).toEqual([]); // no days, no window: not a rule
    expect(parseRules("mỗi ngày nhé")).toEqual([]);
  });
});

describe("spoken numbers", () => {
  it("reads numbers said as words, including 'rưỡi' and the 'sau' (after) / 'sáu' (six) trap", () => {
    expect(one("đừng xếp việc học sau mười một giờ đêm")).toMatchObject({ from: 1380, to: 1440, kinds: ["study"] });
    expect(one("không tập trước bảy giờ rưỡi sáng")).toMatchObject({ from: 0, to: 450 });
    expect(one("từ chín đến mười một giờ thứ ba để trống")).toMatchObject({ days: [2], from: 540, to: 660 });
    expect(one("thứ sáu sau sáu giờ chiều để trống")).toMatchObject({ days: [5], from: 1080 });
  });
});

describe("self-corrections", () => {
  it("the words after the cue replace only what they name", () => {
    expect(one("tối thứ năm, à không, thứ sáu để trống")).toMatchObject({ text: "Tối T6 để trống", days: [5], from: 1080 });
    expect(one("đừng xếp gì sau 10 giờ tối, à nhầm, 11 giờ")).toMatchObject({ from: 1380, to: 1440 });
    expect(one("sáng chủ nhật ý là chiều chủ nhật để trống")).toMatchObject({ days: [0], from: 720, to: 1080 });
  });
});

describe("chains", () => {
  it("each clause with its own time is its own rule; day-only clauses join a neighbour", () => {
    const two = parseRules("tối thứ sáu và sáng chủ nhật để trống");
    expect(two.map((r) => [r.days, r.from, r.to])).toEqual([[[5], 1080, 1440], [[0], 300, 720]]);
    expect(one("tối thứ sáu và thứ bảy để trống")).toMatchObject({ days: [5, 6], from: 1080 });
    expect(one("thứ bảy, chủ nhật để trống")).toMatchObject({ text: "Cả ngày cuối tuần để trống", days: [6, 0] });
    expect(one("thứ hai đến thứ tư sau 9 giờ tối để trống")).toMatchObject({ days: [1, 2, 3], from: 1260 });
    expect(one("đừng xếp học và dọn dẹp sau 10 giờ tối")).toMatchObject({ kinds: ["study", "chores"], from: 1320 });
  });
});

describe("exceptions", () => {
  it("'trừ' takes days or kinds off", () => {
    expect(one("tối nào cũng để trống trừ thứ bảy")).toMatchObject({ text: "Tối trừ T7 để trống", days: [1, 2, 3, 4, 5, 0], from: 1080 });
    expect(one("sau 10 giờ tối đừng xếp gì trừ việc học")).toMatchObject({ text: "Sau 22:00 chỉ học", kinds: ["exercise", "chores", "social", "other", "work", "errand", "finance", "self"] });
    expect(one("cuối tuần để trống ngoại trừ chủ nhật")).toMatchObject({ days: [6] });
  });
});

describe("past midnight", () => {
  it("splits into the evening and the next early hours", () => {
    const r = parseRules("thứ sáu từ 11 giờ đêm đến 6 giờ sáng để trống");
    expect(r.map((x) => [x.days, x.from, x.to])).toEqual([[[5], 1380, 1440], [[6], 0, 360]]);
    expect(r[0].text).toBe(r[1].text);
  });
});

describe("forget", () => {
  const rules: Rule[] = [
    { id: "a", text: "Tối T6 để trống", days: [5], from: 1080, to: 1440, kinds: [], at: 0 },
    { id: "b", text: "Không học sau 23:00", days: [], from: 1380, to: 1440, kinds: ["study"], at: 0 },
    { id: "c1", text: "23:00–06:00 T7 để trống", days: [6], from: 1380, to: 1440, kinds: [], at: 0 },
    { id: "c2", text: "23:00–06:00 T7 để trống", days: [0], from: 0, to: 360, kinds: [], at: 0 },
  ];
  it("points at the right rule; a split rule goes whole; ambiguity returns nothing", () => {
    expect(readRule("quên lời dặn tối thứ sáu đi", rules)).toEqual({ forget: [rules[0]] });
    expect(readRule("thôi bỏ cái không học sau mười một giờ đêm", rules)).toEqual({ forget: [rules[1]] });
    expect(readRule("quên lời dặn 23:00 thứ bảy", rules)).toEqual({ forget: [rules[2], rules[3]] });
    expect(readRule("quên hết đi", rules)).toEqual({ forget: rules }); // "hết" is everything; Undo is the net
    expect(readRule("quên đi", rules)).toBeUndefined();
  });
});

it("home routes rule-sounding sentences away from the task NLU", () => {
  expect(RULE_CUE.test("tối thứ sáu để trống nhé")).toBe(true);
  expect(RULE_CUE.test("mai 9 giờ ôn giải tích")).toBe(false);
});

describe("Whisper mishearings", () => {
  it("wrong or missing tones, tr/ch, s/x, d/r/gi, and 'tôi' for 'tối'", () => {
    expect(one("tối thứ sau để chống nhé")).toMatchObject({ text: "Tối T6 để trống", days: [5] });
    expect(one("đừng sếp việc học sau 11 dờ đêm")).toMatchObject({ kinds: ["study"], from: 1380 });
    expect(one("chủ nhựt mình muốn nghỉ")).toMatchObject({ days: [0], from: 0, to: 1440 });
    expect(one("tôi thứ bẩy để trống")).toMatchObject({ text: "Tối T7 để trống", days: [6], from: 1080 });
    expect(one("thư tư sau 9 giờ tối để trống")).toMatchObject({ days: [3], from: 1260 });
  });
  it("text with no diacritics at all", () => {
    expect(one("toi thu sau de trong")).toMatchObject({ text: "Tối T6 để trống", days: [5], from: 1080 });
    expect(one("khong hoc sau 11 gio dem")).toMatchObject({ kinds: ["study"], from: 1380 });
    expect(one("tu 9 toi 11 gio thu ba de trong")).toMatchObject({ days: [2], from: 540, to: 660 });
    expect(one("cuoi tuan de trong tru chu nhat")).toMatchObject({ days: [6] });
  });
  it("leaves ordinary words alone: 'để trong tủ' routes, then fails to parse, so home falls back to tasks", () => {
    expect(isRule("để trong tủ lạnh")).toBe(true);
    expect(parseRules("để trong tủ lạnh")).toEqual([]);
    expect(isRule("tôi đi học thứ ba")).toBe(false);
    expect(isRule("tối thứ sau để chống nhé")).toBe(true);
  });
});

// One line per utterance: expected rules as "days|from-to|kinds" (days Monday-first, empty = every day). [] = not a rule.
const sum = (s: string) => parseRules(s).map((r) => `${r.days.join(",")}|${String(Math.floor(r.from / 60)).padStart(2, "0")}:${String(r.from % 60).padStart(2, "0")}-${String(Math.floor(r.to / 60)).padStart(2, "0")}:${String(r.to % 60).padStart(2, "0")}|${r.kinds.join(",")}`);
const CORPUS: [string, string, string[]][] = [
  // plain
  ["plain", "tối thứ sáu để trống", ["5|18:00-24:00|"]],
  ["plain", "sáng chủ nhật để trống", ["0|05:00-12:00|"]],
  ["plain", "chiều thứ bảy mình bận việc riêng, đừng xếp gì", ["6|12:00-18:00|"]],
  ["plain", "cả ngày chủ nhật để trống", ["0|00:00-24:00|"]],
  ["plain", "đêm nào cũng đừng xếp gì sau 11 giờ", ["|23:00-24:00|"]],
  ["plain", "trưa thứ hai để trống", ["1|11:30-13:30|"]],
  ["plain", "không xếp việc nhà vào cuối tuần", ["6,0|00:00-24:00|chores"]],
  ["plain", "đừng xếp lịch gặp bạn bè ngày thường", ["1,2,3,4,5|00:00-24:00|social"]],
  ["plain", "không tập thể dục sau 9 giờ tối", ["|21:00-24:00|exercise"]],
  ["plain", "đừng xếp gì trước 8 giờ sáng", ["|00:00-08:00|"]],
  ["plain", "đừng xếp gì trước 8h", ["|00:00-08:00|"]],
  ["plain", "sau 22h không học", ["|22:00-24:00|study"]],
  ["plain", "từ 12 giờ đến 1 giờ chiều để trống", ["|12:00-13:00|"]],
  ["plain", "từ 7 đến 9 giờ tối thứ năm để trống", ["4|19:00-21:00|"]],
  ["plain", "11:30 đến 13:00 để trống", ["|11:30-13:00|"]],
  ["plain", "thứ tư 14h-16h để trống", ["3|14:00-16:00|"]],
  ["plain", "t6 tối để trống", ["5|18:00-24:00|"]],
  ["plain", "thứ 7 và cn để trống", ["6,0|00:00-24:00|"]],
  ["plain", "bỏ trống tối thứ sáu", ["5|18:00-24:00|"]],
  ["plain", "giữ chiều chủ nhật cho mình nghỉ", ["0|12:00-18:00|"]],
  // spoken numbers
  ["spoken", "sau mười giờ tối đừng xếp gì", ["|22:00-24:00|"]],
  ["spoken", "trước sáu giờ sáng đừng xếp gì", ["|00:00-06:00|"]],
  ["spoken", "từ hai giờ đến bốn giờ chiều thứ ba để trống", ["2|14:00-16:00|"]],
  ["spoken", "sau chín giờ rưỡi tối không học", ["|21:30-24:00|study"]],
  ["spoken", "không học sau hai mươi ba giờ", ["|23:00-24:00|study"]],
  ["spoken", "thứ năm từ mười giờ đến mười một giờ rưỡi để trống", ["4|10:00-11:30|"]],
  // self-corrections
  ["correct", "tối thứ năm, à không, thứ sáu để trống", ["5|18:00-24:00|"]],
  ["correct", "sáng thứ bảy, nhầm, chiều thứ bảy để trống", ["6|12:00-18:00|"]],
  ["correct", "đừng xếp học sau 10 giờ, à không, 11 giờ tối", ["|23:00-24:00|study"]],
  ["correct", "chủ nhật để trống, ý là thứ bảy", ["6|00:00-24:00|"]],
  ["correct", "tối thứ sáu để trống, không phải, tối thứ năm", ["4|18:00-24:00|"]],
  // chains
  ["chain", "tối thứ sáu và sáng chủ nhật để trống", ["5|18:00-24:00|", "0|05:00-12:00|"]],
  ["chain", "sáng thứ hai, tối thứ tư để trống", ["1|05:00-12:00|", "3|18:00-24:00|"]],
  ["chain", "tối thứ sáu, thứ bảy và chủ nhật để trống", ["5,6,0|18:00-24:00|"]],
  ["chain", "không học sau 11 giờ đêm và không tập trước 6 giờ sáng", ["|23:00-24:00|study", "|00:00-06:00|exercise"]],
  ["chain", "từ thứ hai tới thứ sáu, sau 10 giờ tối không học", ["1,2,3,4,5|22:00-24:00|study"]],
  // exceptions
  ["except", "tối nào cũng để trống trừ thứ bảy", ["1,2,3,4,5,0|18:00-24:00|"]],
  ["except", "cuối tuần để trống ngoại trừ chủ nhật", ["6|00:00-24:00|"]],
  ["except", "ngày thường sau 9 giờ tối để trống trừ thứ sáu", ["1,2,3,4|21:00-24:00|"]],
  ["except", "tối nào cũng để trống trừ 8 đến 9 giờ", ["|18:00-20:00|", "|21:00-24:00|"]],
  ["except", "riêng thứ bảy thì được, tối nào cũng để trống", ["1,2,3,4,5,0|18:00-24:00|"]],
  ["except", "thứ bảy mình có việc riêng đừng xếp gì", ["6|00:00-24:00|"]],
  // past midnight
  ["midnight", "từ 11 giờ đêm đến 6 giờ sáng đừng xếp gì", ["|23:00-24:00|", "|00:00-06:00|"]],
  ["midnight", "thứ sáu từ 11 giờ đêm đến 6 giờ sáng để trống", ["5|23:00-24:00|", "6|00:00-06:00|"]],
  // Whisper mishearings
  ["asr", "tối thư bảy để trống", ["6|18:00-24:00|"]],
  ["asr", "đừng xếp việc học sau 11 giờ đếm", ["|23:00-24:00|study"]],
  ["asr", "để trống buổi tôi thứ năm", ["4|18:00-24:00|"]],
  ["asr", "chủ nhật để chống", ["0|00:00-24:00|"]],
  ["asr", "đừng sếp gì sau 10 dờ tối", ["|22:00-24:00|"]],
  ["asr", "cuối tuầng để trống", ["6,0|00:00-24:00|"]],
  ["asr", "thứ hai đến thứ tư sao 9 giờ tối để trống", ["1,2,3|21:00-24:00|"]],
  ["asr", "thứ sáo tối để trống", ["5|18:00-24:00|"]],
  ["asr", "tối thứ nằm để trống", ["4|18:00-24:00|"]],
  // no diacritics
  ["bare", "chu nhat de trong", ["0|00:00-24:00|"]],
  ["bare", "sang thu bay de trong", ["6|05:00-12:00|"]],
  ["bare", "dung xep hoc sau 23h", ["|23:00-24:00|study"]],
  ["bare", "toi thu 6 va sang cn de trong", ["5|18:00-24:00|", "0|05:00-12:00|"]],
  ["bare", "khong tap the duc truoc 6 gio sang", ["|00:00-06:00|exercise"]],
  // not rules: tasks, chatter, plans
  ["none", "mai 9 giờ ôn giải tích", []],
  ["none", "nộp bài tập thứ sáu", []],
  ["none", "tôi đi học thứ ba", []],
  ["none", "tối thứ sáu đi xem phim với Lan", []],
  ["none", "để trong tủ lạnh", []],
  ["none", "mỗi ngày nhé", []],
  ["none", "", []],
];

describe("corpus", () => {
  for (const [group, said, want] of CORPUS) it(`${group}: ${said || "(empty)"}`, () => expect(sum(said)).toEqual(want));
});

describe("forget corpus", () => {
  const R = (id: string, text: string, days: number[], from: number, to: number, kinds: Rule["kinds"] = []): Rule => ({ id, text, days, from, to, kinds, at: 0 });
  const rules = [R("fri", "Tối T6 để trống", [5], 1080, 1440), R("late", "Không học sau 23:00", [], 1380, 1440, ["study"]), R("sun", "Cả ngày CN để trống", [0], 0, 1440)];
  const ids = (s: string) => { const r = readRule(s, rules); return r && "forget" in r ? r.forget.map((x) => x.id) : r ? "add" : undefined; };
  it.each([
    ["quên lời dặn tối thứ sáu", ["fri"]],
    ["bỏ lời dặn không học", ["late"]],
    ["thôi không cần để trống chủ nhật nữa", ["sun"]],
    ["xoá lời dặn chủ nhựt", ["sun"]],
    ["quen loi dan toi thu sau", ["fri"]],
    ["xoá hết lời dặn", ["fri", "late", "sun"]],
    ["quên đi", undefined],
    ["bỏ trống tối thứ bảy", "add"],
  ] as [string, string[] | string | undefined][])("%s", (s, want) => expect(ids(s)).toEqual(want));
});

describe("forget cues that are really new rules", () => {
  it("'bỏ trống' and 'thôi xếp' without a rule word add, they don't forget", () => {
    const rules: Rule[] = [{ id: "a", text: "Tối T6 để trống", days: [5], from: 1080, to: 1440, kinds: [], at: 0 }];
    expect(readRule("bỏ trống sáng thứ bảy", rules)).toMatchObject({ add: [{ days: [6], from: 300 }] });
    expect(readRule("bỏ vụ tối thứ sáu đi", rules)).toEqual({ forget: rules });
  });
});

describe("midnight and noon clocks", () => {
  it("12 giờ đêm is the end of the day, the small hours run to morning, trưa is around noon", () => {
    expect(sum("từ 10 giờ tối đến 12 giờ đêm để trống")).toEqual(["|22:00-24:00|"]);
    expect(sum("sau 12 giờ đêm đừng xếp")).toEqual(["|00:00-05:00|"]);
    expect(sum("trưa từ 11 giờ đến 1 giờ để trống")).toEqual(["|11:00-13:00|"]);
    expect(sum("từ 11 giờ đêm đến 2 giờ đêm để trống")).toEqual(["|23:00-24:00|", "|00:00-02:00|"]);
    expect(sum("từ 12 giờ đêm đến 6 giờ sáng để trống")).toEqual(["|00:00-06:00|"]);
    expect(sum("12 giờ trưa đến 2 giờ chiều để trống")).toEqual(["|12:00-14:00|"]);
  });
});
