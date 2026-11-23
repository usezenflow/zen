import { describe, expect, it, vi } from "vitest";
import { compose, inferred, repeats, whereOf, type Ctx } from "./say";
import type { Result } from "./apply";
import { lenW, partAt, plain, t } from "./i18n";
import type { Action, Move } from "./types";

const NOW = new Date(2026, 10, 17, 10, 0).getTime();
const res = (toast: string, over: Partial<Result> = {}): Result => ({ toast, changed: true, undo: vi.fn(async () => {}), ...over });
const move = (over: Partial<Move> = {}): Move => ({ id: "m", title: "Đọc sách", from: NOW, to: NOW + 3600e3, at: NOW, ...over });

describe("compose", () => {
  it("the engine's line is the sub when nothing else is asked", () => {
    expect(compose(res("Đã thêm Gym", { sub: "Hay xong việc buổi tối" })).sub).toBe("Hay xong việc buổi tối");
  });
  it("a drag's learned line is not overwritten by a clash", () => {
    const learned = t("learnedAvoid", { time: partAt(14) });
    const out = compose(res("Đã dời Toán sang 15:00", { sub: learned }), { clash: t("previewClash", { title: "Cơ sở dữ liệu" }) });
    expect(out.sub).toBe(learned);
  });
  it("with no learned line, the clash says what it sits on", () => {
    const out = compose(res("Đã dời Toán sang 15:00"), { clash: t("previewClash", { title: "Cơ sở dữ liệu" }) });
    expect(plain(out.sub!)).toBe("Trùng Cơ sở dữ liệu");
  });
  it("priority: stuck over reason over understood over where", () => {
    const c: Ctx = { stuck: "Chưa có giờ trống", reason: "Hợp buổi học", understood: "Mình hiểu: 1h", where: "T3, buổi chiều" };
    expect(compose(res("Đã thêm Ôn"), c).sub).toBe("Chưa có giờ trống");
    expect(compose(res("Đã thêm Ôn"), { ...c, stuck: undefined }).sub).toBe("Hợp buổi học");
    expect(compose(res("Đã thêm Ôn"), { understood: "Mình hiểu: 1h", where: "T3, buổi chiều" }).sub).toBe("Mình hiểu: 1h");
    expect(compose(res("Đã thêm Ôn"), { where: "T3, buổi chiều" }).sub).toBe("T3, buổi chiều");
  });
  it("a line that repeats the title is dropped, the next one is said", () => {
    expect(compose(res("Đã thêm Gym"), { name: "Gym", understood: "Mình hiểu: Gym", where: "T3, buổi chiều" }).sub).toBe("T3, buổi chiều");
  });
  it("Xem only when something else moved, and an alt takes its pill", () => {
    const see = vi.fn();
    expect(compose(res("Đã dời Gym", { moves: [move()] }), { see }).more).toBeUndefined();
    const two = compose(res("Đã dời Gym", { moves: [move(), move({ id: "n" })] }), { see });
    expect(two.more).toMatchObject({ label: t("briefSee"), plain: true });
    two.more!.run();
    expect(see).toHaveBeenCalledTimes(1);
    const alt = { label: "sáng mai", run: vi.fn() };
    expect(compose(res("Đã thêm Gọi mẹ", { moves: [move(), move({ id: "n" })] }), { see, alt })).toMatchObject({ alt, more: undefined });
  });
  it("keeps the undo of the result", () => {
    const r = res("Đã xoá Gym");
    expect(compose(r).undo).toBe(r.undo);
    expect(compose(undefined, { title: "Mic chưa bật" })).toEqual({ title: "Mic chưa bật", sub: undefined, alt: undefined, more: undefined, undo: undefined });
  });
});

// Every template the app says a move in, for each task name and each clock: no sub repeats the name the title holds, or a clock the title holds.
describe("compose never repeats a title or a time", () => {
  const names = ["Gym", "Đọc sách", "Ôn Giải tích", "Toán"];
  const clocks: [number, number][] = [[9, 0], [13, 30], [15, 0], [18, 45], [21, 0]];
  const at = (h: number, m: number) => `T3 ${h}:${String(m).padStart(2, "0")}`;
  const templates: Record<string, (name: string, time: string, h: number) => [Result, Ctx]> = {
    moved: (name, time) => [res(t("moved", { title: name, time }), { sub: t("learnedAvoid", { time: partAt(9) }) }), {}],
    timeAsSub: (name, time) => [res(t("moved", { title: name, time }), { sub: time }), {}],
    pulledIn: (name, _time, h) => [res(t("done"), { sub: t("pulledIn", { title: name, part: partAt(h) }) }), {}],
    added: (name) => [res(t("added", { title: name })), { name }],
    addedRepeatsName: (name, time) => [res(t("added", { title: name }), { sub: `${name} ${time}` }), { name }],
  };
  for (const [tag, make] of Object.entries(templates)) {
    it(tag, () => {
      for (const name of names) for (const [h, m] of clocks) {
        const time = at(h, m), when = new Date(2026, 10, 17, h, m).getTime();
        const [r, ctx] = make(name, time, h);
        const out = compose(r, { ...ctx, understood: t("understood", { what: lenW(90) }), where: whereOf(when, NOW) });
        const sub = out.sub ?? "";
        if (ctx.name) expect(sub.toLocaleLowerCase("vi")).not.toContain(name.toLocaleLowerCase("vi"));
        for (const c of r.toast.match(/\d{1,2}:\d{2}/g) ?? []) expect(sub).not.toContain(c);
        expect(out.title).toBe(r.toast);
      }
    });
  }
});

describe("repeats", () => {
  it("a sub that holds the title, the task's name or a clock the title holds, repeats", () => {
    expect(repeats("Đã dời Gym sang 15:00", "15:00")).toBe(true);
    expect(repeats("Đã thêm Gym", "Gym 1h", "Gym")).toBe(true);
    expect(repeats("Đã thêm Gym", "Hay xong buổi tối", "Gym")).toBe(false);
  });
});

describe("inferred and whereOf", () => {
  const act = (over: Partial<Action>): Action => ({ op: "create", title: "Gym", ...over });
  it("says only what was worked out beyond the words", () => {
    expect(inferred([act({ effortMinutes: 60, effortGuessed: true })])).toBe(t("understood", { what: "1h" }));
    expect(inferred([act({ effortMinutes: 90 })], "3 buổi · Hạn T6")).toBe(t("understood", { what: "3 buổi · Hạn T6" }));
    expect(inferred([act({ effortMinutes: 90 })])).toBeUndefined(); // the length was said: nothing inferred
  });
  it("names the day and part, never the clock", () => {
    expect(whereOf(new Date(2026, 10, 17, 15, 0).getTime(), NOW)).toBe("Hôm nay, buổi chiều");
    expect(whereOf(new Date(2026, 10, 17, 21, 0).getTime(), NOW)).not.toMatch(/21:/);
  });
});
