import { describe, expect, it } from "vitest";
import { fold } from "./fold";
import { read } from "./reader";
import { mentionsOf } from "./mentions";

describe("reader titles", () => {
  it("extracts bulk 5 items without error", () => {
    const text =
      "Launch Zenflow trc mai, quay demo và hoàn thiện báo cáo hết tuần này, học system design hết tuần này, viết bc môn web trc 20/11, đọc code zf hết tuần này";
    const r = read(text, {
      source: "paste",
      ref: { y: 2026, m: 11, d: 5, h: 9, mi: 0 },
    });
    expect(r.items).toHaveLength(5);
    expect(r.items[0]).toMatchObject({ title: "Launch Zenflow", type: "PLAN" });
    expect(r.items[1]).toMatchObject({
      title: "Quay demo và hoàn thiện báo cáo",
      type: "PLAN",
    });
    expect(r.items[2]).toMatchObject({
      title: "Học system design",
      type: "PLAN",
    });
    expect(r.items[3]).toMatchObject({ title: "Đọc code zf", type: "PLAN" });
    expect(r.items[4]).toMatchObject({
      title: "Viết Báo cáo môn web",
      type: "ASSIGNMENT",
    });
  });

  it("extracts mentions covering the part-of-day words in time mentions", () => {
    const text = "Bao cao web 9h tối đến 11h đêm 21/11";
    const mentions = mentionsOf(text);
    const spans = mentions.map((m) => text.slice(m.start, m.end));
    expect(spans).toContain("9h tối");
    expect(spans).toContain("11h đêm");
    expect(spans).toContain("21/11");
  });

  it("marks a duration as dur, not time", () => {
    const text = "học raft mất 2 tiếng trong tuần này";
    const mentions = mentionsOf(text);
    expect(mentions).toContainEqual({
      kind: "dur",
      start: text.indexOf("2 tiếng"),
      end: text.indexOf("2 tiếng") + "2 tiếng".length,
    });
  });

  it("calculates 120min duration from time range 9h toi den 11h dem", () => {
    const text = "Bao cao web 9h tối đến 11h đêm 21/11";
    const r = read(text, {
      source: "typed",
      ref: { y: 2026, m: 11, d: 5, h: 9, mi: 0 },
    });
    const dnd = r.items.find((i) => i.type === "BUSY");
    expect(dnd).toMatchObject({
      title: "Bao cao web",
      startsAt: "2026-11-21 21:00",
      durationMinutes: 120,
    });
    // the clock with no due cue also asks for its prep, due at the start
    expect(r.items.find((i) => i.type === "PLAN")).toMatchObject({
      deadline: "2026-11-21 21:00",
      durationMinutes: 120,
    });
  });

  it("the folded cue word tu never leaks into a title", () => {
    const r = read("Làm báo cáo từ thứ hai", {
      source: "typed",
      ref: { y: 2026, m: 11, d: 5, h: 20, mi: 0 },
    });
    expect(r.items.length).toBeGreaterThan(0);
    for (const it of r.items)
      expect(fold(it.title).text.split(/\s+/)).not.toContain("tu");
  });

  it("extracts announcement topic as title and keeps a past full date as written", () => {
    const text =
      "Trợ lý CTSV Khoa Công nghệ Thông tin thông báo đến các em sinh viên về việc cập nhật thông tin khám sức khỏe định kỳ, khám sàng lọc miễn phí năm 2026 dành cho sinh viên Trường Đại học Đà Lạt.\n" +
      "Thời gian thực hiện: từ khi ban hành thông báo đến hết 17 giờ 30 phút, ngày 28/10/2026.";
    const r = read(text, {
      source: "paste",
      ref: { y: 2026, m: 11, d: 6, h: 10, mi: 0 },
    });

    expect(r.items).toHaveLength(1);
    const item = r.items[0];
    expect(item.title).toBe("Cập nhật thông tin khám sức khỏe định kỳ");
    expect(item.deadline).toBe("2026-10-28 17:30");
    // a full date already past stays as written, never checked and never moved to another year
    expect(item.flags).toEqual([]);
    expect(item.alternatives).toEqual([]);
    expect(item.checked).toBe(false);
  });

  it("rejects boilerplate titles like 'khi ban hành thông báo'", () => {
    const text =
      "Thời gian thực hiện: từ khi ban hành thông báo đến hết 17 giờ 30 phút, ngày 28/10/2026.";
    const r = read(text, {
      source: "paste",
      ref: { y: 2026, m: 10, d: 26, h: 9, mi: 0 },
    });

    expect(r.items).toHaveLength(1);
    const item = r.items[0];
    expect(fold(item.title).text).not.toMatch(/khi\s+(?:ban\s+)?hanh/);
  });

  it("correctly extracts academic thesis announcement without heading bleeding or wrong agency rewriting", () => {
    const text = `Gửi các bạn Một số mốc thời gian cần lưu ý cho đồ án:





Thời gian báo cáo tiến độ lần 2: từ 2/11 đến hết ngày 8/11/2026.

Hội đồng: Nhận xét, góp ý kết quả thực hiện trong đợt 2 và các thay đổi so với đợt 1;

GVHD: Đọc, góp ý báo cáo tổng kết Đồ án tốt nghiệp của sinh viên.





Sinh viên gửi báo cáo cho GVPB (báo cáo Word, PowerPoint và video demo): từ 15/11 đến hết ngày 22/11/2026;



Sinh viên hoàn thiện báo cáo theo góp ý của GVPB: từ 23/11 đến hết ngày 29/11/2026;



Sinh viên nộp báo cáo theo lịch thi khoa: sáng ngày 30/11/2026 (xem lịch thi);



Bảo vệ Đồ án theo hội đồng: từ 30/11 đến hết ngày 6/12/2026.`;

    const r = read(text, {
      source: "paste",
      ref: { y: 2026, m: 11, d: 6, h: 18, mi: 45 },
    });

    expect(r.items).toHaveLength(7);

    // 1. First item should NOT contain salutation / heading "Gửi các bạn" or "Một số mốc"
    const item0 = r.items[0];
    expect(item0.title).toContain("báo cáo tiến độ lần 2");
    expect(fold(item0.title).text).not.toContain("gui");
    expect(fold(item0.title).text).not.toContain("moc");
    expect(fold(item0.title).text).not.toContain("luu y");
    expect(item0.notBefore).toBe("2026-11-02 00:00");
    expect(item0.deadline).toBe("2026-11-08 23:59");

    // 2. Second item: send to reviewer
    const item1 = r.items[1];
    expect(fold(item1.title).text).toContain("gui bao cao cho gvpb");
    expect(item1.notBefore).toBe("2026-11-15 00:00");
    expect(item1.deadline).toBe("2026-11-22 23:59");

    // 3. Third item: complete per reviewer feedback
    const item2 = r.items[2];
    expect(fold(item2.title).text).toContain(
      "hoan thien bao cao theo gop y cua gvpb",
    );
    expect(item2.notBefore).toBe("2026-11-23 00:00");
    expect(item2.deadline).toBe("2026-11-29 23:59");

    // 4. Fourth item: the window's report prep, sorted by its deadline
    const item3 = r.items[3];
    expect(fold(item3.title).text).toContain("bao ve do an");
    expect(item3.deadline).toBe("2026-11-29 23:59");

    // 5. Submission assignment ("Nộp báo cáo theo lịch thi khoa") is NOT included (never include submit assignments)
    expect(r.items.some((it) => fold(it.title).text.includes("nop"))).toBe(
      false,
    );
  });

  it("3h: a leading command phrase and a trailing connector are not title words", () => {
    const r = read("tạo ra buổi leo núi vào ngày 15 tháng 11 7 giờ sáng", {
      source: "typed",
      ref: { y: 2026, m: 11, d: 5, h: 9, mi: 0 },
    });
    expect(r.items[0]).toMatchObject({ title: "Buổi leo núi" });
  });

  it("3h: a reminder verb and a clock are stripped, the task keeps its name", () => {
    const r = read("nhắc tôi nộp bài lúc 9h", {
      source: "typed",
      ref: { y: 2026, m: 11, d: 5, h: 9, mi: 0 },
    });
    expect(r.items[0]).toMatchObject({ title: "Nộp bài" });
  });

  it("3h: a place cue left at the end of a title is dropped", () => {
    const r = read("họp nhóm ở 9h mai", {
      source: "typed",
      ref: { y: 2026, m: 11, d: 5, h: 9, mi: 0 },
    });
    expect(r.items[0]).toMatchObject({ title: "Họp nhóm" });
  });

  it("3h: an English command and trailing preposition are stripped", () => {
    const r = read("remind me to call mom at 5pm", {
      source: "typed",
      ref: { y: 2026, m: 11, d: 5, h: 9, mi: 0 },
    });
    expect(r.items[0]).toMatchObject({ title: "Call mom" });
  });

  it("3h: a voice filler and a stray filler after the command are stripped", () => {
    const r = read("ờ tạo cái buổi leo núi vào ngày mười lăm", {
      source: "voice",
      ref: { y: 2026, m: 11, d: 5, h: 9, mi: 0 },
    });
    expect(r.items[0]).toMatchObject({ title: "Buổi leo núi" });
  });

  it("3h: a kept name keeps its word, and a title is never emptied", () => {
    const study = read("đi học lúc 7h", {
      source: "typed",
      ref: { y: 2026, m: 11, d: 5, h: 9, mi: 0 },
    });
    expect(study.items[0]).toMatchObject({ title: "Đi học" });
    const bare = read("nhắc tôi lúc 9h", {
      source: "typed",
      ref: { y: 2026, m: 11, d: 5, h: 9, mi: 0 },
    });
    expect(bare.items[0].title.length).toBeGreaterThan(0);
  });
});
