import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { HOUR, MIN } from "./features";
import { afterBuffer, newModel } from "./model";
import { learn, plan } from "./index";
import { type Env, cells, solve } from "./place";
import type { Piece } from "./value";

const now = new Date(2026, 10, 16, 10, 0).getTime(); // Monday 10:00
const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
const lecture: Task = { id: "lec", title: "Giải tích", kind: "study", source: "dlu", fixed: "lecture", effort: 120, start: at(9), end: at(11), createdAt: now };
const flex = (o: Partial<Task> = {}): Task => ({ id: "f", title: "Ôn bài", kind: "study", source: "user", effort: 60, createdAt: now, ...o });
const piece = (t: Task): Piece => ({ id: t.id, task: t, effort: t.effort, k: 1, n: 1, slip: 0 });
// prefers a start at 11:10, the lecture's end plus 10 minutes: without the rule the solver takes 11:00 or 11:15
const near1110 = (_p: Piece, s: number) => -Math.abs(s - at(11, 10)) / HOUR;
const envOf = (rest?: Env["rest"]): Env => ({ busy: [{ start: at(9), end: at(11) }], fixedEnds: [], now, util: near1110, rest });

describe("rest after a lecture or exam", () => {
  it("with no rest, the solver takes the minutes right after the lecture (the control)", () => {
    const r = solve([piece(flex())], envOf(), 1);
    expect(r.starts.get("f")!).toBeLessThan(at(11, 30));
  });

  it("a learned 40 min rest keeps own work out of the first 40 min after a lecture ends", () => {
    const rest = { classEnds: [at(11)], buffer: 40 * MIN };
    const r = solve([piece(flex())], envOf(rest), 1);
    const s = r.starts.get("f")!;
    expect(s).toBeGreaterThanOrEqual(at(11, 40));
    expect(cells(piece(flex()), now, rest).every((c) => c < at(11) || c >= at(11, 40))).toBe(true);
  });

  it("a piece the user set by hand is not held back by the rest", () => {
    const rest = { classEnds: [at(11)], buffer: 40 * MIN };
    expect(cells(piece(flex({ userEdited: ["start"] })), now, rest)).toContain(at(11, 15));
  });

  it("five ticks of 40 min teach a 40 min rest; fewer than five say the 15 min default", () => {
    const m = newModel(now);
    m.afterClass = [40, 40, 40, 40];
    expect(afterBuffer(m)).toBe(15);
    m.afterClass = [40, 40, 40, 40, 40];
    expect(afterBuffer(m)).toBe(40);
    m.afterClass = [200, 200, 200, 200, 200];
    expect(afterBuffer(m)).toBe(60);
  });

  it("plan() with 5 learned 40 min samples keeps a flexible task out of 11:00 to 11:40", () => {
    const m = newModel(now);
    m.afterClass = [40, 40, 40, 40, 40];
    const { diff } = plan([lecture, flex()], [], m, now);
    const p = diff.placed.find((x) => x.id === "f");
    expect(p).toBeDefined();
    expect(p!.start < at(11) || p!.start >= at(11, 40)).toBe(true);
  });

  it("a done tick after a lecture records the gap in minutes; a gap over 2 h records nothing", () => {
    const m0 = newModel(now);
    const tick = (start: number) => {
      const t = flex({ start, end: start + 60 * MIN, doneAt: start + 60 * MIN });
      return learn(m0, { id: "e", taskId: t.id, type: "done", at: start + 60 * MIN }, t, false, [at(11)]);
    };
    expect(tick(at(11, 40)).afterClass).toEqual([40]);
    expect(tick(at(14)).afterClass).toBeUndefined();
  });
});
