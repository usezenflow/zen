import { describe, expect, it } from "vitest";
import { target, think } from "./commands";

const now = new Date("2026-11-13T03:00:00Z"); // 10:00 Fri, UTC+7
const tasks = [
  { id: "t1", title: "Bài tập Toán", start: Date.parse("2026-11-13T07:00:00Z") }, // 14:00
  { id: "t2", title: "Báo cáo nhóm" },
  { id: "t3", title: "Đi nha sĩ" },
];

describe("voice commands", () => {
  it("finds the task the words name, accent-free", () => {
    expect(target("bai tap toan", tasks)?.id).toBe("t1");
    expect(target("lau nha", tasks)).toBeUndefined();
  });
  it("done, either word order", () => {
    expect(think("xong bài tập toán", now, tasks)).toEqual([{ op: "done", target: "t1" }]);
    expect(think("làm báo cáo nhóm xong rồi", now, tasks)).toEqual([{ op: "done", target: "t2" }]);
  });
  it("delete", () => {
    expect(think("xoá lịch đi nha sĩ", now, tasks)).toEqual([{ op: "delete", target: "t3" }]);
  });
  it("a move verb that is part of a task's title makes a new task", () => {
    const ts = [...tasks, { id: "t4", title: "Dọn phòng" }, { id: "t5", title: "Chuyển tiền" }];
    expect(think("dọn phòng vào thứ 7", now, ts)[0]).toMatchObject({ op: "create" });
    expect(think("chuyển tiền vào thứ 6", now, ts)[0]).toMatchObject({ op: "create" });
  });
  it("note keeps the original words", () => {
    expect(think("Ghi chú: ba gọi điện chiều mai", now, tasks)).toEqual([{ op: "note", title: "ba gọi điện chiều mai" }]);
  });
  it("a command naming no task is not understood; anything else is a create", () => {
    expect(think("xong lau nhà", now, tasks)).toEqual([]);
    expect(think("họp nhóm mai 9h", now, tasks)).toEqual([expect.objectContaining({ op: "create", when: "2026-11-14T09:00:00" })]);
    expect(think("mua sữa", now, tasks)[0]).toMatchObject({ op: "create" });
  });
});
