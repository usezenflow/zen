// The outline reader: a pasted list read by its lines (eval/outline fixtures), and the budgets and rules around it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actionsOf, outline, type Group } from "./outline";

const now = new Date(2026, 10, 24, 9, 0);
const fixture = (name: string) => readFileSync(new URL(`./eval/outline/${name}`, import.meta.url), "utf8");

/** The order edges the save makes: [leaf, the leaf it follows], by title. */
function edges(gs: Group[]): [string, string][] {
  const acts = actionsOf(gs);
  const title = new Map(acts.filter((a) => a.ref).map((a) => [a.ref, a.title]));
  return acts.filter((a) => a.after).map((a) => [a.title!, title.get(a.after!)!]);
}

/** The asserted shape: titles, minutes, done flags and budgets. Deadlines and kinds are checked elsewhere. */
function shape(gs: Group[]): unknown {
  return gs.map((g) => ({
    title: g.title,
    ...(g.budgetMin !== undefined ? { budgetMin: g.budgetMin } : {}),
    items: g.items.map((i) => ({
      title: i.title,
      done: i.done,
      ...(i.minutes !== undefined ? { minutes: i.minutes, sized: i.sized } : {}),
    })),
    ...(g.groups ? { groups: shape(g.groups) } : {}),
  }));
}

const fixtures = ["notion-postgres", "google-docs-paste", "messenger-list", "ocr-syllabus", "plain-sizes"];

describe("outline fixtures", () => {
  for (const name of fixtures) {
    it(`${name}: groups, titles, minutes, done flags`, () => {
      const expected = JSON.parse(fixture(`${name}.json`)) as { groups: Group[]; order?: [string, string][] };
      const got = outline(fixture(`${name}.txt`), now);
      expect(shape(got?.groups ?? [])).toEqual(shape(expected.groups));
      expect(edges(got?.groups ?? [])).toEqual(expected.order ?? []);
    });
  }

  it("prose is not an outline", () => {
    expect(outline(fixture("prose.txt"), now)).toBeUndefined();
  });
});

describe("outline", () => {
  it("keeps the size out of the title and reads the deadline and kind", () => {
    const r = outline("- Nộp báo cáo môn web 20/12 (2 tiếng)\n- Đọc tài liệu 1h\n- Viết code\n", now);
    const [first] = r!.groups[0].items;
    expect(first.title).toBe("Nộp báo cáo môn web");
    expect(first.minutes).toBe(120);
    expect(first.deadline).toBe(new Date(2026, 11, 20, 23, 59).getTime());
  });

  it("reads a Date and an epoch number alike", () => {
    const text = "- A (1h)\n- B (1h)\n- C (1h)";
    expect(outline(text, now)).toEqual(outline(text, now.getTime()));
  });

  it("returns undefined under three leaves", () => {
    expect(outline("- A (1h)\n- B (1h)", now)).toBeUndefined();
  });

  it("shares a group's budget over its open unsized leaves, rounded to 15 min", () => {
    const r = outline("Ôn tập — 3h\n- A\n- B (1h)\n- C\n✅ D", now);
    const [g] = r!.groups;
    expect(g.title).toBe("Ôn tập");
    expect(g.budgetMin).toBe(180);
    // (180 − 60) ÷ 2 open leaves = 60 each; the done leaf takes none
    expect(g.items.map((i) => [i.title, i.minutes, i.sized, i.done])).toEqual([
      ["A", 60, "budget", false],
      ["B", 60, "said", false],
      ["C", 60, "budget", false],
      ["D", undefined, undefined, true],
    ]);
  });

  it("reads a checkbox, a bullet emoji and the done tag", () => {
    const r = outline("📚 Đọc sách (1h)\n☐ Viết bài\n☑ Nộp đơn\n✓ Gửi mail\n", now);
    expect(r!.groups[0].items.map((i) => [i.title, i.done])).toEqual([
      ["Đọc sách", false],
      ["Viết bài", false],
      ["Nộp đơn", true],
      ["Gửi mail", true],
    ]);
  });

  it("reads a markdown heading as the group over its list", () => {
    const r = outline("# Tuần\n## Ngày 1 — 2h\n- A\n- B\n- C", now);
    expect(r!.groups[0].groups![0].title).toBe("Ngày 1");
    expect(r!.groups[0].groups![0].budgetMin).toBe(120);
  });

  it("chains a 'theo thứ tự' group's bullets and a 'Bước N' list; plain bullets stay unordered", () => {
    const r = outline("Quy trình (theo thứ tự)\n- A (1h)\n- B\n✅ C\n- D\n\nRời rạc\n- X\n- Y\n- Z\n", now);
    expect(r!.groups[0].ordered).toBe(true);
    expect(edges(r!.groups)).toEqual([["B", "A"], ["D", "B"]]);
    const s = outline("Bước 1: Mua vé\nBước 2: Đi tàu\nBước 3: Về nhà", now);
    expect(edges(s!.groups)).toEqual([["Bước 2: Đi tàu", "Bước 1: Mua vé"], ["Bước 3: Về nhà", "Bước 2: Đi tàu"]]);
    expect(edges(r!.groups.slice(1))).toEqual([]);
  });

  it("saves open leaves (group title as note) with sizes, deadline and order, in actions", () => {
    const r = outline("Ôn tập\n1. Đọc (1h)\n2. Làm bài 20/12\n3. Nộp (xong)\n", now);
    const acts = actionsOf(r!.groups);
    expect(acts.map((a) => [a.op, a.title, a.note, a.after === acts[0].ref])).toEqual([
      ["create", "Đọc", "Ôn tập", false],
      ["create", "Làm bài", "Ôn tập", true],
    ]);
    expect(acts[0].effortMinutes).toBe(60);
    expect(acts[1].deadline).toBe(new Date(2026, 11, 20, 23, 59).toISOString());
  });

  it("nests dotted numbers under their parent; leaves above a group go in an untitled group", () => {
    const r = outline("1. Lập trình\n   1.1 Biến (30p)\n   1.2 Hàm (30p)\n2. Ôn tập (1h)\n3. Nghỉ", now);
    expect(r!.groups.map((g) => [g.title, g.items.map((i) => i.title)])).toEqual([
      ["", ["Ôn tập", "Nghỉ"]],
      ["Lập trình", ["Biến", "Hàm"]],
    ]);
  });
});

describe("a said start", () => {
  it("rides on its leaf and saves as a busy block", () => {
    const o = outline("Tuần này:\n- Họp nhóm 14h ngày 10/12 (1 giờ)\n- Đọc chương 3\n- Viết báo cáo", new Date(2026, 11, 1, 9))!;
    const l = o.groups[0].items[0];
    expect(l.start).toBe(new Date(2026, 11, 10, 14).getTime());
    expect(actionsOf(o.groups)[0]).toMatchObject({ when: new Date(l.start!).toISOString(), fixed: "busy" });
  });
});
