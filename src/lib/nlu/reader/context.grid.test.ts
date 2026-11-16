// A lead or trailing span on a line of tasks gives every task of the line its span: "tuần sau học toán, viết báo cáo" and
// "học toán, viết báo cáo tuần sau" both put each task from Monday to Sunday of the next week. The expected days are worked
// out here from the reference day, not read from the reader. `pnpm vitest run context.grid` runs the whole set.
import { expect, it } from "vitest";
import { fold } from "./fold";
import { read } from "./reader";

// Mon 16/11/2026: the week, month, year and quarter below are counted from this day
const REF = { y: 2026, m: 11, d: 16, h: 10, mi: 0 };
const TODAY = "2026-11-16";
const DAY_MS = 86_400_000;
const REF_MS = Date.UTC(2026, 10, 16);
const dayAt = (n: number) => new Date(REF_MS + n * DAY_MS).toISOString().slice(0, 10);

interface Span { notBefore?: string; deadline?: string }
// the span each lead names, as a line of tasks should read it
const SPANS: [string, Span][] = [
  ["tuần sau", { notBefore: "2026-11-23 00:00", deadline: "2026-11-29 23:59" }],
  // "tuần này" alone reads as its Sunday: start and deadline are that day
  ["tuần này", { notBefore: "2026-11-22 00:00", deadline: "2026-11-22 23:59" }],
  ["tháng này", { notBefore: `${TODAY} 00:00`, deadline: "2026-11-30 23:59" }],
  ["trong năm nay", { notBefore: `${TODAY} 00:00`, deadline: "2026-12-31 23:59" }],
  ["năm nay", { notBefore: `${TODAY} 00:00`, deadline: "2026-12-31 23:59" }],
  ["trước thứ 6", { deadline: "2026-11-20 23:59" }],
  ["từ mai", { notBefore: "2026-11-17 00:00" }],
  ["cuối tháng", { notBefore: "2026-11-21 00:00", deadline: "2026-11-30 23:59" }],
];
const TITLES = ["học toán", "viết báo cáo", "đi khám", "dọn phòng", "mua sữa", "gọi mẹ"];
// the same tasks, three rotations per count, so every title meets every other one
const LISTS: string[][] = [2, 3, 4].flatMap((n) =>
  [0, 2, 4].map((s) => Array.from({ length: n }, (_, i) => TITLES[(s + i) % TITLES.length])),
);
const POSITIONS = ["lead", "trail"] as const;
const SEP = ", ";

const cases = (): { text: string; titles: string[]; want: Span }[] => {
  const out: { text: string; titles: string[]; want: Span }[] = [];
  for (const [lead, want] of SPANS)
    for (const pos of POSITIONS)
      for (const titles of LISTS) {
        const list = titles.join(SEP);
        const text = pos === "lead" ? `${lead} ${list}` : `${list} ${lead}`;
        out.push({ text, titles, want });
      }
  return out;
};


/** The fields a task of a span must carry, and the fixed start it must not have. */
interface Want { notBefore?: string; deadline?: string; windows?: string[] }

/** Why `text` misses one of the wanted tasks, or undefined. A title in `fixed` must have a start, and a clock is never carried. */
function missWants(text: string, wants: [string, Want][], fixed: Record<string, string> = {}): string | undefined {
  const res = read(text, { ref: REF, source: "typed" });
  if (res.items.length !== wants.length)
    return `${text}: ${res.items.length} items, want ${wants.length}`;
  for (const [title, want] of wants) {
    const it = res.items.find((x) => fold(x.title).text.includes(fold(title).text));
    if (!it) return `${text}: no item for "${title}"`;
    if (title in fixed) {
      if (it.startsAt !== fixed[title]) return `${text}: "${title}" starts ${it.startsAt}, want ${fixed[title]}`;
      continue;
    }
    if (it.startsAt) return `${text}: "${title}" is fixed at ${it.startsAt}`;
    // a class's implied due (listed as inferred) is not the span: a start-only phrase has no end to match
    const implied = want.deadline === undefined && it.inferred.includes("deadline");
    const got = { notBefore: it.notBefore, deadline: implied ? undefined : it.deadline, windows: it.windows ?? undefined };
    if (JSON.stringify(got) !== JSON.stringify({ notBefore: want.notBefore, deadline: want.deadline, windows: want.windows }))
      return `${text}: "${title}" ${JSON.stringify(got)}, want ${JSON.stringify(want)}`;
  }
  return undefined;
}

/** A reason the line reads wrong, or undefined. */
function miss(c: { text: string; titles: string[]; want: Span }): string | undefined {
  return missWants(c.text, c.titles.map((t) => [t, c.want] as [string, Want]));
}

it("context grid: every task on a line with a lead or trailing span takes that span", () => {
  const misses = cases()
    .map(miss)
    .filter((x): x is string => !!x);
  expect(misses, misses.slice(0, 10).join("\n")).toEqual([]);
}, 60000);

it("context grid: a later date keeps its own day", () => {
  const res = read("tuần sau học toán, mai đi khám", { ref: REF, source: "typed" });
  const gym = res.items.find((x) => fold(x.title).text.includes("di kham"));
  const study = res.items.find((x) => fold(x.title).text.includes("hoc toan"));
  expect(gym?.notBefore).toBe("2026-11-17 00:00");
  expect(gym?.deadline).toBe("2026-11-17 23:59");
  expect(study?.notBefore).toBe("2026-11-23 00:00");
  expect(study?.deadline).toBe("2026-11-29 23:59");
});

// Parts of the day: "sáng mai" is the morning of tomorrow, "tối nay" the evening of today, "chiều thứ 6" the afternoon of Friday
const PARTS = [
  { word: "sáng", window: "MORNING", due: "11:00", days: ["nay", "mai", "thứ 6"] },
  { word: "trưa", window: "NOON", due: "13:00", days: ["mai", "thứ 6"] },
  { word: "chiều", window: "AFTERNOON", due: "18:00", days: ["nay", "mai", "thứ 6"] },
  { word: "tối", window: "NIGHT", due: "22:00", days: ["nay", "mai", "thứ 6"] },
];
// the day each day word names, counted from Monday 16/11: "thứ 6" is Friday 20/11
const OFFSET: Record<string, number> = { nay: 0, mai: 1, "thứ 6": 4 };
const PART_PHRASES = PARTS.flatMap((p) =>
  p.days.map((d) => ({
    phrase: `${p.word} ${d}`,
    // what the part and the day give, worked out here: the day from 00:00 to the part's end, the part's window
    want: { notBefore: `${dayAt(OFFSET[d])} 00:00`, deadline: `${dayAt(OFFSET[d])} ${p.due}`, windows: [p.window] } as Want,
  })),
);
const PART_LISTS: string[][] = [
  [0, 1], [2, 3], [4, 5], [0, 1, 2], [2, 3, 4], [4, 5, 0],
].map((ix) => ix.map((i) => TITLES[i]));

it("context grid: a part and day before a line of tasks gives each task that part of that day", () => {
  const misses: string[] = [];
  for (const { phrase, want } of PART_PHRASES) {
    // the same phrase on one task is the reference the list must match
    const single = missWants(`${phrase} ${TITLES[0]}`, [[TITLES[0], want]]);
    if (single) misses.push(single);
    for (const titles of PART_LISTS) {
      const miss = missWants(`${phrase} ${titles.join(SEP)}`, titles.map((t) => [t, want]));
      if (miss) misses.push(miss);
    }
  }
  expect(misses, misses.slice(0, 10).join("\n")).toEqual([]);
}, 60000);

it("context grid: a part and day after a line of tasks gives each task that part of that day", () => {
  const misses: string[] = [];
  for (const { phrase, want } of PART_PHRASES)
    for (const titles of PART_LISTS) {
      const miss = missWants(`${titles.join(SEP)} ${phrase}`, titles.map((t) => [t, want]));
      if (miss) misses.push(miss);
    }
  expect(misses, misses.slice(0, 10).join("\n")).toEqual([]);
}, 60000);

// "8h sáng mai A, B": A is fixed at 8:00 tomorrow, B is tomorrow morning and flexible; "mai 8h" and "8h mai" give the day alone
const CLOCK_LEADS: [string, Want][] = [
  ["8h sáng mai", { notBefore: `${dayAt(1)} 00:00`, deadline: `${dayAt(1)} 11:00`, windows: ["MORNING"] }],
  ["8h mai", { notBefore: `${dayAt(1)} 00:00`, deadline: `${dayAt(1)} 23:59` }],
  ["mai 8h", { notBefore: `${dayAt(1)} 00:00`, deadline: `${dayAt(1)} 23:59` }],
];
it("context grid: a clock before a day is never carried, only the day and its part", () => {
  const misses: string[] = [];
  for (const [phrase, want] of CLOCK_LEADS)
    for (const titles of PART_LISTS) {
      // the first task is the fixed one; the rest must be flexible with the day's fields
      const miss = missWants(`${phrase} ${titles.join(SEP)}`, titles.map((t) => [t, want]), { [titles[0]]: `${dayAt(1)} 08:00` });
      if (miss) misses.push(miss);
    }
  expect(misses, misses.slice(0, 10).join("\n")).toEqual([]);
});

it("context grid: a task that names its own part keeps it, on the lead's day", () => {
  const res = missWants("sáng mai học toán, tối dọn phòng", [
    ["học toán", { notBefore: `${dayAt(1)} 00:00`, deadline: `${dayAt(1)} 11:00`, windows: ["MORNING"] }],
    ["dọn phòng", { notBefore: `${dayAt(1)} 00:00`, deadline: `${dayAt(1)} 22:00`, windows: ["NIGHT"] }],
  ]);
  expect(res).toBeUndefined();
});

// every lead part × every other part as the task's own × 2 title pairs: the own task keeps its part's end on the lead's day
const PAIRS: string[][] = [["học toán", "dọn phòng"], ["viết báo cáo", "đi khám"]];
const partWant = (p: (typeof PARTS)[number], day: number): Want => ({
  notBefore: `${dayAt(day)} 00:00`,
  deadline: `${dayAt(day)} ${p.due}`,
  windows: [p.window],
});
it("context grid: a task that names its own part keeps it, for every lead part and own part", () => {
  const misses: string[] = [];
  for (const lead of PARTS)
    for (const own of PARTS) {
      if (own === lead) continue;
      for (const [a, b] of PAIRS) {
        const miss = missWants(`${lead.word} mai ${a}, ${own.word} ${b}`, [
          [a, partWant(lead, 1)],
          [b, partWant(own, 1)],
        ]);
        if (miss) misses.push(miss);
      }
    }
  expect(misses, misses.slice(0, 10).join("\n")).toEqual([]);
});

// a part with no lead and no day is today's part: "tối dọn phòng" reads as "tối nay dọn phòng"
it("context grid: a lone part with no day is today's part, as 'nay' says", () => {
  const misses: string[] = [];
  for (const p of PARTS)
    for (const t of PAIRS.flat()) {
      const want = partWant(p, 0);
      const miss = missWants(`${p.word} ${t}`, [[t, want]]);
      if (miss) misses.push(miss);
      const ref = missWants(`${p.word} nay ${t}`, [[t, want]]);
      if (ref) misses.push(ref);
    }
  expect(misses, misses.slice(0, 10).join("\n")).toEqual([]);
});

// a task that names its own day keeps it: "sáng mai A, thứ 6 B" gives B Friday, and A tomorrow morning
it("context grid: a later task with its own day keeps that day", () => {
  const own: Want = { notBefore: `${dayAt(4)} 00:00`, deadline: `${dayAt(4)} 23:59` };
  const res = missWants("sáng mai học toán, thứ 6 dọn phòng", [
    ["học toán", { notBefore: `${dayAt(1)} 00:00`, deadline: `${dayAt(1)} 11:00`, windows: ["MORNING"] }],
    ["dọn phòng", own],
  ]);
  expect(res).toBeUndefined();
});

// The term: "học kỳ này" is today to the last day of the term holding now. HK01 ends where HK02 starts, the Monday of the
// last week of December (2026: Monday 28/12), so its last day is Sunday 27/12.
const lastDec = new Date(Date.UTC(2026, 11, 31));
const hk2Start = new Date(lastDec.getTime() - ((lastDec.getUTCDay() + 6) % 7) * DAY_MS);
const TERM_DEADLINE = `${new Date(hk2Start.getTime() - DAY_MS).toISOString().slice(0, 10)} 23:59`;
const TERM_PHRASES = [
  "học kỳ này", "học kì này", "kỳ này", "kì này", "hoc ky nay", "hk này", "trong học kỳ này", "hết học kỳ", "het hoc ky",
];
const TERM_CASES = TERM_PHRASES.flatMap((phrase) =>
  LISTS.filter((l) => l.length <= 3).flatMap((titles) => {
    const list = titles.join(SEP);
    const want: Want = { notBefore: `${TODAY} 00:00`, deadline: TERM_DEADLINE };
    const wants = titles.map((t) => [t, want] as [string, Want]);
    return [
      { text: `${phrase} ${list}`, wants },
      { text: `${list} ${phrase}`, wants },
    ];
  }),
);
it("context grid: a term span gives every task of the line today to the term's last day", () => {
  const misses = TERM_CASES.map((c) => missWants(c.text, c.wants)).filter((x): x is string => !!x);
  expect(misses, misses.slice(0, 10).join("\n")).toEqual([]);
});

it("context grid: the term's last day follows the term holding the reference day", () => {
  // Fri 10/07/2026 is in HK03, which ends where the last week of July starts (Monday 27/07): its last day is 26/07
  const res = read("học kỳ này học toán", { ref: { y: 2026, m: 7, d: 10, h: 10, mi: 0 }, source: "typed" });
  expect(res.items[0]?.deadline).toBe("2026-07-26 23:59");
  expect(res.items[0]?.notBefore).toBe("2026-07-10 00:00");
});
