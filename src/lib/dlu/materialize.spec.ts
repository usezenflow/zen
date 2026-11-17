import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import type { Fetched } from "./client";
import { digestNotices, marksNotice, materialize } from "./materialize";

const NOW = Date.UTC(2026, 8, 1);
const H = 3_600_000;
const D = 24 * H;

const lecture = (key = "portal:lecture:S1:2026-09-03:1", at = NOW + 2 * D): Fetched[number] => ({
  externalKey: key, title: "Môn mẫu", type: "LECTURE", scheduledStartTime: new Date(at), durationMinutes: 225, location: null, note: null,
});
const assign = (over: Partial<Fetched[number]> = {}): Fetched[number] => ({
  externalKey: "lms:assign:7", title: "Bài tập", type: "PLAN", scheduledStartTime: new Date(NOW + 3 * D), durationMinutes: 0, location: null, note: null, ...over,
});
const stored = (i: Fetched[number]): Task => materialize([i] as Fetched, [], NOW).upserts[0];

describe("materialize", () => {
  it("creates fixed lectures and exams, and deadline tasks for assignments", () => {
    const exam: Fetched[number] = { ...lecture("portal:exam:9"), type: "EXAM", durationMinutes: 90 };
    const { upserts } = materialize([lecture(), exam, assign()] as Fetched, [], NOW);
    expect(upserts.map((t) => [t.upstreamKey, t.fixed, t.source])).toEqual([
      ["portal:lecture:S1:2026-09-03:1", "lecture", "dlu"],
      ["portal:exam:9", "exam", "dlu"],
      ["lms:assign:7", undefined, "dlu"],
      [undefined, undefined, "user"], // the exam's prep is the user's own plan item
    ]);
    expect(upserts[0].end! - upserts[0].start!).toBe(225 * 60_000);
    expect(upserts[2].deadline).toBe(NOW + 3 * D);
  });

  it("is idempotent", () => {
    const items = [lecture(), assign()] as Fetched;
    const tasks = materialize(items, [], NOW).upserts;
    expect(materialize(items, tasks, NOW)).toMatchObject({ upserts: [], deletes: [] });
  });

  it("keeps user-edited fields and updates the rest", () => {
    const old = { ...stored(lecture()), start: NOW + 5 * D, userEdited: ["start"] };
    const moved = { ...lecture(), title: "Đổi tên", scheduledStartTime: new Date(NOW + 2 * D + H) };
    const [t] = materialize([moved] as Fetched, [old], NOW).upserts;
    expect(t.start).toBe(NOW + 5 * D);
    expect(t.title).toBe("Đổi tên");
  });

  it("does not touch planner-owned fields of an assignment", () => {
    const old = { ...stored(assign()), start: NOW + D, end: NOW + D + H, effort: 90 };
    const [t] = materialize([assign({ title: "Mới" })] as Fetched, [old], NOW).upserts;
    expect(t).toMatchObject({ title: "Mới", start: NOW + D, effort: 90 });
  });

  it("sizes an assignment by what it asks for and the marks of its course", () => {
    const size = (over: Partial<Fetched[number]>, mult?: (title: string) => number) => materialize([assign(over)] as Fetched, [], NOW, mult).upserts[0];
    expect(size({})).toMatchObject({ title: "Bài tập", effort: 120, maxSitting: 60 });
    expect(size({ description: "<p>Nộp <b>báo cáo</b> toàn văn</p>" }).effort).toBe(180);
    expect(size({ title: "Bài thực hành 3", lmsCourse: { lmsCourseId: 1, fullName: "Lập trình Web", shortName: null } }, (t) => (t.includes("Lập trình Web") ? 1.6 : 1)).effort).toBe(180);
  });
  it("sizes an assignment stored at the old 45 minutes, unless the student set its length", () => {
    const old = { ...stored(assign()), effort: 45 };
    expect(materialize([assign()] as Fetched, [old], NOW).upserts[0].effort).toBe(120);
    expect(materialize([assign()] as Fetched, [{ ...old, userEdited: ["effort"] }], NOW).upserts).toEqual([]);
  });
  it("backfills an assignment stored in 45 min sittings: half hours, sittings up to an hour, open sittings dropped to split again", () => {
    const old = { ...stored(assign()), effort: 135, maxSitting: 45 };
    const kid = (id: string, over: Partial<Task> = {}): Task => ({ ...old, id, parentId: old.id, effort: 45, start: NOW + D, end: NOW + D + 45 * 60_000, ...over });
    const tasks = [old, kid(`${old.id}#1`, { doneAt: NOW - H }), kid(`${old.id}#2`), kid(`${old.id}#3`)];
    const none = Object.assign([], { failed: ["portal", "lms"] }) as unknown as Fetched; // the app-open backfill: no fetch
    const { upserts, deletes } = materialize(none, tasks, NOW);
    expect(upserts).toMatchObject([{ id: old.id, effort: 150, maxSitting: 60 }]); // 135 is not whole half hours
    expect(deletes).toEqual([`${old.id}#2`, `${old.id}#3`]); // the done one stays
    expect(materialize(none, [...upserts, ...tasks.slice(1).map((t) => (deletes.includes(t.id) ? { ...t, deletedAt: NOW } : t))], NOW)).toMatchObject({ upserts: [], deletes: [] }); // once
    // with a fetch the merged task is resized, not doubled
    const fetched = materialize([assign({ title: "Mới" })] as Fetched, tasks, NOW).upserts.filter((t) => t.id === old.id);
    expect(fetched).toMatchObject([{ title: "Mới", effort: 150, maxSitting: 60 }]);
    // only work still ahead: one already due keeps its sittings
    expect(materialize(none, [{ ...old, deadline: NOW - H }, ...tasks.slice(1)], NOW)).toMatchObject({ upserts: [], deletes: [] });
    // a length the student set stays
    expect(materialize(none, [{ ...old, userEdited: ["effort"] }], NOW).upserts).toMatchObject([{ effort: 135, maxSitting: 60 }]);
  });
  it("updates the parent, not a sitting, and carries upstream changes to open sittings", () => {
    const parent = stored(assign());
    const kid = (id: string, over: Partial<Task> = {}): Task => ({ ...parent, id, parentId: parent.id, start: NOW + D, end: NOW + D + H, ...over });
    const tasks = [parent, kid("k1"), kid("k2", { doneAt: NOW - H })];
    const { upserts } = materialize([assign({ title: "Mới", submitted: true })] as Fetched, tasks, NOW);
    expect(upserts.map((t) => [t.id, t.title, t.doneAt, t.start])).toEqual([
      [parent.id, "Mới", NOW, undefined],
      ["k1", "Mới", NOW, NOW + D], // the done sitting k2 stays as it was
    ]);
  });

  it("marks a submitted assignment done", () => {
    const old = stored(assign());
    const [t] = materialize([assign({ submitted: true })] as Fetched, [old], NOW).upserts;
    expect(t.doneAt).toBe(NOW);
  });

  it("deletes future upstream tasks that vanished, never user or past ones", () => {
    const gone = stored(lecture());
    const past = stored(lecture("portal:lecture:S1:2026-08-01:1", NOW - D));
    const mine: Task = { ...gone, id: "u1", source: "user", upstreamKey: undefined };
    expect(materialize([] as unknown as Fetched, [gone, past, mine], NOW).deletes).toEqual([gone.id]);
  });

  it("keeps a source's tasks when that source failed to fetch", () => {
    const gone = stored(lecture());
    const items = Object.assign([], { failed: ["portal" as const] }) as Fetched;
    expect(materialize(items, [gone], NOW).deletes).toEqual([]);
  });

  it("does not delete LMS tasks beyond the fetched months", () => {
    const far = stored(assign({ scheduledStartTime: new Date(NOW + 150 * D) }));
    expect(materialize([] as unknown as Fetched, [far], NOW).deletes).toEqual([]);
  });

  it("revives an unedited deleted task when it returns", () => {
    const old = { ...stored(lecture()), deletedAt: NOW - D };
    expect(materialize([lecture()] as Fetched, [old], NOW).upserts[0].deletedAt).toBeUndefined();
  });

  it("never revives a task the user deleted", () => {
    const old = { ...stored(lecture()), deletedAt: NOW - D, userEdited: ["deleted"] };
    expect(materialize([lecture()] as Fetched, [old], NOW)).toMatchObject({ upserts: [], deletes: [] });
  });

  it("carries room, and a room change is a change with a digest line", () => {
    const old = stored({ ...lecture(), location: "A1" });
    expect(old).toMatchObject({ location: "A1" });
    const r = materialize([{ ...lecture(), location: "B2" }] as Fetched, [old], NOW);
    expect(r.upserts[0].location).toBe("B2");
    expect(digestNotices(r.digest, NOW)).toEqual([{ title: "Đổi phòng: Môn mẫu", sub: "Sang B2", route: `/task/${old.id}` }]);
    expect(materialize([{ ...lecture(), location: "B2" }] as Fetched, [{ ...old, userEdited: ["location"] }], NOW).upserts).toEqual([]); // the user's room stays
  });

  it("keeps upstream details in their own fields and the note for the user", () => {
    const [l] = materialize([{ ...lecture(), scheduleStudyUnitId: "S1", teacher: "Cô A" }] as Fetched, [], NOW).upserts;
    expect(l).toMatchObject({ section: "S1", teacher: "Cô A" });
    expect(l.note).toBeUndefined();
    const [a] = materialize([assign({ lmsCourse: { lmsCourseId: 1, fullName: "Toán", shortName: null }, url: "https://x/1", description: '<p>Nộp bài</p><script>x</script>' })] as Fetched, [], NOW).upserts;
    expect(a).toMatchObject({ course: "Toán", url: "https://x/1", content: "<p>Nộp bài</p>" });
    expect(a.location).toBeUndefined();
  });

  it("clears an old upstream note, room-as-url and rrule unless the user edited them", () => {
    const old = { ...stored(lecture()), note: "GV: A", location: "https://x", rrule: "FREQ=WEEKLY" };
    const [t] = materialize([lecture()] as Fetched, [old], NOW).upserts;
    expect([t.note, t.location, t.rrule]).toEqual([undefined, undefined, undefined]);
    expect(materialize([lecture()] as Fetched, [{ ...old, userEdited: ["note"] }], NOW).upserts[0].note).toBe("GV: A");
  });

  it("does not re-import meetings of a deleted section, or of its tail", () => {
    const items = [lecture(), lecture("portal:lecture:S1:2026-09-10:1", NOW + 9 * D)].map((i) => ({ ...i, scheduleStudyUnitId: "S1" })) as Fetched;
    const gone = (cut: number) => ({ sections: { S1: cut }, series: {} });
    expect(materialize(items, [], NOW, undefined, gone(0)).upserts).toEqual([]);
    expect(materialize(items, [], NOW, undefined, gone(NOW + 5 * D)).upserts.map((t) => t.upstreamKey)).toEqual(["portal:lecture:S1:2026-09-03:1"]);
  });

  it("digests new exams and assignments", () => {
    const exam: Fetched[number] = { ...lecture("portal:exam:9"), type: "EXAM", durationMinutes: 90 };
    const { digest } = materialize([exam, assign()] as Fetched, [], NOW);
    expect([digest.exams.length, digest.assignments.length]).toEqual([1, 1]);
    const [ne, na] = digestNotices(digest, NOW);
    expect(ne).toMatchObject({ title: "Thêm lịch thi: Môn mẫu", route: `/task/${digest.exams[0].id}` });
    expect(na).toMatchObject({ title: "Bài tập mới: Bài tập", sub: expect.stringMatching(/^Hạn T/) });
  });

  it("groups three or more item changes into one notice", () => {
    const exam: Fetched[number] = { ...lecture("portal:exam:9"), type: "EXAM", durationMinutes: 90 };
    const as = [1, 2, 3].map((i) => assign({ externalKey: `lms:assign:${i}`, title: `Bài ${i}` }));
    const { digest } = materialize([exam, ...as] as Fetched, [], NOW);
    expect(digestNotices(digest, NOW)).toEqual([{ title: "Trường cập nhật 4 việc", sub: "Môn mẫu, Bài 1 +2" }]);
  });

  it("announces a new timetable with its size and first lecture, and changed marks", () => {
    const ls = [0, 1, 2].map((i) => lecture(`portal:lecture:S1:2026-09-0${i + 3}:1`, NOW + (i + 1) * D));
    const { digest } = materialize(ls as Fetched, [], NOW);
    expect(digestNotices(digest, NOW)).toEqual([{ title: "Thời khoá biểu học kỳ 1 đã có", sub: "3 tiết, đã xếp vào tuần", route: `day:${NOW + D}` }]);
    const m = (score10: number | null) => ({ marks: [{ scheduleStudyUnitId: "u", curriculumName: "Giải tích", score10 }] }) as never;
    expect(marksNotice(m(null), m(8.6))).toEqual({ title: "Điểm vừa cập nhật", sub: "Giải tích: 8,6", route: "/marks" });
    expect(marksNotice(m(8.6), m(8.6))).toEqual({ title: "Điểm vừa cập nhật", route: "/marks" });
  });

  describe("preps", () => {
    const exam = (at = NOW + 5 * D, over: Partial<Fetched[number]> = {}): Fetched[number] => ({
      ...lecture("portal:exam:9", at), type: "EXAM", durationMinutes: 90, ...over,
    });
    const withPrep = () => {
      const ex = stored(exam());
      return [ex, ...materialize([exam()] as Fetched, [ex], NOW).upserts];
    };

    it("adds one prep with a new exam, sized by the marks multiplier of its course", () => {
      const { upserts } = materialize([exam()] as Fetched, [], NOW, (title) => (title === exam().title ? 1.6 : 1));
      const prep = upserts.find((t) => t.id.startsWith("prep:"))!;
      expect(prep).toMatchObject({ id: "prep:dlu:portal:exam:9", title: "Ôn thi", course: exam().title, effort: 300, maxSitting: 60, deadline: NOW + 5 * D });
    });
    it("adds the prep for an exam stored before preps existed", () => {
      const { upserts } = materialize([exam()] as Fetched, [stored(exam())], NOW);
      expect(upserts.filter((t) => t.id.startsWith("prep:"))).toHaveLength(1);
    });
    it("adds the prep for an exam stored before preps existed", () => {
      const { upserts } = materialize([exam()] as Fetched, [stored(exam())], NOW);
      expect(upserts.filter((t) => t.id.startsWith("prep:"))).toHaveLength(1);
    });
    it("carries an exam's credits and retake onto the exam and into its prep, and refreshes them when stored", () => {
      const plain = materialize([exam()] as Fetched, [], NOW).upserts.find((t) => t.id.startsWith("prep:"))!;
      const row = exam(NOW + 5 * D, { examCredits: 4, examRetake: true });
      const { upserts } = materialize([row] as Fetched, [], NOW);
      expect(upserts.find((t) => t.id === "dlu:portal:exam:9")).toMatchObject({ credits: 4, retake: true });
      expect(upserts.find((t) => t.id.startsWith("prep:"))!.effort).toBeGreaterThan(plain.effort);
      const stored1 = upserts.find((t) => t.id === "dlu:portal:exam:9")!;
      const later = materialize([exam(NOW + 5 * D, { examCredits: 2, examRetake: null })] as Fetched, [stored1], NOW);
      expect(later.upserts.find((t) => t.id === "dlu:portal:exam:9")).toMatchObject({ credits: 2 });
      expect(later.upserts.find((t) => t.id === "dlu:portal:exam:9")!.retake).toBeUndefined();
    });
    it("adds a writing prep for a report exam", () => {
      const { upserts } = materialize([exam(NOW + 5 * D, { examFormat: "Báo cáo(TL)" })] as Fetched, [], NOW);
      expect(upserts.filter((t) => t.id.startsWith("prep:"))).toMatchObject([{ title: "Viết báo cáo", effort: 270 }]);
    });
    it("renames a prep made under the old title and its open sittings, but not one the student renamed", () => {
      const [ex, prep] = withPrep();
      const old = { ...prep, title: "Ôn Toán", course: undefined }, kid = { ...old, id: `${prep.id}#1`, parentId: prep.id };
      expect(materialize([exam()] as Fetched, [ex, old, kid], NOW).upserts.map((t) => [t.id, t.title, t.course])).toEqual([[prep.id, prep.title, prep.course], [kid.id, prep.title, prep.course]]);
      expect(materialize([exam()] as Fetched, [ex, { ...prep, title: "Của tôi", userEdited: ["title"] }], NOW).upserts).toEqual([]);
    });
    it("is idempotent", () => {
      expect(materialize([exam()] as Fetched, withPrep(), NOW)).toMatchObject({ upserts: [], deletes: [] });
    });
    it("links a prep to its exam, also one stored before forId existed", () => {
      const old = withPrep().find((t) => t.id.startsWith("prep:"))!;
      expect(old.forId).toBe("dlu:portal:exam:9");
      const { forId: _, ...legacy } = old;
      const tasks = withPrep().map((t) => (t.id === old.id ? legacy : t));
      expect(materialize([exam()] as Fetched, tasks, NOW).upserts.find((t) => t.id === old.id)?.forId).toBe("dlu:portal:exam:9");
    });
    it("backfills a prep stored in 45 min sittings and drops its open sittings", () => {
      const [ex, prep] = withPrep();
      const old = { ...prep, effort: 135, maxSitting: 45 }, kid = { ...old, id: `${prep.id}#1`, parentId: prep.id, effort: 45 };
      const { upserts, deletes } = materialize([exam()] as Fetched, [ex, old, kid], NOW);
      expect(upserts.find((t) => t.id === prep.id)).toMatchObject({ effort: prep.effort, maxSitting: 60 });
      expect(deletes).toEqual([kid.id]);
      expect(materialize([exam()] as Fetched, [ex, { ...old, effort: prep.effort }], NOW).upserts).toMatchObject([{ maxSitting: 60 }]); // same length, old sitting size
      expect(materialize([] as unknown as Fetched, [{ ...ex, start: NOW - D, end: NOW - D + H, deadline: NOW - D }, old, kid], NOW, undefined).upserts.filter((t) => t.id === prep.id)).toEqual([]); // an exam already sat: left alone
    });
    it("resizes when the exam moves", () => {
      const { upserts } = materialize([exam(NOW + 6 * D)] as Fetched, withPrep(), NOW);
      expect(upserts.find((t) => t.id.startsWith("prep:"))?.deadline).toBe(NOW + 6 * D);
    });
    it("removes the prep and its sittings with the exam", () => {
      const tasks = [...withPrep(), { ...withPrep()[1], id: "prep:dlu:portal:exam:9#1", parentId: "prep:dlu:portal:exam:9" }];
      const { deletes } = materialize([] as unknown as Fetched, tasks, NOW);
      expect(deletes.sort()).toEqual(["dlu:portal:exam:9", "prep:dlu:portal:exam:9", "prep:dlu:portal:exam:9#1"]);
    });
  });
});

it("an exam list scoped with `only` deletes only exams it listed before (semester 2 leaves semester 1 alone)", () => {
  const ex = (k: string): Fetched[number] => ({ ...lecture(k), type: "EXAM", durationMinutes: 90, scheduledStartTime: new Date(NOW + 30 * 86_400_000) });
  const hk1 = materialize([ex("portal:exam:1")] as Fetched, [], NOW).upserts;
  const hk2old = materialize([ex("portal:exam:2")] as Fetched, [], NOW).upserts;
  const reply = Object.assign([] as Fetched, { failed: ["lms"], skipped: ["portal:lecture"], only: ["portal:exam:2"] }) as Fetched;
  const { deletes } = materialize(reply, [...hk1, ...hk2old], NOW);
  expect(deletes).toEqual(hk2old.map((x) => x.id)); // the cancelled semester-2 exam goes; semester 1's stays
});

describe("changes that now get a notice", () => {
  const exam = (at = NOW + 5 * D): Fetched[number] => ({ ...lecture("portal:exam:9", at), type: "EXAM", durationMinutes: 90 });
  const term = () => [0, 1, 2].map((i) => lecture(`portal:lecture:S1:2026-09-0${i + 3}:1`, NOW + (i + 1) * D));

  it("says an exam whose time moved, not one that stayed", () => {
    const old = stored(exam());
    const { digest } = materialize([exam(NOW + 6 * D)] as Fetched, [old], NOW);
    expect(digestNotices(digest, NOW)).toEqual([{ title: "Lịch thi đổi: Môn mẫu", sub: expect.any(String), route: `/task/${old.id}` }]);
    expect(materialize([exam()] as Fetched, [old], NOW).digest.moved).toEqual([]);
  });

  it("says an open assignment whose due date changed, and not a done one", () => {
    const old = stored(assign());
    const { digest } = materialize([assign({ scheduledStartTime: new Date(NOW + 4 * D) })] as Fetched, [old], NOW);
    expect(digestNotices(digest, NOW)).toEqual([{ title: "Hạn đổi: Bài tập", sub: expect.stringMatching(/^Hạn /), route: `/task/${old.id}` }]);
    const done = materialize([assign({ scheduledStartTime: new Date(NOW + 4 * D), submitted: true })] as Fetched, [{ ...old, doneAt: NOW - H }], NOW);
    expect(done.digest.due).toEqual([]);
  });

  it("says a new single lecture once the timetable exists, and not while the timetable is first made", () => {
    expect(materialize(term() as Fetched, [], NOW).digest.makeup).toEqual([]);
    const tasks = materialize(term() as Fetched, [], NOW).upserts;
    const extra = lecture("portal:lecture:S1:2026-09-20:1", NOW + 10 * D);
    const { digest } = materialize([...term(), extra] as Fetched, tasks, NOW);
    expect(digestNotices(digest, NOW)).toEqual([{ title: "Buổi học bù: Môn mẫu", sub: expect.any(String), route: expect.stringMatching(/^\/task\//) }]);
  });

  it("says a future upstream item the campus took back, and not a past one", () => {
    const gone = stored(lecture());
    const { digest, deletes } = materialize([] as unknown as Fetched, [gone], NOW);
    expect(deletes).toEqual([gone.id]);
    expect(digestNotices(digest, NOW)).toEqual([{ title: "Đã huỷ: Môn mẫu", sub: expect.any(String) }]);
    const past = stored(lecture("portal:lecture:S1:2026-08-01:1", NOW - D));
    expect(materialize([] as unknown as Fetched, [past], NOW).digest.cancelled).toEqual([]);
  });

  it("merges three or more of the new kinds into the many-changes notice", () => {
    const ex = stored(exam()), a = stored(assign()), cancelled = stored(lecture());
    const { digest } = materialize([exam(NOW + 6 * D), assign({ scheduledStartTime: new Date(NOW + 5 * D) })] as Fetched, [ex, a, cancelled], NOW);
    expect([digest.moved.length, digest.due.length, digest.cancelled.length]).toEqual([1, 1, 1]);
    expect(digestNotices(digest, NOW)).toEqual([{ title: "Trường cập nhật 3 việc", sub: "Môn mẫu, Bài tập +1" }]);
  });
});
