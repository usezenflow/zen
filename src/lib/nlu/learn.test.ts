import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskEvent } from "../types";

const db = vi.hoisted(() => ({ tasks: new Map<string, any>(), events: new Map<string, any>(), kv: new Map<string, string>(), model: null as any }));
vi.mock("../store", () => ({
  allTasks: async () => [...db.tasks.values()],
  putTasks: async (ts: Task[]) => ts.forEach((x) => db.tasks.set(x.id, x)),
  removeTasks: async (ids: string[]) => ids.forEach((i) => db.tasks.delete(i)),
  allEvents: async () => [...db.events.values()],
  keptPlaced: async () => ({ kept: new Set<string>(), placed: new Map<string, number>() }),
  putEvent: async (e: TaskEvent) => void db.events.set(e.id, e),
  removeEvents: async (ids: string[]) => ids.forEach((i) => db.events.delete(i)),
  loadModel: async (now: number) => db.model ?? newModel(now),
  saveModel: async (m: unknown) => void (db.model = m),
  kvGet: async (k: string) => db.kv.get(k) ?? null,
  kvSet: async (k: string, v: string) => void db.kv.set(k, v),
}));

import { apply, loadNlu } from "../apply";
import { newModel } from "../../planner";
import { inferred } from "../say";
import { readActions, readFull, readNotes } from "./adapt";
import { frameOf } from "./frame";
import {
  correctTitle,
  evalRidge,
  learnDeadline,
  learnDuration,
  learnKind,
  learnLocation,
  learnTitle,
  newNluLearned,
  nluFeatures,
  refreshSampleContext,
} from "./learn";
import { outline } from "./reader/outline";

// 2026-11-27 10:00 in UTC+7 = 03:00Z
const NOW = new Date("2026-11-27T03:00:00Z");
const NOW_MS = NOW.getTime();
const DAY = 86_400_000;

beforeEach(() => {
  db.tasks.clear();
  db.events.clear();
  db.kv.clear();
  db.model = null;
});

describe("title auto-correction & shorthand completion (iOS-style)", () => {
  it("stays tentative on 1 edit, activates on 2nd confirmation, and reverts when edited back", () => {
    const m = newNluLearned(NOW_MS);
    learnTitle(m, "Làm sp mới", "Làm side project mới", undefined, NOW_MS);
    // 1 edit: still observing, does not rewrite yet
    expect(correctTitle("Code sp thanh toán", m).title).toBe("Code sp thanh toán");

    // 2nd confirmation (even at sentence start): activates
    learnTitle(m, "Sp lịch", "Side project lịch", undefined, NOW_MS + 1000);
    expect(correctTitle("Code sp thanh toán", m).title).toBe("Code side project thanh toán");
    expect(correctTitle("Sp thanh toán", m).title).toBe("Side project thanh toán");
    // Does not double-expand if already expanded
    expect(correctTitle("Code side project thanh toán", m).title).toBe("Code side project thanh toán");

    // Surfaces repair in readNotes and triggers project framing downstream
    const full = readFull("làm sp thanh toán", NOW, "typed", { learned: m });
    expect(full.items[0].title).toBe("Làm side project thanh toán");
    expect(readNotes("làm sp thanh toán", full).sub).toContain("“sp” → side project");

    // User reverts auto-correction ("Code side project" -> "Code sp"): immediately backs off
    learnTitle(m, "Code side project", "Code sp", undefined, NOW_MS + 2000);
    expect(correctTitle("Code sp thanh toán", m).title).toBe("Code sp thanh toán");
  });

  it("preserves mid-sentence capitalization for acronyms and ignores unrelated wholesale renames", () => {
    const m = newNluLearned(NOW_MS);
    learnTitle(m, "Họp clb ai", "Họp CLB AI", undefined, NOW_MS);
    learnTitle(m, "Tuyển clb ai", "Tuyển CLB AI", undefined, NOW_MS + 1000);
    expect(correctTitle("Chuẩn bị clb ai", m).title).toBe("Chuẩn bị CLB AI");

    // Wholesale rename with no shared context or plausible abbreviation is ignored
    learnTitle(m, "Mua sữa", "Gọi điện cho mẹ", undefined, NOW_MS);
    learnTitle(m, "Mua sữa", "Gọi điện cho mẹ", undefined, NOW_MS + 1000);
    expect(correctTitle("Mua sữa tươi", m).title).toBe("Mua sữa tươi");
  });

  it("stops applying a built-in reader repair once the user reverts it twice", () => {
    const m = newNluLearned(NOW_MS);
    const r0 = readFull("nộp bài đét lai thứ 6", NOW, "voice");
    expect(r0.repairs.length).toBeGreaterThan(0);

    const reps = [{ was: "đét lai", to: "deadline" }];
    learnTitle(m, "Nộp bài deadline", "Nộp bài đét lai", reps, NOW_MS);
    expect(readFull("nộp bài đét lai thứ 6", NOW, "voice", { learned: m }).repairs.length).toBeGreaterThan(0);

    learnTitle(m, "Nộp bài deadline", "Nộp bài đét lai", reps, NOW_MS + 1000);
    expect(readFull("nộp bài đét lai thứ 6", NOW, "voice", { learned: m }).repairs).toEqual([]);
  });
});

describe("hybrid LinUCB + statistics + (title, note) inference", () => {
  it("takes both title and notes into account to infer side-project 2-week deadline, duration, and location", () => {
    expect(frameOf("Build habit tracker", "Side project cuối tuần, làm nhóm")).toMatchObject({
      cls: "project",
      group: true,
    });

    const m = newNluLearned(NOW_MS);
    // Task 1: "side project" in note, corrected to 6h (360m), 14-day deadline, location "Ở nhà"
    const t1 = { id: "t1", title: "Làm widget thời tiết", note: "side project cá nhân bằng Expo" };
    learnDuration(m, t1, 360, 120, NOW_MS);
    learnDeadline(m, t1, 14, NOW_MS);
    learnLocation(m, t1, "Ở nhà", undefined, NOW_MS);

    // Task 2: "side project" in title, corrected to 6h (360m), 14-day deadline, location "Ở nhà"
    const t2 = { id: "t2", title: "Side project bot dịch thuật", note: "viết thử bằng Rust" };
    learnDuration(m, t2, 360, 120, NOW_MS + 1000);
    learnDeadline(m, t2, 14, NOW_MS + 1000);
    learnLocation(m, t2, "Ở nhà", undefined, NOW_MS + 1000);

    // Query with a fresh title whose NOTE mentions side project (and no date word): infers 6h, +14 days (2026-12-11), and "Ở nhà"
    const text = "Viết công cụ nén ảnh\nSide project thử nghiệm thuật toán mới, cần đóng gói CLI gọn nhẹ";
    const [act] = readActions(text, NOW, "typed", { learned: m });
    expect(act.effortMinutes).toBe(360);
    expect(act.effortGuessed).toBe(true);
    expect(act.deadline).toBe("2026-12-11T23:59:00");
    expect(act.location).toBe("Ở nhà");
    expect(act.locationGuessed).toBe(true);
    expect(inferred([act])).toContain("6h");
    expect(inferred([act])).toContain("Ở nhà");

    // Explicit user values in text always override learned defaults
    const [said] = readActions("Side project landing page 90 phút trước 30/11 tại Thư viện", NOW, "typed", { learned: m });
    expect(said.effortMinutes).toBe(90);
    expect(said.effortGuessed).toBeUndefined();
    expect(said.deadline).toMatch(/^2026-11-30/);
    expect(said.location).toBe("Thư viện");

    // Time-of-day windows ("tối dọn phòng") are never overwritten by learned deadlines
    const [tonight] = readActions("tối dọn phòng", NOW, "typed", { learned: m });
    expect(tonight.notAfter).toBe("2026-11-27T22:00:00");
    expect(tonight.deadline).toBeUndefined();
  });

  it("infers a deadline on custom undated task types once taught twice, and suppresses default deadlines when cleared twice", () => {
    const m = newNluLearned(NOW_MS);
    // Custom phrase with no static class in frame.ts
    for (let i = 0; i < 2; i++) {
      learnDeadline(m, { id: `p${i}`, title: `Gửi mẫu in ấn đợt ${i + 1}`, note: "xưởng in quận 3" }, 5, NOW_MS + i * 1000);
    }
    const [custom] = readActions("Gửi mẫu in ấn đợt 3", NOW, "typed", { learned: m });
    expect(custom.deadline).toBe("2026-12-02T23:59:00");
    expect(custom.deadlineGuessed).toBe(true);

    // Clearing default deadlines on "code" tasks twice teaches NLU to stop guessing a 7-day deadline
    for (let i = 0; i < 2; i++) {
      learnDeadline(m, { id: `c${i}`, title: `Code kata ${i + 1}` }, null, NOW_MS + i * 1000);
    }
    const [kata] = readActions("Code kata 3", NOW, "typed", { learned: m });
    expect(kata.deadline).toBeUndefined();
  });

  it("shrinks LinUCB epistemic uncertainty with observations and updates same-task edits in place", () => {
    const m = newNluLearned(NOW_MS);
    const x = nluFeatures("Code API auth", "nhóm 3 người\nspec chi tiết\ntích hợp OAuth\nviết test");
    const s0 = evalRidge(m.dur, x);
    expect(s0.mean).toBe(0);

    // Editing the same task twice updates b without double-counting precision A
    learnDuration(m, { id: "same", title: "Code API auth", note: "nhóm 3 người" }, 90, undefined, NOW_MS);
    const aAfterOne = [...m.dur.A];
    learnDuration(m, { id: "same", title: "Code API auth", note: "nhóm 3 người" }, 360, undefined, NOW_MS);
    expect(m.dur.A).toEqual(aAfterOne);
    expect(m.samples).toHaveLength(1);

    const s1 = evalRidge(m.dur, x);
    expect(s1.std).toBeLessThan(s0.std);
    expect(s1.mean).toBeGreaterThan(0);

    // Adding a note afterwards refreshes the sample's phrases so future note queries match
    refreshSampleContext(m, "same", "Code API auth", "dự án freelance cho khách", NOW_MS + 500);
    expect(m.samples[0].phrases).toContain("freelance");

    // Learned kind reaches new similar tasks
    learnKind(m, { id: "k1", title: "Đồng bộ sổ quỹ", note: "clb" }, "finance", NOW_MS);
    learnKind(m, { id: "k2", title: "Cập nhật sổ quỹ", note: "clb" }, "finance", NOW_MS + 1000);
    expect(readActions("Đối soát sổ quỹ", NOW, "typed", { learned: m })[0].kind).toBe("finance");
  });

  it("learns through apply() edits, reaches outline(), and rolls back cleanly on undo()", async () => {
    // 1. Create and correct two tasks through the real store transaction pipeline
    for (let i = 1; i <= 2; i++) {
      const acts = readActions(`làm sp số ${i}`, NOW, "typed", { learned: await loadNlu(NOW_MS) });
      await apply(acts, NOW_MS + i * 1000);
      const task = [...db.tasks.values()].find((t: Task) => !t.parentId && t.title.endsWith(`số ${i}`))!;
      const r = await apply(
        [
          {
            op: "edit",
            target: task.id,
            title: `Làm side project số ${i}`,
            effortMinutes: 240,
            deadline: new Date(NOW_MS + 14 * DAY).toISOString(),
            location: "Thư viện Tạ Quang Bửu",
          },
        ],
        NOW_MS + i * 1000 + 500,
      );
      if (i === 2) {
        // Verify undo rolls back the 2nd edit's NLU learning, then re-apply it
        await r.undo();
        const undone = await loadNlu(NOW_MS + 5000);
        expect(correctTitle("làm sp số 3", undone).title).toBe("làm sp số 3");
        await apply(
          [
            {
              op: "edit",
              target: task.id,
              title: `Làm side project số ${i}`,
              effortMinutes: 240,
              deadline: new Date(NOW_MS + 14 * DAY).toISOString(),
              location: "Thư viện Tạ Quang Bửu",
            },
          ],
          NOW_MS + i * 1000 + 800,
        );
      }
    }

    const learned = await loadNlu(NOW_MS + 10_000);
    const [next] = readActions("làm sp số 3", NOW, "typed", { learned });
    expect(next.title).toBe("Làm side project số 3");
    expect(next.effortMinutes).toBe(240);
    expect(next.deadline).toBe("2026-12-11T23:59:00");
    expect(next.location).toBe("Thư viện Tạ Quang Bửu");

    // Outline also inherits learned expansions, deadlines and locations from group headings
    const ol = outline("Side project mới:\n- Thiết kế sp auth\n- Viết API\n- Đóng gói bản đầu", NOW, learned);
    expect(ol?.groups[0].items[0].title).toBe("Thiết kế side project auth");
    expect(ol?.groups[0].items[1].location).toBe("Thư viện Tạ Quang Bửu");
  });
});
