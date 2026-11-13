import { describe, expect, it } from "vitest";
import { read } from "./reader";
import { hintsOf } from "./hints";

const ref = { y: 2026, m: 11, d: 12, h: 10, mi: 0 };
const labels = (hs: ReturnType<typeof hintsOf>) =>
  hs.map((h) => h.options.map((o) => o.label));

describe("hintsOf", () => {
  it("offers a length first after a task verb, then the PM and AM clocks", () => {
    const text = "học raft 2h";
    const [h] = hintsOf(text, { ref, repairs: [] });
    expect(h).toMatchObject({
      kind: "ask",
      label: "2h",
      start: text.indexOf("2h"),
      end: text.indexOf("2h") + 2,
    });
    expect(h.options.map((o) => o.label)).toEqual([
      "mất 2 tiếng",
      "2 giờ chiều",
      "2 giờ sáng",
    ]);
  });

  it("leads with the clocks after an event verb", () => {
    expect(labels(hintsOf("họp 2h", { ref, repairs: [] }))).toEqual([
      ["2 giờ chiều", "mất 2 tiếng", "2 giờ sáng"],
    ]);
  });

  it("drops the length after a start cue and puts a passed morning last", () => {
    const [h] = hintsOf("gặp thầy lúc 8h", { ref, repairs: [] });
    expect(h.options.map((o) => o.label)).toEqual(["8 giờ tối", "8 giờ sáng"]);
    expect(h.options[0].caption).toBe("20:00");
  });

  it("asks nothing when a part of the day is named", () => {
    expect(hintsOf("học 2h chiều", { ref, repairs: [] })).toEqual([]);
  });

  it("asks today or tomorrow for a 24 hour clock still ahead", () => {
    expect(labels(hintsOf("gặp thầy 15h30", { ref, repairs: [] }))).toEqual([
      ["hôm nay 15h30", "ngày mai 15h30"],
    ]);
  });

  it("asks nothing for a clock already passed today or with a day named", () => {
    const late = { ...ref, h: 16 };
    expect(hintsOf("gặp thầy 15h30", { ref: late, repairs: [] })).toEqual([]);
    expect(hintsOf("gặp thầy 15h30 thứ 6", { ref, repairs: [] })).toEqual([]);
  });

  it("turns each repair into a typo with one option", () => {
    const text = "học 2h";
    expect(
      hintsOf(text, { ref, repairs: [{ start: 4, end: 6, to: "3h" }] }),
    ).toEqual([
      {
        start: 4,
        end: 6,
        kind: "typo",
        label: "3h",
        options: [{ label: "3h", to: "3h" }],
      },
    ]);
  });

  it("drops an ask that overlaps a typo", () => {
    const hs = hintsOf("học 2h", {
      ref,
      repairs: [{ start: 4, end: 6, to: "3h" }],
    });
    expect(hs.map((h) => h.kind)).toEqual(["typo"]);
  });
});

describe("read hints", () => {
  it("carries the typo repairs and the asks on the result", () => {
    const res = read("nop bai 1O/11 lúc 8h", { ref, source: "typed" });
    expect(res.hints).toContainEqual({
      start: 8,
      end: 13,
      kind: "typo",
      label: "10/11",
      options: [{ label: "10/11", to: "10/11" }],
    });
  });

  it("asks on a bare hour in a typed task", () => {
    const res = read("học raft 2h", { ref, source: "typed" });
    expect(res.hints?.map((h) => h.kind)).toEqual(["ask"]);
  });
});
