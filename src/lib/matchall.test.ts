import { expect, it } from "vitest";
import { matchAllByExec } from "./matchall";

it("the exec loop matches native matchAll, groups and empty matches included", () => {
  for (const [s, re] of [["thu 7 tuan sau, t2", /(?<wd>\d)|(?<w>tuan)/g], ["a😀b", /(?:)/gu], ["xx", /x*/g], ["Tết tet", /(?<![a-z])tet/gi]] as const) {
    const pick = (ms: Iterable<RegExpMatchArray>) => [...ms].map((m) => [m[0], m.index, { ...m.groups }]);
    expect(pick(matchAllByExec.call(s, re))).toEqual(pick(s.matchAll(re)));
  }
  expect(() => matchAllByExec.call("x", /x/)).toThrow(TypeError);
});
