// Section 3e: recurrence phrases to an RRULE base, and the COUNT and UNTIL bounds.
import { describe, expect, it } from "vitest";
import { exceptSpans, ruleBase, withBounds } from "./rules";

describe("rules: phrases to a base rule", () => {
  it("reads weekdays, minus a named day", () => {
    expect(ruleBase("hop nhom cac ngay thuong 9h")).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    );
    expect(
      ruleBase(
        "moi ngay trong tuan hoc 9h",
        "moi ngay trong tuan tru thu 4 hoc 9h",
      ),
    ).toBe("FREQ=WEEKLY;BYDAY=MO,TU,TH,FR");
  });

  it("reads the weekend and every other week", () => {
    expect(ruleBase("moi cuoi tuan 8h tap yoga")).toBe(
      "FREQ=WEEKLY;BYDAY=SA,SU",
    );
    expect(ruleBase("hop 2 tuan 1 lan 9h")).toBe("FREQ=WEEKLY;INTERVAL=2");
    expect(ruleBase("hop cach tuan 9h")).toBe("FREQ=WEEKLY;INTERVAL=2");
    expect(ruleBase("hop moi 3 tuan 9h")).toBe("FREQ=WEEKLY;INTERVAL=3");
  });

  it("spreads n times a week over the week", () => {
    expect(ruleBase("tap gym 3 buoi mot tuan")).toBe(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    );
    expect(ruleBase("tap gym 3 lan/tuan")).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(ruleBase("tap gym 1 tuan 2 buoi")).toBe("FREQ=WEEKLY;BYDAY=MO,TH");
  });

  it("reads yearly, last day and nth weekday of the month", () => {
    expect(ruleBase("hang nam 20/11 9h hop lop")).toBe(
      "FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=20",
    );
    expect(ruleBase("moi cuoi thang nop hoa don")).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=-1",
    );
    expect(ruleBase("thu 2 dau tien moi thang hop")).toBe(
      "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1",
    );
    expect(ruleBase("thu 6 cuoi cung cua thang nop")).toBe(
      "FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1",
    );
  });

  it("reads hourly within the waking day, and every day", () => {
    expect(ruleBase("moi 3 tieng uong nuoc")).toBe(
      "FREQ=HOURLY;INTERVAL=3;BYHOUR=7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22",
    );
    expect(ruleBase("every day review")).toBe("FREQ=DAILY");
  });

  it("leaves a plain weekday rule to the caller", () => {
    expect(ruleBase("thu 2 hang tuan hop nhom 9h")).toBeUndefined();
    expect(ruleBase("hang ngay doc sach")).toBeUndefined();
  });
});

describe("rules: bounds", () => {
  it("adds COUNT from a count of times", () => {
    expect(withBounds("FREQ=WEEKLY", "hop moi tuan 9h 10 buoi")).toBe(
      "FREQ=WEEKLY;COUNT=10",
    );
    expect(withBounds("FREQ=WEEKLY", "hop 5 lan")).toBe("FREQ=WEEKLY;COUNT=5");
  });

  it("does not read a weekly count as COUNT", () => {
    expect(
      withBounds("FREQ=WEEKLY;BYDAY=MO,WE,FR", "tap gym 3 buoi mot tuan"),
    ).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(withBounds("FREQ=WEEKLY;INTERVAL=2", "hop 2 tuan 1 lan 9h")).toBe(
      "FREQ=WEEKLY;INTERVAL=2",
    );
  });

  it("adds UNTIL as the end of the day, floating", () => {
    expect(
      withBounds("FREQ=WEEKLY", "hop moi tuan 9h den 20/12", {
        y: 2026,
        m: 12,
        d: 20,
      }),
    ).toBe("FREQ=WEEKLY;UNTIL=20261220T235959");
  });

  it("reads a trừ weekday as a span to blank", () => {
    const raw = "moi ngay trong tuan tru thu 4 hoc 9h";
    const [[s, e]] = exceptSpans(raw);
    expect(raw.slice(s, e)).toBe("tru thu 4");
  });
});
