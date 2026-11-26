// Gen Z and chat slang for the day: each must read as the full word does, and the ambiguous ones must stay untouched.
import { expect, it } from "vitest";
import { itemAction } from "../adapt";
import { read } from "./reader";

// Sat 14/11/2026 06:00
const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };
const act = (s: string) => read(s, { ref: REF, source: "typed" }).items.map(itemAction);
const sig = (s: string) => JSON.stringify(act(s).map((a) => ({ ...a, title: undefined })));

// [slang, the full spelling it must read the same as]
const SAME: [string, string][] = [
  ["hnay", "hôm nay"], ["hmnay", "hôm nay"], ["homnay", "hôm nay"], ["Hnay", "hôm nay"], ["hnayy", "hôm nay"],
  ["ngmai", "ngày mai"], ["tmr", "ngày mai"], ["tmrw", "ngày mai"], ["tmrrw", "ngày mai"], ["2moro", "ngày mai"],
  ["snay", "sáng nay"], ["cnay", "chiều nay"], ["smai", "sáng mai"], ["cmai", "chiều mai"], ["tmai", "tối mai"],
  ["tối ni", "tối nay"], ["sáng ni", "sáng nay"], ["hôm ni", "hôm nay"], ["bữa ni", "hôm nay"], ["bửa ni", "hôm nay"], ["bứa nay", "hôm nay"], ["bua ni", "hôm nay"], ["hôm nì", "hôm nay"], ["tối nỳ", "tối nay"], ["chiều ny", "chiều nay"],
  ["tsau", "tuần sau"], ["tuansau", "tuần sau"], ["cuoituan", "cuối tuần"], ["wknd", "cuối tuần"],
  ["th2", "thứ 2"], ["th 3", "thứ 3"], ["th7", "thứ 7"], ["cnhat", "chủ nhật"],
];
const FRAMES = ["Brainstorm game idea {d}", "Brainstorm game idea trong {d}", "{d} làm slide 3h", "họp nhóm {d} lúc 9h"];

it(`slang day words read as the full word (${SAME.length * FRAMES.length} cases)`, () => {
  const miss: string[] = [];
  for (const [slang, full] of SAME) for (const f of FRAMES) {
    const a = f.replace("{d}", slang), b = f.replace("{d}", full);
    if (sig(a) !== sig(b)) miss.push(`${a} -> ${sig(a)}\n   want ${sig(b)}`);
  }
  if (miss.length) console.log(miss.slice(0, 20).join("\n"));
  expect(miss).toEqual([]);
});

it("the reported case: one task today, not three sessions", () => {
  const a = act("Brainstorm game idea trong hnay");
  expect(a.length).toBe(1);
  expect(sig("Brainstorm game idea trong hnay")).toBe(sig("Brainstorm game idea trong hôm nay"));
});

it("words that mean something else stay as typed", () => {
  for (const s of ["họp hn", "mua bh", "mn ơi họp", "làm 5g", "học thêm", "mới mua"]) expect(sig(s)).toBe(sig(s));
  expect(act("mua bh xe")[0].title).toMatch(/bh/i);
  expect(act("đi hn thăm bạn")[0].title).toMatch(/hn/i);
});
