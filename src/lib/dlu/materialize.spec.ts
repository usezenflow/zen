import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import type { Fetched } from "./client";
import { materialize } from "./materialize";

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
      [undefined, undefined, "dlu"], // the exam's prep
    ]);
    expect(upserts[0].end! - upserts[0].start!).toBe(225 * 60_000);
    expect(upserts[2].deadline).toBe(NOW + 3 * D);
  });

  it("is idempotent", () => {
    const items = [lecture(), assign()] as Fetched;
    const tasks = materialize(items, [], NOW).upserts;
    expect(materialize(items, tasks, NOW)).toEqual({ upserts: [], deletes: [] });
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

  it("does not delete LMS tasks beyond next month", () => {
    const far = stored(assign({ scheduledStartTime: new Date(NOW + 90 * D) }));
    expect(materialize([] as unknown as Fetched, [far], NOW).deletes).toEqual([]);
  });

  it("revives an unedited deleted task when it returns", () => {
    const old = { ...stored(lecture()), deletedAt: NOW - D };
    expect(materialize([lecture()] as Fetched, [old], NOW).upserts[0].deletedAt).toBeUndefined();
  });

  describe("preps", () => {
    const exam = (at = NOW + 5 * D, over: Partial<Fetched[number]> = {}): Fetched[number] => ({
      ...lecture("portal:exam:9", at), type: "EXAM", durationMinutes: 90, ...over,
    });
    const withPrep = () => {
      const ex = stored(exam());
      return [ex, ...materialize([exam()] as Fetched, [ex], NOW).upserts];
    };

    it("adds one prep with a new exam, sized by weak", () => {
      const { upserts } = materialize([exam()] as Fetched, [], NOW, 0.8);
      const prep = upserts.find((t) => t.id.startsWith("prep:"))!;
      expect(prep).toMatchObject({ id: "prep:dlu:portal:exam:9", effort: 90, maxSitting: 30, deadline: NOW + 5 * D });
    });
    it("adds none for a report exam", () => {
      const { upserts } = materialize([exam(NOW + 5 * D, { examFormat: "Báo cáo(TL)" })] as Fetched, [], NOW);
      expect(upserts.filter((t) => t.id.startsWith("prep:"))).toEqual([]);
    });
    it("is idempotent", () => {
      expect(materialize([exam()] as Fetched, withPrep(), NOW)).toEqual({ upserts: [], deletes: [] });
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
