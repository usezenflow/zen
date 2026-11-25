import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { askOf, commandOf, corrected, intentOf, learn, ordinalOf, soundFix, soundKey, splitHeard, splitOf } from "./intent";
import { think } from "./commands";

const now = new Date("2026-11-13T03:00:00Z"); // 10:00 Fri, UTC+7
const day = (d: number, h: number) => Date.UTC(2026, 10, d, h - 7);
const task = (id: string, title: string, start: number, extra: Partial<Task> = {}): Task =>
  ({ id, title, start, end: start + 3600_000, createdAt: 0, source: "user", ...extra }) as Task;
const tasks = [
  task("laundry", "Giặt đồ", day(14, 9)),
  task("gym1", "Gym", day(15, 18)),
  task("gym2", "Gym", day(16, 18)),
  task("meet", "Họp nhóm", day(14, 15)),
  task("report", "Báo cáo", day(20, 9)),
];

describe("intentOf", () => {
  it("reads a leading verb, typed or typoed", () => {
    expect(intentOf("xoá việc giặt đồ")).toMatchObject({ verb: "delete", rest: "việc giặt đồ", fuzzy: false });
    expect(intentOf("xao viec giat do")).toMatchObject({ verb: "delete", fuzzy: true });
    expect(intentOf("mvoe gym to tomorrow")).toMatchObject({ verb: "move", fuzzy: true });
    expect(intentOf("giúp mình dời họp sang 3h")).toMatchObject({ verb: "move" });
  });
  it("does not read a create line or an order as a command", () => {
    expect(intentOf("mua sữa")).toBeUndefined();
    expect(intentOf("làm bài 1 xong rồi làm bài 2")).toBeUndefined();
    expect(intentOf("bổ sung tài liệu")).toMatchObject({ verb: "delete", rest: "sung tài liệu" }); // a verb only; no task matches
  });
});

describe("commandOf", () => {
  it("one clear match is applied", () => {
    expect(commandOf("xoá việc giặt đồ", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "delete", target: "laundry" }] });
    expect(commandOf("xong giặt đồ", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "done", target: "laundry" }] });
  });
  it("a rename takes the new title", () => {
    expect(commandOf("đổi tên Giặt đồ thành Giặt quần áo", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "edit", target: "laundry", title: "Giặt quần áo" }] });
  });
  it("a move takes the new time", () => {
    const c = commandOf("dời họp sang 3h", now.getTime(), tasks);
    expect(c).toMatchObject({ kind: "one", actions: [{ op: "edit", target: "meet" }] });
    expect(c?.kind === "one" && c.actions[0].when).toBeTruthy();
    expect(commandOf("move báo cáo to tomorrow", now.getTime(), tasks)?.kind).toBe("one");
  });
  it("two tasks with the same name are a choice", () => {
    const c = commandOf("huỷ gym", now.getTime(), tasks);
    expect(c).toMatchObject({ kind: "choose", verb: "delete" });
    expect(c?.kind === "choose" && c.options.map((o) => o.label)).toEqual(["huỷ Gym", "huỷ Gym", "Xoá cả hai"]);
    const both = c?.kind === "choose" ? c.options[2] : undefined;
    expect(both?.actions).toHaveLength(2); // the extra choice removes every match at once
  });
  it("a bulk word asks for a count", () => {
    expect(commandOf("xoá hết gym", now.getTime(), tasks)).toMatchObject({ kind: "bulk", count: 2 });
  });
  it("no match falls through to create", () => {
    expect(commandOf("xoá việc chẳng có", now.getTime(), tasks)).toBeUndefined();
    expect(think("xoá việc chẳng có", now, "typed", {}, tasks)[0]).toMatchObject({ op: "create" });
  });
  it("a create sentence with a guard word stays a create", () => {
    expect(commandOf("bỏ rác", now.getTime(), tasks)).toBeUndefined();
  });
  it("think applies a one-match command, and keeps creating otherwise", () => {
    expect(think("xoá việc giặt đồ", now, "typed", {}, tasks)).toEqual([{ op: "delete", target: "laundry" }]);
    expect(think("họp nhóm mai 9h", now, "typed", {}, tasks)).toEqual([expect.objectContaining({ op: "create" })]);
  });
});

describe("think never returns nothing for a non-empty line", () => {
  it("a command-only or filler-only line still reads as creates", () => {
    for (const line of ["dọn phòng vào thứ 7", "huỷ gym", "xoá hết gym", "khỏi lo", "thôi", "gym xong rồi đi ăn", "xong việc thì đi ngủ", "xoá giặt đồ, thêm học toán 3h chiều mai", "bỏ rác", "xoa", "xog r"])
      expect(think(line, now, "typed", {}, tasks).length, line).toBeGreaterThan(0);
  });
  it("a fuzzy verb does not ask, and a done is not read from 'xong rồi' with words after", () => {
    expect(commandOf("dọn phòng vào thứ 7", now.getTime(), [...tasks, { ...tasks[0], id: "clean", title: "Dọn phòng" }])).toBeUndefined();
    expect(commandOf("gym xong rồi đi ăn", now.getTime(), tasks)).toBeUndefined();
  });
  it("filler is not a task; a leading 'thôi' is dropped; 'vs' carries the verb", () => {
    expect(think("khỏi lo, mai nộp báo cáo", now, "typed", {}, tasks).map((a) => a.title)).toEqual([expect.stringMatching(/nộp báo cáo/i)]);
    expect(think("thôi mai học bù", now, "typed", {}, tasks).map((a) => a.title)).toEqual([expect.stringMatching(/học bù/i)]);
    const solo = [tasks[3], { ...tasks[1], id: "gym" }]; // one Gym, one Họp nhóm
    expect(think("bo hop nhom vs gym", now, "typed", {}, solo)).toEqual([{ op: "delete", target: "meet" }, { op: "delete", target: "gym" }]);
  });
});

describe("slang and typos", () => {
  it("a delete says 'bỏ cái … đi', 'không cần … nữa', 'thôi khỏi …', 'khỏi … đi', typoed or not", () => {
    expect(intentOf("bỏ cái gym đi")).toMatchObject({ verb: "delete", rest: "gym" });
    expect(intentOf("k cần giặt đồ nữa")).toMatchObject({ verb: "delete", rest: "giặt đồ" });
    expect(intentOf("khôg cần giặt đồ nữa")).toMatchObject({ verb: "delete", rest: "giặt đồ" });
    expect(intentOf("thôi khỏi họp nhóm")).toMatchObject({ verb: "delete", rest: "họp nhóm" });
    expect(intentOf("khỏi họp nhóm đi")).toMatchObject({ verb: "delete", rest: "họp nhóm" });
    expect(intentOf("cancle gym")).toMatchObject({ verb: "delete", fuzzy: true });
  });
  it("a done says 'X xong r', 'X xong rùi', 'X done'", () => {
    expect(commandOf("giặt đồ xong r", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "done", target: "laundry" }] });
    expect(commandOf("giặt đồ xong rùi", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "done", target: "laundry" }] });
    expect(commandOf("giat do xog r", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "done", target: "laundry" }] });
  });
  it("a move says 'X để mai', 'X lùi N tiếng' from its own start", () => {
    expect(commandOf("họp nhóm để mai", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "edit", target: "meet" }] });
    const c = commandOf("họp nhóm lùi 1 tiếng", now.getTime(), tasks);
    expect(c).toMatchObject({ kind: "one", actions: [{ op: "edit", target: "meet", when: "2026-11-14T16:00:00" }] }); // 15:00 + 1h, wall clock
    expect(commandOf("họp nhóm sớm 1h", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "edit", target: "meet" }] });
  });
  it("a bare hour after 'sang' in a move reads as the afternoon", () => {
    const c = commandOf("dời họp nhóm sang 4h", now.getTime(), tasks);
    expect(c?.kind === "one" && c.actions[0].when).toMatch(/T16:00/);
  });
  it("a rename says 'đổi X thành Y', typoed too; a time after 'thành' is a move", () => {
    expect(commandOf("đổi giặt đồ thàh giặt áo", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "edit", target: "laundry", title: "giặt áo" }] });
    expect(commandOf("đổi giặt đồ thành 4h", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "edit", target: "laundry" }] });
  });
  it("trailing particles are dropped: nhé, đi, luôn, giùm, với, ạ", () => {
    expect(commandOf("xoá giặt đồ nhé", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "delete", target: "laundry" }] });
    expect(commandOf("xoa giat do nhaa", now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "delete", target: "laundry" }] });
  });
});

describe("a line with several parts", () => {
  const en = [{ ...tasks[0], id: "laundry", title: "Laundry" }, { ...tasks[3], id: "meet", title: "Team meeting" }, { ...tasks[1], id: "read", title: "Read book" }];
  it("a delete and a create in one line: the delete is applied, the rest is a create", () => {
    expect(think("xoá giặt đồ, thêm học toán 3h chiều mai", now, "typed", {}, tasks)).toEqual([
      { op: "delete", target: "laundry" },
      expect.objectContaining({ op: "create", title: "Học toán" }),
    ]);
  });
  it("two commands and no create", () => {
    const a = think("xoá giặt đồ và dời họp nhóm sang 4h", now, "typed", {}, tasks);
    expect(a).toEqual([{ op: "delete", target: "laundry" }, expect.objectContaining({ op: "edit", target: "meet" })]);
  });
  it("a command after 'rồi', and a particle before a comma", () => {
    expect(splitOf("dời họp nhóm sang 3h rồi xoá giặt đồ", now.getTime(), tasks)?.ones.map((o) => o.label)).toEqual(["dời Họp nhóm", "xoá Giặt đồ"]);
    expect(think("huỷ giặt đồ nhé, tối nay đi ăn với Minh", now, "typed", {}, tasks)).toEqual([
      { op: "delete", target: "laundry" },
      expect.objectContaining({ op: "create", title: "Đi ăn với Minh" }),
    ]);
  });
  it("an ambiguous part is a chip, and the rest of the line is still applied", () => {
    const s = splitOf("dời họp nhóm sang 3h rồi xoá gym", now.getTime(), tasks);
    expect(s?.asks.map((a) => a.text)).toEqual(["xoá gym"]);
    expect(think("dời họp nhóm sang 3h rồi xoá gym", now, "typed", {}, tasks)).toEqual([expect.objectContaining({ op: "edit", target: "meet" })]);
  });
  it("English parts: a delete, a comma-less 'and', and a create with 'add' dropped", () => {
    expect(think("delete laundry and add study math tomorrow 3pm", now, "typed", {}, en)).toEqual([
      { op: "delete", target: "laundry" },
      expect.objectContaining({ op: "create", title: expect.stringMatching(/study math/i) }),
    ]);
    expect(think("move read book to friday, then add team meeting", now, "typed", {}, en)).toEqual([
      expect.objectContaining({ op: "edit", target: "read" }),
      expect.objectContaining({ op: "create" }),
    ]);
  });
  it("a line with no command part is read as before, order included", () => {
    expect(splitOf("học toán rồi làm bài tập", now.getTime(), tasks)).toBeUndefined();
    expect(think("học toán rồi làm bài tập", now, "typed", {}, tasks).map((a) => a.title)).toEqual(["Học toán", "Làm bài tập"]);
  });
  it("the guards hold with typos: 'bo rac', 'chuyen nha', 'chuyen khoan' stay creates", () => {
    for (const line of ["bỏ rác", "bo rac", "chuyển nhà", "chuyen nha", "chuyển khoản cho mẹ", "chuyen khoan cho me", "dọn phòng vào thứ 7", "xong việc nhà", "cancel subscription"])
      expect(think(line, now, "typed", {}, tasks).every((a) => a.op === "create")).toBe(true);
  });
});

describe("a series and the days said", () => {
  // Gym every Mon, Wed, Fri at 18:00 over three weeks; now is Fri 13 at 10:00
  const g = (d: number) => task(`g${d}`, "Gym", day(d, 18), { rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR", seriesId: "gym" });
  const weekly = [11, 13, 16, 18, 20, 23, 25, 27].map(g);
  const cmd = (l: string) => commandOf(l, now.getTime(), weekly);
  const ids = (c: ReturnType<typeof cmd>) => (c && "actions" in c ? c.actions.map((a) => a.target) : []);
  it("takes every session in the days said, and asks first naming them", () => {
    expect(cmd("xoá gym tuần sau")).toMatchObject({ kind: "bulk", count: 3, label: "Xoá 3 buổi Gym: T2 16/11, T4 18/11, T6 20/11?" });
    expect(ids(cmd("xoa gym tuan nay"))).toEqual(["g11", "g13"]);
    expect(ids(cmd("xoá gym T2 và T4"))).toEqual(["g16", "g18"]);
    expect(ids(cmd("xoá gym tuần sau trừ T6"))).toEqual(["g16", "g18"]);
    expect(ids(cmd("xong gym từ T2 đến T4"))).toEqual(["g16", "g18"]);
  });
  it("one session said is one, without asking", () => {
    expect(cmd("xoá gym T6")).toMatchObject({ kind: "one", actions: [{ op: "delete", target: "g13" }] });
  });
  it("a series named with no day asks: the next session, or the whole series as a scope", () => {
    const c = cmd("xoá gym");
    expect(c?.kind).toBe("choose");
    expect(c?.kind === "choose" && c.options.map((o) => [o.label, o.series])).toEqual([["Xoá buổi T6 13/11", undefined], ["Xoá cả chuỗi Gym", { id: "g13", scope: "all" }]]);
    expect(cmd("xoá hết gym")).toMatchObject({ kind: "bulk", count: 8, series: { id: "g13", scope: "all" } });
    expect(cmd("xoá gym từ giờ")).toMatchObject({ kind: "bulk", series: { id: "g13", scope: "following" } });
  });
  it("a move to a clock moves each session in the days said; to a day, the one said", () => {
    const c = cmd("dời gym tuần sau sang 7h tối");
    expect(c && "actions" in c && c.actions.map((a) => a.when)).toEqual(["2026-11-16T19:00:00", "2026-11-18T19:00:00", "2026-11-20T19:00:00"]);
    expect(cmd("dời gym 16/11 sang 17/11")).toMatchObject({ kind: "one", actions: [{ op: "edit", target: "g16", when: "2026-11-17T18:00:00" }] });
  });
});

describe("corrected", () => {
  it("puts a corrected value, day or name in its place, and keeps the rest", () => {
    expect(corrected("dời họp sang 3h à không 4h").line).toBe("dời họp sang 4h");
    expect(corrected("dời họp sang 3h, à không, sang 4h chiều").line).toBe("dời họp sang 4h chiều");
    expect(corrected("xoá gym T2 à nhầm T4").line).toBe("xoá gym T4");
    expect(corrected("dời gym sang 7h à nhầm yoga").line).toBe("dời yoga sang 7h");
    expect(corrected("xoá gym à không dời gym sang mai").line).toBe("dời gym sang mai");
    expect(corrected("đổi tên gym thành chạy ý là thành bơi").line).toBe("đổi tên gym thành bơi");
    expect(corrected("xoá yoga, dời họp sang 3h à không 4h").line).toBe("xoá yoga, dời họp sang 4h");
  });
  it("drops a command taken back, and keeps what follows", () => {
    expect(corrected("xoá gym, à thôi")).toEqual({ line: "", cancelled: true });
    expect(corrected("xoá gym à thôi, dời họp sang 4h")).toEqual({ line: "dời họp sang 4h", cancelled: true });
    expect(think("xoá giặt đồ, à thôi", now, "typed", {}, tasks)).toEqual([]);
  });
  it("leaves a line that is no command to the reader", () => {
    expect(corrected("họp nhóm 9h à quên 10h").line).toBe("họp nhóm 9h à quên 10h");
    expect(corrected("xoá giặt đồ thôi").line).toBe("xoá giặt đồ thôi"); // "just delete it"
  });
});

describe("verbs as typed or heard", () => {
  it("reads Telex, s/x and tr/ch, a typo in a phrase, a glued verb", () => {
    for (const l of ["xoas giặt đồ", "sóa giặt đồ", "xoagiat do", "xoá dùm giặt đồ", "khong cna giat do nua"]) expect(commandOf(l, now.getTime(), tasks)).toMatchObject({ kind: "one", actions: [{ op: "delete", target: "laundry" }] });
    expect(intentOf("truyển họp sang 4h")).toMatchObject({ verb: "move" });
    expect(intentOf("doi tne gym thanh boi")).toMatchObject({ verb: "rename", fuzzy: true });
  });
  it("never reads a no, or a word near a verb, as a command", () => {
    for (const l of ["đừng xoá gym", "không xoá gym nữa", "chưa xong báo cáo", "báo cáo chưa xong", "don't delete gym", "huyền thoại", "xoài"]) expect(commandOf(l, now.getTime(), tasks)).toBeUndefined();
  });
  it("reads a shift said in words or with a half", () => {
    expect(intentOf("lùi họp nhóm 1 tiếng")).toMatchObject({ rest: "họp nhóm", delta: 60 });
    expect(intentOf("họp nhóm lùi một tiếng rưỡi")).toMatchObject({ rest: "họp nhóm", delta: 90 });
    expect(intentOf("hop nhom som nua tieng")).toMatchObject({ delta: -30 });
    expect(intentOf("dời họp nhóm 3 giờ")?.delta).toBeUndefined(); // a time, not a shift
  });
  it("splits a voice line with no commas at a second verb", () => {
    expect(think("xoá giặt đồ dời họp nhóm sang 4h", now, "typed", {}, tasks).map((a) => [a.op, a.target])).toEqual([["delete", "laundry"], ["edit", "meet"]]);
  });
});

describe("which sessions, no name, new verbs (plan steps 7–10)", () => {
  const g = (d: number) => task(`g${d}`, "Gym", day(d, 18), { rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR", seriesId: "gym" });
  const weekly = [11, 13, 16, 18, 20, 23, 25, 27].map(g);
  const T = now.getTime();
  const ids = (c: ReturnType<typeof commandOf>) => (c && "actions" in c ? c.actions.map((a) => a.target) : []);
  it("ordinals and counts: next, the next N, the last, the Nth", () => {
    expect(commandOf("xoá buổi gym tiếp theo", T, weekly)).toMatchObject({ kind: "one", actions: [{ op: "delete", target: "g13" }] });
    expect(ids(commandOf("xoá 2 buổi gym tới", T, weekly))).toEqual(["g13", "g16"]);
    expect(ids(commandOf("xoá buổi cuối gym tuần sau", T, weekly))).toEqual(["g20"]);
    expect(ids(commandOf("xoá buổi thứ 2 của gym tuần sau", T, weekly))).toEqual(["g18"]);
    expect(ordinalOf("gym buổi tối")).toBeUndefined(); // a part of the day in a title
    expect(ordinalOf("gym 2 tuần tới")).toBeUndefined();
  });
  it("plural words say a set", () => {
    expect(commandOf("xoá các buổi gym tuần sau", T, weekly)).toMatchObject({ kind: "bulk", count: 3 });
    expect(commandOf("xoá mấy cái gym tuần sau", T, weekly)).toMatchObject({ kind: "bulk", count: 3 });
  });
  it("no name: a scope with 'hết' finds every task in it, and always asks", () => {
    const c = commandOf("dời hết việc mai sang CN", T, tasks);
    expect(c).toMatchObject({ kind: "bulk", count: 2 });
    expect(c?.kind === "bulk" && c.actions.map((a) => a.when)).toEqual(["2026-11-15T09:00:00", "2026-11-15T15:00:00"]);
    const d = commandOf("lùi hết lịch chiều mai 30 phút", T, tasks);
    expect(d).toMatchObject({ kind: "bulk", count: 1, actions: [{ target: "meet", when: "2026-11-14T15:30:00" }] });
  });
  it("pointing words act on what was just touched", () => {
    expect(commandOf("xoá nó", T, tasks, { last: ["laundry"] })).toMatchObject({ kind: "one", actions: [{ op: "delete", target: "laundry" }] });
    expect(commandOf("dời cái đó sang 5h chiều", T, tasks, { last: ["meet"] })).toMatchObject({ kind: "one", actions: [{ target: "meet", when: "2026-11-14T17:00:00" }] });
  });
  it("reopen, shorten, an end time", () => {
    const xs = [...tasks, task("read", "Đọc sách", day(12, 20), { doneAt: day(12, 21) })];
    expect(commandOf("chưa xong đọc sách", T, xs)).toMatchObject({ kind: "one", actions: [{ op: "edit", target: "read", reopen: true }] });
    expect(commandOf("mở lại đọc sách", T, xs)).toMatchObject({ kind: "one", actions: [{ target: "read", reopen: true }] });
    expect(commandOf("chưa xong giặt đồ", T, xs)).toBeUndefined(); // not done: nothing to reopen
    expect(commandOf("rút họp nhóm còn 30p", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "meet", effortMinutes: 30 }] });
    expect(commandOf("bớt 15p họp nhóm", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "meet", effortMinutes: 45 }] });
    expect(commandOf("rút ngắn họp nhóm 15 phút", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "meet", effortMinutes: 45 }] });
    expect(commandOf("họp nhóm kết thúc lúc 5h", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "meet", effortMinutes: 120 }] });
  });
  it("deadline, room, note, swap", () => {
    const xs = [...tasks.filter((x) => x.id !== "report"), task("report", "Báo cáo", day(20, 9), { deadline: day(22, 17) })];
    const d = commandOf("hạn báo cáo dời sang 25/11", T, xs);
    expect(d).toMatchObject({ kind: "one", actions: [{ target: "report", deadline: "2026-11-25T17:00:00" }] });
    expect(d?.kind === "one" && d.actions[0].when).toBeFalsy();
    expect(commandOf("dời hạn báo cáo sang 25/11", T, xs)).toMatchObject({ kind: "one", actions: [{ target: "report", deadline: "2026-11-25T17:00:00" }] });
    expect(commandOf("đổi phòng họp nhóm sang B2", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "meet", location: "B2" }] });
    expect(commandOf("họp nhóm đổi phòng sang B2", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "meet", location: "B2" }] });
    expect(commandOf("ghi chú giặt đồ: dùng nước xả", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "laundry", note: "dùng nước xả" }] });
    expect(splitOf("đổi chỗ giặt đồ và họp nhóm", T, tasks)?.ones[0].actions).toEqual([
      { op: "edit", target: "laundry", when: "2026-11-14T15:00:00" }, { op: "edit", target: "meet", when: "2026-11-14T09:00:00" }]);
  });
  it("skip one session, pause a span, hand one to the planner for later", () => {
    expect(commandOf("bỏ qua gym", T, weekly)).toMatchObject({ kind: "one", actions: [{ op: "delete", target: "g13" }] });
    expect(ids(commandOf("tạm dừng gym 2 tuần", T, weekly))).toEqual(["g13", "g16", "g18", "g20", "g23", "g25"]);
    expect(commandOf("tạm dừng gym", T, weekly)).toBeUndefined();
    expect(splitOf("hoãn giặt đồ", T, tasks)?.later).toEqual([{ label: "hoãn Giặt đồ", ids: ["laundry"] }]);
    expect(splitOf("giặt đồ để sau", T, tasks)?.later?.[0].ids).toEqual(["laundry"]);
    expect(think("hoãn giặt đồ", now, "typed", {}, tasks)).toEqual([]);
  });
  it("a bare clock keeps the task's half of the day; a number names one task; a done on a weekday looks back", () => {
    const xs = [...tasks, task("yoga", "Yoga", day(17, 7)), task("b1", "Bài 1", day(18, 9)), task("b12", "Bài 12", day(18, 10))];
    expect(commandOf("dời yoga sang 8h", T, xs)).toMatchObject({ kind: "one", actions: [{ target: "yoga", when: "2026-11-17T08:00:00" }] });
    expect(commandOf("xoá bài 1", T, xs)).toMatchObject({ kind: "one", actions: [{ target: "b1" }] });
    expect(commandOf("xong gym T4", T, weekly)).toMatchObject({ kind: "one", actions: [{ op: "done", target: "g11" }] });
  });
  it("a scope with nothing in it says so", () => {
    expect(commandOf("xoá giặt đồ tuần sau", T, tasks)).toMatchObject({ kind: "choose", ask: "Không thấy giặt đồ tuần sau", options: [] });
  });
  it("a pick teaches its words; an undo makes them ask", () => {
    expect(commandOf("huỷ gym", T, tasks)?.kind).toBe("choose");
    const l = learn({}, "gym", "gym2", "pick");
    expect(commandOf("huỷ gym", T, tasks, l)).toMatchObject({ kind: "one", actions: [{ target: "gym2" }] });
    expect(commandOf("xoá giặt đồ", T, tasks, learn(l, "giat do", "laundry", "undo"))).toMatchObject({ kind: "choose", options: [{ actions: [{ target: "laundry" }] }] });
    expect(learn(l, "gym", "gym2", "undo").alias).toEqual({});
  });
  it("voice: another guess is taken only when the heard line was a command", () => {
    expect(splitHeard("xoá dắt đồ", ["xoá giặt đồ"], T, tasks)?.ones[0].actions).toEqual([{ op: "delete", target: "laundry" }]);
    expect(splitHeard("mua sữa", ["xoá giặt đồ"], T, tasks)).toBeUndefined();
  });
});

describe("askOf", () => {
  it("a question about the tasks is a search, never a create", () => {
    expect(askOf("mai có gì")).toBe("mai");
    expect(askOf("tối nay có gì không?")).toBe("tối nay");
    expect(askOf("tuần này còn mấy bài tập")).toBe("tuần này bài tập");
    expect(askOf("khi nào thi toán?")).toBe("thi toán");
    expect(askOf("khi nào rảnh thì dọn phòng")).toBeUndefined();
    expect(askOf("mua sữa")).toBeUndefined();
    expect(askOf("con mèo")).toBeUndefined();
  });
});

describe("the deferred ones: a clock as the target, a said length, redo, a series' new days, titles by sound", () => {
  const T = now.getTime();
  const g = (d: number) => task(`g${d}`, "Gym", day(d, 18), { rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR", seriesId: "gym" });
  const weekly = [13, 16, 18, 20].map(g);
  it("'cái lúc 3h' is the task at that clock, today on; two at it are a choice", () => {
    expect(commandOf("xoá cái lúc 3h chiều mai", T, tasks)).toMatchObject({ kind: "one", actions: [{ op: "delete", target: "meet" }] });
    expect(commandOf("xoá cái lúc 3h", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "meet" }] }); // either half: 15:00
    expect(commandOf("dời cái lúc 9h mai sang 10h", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "laundry", when: "2026-11-14T10:00:00" }] });
    expect(commandOf("xoá cái lúc 6h", T, tasks)).toMatchObject({ kind: "choose", options: [{ actions: [{ target: "gym1" }] }, { actions: [{ target: "gym2" }] }] });
  });
  it("'X 45 phút thôi' sets the length; 'X 45 phút' stays a new task", () => {
    expect(commandOf("họp nhóm 45 phút thôi", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "meet", effortMinutes: 45 }] });
    expect(commandOf("họp nhóm 1 tiếng rưỡi là đủ", T, tasks)).toMatchObject({ kind: "one", actions: [{ target: "meet", effortMinutes: 90 }] });
    expect(commandOf("họp nhóm 45 phút", T, tasks)).toBeUndefined();
  });
  it("'làm lại' reopens a done task, and never by a typo", () => {
    const xs = [...tasks, task("hw", "Viết luận", day(12, 20), { doneAt: day(12, 21) })];
    expect(commandOf("làm lại viết luận", T, xs)).toMatchObject({ kind: "one", actions: [{ target: "hw", reopen: true }] });
    expect(commandOf("làm viết luận", T, xs)).toBeUndefined();
    expect(commandOf("làm lại giặt đồ", T, xs)).toBeUndefined(); // not done: a task to make
  });
  it("new weekdays for a series ask first, from the day said", () => {
    expect(commandOf("từ tuần sau gym chuyển sang T3, T5", T, weekly)).toMatchObject({ kind: "rule", id: "g13", rrule: "FREQ=WEEKLY;BYDAY=TU,TH", from: Date.UTC(2026, 10, 15, 17), label: "Gym: T3, T5 từ T2 16/11?" });
    expect(commandOf("đổi lịch gym sang T3 và T5", T, weekly)).toMatchObject({ kind: "rule", from: T });
    expect(commandOf("gym chuyển sang T2 hằng tuần", T, weekly)).toMatchObject({ kind: "rule", rrule: "FREQ=WEEKLY;BYDAY=MO" });
    expect(commandOf("dời gym sang T3", T, weekly)?.kind).not.toBe("rule"); // one weekday: one session moves
    expect(splitOf("từ tuần sau gym chuyển sang T3, T5", T, weekly)?.asks[0].cmd.kind).toBe("rule");
  });
  it("voice: a word that sounds like a title word is tried as it", () => {
    expect(soundKey("gym")).toBe(soundKey("dim"));
    expect(soundKey("jim")).toBe(soundKey("gym"));
    const xs = [tasks[0], task("gym", "Gym", day(15, 18)), task("yoga", "Yoga", day(17, 7))];
    expect(soundFix("xoá dim", xs)).toBe("xoá Gym");
    expect(soundFix("xoá y ô ga", xs)).toBe("xoá Yoga");
    expect(splitHeard("xoá dim", [], T, xs)?.ones[0].actions).toEqual([{ op: "delete", target: "gym" }]);
    expect(splitHeard("xoá dim", undefined, T, xs)).toBeUndefined(); // typed: no guessing
    expect(splitHeard("dim sum tối nay", [], T, xs)).toBeUndefined(); // no verb heard: never a command
  });
});
