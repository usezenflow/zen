import { describe, expect, it } from "vitest";
import { anchorAction, anchorOf, anchorsOf } from "./anchor";
import type { Action, Task } from "../../types";

// A local-time instant; the finder reads days in local time, so tests build them the same way.
const at = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const now = at(2026, 11, 24, 9);
const task = (over: Partial<Task>): Task => ({ id: "t", title: "", kind: "study", source: "typed", ...over } as Task);
const exam = task({ id: "exam", title: "Thi Cơ sở dữ liệu", fixed: "exam", start: at(2026, 12, 4, 9), end: at(2026, 12, 4, 11) });
const lec = (id: string, d: number, h: number) => task({ id, title: "Toán cao cấp", fixed: "lecture", start: at(2026, 11, d, h), end: at(2026, 11, d, h + 2) });
const lecs = [lec("l1", 24, 7), lec("l2", 25, 7), lec("l3", 26, 13), lec("l4", 27, 7)];
const report = task({ id: "rep", title: "Báo cáo tuần", deadline: at(2026, 11, 30, 23, 59) });
const notes = task({ id: "bt", title: "Bài tập lớn", deadline: at(2026, 12, 1, 23, 59) });
const gym1 = task({ id: "g1", title: "Gym", start: at(2026, 11, 25, 18), end: at(2026, 11, 25, 19) });
const gym2 = task({ id: "g2", title: "Gym", start: at(2026, 11, 26, 18), end: at(2026, 11, 26, 19) });
const tasks = [exam, ...lecs, report, notes, gym1, gym2];
const base: Action = { op: "create", title: "Ôn" };

describe("anchors on a busy block", () => {
  const meet = task({ id: "m", title: "Họp nhóm đồ án", fixed: "busy", start: at(2026, 11, 26, 15), end: at(2026, 11, 26, 16) });
  it("after a meeting waits for its end; before it is due at its start", () => {
    const a = anchorOf("viết biên bản sau cuộc họp nhóm", [...tasks, meet], now)!;
    expect(a).toMatchObject({ rel: "after", kind: "busy" });
    expect(a.xs.map((x) => x.id)).toEqual(["m"]);
    expect(anchorAction(base, a).notBefore).toBeDefined();
    const b = anchorOf("chuẩn bị trước buổi họp nhóm", [...tasks, meet], now)!;
    expect(anchorAction(base, b).deadline).toBeDefined();
  });
});

describe("anchorOf", () => {
  it("before an exam names it by its words", () => {
    const h = anchorOf("ôn trước kỳ thi CSDL", tasks, now);
    expect(h).toMatchObject({ rel: "before", kind: "exam" });
    expect(h!.xs.map((x) => x.id)).toEqual(["exam"]);
  });
  it("a typoed exam name still finds the exam", () => {
    expect(anchorOf("ôn trước kỳ thi csld", tasks, now)?.xs.map((x) => x.id)).toEqual(["exam"]);
  });
  it("after a class, the ordinal picks the Nth of its matches", () => {
    const h = anchorOf("sau buổi Toán thứ 3 làm bài tập", tasks, now);
    expect(h).toMatchObject({ rel: "after", kind: "class" });
    expect(h!.xs.map((x) => x.id)).toEqual(["l3"]);
  });
  it("after finishing a task names it", () => {
    expect(anchorOf("sau khi xong báo cáo làm slide", tasks, now)).toMatchObject({ rel: "after", kind: "task" });
    expect(anchorOf("sau khi xong báo cáo làm slide", tasks, now)!.xs.map((x) => x.id)).toEqual(["rep"]);
  });
  it("before submitting a task takes its deadline", () => {
    expect(anchorOf("trước khi nộp Bài tập lớn ôn lại", tasks, now)!.xs.map((x) => x.id)).toEqual(["bt"]);
  });
  it("a name that several tasks match is ambiguous", () => {
    expect(anchorOf("sau khi xong gym", tasks, now)!.xs).toHaveLength(2);
  });
  it("accent-free names find the class", () => {
    expect(anchorOf("sau buoi toan thu 3", tasks, now)!.xs.map((x) => x.id)).toEqual(["l3"]);
  });
  it("a name with no match is an anchor with no candidates", () => {
    expect(anchorOf("trước khi nộp xyz", tasks, now)).toEqual({ rel: "before", kind: "task", xs: [] });
  });
  it("a clause with no cue is not an anchor", () => {
    expect(anchorOf("ôn csdl chiều mai", tasks, now)).toBeUndefined();
  });
});

describe("anchorsOf and anchorAction", () => {
  it("one match sets the deadline and the exam link", () => {
    const m = anchorsOf("ôn trước kỳ thi CSDL", ["Ôn kỳ thi Cơ sở dữ liệu"], tasks, now);
    const a = anchorAction(base, m.get(0)!);
    expect(a).toMatchObject({ deadline: "2026-12-04T09:00:00", anchor: "exam" });
  });
  it("after a class, notBefore is its end", () => {
    const a = anchorAction(base, anchorOf("sau buổi Toán thứ 3", tasks, now)!);
    expect(a.notBefore).toBe("2026-11-26T15:00:00");
  });
  it("after a task links it by id", () => {
    expect(anchorAction(base, anchorOf("sau khi xong báo cáo", tasks, now)!).after).toBe("rep");
    // the resolved phrase leaves the title: "làm slide sau khi xong báo cáo" is "làm slide"
    expect(anchorAction({ ...base, title: "Làm slide sau khi xong báo cáo" }, anchorOf("làm slide sau khi xong báo cáo", tasks, now)!)).toMatchObject({ title: "Làm slide", after: "rep" });
  });
  it("several matches flag the item and list the candidates", () => {
    const a = anchorAction(base, anchorOf("sau khi xong gym", tasks, now)!);
    expect(a.flags).toEqual(["anchor-ambiguous", expect.stringMatching(/^anchor:(before|after):/)]);
    expect(a.alternatives).toEqual(["g1", "g2"]);
    expect(a.after).toBeUndefined();
  });
  it("a fixed item is left as it is", () => {
    const fixed: Action = { ...base, fixed: "busy" };
    expect(anchorAction(fixed, anchorOf("sau khi xong báo cáo", tasks, now)!)).toBe(fixed);
  });
  it("with two items, the anchor goes to the item that shares its words", () => {
    const m = anchorsOf("ôn trước kỳ thi CSDL, đọc báo cáo", ["Ôn kỳ thi Cơ sở dữ liệu", "Đọc báo cáo"], tasks, now);
    expect([...m.keys()]).toEqual([0]);
  });
});

describe("readActions", () => {
  it("an anchored phrase reads as one item due at the exam", async () => {
    const { readActions } = await import("../adapt");
    const acts = readActions("ôn trước kỳ thi CSDL", new Date(now), "typed", { tasks });
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ deadline: "2026-12-04T09:00:00", anchor: "exam" });
  });
});

describe("anchorOf, said many ways", () => {
  const ktpm = task({ id: "kt", title: "Thi Kiểm thử phần mềm", fixed: "exam", start: at(2026, 12, 1, 9), end: at(2026, 12, 1, 11) });
  const ours = [...tasks, ktpm];
  const ids = (c: string) => anchorOf(c, ours, now)?.xs.map((x) => x.id);
  it.each([
    "đọc code outline trước ngày thi ktpm", "doc code outline truoc ngay thi KTPM", "đọc code outline trc ngày thi ktpm", "đọc code outline trươc ngày thi ktmp",
    "đọc code outline trước kì thi ktp", "đọc code outline trước ngày thi kiểm thử", "đọc code outline trước thi phần mềm", "đọc code outline before the exam ktpm",
    "đọc code outline truớc ngày thi ktpm", "đọc code outline trước buổi kiểm tra ktpm",
  ])("%s links the exam", (c) => expect(ids(c)).toEqual(["kt"]));
  it("a self-correction takes the corrected name", () => {
    expect(ids("đọc code trước ngày thi toán à nhầm ktpm")).toEqual(["kt"]);
    expect(ids("đọc code trước thi ktpm ý là csdl")).toEqual(["exam"]);
  });
  it("an exam cue never links a lecture of the same course", () => {
    const lk = task({ id: "lk", title: "Kiểm thử phần mềm", fixed: "lecture", start: at(2026, 11, 27, 7), end: at(2026, 11, 27, 9) });
    expect(anchorOf("ôn trước ngày thi ktpm", [...ours, lk], now)!.xs.map((x) => x.id)).toEqual(["kt"]);
  });
  it("several exams of the name are ambiguous: the which-one prompt", () => {
    const two = task({ id: "kt2", title: "Thi Kiểm thử phần mềm", fixed: "exam", start: at(2026, 12, 9, 9), end: at(2026, 12, 9, 11) });
    expect(anchorOf("ôn trước ngày thi ktpm", [...ours, two], now)!.xs).toHaveLength(2);
  });
  it("no anchor in plain dates", () => {
    expect(anchorOf("đọc code outline trước 1/12", ours, now)).toBeUndefined();
    expect(anchorOf("đọc code trước thứ 6", ours, now)).toBeUndefined();
  });
});
