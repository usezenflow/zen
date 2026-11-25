// Command eval: golden/commands.jsonl, one line each. A line says what `think` makes of it on a fixed task list.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Action, Task } from "../../../types";
import { think } from "../../commands";
import { splitOf } from "../../intent";
import { fold } from "../fold";
import { FAMILIES, mutate } from "./mutate";

export interface CmdCase {
  text: string;
  tasks?: keyof typeof FIXTURES;
  /** The commands the line makes (each matched once): the op, on the task with this id; `when`: it moves; `title`: folded words of the new title. */
  ops?: { op: Action["op"]; target?: string; when?: boolean; title?: string }[];
  /** Folded words each create title must hold (the rest of the line, read as creates). */
  creates?: string[];
  /** Folded words no create title may hold (filler that must not become a task). */
  absent?: string[];
  /** The `when` one of the commands must be, exactly (wall clock, as the reader writes it). */
  whenIs?: string;
  /** The line asks (a chip or a bulk confirm) instead of acting. */
  ask?: boolean;
  /** With `ask`: the ids the first ask acts on (a bulk's, or its one chip's), exactly: "xoá gym tuần sau" is each session next week. */
  targets?: string[];
  /** A create line: no command, no chip. */
  create?: boolean;
  /** Typos, slang or teencode in the line. */
  noisy?: boolean;
}

const NOW = Date.parse("2026-11-13T03:00:00Z"); // Fri 10:00, UTC+7
const day = (d: number, h: number) => Date.UTC(2026, 10, d, h - 7);
const task = (id: string, title: string, start: number, extra: Partial<Task> = {}) =>
  ({ id, title, start, end: start + 3600_000, createdAt: 0, source: "user", ...extra }) as Task;

export const FIXTURES = {
  main: [task("laundry", "Giặt đồ", day(14, 9)), task("meet", "Họp nhóm", day(14, 15)), task("gym1", "Gym", day(15, 18)), task("gym2", "Gym", day(16, 18)),
    task("report", "Báo cáo", day(20, 9)), task("yoga", "Yoga", day(17, 7)), task("read", "Đọc sách", day(18, 20)), task("dentist", "Khám răng", day(19, 10))],
  en: [task("laundry", "Laundry", day(14, 9)), task("meet", "Team meeting", day(14, 15)), task("gym", "Gym", day(15, 18)), task("report", "Report", day(20, 9)), task("read", "Read book", day(18, 20))],
  coord: [task("laundry", "Giặt đồ", day(14, 9)), task("gym", "Gym", day(17, 18)), task("meet", "Họp nhóm", day(14, 15)), task("report", "Báo cáo", day(20, 9)),
    task("run", "Chạy bộ", day(16, 6)), task("clean", "Dọn phòng", day(14, 20)), task("read", "Đọc sách", day(14, 21))],
  // A weekly series over three weeks (Mon, Wed, Fri evenings; one Wed moved to the morning), a done session, and a one-off on the same days.
  weekly: [
    ...[11, 13, 16, 18, 20, 23, 25, 27].map((d) => task(`g${d}`, "Gym buổi tối", day(d, d === 18 ? 7 : 18), { rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR", seriesId: "gym" })),
    task("g9", "Gym buổi tối", day(9, 18), { rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR", seriesId: "gym", doneAt: day(9, 19) }),
    task("yoga", "Yoga", day(14, 7)), task("piano", "Piano", day(16, 19)),
  ],
  series: [task("gym-s", "Gym", day(16, 18), { rrule: "FREQ=WEEKLY;BYDAY=MO,WE", seriesId: "gym" }), task("piano-s", "Piano", day(17, 19), { rrule: "FREQ=WEEKLY;BYDAY=TU,TH", seriesId: "piano" })],
};

const norm = (s: string) => fold(s).text;
const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 100);

function run(c: CmdCase) {
  const tasks = FIXTURES[c.tasks ?? "main"];
  const sp = splitOf(c.text, NOW, tasks);
  const acts = think(c.text, new Date(NOW), "typed", {}, tasks);
  return { sp, acts, cmds: acts.filter((a) => a.op !== "create") };
}

export function passes(c: CmdCase): boolean {
  const { sp, acts, cmds } = run(c);
  if (c.ask) {
    const a = sp?.asks[0]?.cmd;
    if (!a) return false;
    if (!c.targets) return true;
    const got = "actions" in a ? a.actions : a.kind === "choose" && a.options.length === 1 ? a.options[0].actions : [];
    return got.map((x) => x.target).sort().join() === [...c.targets].sort().join();
  }
  if (sp?.asks.length) return false; // a chip where the line should just act or create
  const ops = c.ops ?? [];
  if (cmds.length !== ops.length) return false;
  const left = [...cmds];
  for (const e of ops) {
    const i = left.findIndex((a) => a.op === e.op && (e.target === undefined || a.target === e.target) && (!e.when || a.when !== undefined) && (e.title === undefined || norm(a.title ?? "").includes(norm(e.title))));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  if (c.whenIs && !cmds.some((a) => a.when === c.whenIs)) return false;
  if ((c.absent ?? []).some((w) => acts.some((a) => a.op === "create" && norm(a.title ?? "").includes(norm(w))))) return false;
  return (c.creates ?? []).every((w) => acts.some((a) => a.op === "create" && norm(a.title ?? "").includes(norm(w))));
}

/** Pass rates of the command golden, overall and split into clean and typo/slang lines, and how often a create line is read as a command. */
export function commandScore() {
  const cases = readFileSync(join(__dirname, "golden/commands.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as CmdCase);
  const of = (f: (c: CmdCase) => boolean) => { const s = cases.filter(f); return `${s.filter(passes).length}/${s.length}`; };
  const neg = cases.filter((c) => c.create);
  const falseCmd = neg.filter((c) => { const { sp, cmds } = run(c); return cmds.length > 0 || !!sp?.asks.length; }).length;
  return {
    pass: of(() => true),
    clean: of((c) => !c.noisy),
    noisy: of((c) => !!c.noisy),
    negatives: neg.length,
    negativeFalseCommandRate: pct(falseCmd, neg.length),
    failed: cases.filter((c) => !passes(c)).map((c) => c.text),
    // The clean command lines that act, each run through one noise family (typos, Telex, ASR...): how much a typed or heard slip costs.
    mutatedPassPct: Object.fromEntries(FAMILIES.map((f) => {
      const cs = cases.filter((c) => !c.noisy && c.ops?.length);
      return [f, pct(cs.filter((c) => passes({ ...c, text: mutate(f, c.text, 1) })).length, cs.length)];
    })),
  };
}
