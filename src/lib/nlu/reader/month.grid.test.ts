// "trước/trong tháng N" as deadlines, "den/gien" as Zen by voice, and title words that only fold to a cue.
// `pnpm vitest run month.grid` runs it.
import { describe, expect, it } from "vitest";
import { read } from "./reader";

// Wed 18/11/2026 09:00
const REF = { y: 2026, m: 11, d: 18, h: 9, mi: 0 };
const one = (s: string, source: "typed" | "voice" = "typed") => {
  const r = read(s, { ref: REF, source });
  expect(r.items, s).toHaveLength(1);
  return r.items[0];
};
const last = (y: number, m: number) => new Date(y, m, 0).getDate();
const pad = (n: number) => String(n).padStart(2, "0");

describe("trước/trong tháng N", () => {
  const tasks = ["Nộp bài", "Đọc code zenflow", "Viết báo cáo"];
  // the coming six months; a date up to 120 days back stays past (calendar.ts inferYear), so "hết tháng 8" said in November is August gone
  for (const task of tasks) for (const n of [12, 1, 2, 3, 4, 5]) {
    // the month before N, in this year unless it has passed
    const pm = n === 1 ? 12 : n - 1, py = pm < REF.m ? REF.y + 1 : REF.y;
    for (const cue of ["trước", "trc", "truoc", "trước đầu"]) {
      it(`${task} ${cue} tháng ${n}`, () => {
        const x = one(`${task} ${cue} tháng ${n}`);
        expect(x.title).toBe(task);
        expect(x.deadline).toBe(`${py}-${pad(pm)}-${pad(last(py, pm))} 23:59`);
      });
    }
    const y = n < REF.m ? REF.y + 1 : REF.y;
    for (const cue of ["trong", "hết"]) {
      it(`${task} ${cue} tháng ${n}`, () => {
        const x = one(`${task} ${cue} tháng ${n}`);
        expect(x.title).toBe(task);
        expect(x.deadline).toBe(`${y}-${pad(n)}-${pad(last(y, n))} 23:59`);
      });
    }
  }
  it("a year said: trước tháng 12 năm 2027, trước tháng 1 năm 2028", () => {
    expect(one("nộp bài trước tháng 12 năm 2027").deadline).toBe("2027-11-30 23:59");
    expect(one("nộp bài trước tháng 1 năm 2028").deadline).toBe("2027-12-31 23:59");
  });
  it("a day in the month stays that day: trước 20 tháng 12", () => {
    expect(one("nộp bài trước 20 tháng 12").deadline).toBe("2026-12-20 23:59");
  });
});

describe("voice: den, gien are Zen", () => {
  for (const [said, title] of [
    ["đọc code den flow", "Đọc code zenflow"], ["đọc code denflow", "Đọc code zenflow"], ["đọc code gien flow", "Đọc code zenflow"],
    ["đọc code Den-flow", "Đọc code zenflow"], ["test app den", "Test app Zen"], ["test app gien", "Test app Zen"],
  ]) it(said, () => expect(one(said, "voice").title).toBe(title));
  // "đen", "đến", "đèn" keep their "đ"; "gien" beside biology is the gene
  for (const said of ["học về gien di truyền", "ôn đột biến gien", "ôn gien trội", "ôn gien lặn", "mua áo đen", "sửa đèn"])
    it(said, () => expect(one(said, "voice").title.toLowerCase()).not.toMatch(/zen/));
  it("typed den is still đến", () => expect(one("nộp bài den 20/11").title).toBe("Nộp bài"));
});

describe("a marked word that only folds to a cue stays in the title", () => {
  for (const s of ["Sửa đèn", "Mua túi xách", "Mua cân điện tử", "Quét lá sân", "Dọn phòng trống", "Tập thể lực", "Mua tranh", "Mua đệm", "Học hán tự", "Đi khám da", "Mua đồ sang tay"])
    it(s, () => expect(one(s.toLowerCase()).title).toBe(s));
  // the cue in its own spelling still leaves
  for (const [s, title] of [["tối nay sửa đèn", "Sửa đèn"], ["mai trước 9h mua túi", "Mua túi"], ["mai cần dọn phòng trống", "Dọn phòng trống"]])
    it(s, () => expect(one(s).title).toBe(title));
});

describe("simple everyday lines", () => {
  const cases: [string, Partial<{ type: string; title: string; startsAt: string }>][] = [
    // only an untoned "thi" is the exam: "siêu thị", "thì", "thí nghiệm", "thị trường" are not
    ["đi siêu thị chiều nay", { type: "PLAN", title: "Đi siêu thị" }],
    ["mua đồ ở siêu thị mai", { type: "PLAN" }],
    ["làm thí nghiệm hóa 9h mai", { type: "BUSY", title: "Làm thí nghiệm hóa" }],
    ["nghiên cứu thị trường", { type: "PLAN", title: "Nghiên cứu thị trường" }],
    ["thi 9h mai", { type: "EXAM", startsAt: "2026-11-19 09:00" }],
    ["di sieu thi chieu nay", { type: "PLAN" }],
    // a person or a compound keeps its cue word
    ["đón em lúc 5h", { title: "Đón em", startsAt: "2026-11-18 17:00" }],
    ["chở em đi học", { title: "Chở em đi học" }],
    ["sáng thứ 2 họp giao ban", { title: "Họp giao ban" }],
    ["đi đến nhà Lan", { title: "Đi đến nhà Lan" }],
    // bedtime is at night, waking in the morning
    ["đi ngủ lúc 11h", { startsAt: "2026-11-18 23:00" }],
    ["ngủ lúc 10h", { startsAt: "2026-11-18 22:00" }],
    ["ngủ dậy lúc 6h", { startsAt: "2026-11-19 06:00" }],
    ["báo thức 6h", { startsAt: "2026-11-19 06:00" }],
    ["ngủ trưa 1h", { startsAt: "2026-11-18 13:00" }],
    // reminder words are not the task; a line with no reading still gets a capital
    ["nhắc tôi uống nước", { title: "Uống nước" }],
    ["nhớ mua bánh mì", { title: "Mua bánh mì" }],
    ["đừng quên gọi Lan", { title: "Gọi Lan" }],
    ["nhắc mình là nộp bài", { title: "Nộp bài" }],
    ["nhớ", { title: "Nhớ" }],
    ["tưới cây", { title: "Tưới cây" }],
    ["họp", { title: "Họp" }],
    ["fix bug login", { title: "Fix bug login" }],
    ["iPhone sạc", { title: "iPhone sạc" }],
  ];
  for (const [s, want] of cases) it(s, () => expect(read(s, { ref: REF, source: "typed" }).items[0]).toMatchObject(want));
});
