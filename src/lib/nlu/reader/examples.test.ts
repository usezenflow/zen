// The sentences the app itself tells people to say (empty day, widgets): each must read exactly right, or the app teaches a wrong read.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { t } from "../../i18n";
import { itemAction } from "../adapt";
import { read } from "./reader";

// Sat 14/11/2026 06:00
const REF = { y: 2026, m: 11, d: 14, h: 6, mi: 0 };
const pick = (s: string) =>
  read(s, { ref: REF, source: "voice" }).items.map(itemAction).map((a) => ({
    title: a.title, when: a.when, deadline: a.deadline, notAfter: a.notAfter, fixed: a.fixed, repeat: a.repeat,
  }));

it("try1: a day and a clock is one fixed block", () => {
  expect(pick(t("try1"))).toEqual([{ title: "Ôn Giải tích", when: "2026-11-15T09:00:00", deadline: undefined, notAfter: undefined, fixed: "busy", repeat: undefined }]);
});
it("try2: a hand-in on a weekday is due that day, flexible, no repeat", () => {
  expect(pick(t("try2"))).toEqual([{ title: "Nộp báo cáo nhóm", when: undefined, deadline: "2026-11-20T23:59:00", notAfter: undefined, fixed: undefined, repeat: undefined }]);
});
it("try3: 'tối nào cũng' is every evening, flexible, from tonight", () => {
  expect(pick(t("try3"))).toEqual([{ title: "Đọc sách", when: "2026-11-14T20:00:00", deadline: undefined, notAfter: "2026-11-14T22:00:00", fixed: undefined, repeat: "FREQ=DAILY" }]);
});
it("the widgets show the same three lines", () => {
  for (const f of ["ZenToday.ios.tsx", "ZenToday.android.tsx"]) {
    const src = readFileSync(join(__dirname, "../../../widgets", f), "utf8");
    for (const k of ["try1", "try2", "try3"] as const) expect(src, `${f} ${k}`).toContain(`"${t(k)}"`);
  }
});
it("typed reads the examples as voice does", () => {
  const typed = (s: string) => read(s, { ref: REF, source: "typed" }).items.map(itemAction).map((a) => [a.title, a.when, a.deadline, a.fixed, a.repeat]);
  const voice = (s: string) => read(s, { ref: REF, source: "voice" }).items.map(itemAction).map((a) => [a.title, a.when, a.deadline, a.fixed, a.repeat]);
  for (const k of ["try1", "try2", "try3"] as const) expect(typed(t(k)), k).toEqual(voice(t(k)));
});
