// backend/src/nlu/eval/cases.ts
// Stateless NLU eval inputs. Each case fixes its clock (`now`, an ISO instant),
// timezone and text, with no sessions, courses or rows, so cases run in any
// order and relative dates ("mai", "thứ 6 tuần sau") resolve the same every run.
// Expectations are exact: `due` is the deadline day, `window` the [from, to]
// days, `dur` minutes (scored ±25%). A list in `due` accepts either day, and `due: null`
// means the task has no deadline.

/** A class in the student's timetable. The reader takes a calendar instead, so scoring ignores it. */
export interface CourseRow {
  title: string;
  weekday: string;
  periods: string;
  room: string | null;
}

export type Tag =
  | "legacy"
  | "prep-single"
  | "group"
  | "span"
  | "social"
  | "announce"
  | "paste-pdf"
  | "ocr-table"
  | "dictation"
  | "multi"
  | "noisy"
  | "exam"
  | "lecture"
  | "busy"
  | "timetable"
  | "assignment"
  | "undated"
  | "none";

export type TOD =
  | "early_morning"
  | "dawn"
  | "morning"
  | "noon"
  | "afternoon"
  | "evening"
  | "night"
  | "midnight"
  | "any";

/** One expected task. `kw` must appear in the title (accent-folded, lowercase). */
export interface ExpItem {
  kw: string[];
  due?: string | string[] | null;
  window?: [string, string];
  dur?: number;
  tod?: TOD[];
}

/**
 * A fixed item: exam, makeup class or busy block. `periods` or `clock` (HH:MM with
 * `dur` minutes) give its time; `repeat` lists weekdays for a dnd habit only.
 */
export interface ExpFixed {
  type: "exam" | "lecture" | "dnd";
  kw: string[];
  /** YYYY-MM-DD of the item's day (first occurrence for a repeat). */
  date: string;
  periods?: [number, number];
  clock?: string;
  dur?: number;
  repeat?: ("Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun")[];
}

/** `items` are tasks and assignments; `fixed` are exams, makeup classes and busy blocks. */
export type Expect =
  | { kind: "none" }
  | { kind: "tasks"; items: ExpItem[]; fixed?: ExpFixed[] };

export interface EvalCase {
  id: string;
  tag: Tag;
  /** The clock, as an ISO instant with offset. */
  now: string;
  tz: string;
  lang: "vi" | "en";
  text: string;
  /** Classes already in the student's timetable (COURSES in the prompt). */
  courses?: CourseRow[];
  expect: Expect;
}

const TZ = "Asia/Ho_Chi_Minh";
const none: Expect = { kind: "none" };
const tasks = (...items: ExpItem[]): Expect => ({ kind: "tasks", items });
const fixedOnly = (...fixed: ExpFixed[]): Expect => ({
  kind: "tasks",
  items: [],
  fixed,
});

export const EVAL_CASES: EvalCase[] = [
  // Legacy one-liners, kept with their expectations.
  {
    id: "report-friday",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Nộp báo cáo thực tập trước thứ 6 tuần sau, mất khoảng 4 tiếng",
    expect: tasks({
      kw: ["bao cao"],
      due: ["2026-11-12", "2026-11-13"],
      dur: 240,
    }),
  },
  {
    id: "exam-prep",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Thứ 3 tuần sau có bài kiểm tra Giải tích, cần ôn khoảng 3 tiếng",
    expect: tasks({
      kw: ["giai tich"],
      due: ["2026-11-09", "2026-11-10"],
      dur: 180,
    }),
  },
  {
    id: "lab-en",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "en",
    text: "Need to finish the physics lab report, about 2 hours, due Friday",
    expect: tasks({ kw: ["lab"], due: "2026-11-06", dur: 120 }),
  },
  {
    id: "group-project",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Đồ án nhóm: viết chương 2 trong 2 ngày, hạn cuối 20/11",
    expect: tasks({ kw: ["chuong 2"], due: "2026-11-20" }),
  },
  {
    id: "reading",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Đọc chương 5-7 sách Kinh tế vi mô trước buổi học thứ 5, khoảng 90 phút",
    expect: tasks({
      kw: ["vi mo"],
      due: ["2026-11-11", "2026-11-12"],
      dur: 90,
    }),
  },
  {
    id: "slides",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Chuẩn bị slide thuyết trình môn Marketing, present thứ 2 tới, làm mất 3 tiếng",
    expect: tasks({
      kw: ["slide"],
      due: ["2026-11-08", "2026-11-09"],
      dur: 180,
    }),
  },
  {
    id: "scholarship",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Nộp đơn xin học bổng trước 30/11, cần khoảng 1 tiếng",
    expect: tasks({
      kw: ["hoc bong"],
      due: ["2026-11-29", "2026-11-30"],
      dur: 60,
    }),
  },
  {
    id: "python-weekly",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Làm bài tập Python tuần này, dự kiến 5 tiếng, deadline chủ nhật",
    expect: tasks({ kw: ["python"], due: "2026-11-08", dur: 300 }),
  },
  {
    id: "final-chem",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Thi cuối kỳ môn Hóa vào 15/12, ôn khoảng 10 tiếng, bắt đầu ôn từ 5/12",
    expect: tasks({
      kw: ["hoa"],
      window: ["2026-12-05", "2026-12-14"],
      dur: 600,
    }),
  },
  {
    id: "small-talk",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "hôm nay ăn trưa chưa",
    expect: none,
  },
  {
    id: "fixed-meeting",
    tag: "legacy",
    now: "2026-11-02T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "thứ 4 họp CLB 19:00 phòng B101",
    expect: fixedOnly({
      type: "dnd",
      kw: ["clb", "hop"],
      date: "2026-11-04",
      clock: "19:00",
      dur: 60,
    }),
  },
  {
    id: "already-done",
    tag: "legacy",
    now: "2026-11-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "đã nộp báo cáo rồi, xong rồi",
    expect: none,
  },

  // One-time prep: market, slides, thesis, posters, club demos.
  {
    id: "prep-market",
    tag: "prep-single",
    now: "2026-11-07T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Mai đi chợ mua đồ nấu cơm cho 4 đứa, tầm 1 tiếng, nhớ mua rau với thịt",
    expect: tasks({ kw: ["cho"], due: "2026-11-08", dur: 60 }),
  },
  {
    id: "prep-slides-thu",
    tag: "prep-single",
    now: "2026-11-02T20:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Làm slide marketing cho buổi present thứ 5 tuần sau ở lớp, mất khoảng 3 tiếng, Hoàng check lại giúp mình",
    expect: tasks({
      kw: ["slide"],
      due: ["2026-11-11", "2026-11-12"],
      dur: 180,
    }),
  },
  {
    id: "prep-thesis",
    tag: "prep-single",
    now: "2026-11-04T10:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Viết nháp chương 3 khóa luận, mục tiêu 8 trang, tuần này phải xong",
    expect: tasks({
      kw: ["chuong 3", "khoa luan"],
      due: ["2026-11-07", "2026-11-08"],
    }),
  },
  {
    id: "prep-poster",
    tag: "prep-single",
    now: "2026-11-06T21:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Làm poster cho CLB, trước 18h 8/11 phải gửi để in kịp, mất tầm 2 tiếng",
    expect: tasks({ kw: ["poster"], due: "2026-11-08", dur: 120 }),
  },
  {
    id: "prep-stats-en",
    tag: "prep-single",
    now: "2026-11-08T19:30:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Thứ 3 này có midterm Stats, ôn tầm 4 tiếng",
    expect: tasks({
      kw: ["stats", "midterm"],
      due: ["2026-11-09", "2026-11-10"],
      dur: 240,
    }),
  },
  {
    id: "prep-demo-evening",
    tag: "prep-single",
    now: "2026-11-12T10:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "tối mai phải demo app 5 phút cho buổi hackathon của CLB",
    expect: tasks({
      kw: ["demo"],
      due: "2026-11-13",
      tod: ["evening", "night"],
    }),
  },

  // Group work: split parts, leader asks, deadline plus own share.
  {
    id: "group-ux-split",
    tag: "group",
    now: "2026-11-02T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Nhóm mình chia 4 phần đồ án UX: Hoàng làm survey, Linh làm persona, mình làm wireframe, Đức làm usability test. Hạn chung thứ 6 tuần sau",
    expect: tasks({ kw: ["wireframe"], due: "2026-11-13" }),
  },
  {
    id: "group-leader-ask",
    tag: "group",
    now: "2026-11-10T20:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "nhóm trưởng bảo mỗi người viết 500 chữ phần của mình cho báo cáo nhóm, gửi group trước 22h 12/11",
    expect: tasks({ kw: ["bao cao"], due: "2026-11-12" }),
  },
  {
    id: "group-essay-en",
    tag: "group",
    now: "2026-11-05T14:00:00+07:00",
    tz: TZ,
    lang: "en",
    text: "group essay due Fri 20/11, my part is the literature review, ~3h",
    expect: tasks({
      kw: ["literature review", "lit review", "review"],
      due: "2026-11-20",
      dur: 180,
    }),
  },
  {
    id: "group-present-practice",
    tag: "group",
    now: "2026-11-02T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "tối thứ 4 tập present với nhóm ở thư viện, 1 tiếng rưỡi",
    expect: tasks({
      kw: ["present"],
      due: "2026-11-04",
      tod: ["evening", "night"],
      dur: 90,
    }),
  },

  // Multi-day spans: camping, holiday, club trip, weekend, exam week.
  {
    id: "span-camping",
    tag: "span",
    now: "2026-11-04T19:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Cuối tuần sau mình đi cắm trại Lang Biang 3 ngày, từ 14 đến 16/11, cần chuẩn bị đồ trước đó",
    expect: tasks({
      kw: ["lang biang", "cam trai"],
      window: ["2026-11-14", "2026-11-16"],
    }),
  },
  {
    id: "span-tet-holiday",
    tag: "span",
    now: "2026-11-08T10:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Nghỉ Tết từ 15/2 đến 19/2/2027, mình muốn chốt xong bài báo cáo trước đó",
    expect: tasks({
      kw: ["bao cao"],
      due: ["2027-02-13", "2027-02-14"],
    }),
  },
  {
    id: "span-club-trip",
    tag: "span",
    now: "2026-11-09T19:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "CLB đi Đà Lạt chill 2 ngày 1 đêm, 21 đến 22/11, mình lo đặt homestay, hạn chót chuyển tiền 18/11",
    expect: tasks(
      { kw: ["homestay"] },
      { kw: ["chuyen tien", "tien"], due: "2026-11-18" },
    ),
  },
  {
    id: "span-weekend-java",
    tag: "span",
    now: "2026-11-04T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "cuối tuần này rảnh, muốn làm xong bài tập lớn Java trong thứ 7 và chủ nhật",
    expect: tasks({ kw: ["java"], window: ["2026-11-07", "2026-11-08"] }),
  },
  {
    id: "span-exam-week",
    tag: "span",
    now: "2026-11-16T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "tuần thi từ 23/11 đến 27/11, mình cần ôn 3 môn: Giải tích, Kinh tế vi mô, Lập trình, mỗi môn 2 tiếng",
    expect: tasks(
      { kw: ["giai tich"], dur: 120 },
      { kw: ["vi mo", "kinh te"], dur: 120 },
      { kw: ["lap trinh"], dur: 120 },
    ),
  },

  // Social: chill plans are not tasks, a shift swap is.
  {
    id: "social-chill",
    tag: "social",
    now: "2026-11-06T18:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "cuối tuần này chill với tụi nó, xem phim, không có gì phải làm hết",
    expect: none,
  },
  {
    id: "social-shift-swap",
    tag: "social",
    now: "2026-11-02T20:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Xin đổi ca làm thứ 7 vì trùng lịch ôn, hạn xin đổi là thứ 5 tuần này",
    expect: tasks({ kw: ["doi ca"], due: "2026-11-05" }),
  },
  {
    id: "social-invite",
    tag: "social",
    now: "2026-11-06T16:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "rảnh tối nay, rủ bạn đi ăn lẩu 8h nha",
    expect: none,
  },

  // Teacher and club announcements, Zalo milestone lists, faculty emails.
  {
    id: "announce-milestones",
    tag: "announce",
    now: "2026-11-02T07:30:00+07:00",
    tz: TZ,
    lang: "vi",
    text: `Kính gửi các bạn sinh viên,

Khoa thông báo các mốc thời gian của đồ án như sau:
1. Báo cáo tiến độ lần 2: từ 2/11 đến hết ngày 8/11/2026.
2. Sinh viên gửi báo cáo (Word, PowerPoint, video demo) cho GVPB: từ 15/11 đến hết 22/11/2026.
3. Sinh viên hoàn thiện báo cáo theo góp ý của GVPB: từ 23/11 đến hết 29/11/2026.
4. Bảo vệ đồ án theo hội đồng: từ 30/11 đến hết 6/12/2026.`,
    expect: tasks(
      { kw: ["tien do"], window: ["2026-11-02", "2026-11-08"] },
      { kw: ["gui bao cao", "gvpb"], window: ["2026-11-15", "2026-11-22"] },
      { kw: ["hoan thien"], window: ["2026-11-23", "2026-11-29"] },
      { kw: ["bao ve"], window: ["2026-11-30", "2026-12-06"] },
    ),
  },
  {
    id: "announce-teacher-quiz",
    tag: "announce",
    now: "2026-11-06T16:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "@All Thầy nhắc các bạn, thứ 4 tuần sau lớp mình kiểm tra 15 phút chương 3 và 4 môn Mạng máy tính. Các bạn nhớ mang laptop nhé.",
    expect: tasks({ kw: ["kiem tra", "mang may tinh"], due: "2026-11-11" }),
  },
  {
    id: "announce-health-form",
    tag: "announce",
    now: "2026-11-02T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Sinh viên đăng ký khám sức khỏe định kỳ miễn phí qua link https://forms.example.edu/health26, hạn trước 17h30 ngày 12/11/2026",
    expect: tasks({ kw: ["kham", "dang ky"], due: "2026-11-12" }),
  },
  {
    id: "announce-sunday-email",
    tag: "announce",
    now: "2026-11-08T20:15:00+07:00",
    tz: TZ,
    lang: "vi",
    text: `Chào các bạn.
Ngày mai là buổi cuối học môn Phát triển ứng dụng game, nội dung gồm: giới thiệu AI trong game 3D, các nhóm báo cáo tiến độ, làm 1 bài kiểm tra nếu còn thời gian.
Các bạn đi học đầy đủ, thầy sẽ điểm danh. Mỗi nhóm mang theo 1 máy tính. Mỗi thành viên có ít nhất 1 thiết bị kết nối internet.`,
    expect: tasks({ kw: ["laptop", "may tinh", "game"], due: "2026-11-09" }),
  },
  {
    id: "announce-scholarship-form",
    tag: "announce",
    now: "2026-11-05T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Khoa thông báo sinh viên ĐT01 nộp hồ sơ học bổng trước 18h ngày 9/11. Hồ sơ gồm phiếu đăng ký theo mẫu đính kèm.",
    expect: tasks({ kw: ["ho so", "hoc bong"], due: "2026-11-09" }),
  },

  // Text pasted from PDFs: hard line breaks, page junk, escaped markdown.
  {
    id: "pdf-scholarship-break",
    tag: "paste-pdf",
    now: "2026-10-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: `Thông báo học bổng

Sinh viên

cần đăng ký

trực tuyến trên

trang web

trước

17h00

ngày 11/10/2026

\\_\\_\\_

3`,
    expect: tasks({ kw: ["dang ky", "hoc bong"], due: "2026-10-11" }),
  },
  {
    id: "pdf-bullets-scan",
    tag: "paste-pdf",
    now: "2026-10-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: `+ Sinh viên gửi file scan định dạng PDF

+ File được đặt tên theo cú pháp: Họ tên\\_SĐT

+ Sinh viên gửi về email khoa trước 11h00 ngày 10/10/2026`,
    expect: tasks({ kw: ["scan", "gui"], due: "2026-10-10" }),
  },
  {
    id: "pdf-page-junk",
    tag: "paste-pdf",
    now: "2026-10-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: `Nhắc

Sinh viên nộp bản tóm tắt

đề tài

vào

thứ 6 ngày

9/10/2026

(trang 1)`,
    expect: tasks({ kw: ["tom tat"], due: "2026-10-09" }),
  },
  {
    id: "pdf-deliverables-en",
    tag: "paste-pdf",
    now: "2026-11-05T12:00:00+07:00",
    tz: TZ,
    lang: "en",
    text: `Deliverables\t\tDraft report (Word)  Demo video
Due:    Nov 20 2026,  23:59`,
    expect: tasks(
      { kw: ["draft"], due: "2026-11-20" },
      { kw: ["demo"], due: "2026-11-20" },
    ),
  },

  // OCR from screenshots: tables with merged cells, bad dates, extra text.
  {
    id: "ocr-exam-table",
    tag: "ocr-table",
    now: "2026-11-05T11:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: `ss lịch thi nè
Môn\tNgày\tGiờ
Lập trình web\t16/11/2026\t07:30
Cơ sở dữ liệu\t18/11/2026\t13:30
nhắc mình ôn 2 môn đầu, mỗi môn 2 tiếng`,
    expect: tasks(
      { kw: ["web"], due: ["2026-11-15", "2026-11-16"], dur: 120 },
      { kw: ["du lieu", "csdl"], due: ["2026-11-17", "2026-11-18"], dur: 120 },
    ),
  },
  {
    id: "ocr-merged-cell",
    tag: "ocr-table",
    now: "2026-11-08T10:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: `chụp bảng deadline nhóm, tạo việc giúp mình
Hạn\tViệc
12/11\tNộp bản nháp
\tGửi phản hồi GVHD`,
    expect: tasks(
      { kw: ["ban nhap"], due: "2026-11-12" },
      { kw: ["phan hoi", "gvhd"], due: "2026-11-12" },
    ),
  },
  {
    id: "ocr-invalid-date",
    tag: "ocr-table",
    now: "2026-11-04T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: `chụp bảng từ thầy, số ngày hơi lạ
Mốc   Ngày
Nộp đề cương luận văn  31/11/2026`,
    expect: tasks({ kw: ["de cuong", "luan van"], due: "2026-11-30" }),
  },
  {
    id: "ocr-table-one-row",
    tag: "ocr-table",
    now: "2026-11-16T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: `chụp bảng tiến độ đồ án nhóm này, mình làm phần đợt 2 thôi
Đợt\tThời gian\tNội dung
1\t15/11 – 22/11/2026\tGửi báo cáo (Word, PPT, video)
2\t23/11 – 29/11/2026\tHoàn thiện theo góp ý`,
    expect: tasks({
      kw: ["hoan thien", "gop y"],
      window: ["2026-11-23", "2026-11-29"],
    }),
  },

  // Dictation: self-correction, filler words, no punctuation.
  {
    id: "dictation-fix-day",
    tag: "dictation",
    now: "2026-11-04T18:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "ờ thôi cái bài thuyết trình môn marketing là thứ 5 à không thứ 6 nha làm khoảng 2 tiếng",
    expect: tasks({
      kw: ["thuyet trinh", "marketing"],
      due: "2026-11-06",
      dur: 120,
    }),
  },
  {
    id: "dictation-fix-date",
    tag: "dictation",
    now: "2026-11-05T10:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "nộp bài essay tiếng anh hạn là 25 à nhầm 26 tháng 11 nha",
    expect: tasks({ kw: ["essay"], due: "2026-11-26" }),
  },
  {
    id: "dictation-today-fix",
    tag: "dictation",
    now: "2026-11-02T20:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "mai ờ mai không hôm nay à ừ hôm nay luôn đi ôn cái sinh học khoảng một tiếng rưỡi",
    expect: tasks({ kw: ["sinh hoc"], due: "2026-11-02", dur: 90 }),
  },
  {
    id: "dictation-this-week",
    tag: "dictation",
    now: "2026-11-02T10:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "tuần này thôi không tuần sau nha, nộp đề cương luận văn cho thầy trước thứ 4",
    expect: tasks({
      kw: ["de cuong", "luan van"],
      due: ["2026-11-03", "2026-11-04"],
    }),
  },

  // Several tasks in one message, mixed with a non-task line.
  {
    id: "multi-vi-three",
    tag: "multi",
    now: "2026-11-07T21:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Hôm nay mệt quá. Mai đi chợ mua đồ ăn cả tuần, tối mốt nộp bài thiết kế UI, thứ 6 tuần sau có kiểm tra Excel ôn khoảng 2 tiếng",
    expect: tasks(
      { kw: ["cho"], due: "2026-11-08" },
      { kw: ["thiet ke"], due: "2026-11-09", tod: ["evening", "night"] },
      { kw: ["excel"], due: ["2026-11-12", "2026-11-13"], dur: 120 },
    ),
  },
  {
    id: "multi-en-todo",
    tag: "multi",
    now: "2026-11-02T09:00:00+07:00",
    tz: TZ,
    lang: "en",
    text: "Ok so todo: (1) email prof about the thesis outline by Wed, (2) grocery run tonight after 7 pm, (3) rehearse the 10-min pitch for the startup club, ~1 hr, Sat",
    expect: tasks(
      { kw: ["email", "outline"], due: "2026-11-04" },
      { kw: ["grocery"], due: "2026-11-02", tod: ["evening", "night"] },
      { kw: ["pitch"], due: "2026-11-07", dur: 60 },
    ),
  },
  {
    id: "multi-drop-meeting",
    tag: "multi",
    now: "2026-11-02T10:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "thứ 4 họp CLB 19:00 phòng B101 nha. Còn ôn ngữ pháp Anh cho bài thi thứ 6 khoảng 2 tiếng, và dọn phòng trọ cuối tuần nè",
    expect: tasks(
      { kw: ["ngu phap"], due: ["2026-11-05", "2026-11-06"], dur: 120 },
      { kw: ["don phong"], due: ["2026-11-07", "2026-11-08"] },
    ),
  },
  {
    id: "multi-trip-prep",
    tag: "multi",
    now: "2026-11-05T18:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "mai đi Đà Lạt chill với tụi nó, tối nay lo đồ đi, còn bài nhóm phải nộp trước 12h trưa thứ 7 tuần này",
    expect: tasks(
      { kw: ["da lat", "do di"], due: "2026-11-05", tod: ["evening", "night"] },
      { kw: ["bai nhom", "nop"], due: "2026-11-07" },
    ),
  },

  // Pure information, fixed-time events, questions: no task.
  {
    id: "none-info-ai-offer",
    tag: "none",
    now: "2026-11-06T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "CLB SVIT thông tin: sinh viên có email @dlu.edu.vn và từ 18 tuổi có thể nhận ưu đãi gói AI cho sinh viên, xem chi tiết tại https://ai.example.com/students. Không có hạn nộp, chỉ để biết thôi.",
    expect: none,
  },
  {
    id: "none-graduation-event",
    tag: "none",
    now: "2026-11-06T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "lễ tốt nghiệp 9h sáng 20/12 ở hội trường A, ai đi nhớ mặc áo dài nha",
    expect: none,
  },
  {
    id: "none-form-link",
    tag: "none",
    now: "2026-11-06T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Form đăng ký CLB mới mở: https://forms.example.com/club-2026 (không có hạn)",
    expect: none,
  },
  {
    id: "none-question",
    tag: "none",
    now: "2026-11-06T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "lol bài này khó vãi, ai hiểu chương 4 giải thích lại cho mình với",
    expect: none,
  },

  // Long PDF announcements: multi-paragraph, numbered rules, glued words, hyphen
  // breaks, stray or replacement glyphs, mojibake, zero-width characters, OCR
  // digit swaps. Each has one actionable deadline, so the expected count is exact.
  {
    id: "noisy-pdf-scholarship-glued",
    tag: "noisy",
    now: "2026-10-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "TRƯỜNG ĐẠI HỌC ĐÀ LẠT\nKHOA CÔNG NGHỆ THÔNG TIN\n\nSố: 214/TB-CNTT                                   Đà Lạt, ngày 05 tháng 10 năm 2026\n\nKính gửi: Quý Thầy/Cô giáo viên chủ nhiệm các lớp; Ban cán sự các lớp; toàn thể sinh viên Khoa.\n\nCăn cứ Thông báo số 1848/TB-ĐHĐL ngày 29/10/2025 về việc xét cấp học bổng năm học 2026–2027, Khoa thông báo đến sinh viên như sau:\n\n1. Đối tượng và số suất\nHọc bổng dành cho 3 nhóm: sinh viên chính quy (ĐT01), sinh viên nghiên cứu khoa học (ĐT02) và đoàn, hội, câu lạc bộ (ĐT03). Khoa được phân bổ 08 suất cho ĐT01.\n\n2. Giá trị học bổng\nMỗi suất trị giá 500 USD, nhận bằng tiền Việt Nam theo tỷ giá ngân hàng tại thời điểm chuyển khoản.\n\n3. Hồ sơ\nSinh viên chuẩn bị phiếu đăng ký theo mẫu đính kèm, minh chứng hoàn cảnh khó khăn (nếu có) và bằng khen, giấy khen (nếu có). Không tự liên hệ phòng đào tạo để xin bảng điểm; Khoa sẽ tự lấy.\n\n4. Thời hạn\nSinh viên hoàn thành đăng ký trực tuyến và nộp hồ sơ trước17 giờ 00 ngàyr11/10/2026 tại Văn phòng Khoa.\n\nTrân trọng thông báo.",
    expect: tasks({ kw: ["ho so", "hoc bong"], due: "2026-10-11" }),
  },
  {
    id: "noisy-pdf-scg-ocr-mojibake",
    tag: "noisy",
    now: "2026-10-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Thực hiện Kế hoạch số 49-KH/TWĐTN ngày 22/9/2026 của Ban Bí thư Trung ương Đoàn về\nviệc triển khai Học bổng “SCG Sharing The Dream” năm 2026, Ban Thường vụ Tỉnh đoàn\nđề nghị các đơn vị triển khai chương trình với các nội dung sau.\n\n1. ĐỐI VỚI SINH VIÊN ĐẠI HỌC\n\n- Số lượng và giá trị: 70 suất (15.000.000 đồng/suất) cho hệ đại học.\n- Tiêu chuẩn: học lực khá trở lên; điểm trung bình tích lũy từ 7.5/10 (năm hai trở lên).\n- Hồ sơ:\n+ Phiếu đăng ký trực tuyến tại website chính thức;\n+ File scan định dạng .pdf, đặt tên theo cú pháp: Họ và tên\\_Số điện thoại.\n\n  \n2\n\nSinh viÃªn ná»p báº£n scan PDF vá» email khoa trÆ°á»c 11 giá» 00 ngÃ y 10/10/2026, Khoa tổng hợp gửi về Tỉnh đoàn sau thời hạn trên.\n\nNơi nhận: như trên; lưu VT.",
    expect: tasks({ kw: ["scan"], due: "2026-10-10" }),
  },
  {
    id: "noisy-pdf-health-check-glued",
    tag: "noisy",
    now: "2026-11-02T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Kính gửi các em sinh viên,\n\nTrợ lý CTSV Khoa Công nghệ Thông tin thông báo về chương trình khám sức khỏe định kỳ và khám sàng lọc miễn phí năm 2026 dành cho sinh viên Trường Đại học Đà Lạt. Chương trình gồm đo huyết áp, khám mắt, khám răng hàm mặt và xét nghiệm máu cơ bản; sinh viên được hướng dẫn chi tiết trong tập tin đính kèm.\n\nĐể đăng ký, sinh viên thực hiện tại liên kết https://tinyurl.example.vn/kham26 và chọn cơ sở khám thuận tiện. Mỗi sinh viên chỉ đăng ký một lần.\n\nThời gian thực hiện: từ khi ban hành thông báo hếtthờigian17 giờ 30 phút,ngày12/11/2026. Các trường hợp đăng ký sau thời hạn sẽ không được bố trí.\n\nTrân trọng cảm ơn sự phối hợp của Quý Thầy/Cô và các em sinh viên.\n\n​Trợ lý CTSV",
    expect: tasks({ kw: ["kham", "dang ky"], due: "2026-11-12" }),
  },
  {
    id: "noisy-pdf-sports-ocr-digits",
    tag: "noisy",
    now: "2026-09-25T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Kính gửi toàn thể các bạn sinh viên tham gia Hội thao Sinh viên năm 2026,\n\nBan tổ chức thông báo lịch thi đấu các môn Kéo co (nam nữ hỗn hợp) và Nhảy bao bố trên Sân bóng đá 2. Đội kéo co thi đấu từ 14 giờ 45 phút ngày 29/09/2O26, các trận còn lại được niêm yết tại sân.\n\nĐề nghị các sinh viên có tên trong đội kéo co có mặt đầy đủ từ 13 giờ 3O phút để điểm danh, khởi động và tập hợp đội hình. Trang phục: đồng phục Khoa hoặc áo sơ mi lịch sự.\n\nLưu ý: sinh viên vắng mặt không lý do sẽ bị thay thế, và cần liên hệ người phụ trách đội trước giờ tập trung nếu có việc đột xuất.\n\nBan tổ chức Hội thao",
    expect: {
      kind: "tasks",
      items: [],
      fixed: [
        { type: "dnd", kw: ["keo co"], date: "2026-09-29", clock: "14:45" },
      ],
    },
  },
  {
    id: "noisy-pdf-club-report-spaces",
    tag: "noisy",
    now: "2026-10-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "ĐOÀN THANH NIÊN – HỘI SINH VIÊN\nĐOÀN THANH NIÊN – HỘI SINH VIÊN\n\nThông báo công tác tổng kết hoạt động năm học 2025–2026\n\nCác liên chi đoàn, câu lạc bộ, đội, nhóm sinh viên hoàn thiện Báo  cáo  tổng  kết  hoạt  động  năm  học  2025–2026  có xác nhận của Đoàn Thanh niên, kèm minh chứng hình ảnh, bằng khen và giấy khen liên quan.\n\nHồ sơ được nộp tại chuyên viên phụ trách công tác Đoàn trước 17 giờ 00 ngày 09/10/2026. Hồ sơ thiếu minh chứng sẽ không được xét duyệt.\n\nTrân trọng./.",
    expect: tasks({ kw: ["bao cao"], due: "2026-10-09" }),
  },
  {
    id: "noisy-pdf-hyphen-zero-width",
    tag: "noisy",
    now: "2026-10-05T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Trang 1/2\n\nThông báo kết quả xét duyệt đề tài nghiên cứu khoa học sinh viên năm học 2026–2027. Các nhóm đã được duyệt cần gửi bản báo cáo tiến độ về phòng quản lý khoa học qua hộp thư điện tu-\nử của Khoa, tiêu đề email ghi rõ mã đề tài và tên nhóm.​ Hạn gửi là trước 10/10/2026­, quá hạn Khoa sẽ không tổng hợp.\n\nTrang 2/2\n\nLưu ý: bảng điểm học tập do Khoa lấy trực tiếp từ hệ thống, sinh viên không cần nộp thêm.",
    expect: tasks({ kw: ["bao cao"], due: "2026-10-10" }),
  },
  {
    id: "noisy-pdf-english-notice",
    tag: "noisy",
    now: "2026-11-05T12:00:00+07:00",
    tz: TZ,
    lang: "en",
    text: "NOTICE TO FINAL-YEAR STUDENTS\n\nDear students,\n\nThe Faculty of Information Technology reminds all final-year students that the thesis defense schedule for the 2026 cohort has been published on the notice board on the 3rd floor. Please review the panel list carefully and bring a printed copy of your report on the day of your defense.\n\nSubmission requirements:\n1) The final report in Word and PDF format,\n2) A 10-minute demo video, and\n3) A signed declaration of originality.\n\nThe final report must be submitted to the Faculty office no later than5:00pm on Friday20/11/2026. Late submissions will not be accepted, and the defense slot will be forfeited.\n\nFor questions, contact the thesis office during office hours.\n\nFaculty of Information Technology",
    expect: tasks({ kw: ["report"], due: "2026-11-20" }),
  },
  {
    id: "noisy-pdf-info-only-ai-offer",
    tag: "noisy",
    now: "2026-11-06T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Kính gửi toàn thể các bạn sinh viên Khoa CNTT,\n\nCâu lạc bộ SVIT thông tin về chương trình gói AI dành cho sinh viên.\n\n1. Đối tượng\nSinh viên đại học từ 18 tuổi, sử dụng email cá nhân để đăng ký. Bước xác thực tư cách có thể dùng email do Trường cấp (@dlu.edu.vn).\n\n2. Quyền lợi\nDung lượng lưu trữ đám mây 400 GB, hạn mức sử dụng cao hơn, các tính năng hỗ trợ tóm tắt tài liệu và tạo câu hỏi ôn tập.\n\n3. Lưu ý\nChương trình có thể yêu cầu xác minh lại hằng năm và tự động gia hạn sau thời gian ưu đãi. Sinh viên có thể hủy bất cứ lúc nào.\n\nThông tin chi tiết xem tại trang của nhà cung cấp, CLB không thu phí và không nhận đăng ký hộ.\n\nBan điều hành CLB SVIT",
    expect: none,
  },

  // Exams, makeup classes, busy blocks and long assignments. The fixed items are
  // checked by their date, periods or clock, duration and repeat.
  {
    id: "exam-db-practical-email",
    tag: "exam",
    now: "2025-04-01T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Kính gửi các em sinh viên lớp CTK47A,\n\nThông báo lịch kiểm tra thực hành học phần Cơ sở dữ liệu:\n- Thời gian: 13g00, chiều thứ ba, ngày 08/04/2025\n- Địa điểm: phòng A24.1 và A24LAU (phân phòng xem ở cột Ghi chú trong file đính kèm)\n- Hình thức: làm bài trên máy tính của nhà trường, không sử dụng tài liệu\n\nSinh viên mang theo bút để làm bài.\n\nTrân trọng,\nGiảng viên học phần Cơ sở dữ liệu",
    expect: {
      kind: "tasks",
      items: [{ kw: ["csdl", "thuc hanh"], due: "2025-04-07" }],
      fixed: [
        {
          type: "exam",
          kw: ["kiem tra", "thuc hanh", "csdl"],
          date: "2025-04-08",
          clock: "13:00",
        },
      ],
    },
  },
  {
    id: "exam-api-zalo-periods",
    tag: "exam",
    now: "2026-09-19T20:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "@All Thứ hai 21/09/2026, lớp mình sẽ kiểm tra thay cho Lab 1, vào buổi tối từ tiết 11 đến tiết 14. Nội dung kiểm tra là thiết kế API theo yêu cầu. Các bạn đi học lý thuyết đầy đủ và chuẩn bị giấy bút nhé.",
    expect: {
      kind: "tasks",
      items: [{ kw: ["api"], due: "2026-09-20" }],
      fixed: [
        {
          type: "exam",
          kw: ["kiem tra", "api"],
          date: "2026-09-21",
          periods: [11, 14],
        },
      ],
    },
  },
  {
    id: "lecture-makeup-clock",
    tag: "lecture",
    now: "2026-11-04T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Thầy báo học bù môn Giải tích vào thứ 7 tuần này, 8h đến 10h30, phòng B202.",
    expect: fixedOnly({
      type: "lecture",
      kw: ["giai tich", "hoc bu"],
      date: "2026-11-07",
      clock: "08:00",
      dur: 150,
    }),
  },
  {
    id: "dnd-weekly-habit",
    tag: "busy",
    now: "2026-11-05T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Mỗi thứ 3 mình bận từ 8h đến 10h đi làm thêm, đến hết tháng 12.",
    expect: fixedOnly({
      type: "dnd",
      kw: ["lam them", "lam"],
      date: "2026-11-10",
      clock: "08:00",
      dur: 120,
      repeat: ["Tue"],
    }),
  },
  {
    id: "announce-milestones-real",
    tag: "announce",
    now: "2026-11-02T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: `Gửi các bạn Một số mốc thời gian cần lưu ý cho đồ án:
1. Thời gian báo cáo tiến độ lần 2: từ 2/11 đến hết ngày 8/11/2026.
Hội đồng: Nhận xét, góp ý kết quả thực hiện trong đợt 2 và các thay đổi so với đợt 1;
GVHD: Đọc, góp ý báo cáo tổng kết Đồ án tốt nghiệp của sinh viên.
2. Sinh viên gửi báo cáo cho GVPB (báo cáo Word, PowerPoint và video demo): từ 15/11 đến hết ngày 22/11/2026;
3. Sinh viên hoàn thiện báo cáo theo góp ý của GVPB: từ 23/11 đến hết ngày 29/11/2026;
4. Sinh viên nộp báo cáo theo lịch thi khoa: sáng ngày 30/11/2026 (xem lịch thi);
5. Bảo vệ Đồ án theo hội đồng: từ 30/11 đến hết ngày 6/12/2026.`,
    expect: tasks(
      { kw: ["tien do"], window: ["2026-11-02", "2026-11-08"] },
      { kw: ["gvpb", "gui bao cao"], window: ["2026-11-15", "2026-11-22"] },
      { kw: ["hoan thien"], window: ["2026-11-23", "2026-11-29"] },
      { kw: ["nop"], due: "2026-11-30" },
      { kw: ["bao ve"], window: ["2026-11-30", "2026-12-06"] },
    ),
  },
  {
    id: "assignment-40h-lab",
    tag: "span",
    now: "2026-11-05T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Bài lab tổng hợp cuối kỳ mất khoảng 40 tiếng, nộp trước 31/12/2026.",
    expect: tasks({ kw: ["lab"], due: "2026-12-31", dur: 2400 }),
  },

  // Busy time, timetable rows, undated work and exams announced by Zalo or email.
  {
    id: "busy-wedding",
    tag: "busy",
    now: "2026-11-05T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "thứ 6 này 2h chiều tới 5h mình có đám cưới bạn ở Bảo Lộc, ko làm gì được đâu",
    expect: fixedOnly({
      type: "dnd",
      kw: ["dam cuoi", "cuoi"],
      date: "2026-11-06",
      clock: "14:00",
      dur: 180,
    }),
  },
  {
    id: "timetable-all-known",
    tag: "timetable",
    now: "2026-11-02T08:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "TKB tuần này: thứ 2 tiết 1-3 Giải tích P.A101, thứ 4 tiết 6-8 Kinh tế vi mô B202",
    courses: [
      { title: "Giải tích", weekday: "Mon", periods: "tiết 1-3", room: "A101" },
      {
        title: "Kinh tế vi mô",
        weekday: "Wed",
        periods: "tiết 6-8",
        room: "B202",
      },
    ],
    expect: none,
  },
  {
    id: "undated-reading",
    tag: "undated",
    now: "2026-11-05T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "nhắc mình đọc chương 2 sách Mạng máy tính, khi nào rảnh cũng được",
    expect: tasks({ kw: ["chuong 2", "mang may tinh"], due: null }),
  },
  {
    id: "assignment-large-web",
    tag: "assignment",
    now: "2026-11-05T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "bài tập lớn web của mình chắc tốn khoảng 25 tiếng, deadline 15/12 nha",
    expect: tasks({ kw: ["web"], due: "2026-12-15", dur: 1500 }),
  },
  {
    id: "exam-midterm-zalo-clock",
    tag: "exam",
    now: "2026-11-05T20:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "@All Thứ 2 tuần sau (9/11) lớp mình sẽ kiểm tra giữa kỳ môn Giải tích. Bài kiểm tra bắt đầu lúc 7h30 sáng và kéo dài 90 phút, ở phòng A101. Các bạn nhớ mang bút và giấy nháp nhé.",
    expect: {
      kind: "tasks",
      items: [{ kw: ["giai tich"], due: "2026-11-08" }],
      fixed: [
        {
          type: "exam",
          kw: ["kiem tra", "giai tich"],
          date: "2026-11-09",
          clock: "07:30",
          dur: 90,
        },
      ],
    },
  },
  {
    id: "exam-midterm-email-periods",
    tag: "exam",
    now: "2026-11-06T09:00:00+07:00",
    tz: TZ,
    lang: "vi",
    text: "Kính gửi các em sinh viên lớp CTK47A,\n\nThông báo lịch kiểm tra giữa kỳ học phần Mạng máy tính:\n- Thời gian: thứ 5, ngày 12/11/2026, tiết 2 đến tiết 4\n- Địa điểm: phòng B201\n- Hình thức: viết, không sử dụng tài liệu\n\nĐề nghị các em có mặt trước giờ thi 10 phút.\n\nTrân trọng,\nGiảng viên học phần Mạng máy tính",
    expect: {
      kind: "tasks",
      items: [{ kw: ["mang may tinh"], due: "2026-11-11" }],
      fixed: [
        {
          type: "exam",
          kw: ["kiem tra", "mang may tinh"],
          date: "2026-11-12",
          periods: [2, 4],
        },
      ],
    },
  },
];

/** Plan phase that fixes each case the reader fails today; a case not listed passes now (phase 0). */
export const HARD_PHASE: Record<string, { phase: number; why: string }> = {
  "report-friday": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "exam-prep": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "reading": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "slides": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "scholarship": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "python-weekly": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "final-chem": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "prep-market": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "prep-slides-thu": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "prep-poster": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "assignment-40h-lab": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "assignment-large-web": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "busy-wedding": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "lab-en": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "group-project": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "social-shift-swap": {
    "phase": 2,
    "why": "2.13/2.17 loose-bound words (khoảng, tầm, dự kiến) become junk titles or extra plans"
  },
  "prep-stats-en": {
    "phase": 2,
    "why": "2.14 exam words (midterm, kiểm tra) and 2.15 demo as event"
  },
  "prep-demo-evening": {
    "phase": 2,
    "why": "2.14 exam words (midterm, kiểm tra) and 2.15 demo as event"
  },
  "announce-teacher-quiz": {
    "phase": 2,
    "why": "2.14 exam words (midterm, kiểm tra) and 2.15 demo as event"
  },
  "small-talk": {
    "phase": 2,
    "why": "2.18 text with no task must make no item"
  },
  "none-graduation-event": {
    "phase": 2,
    "why": "2.18 text with no task must make no item"
  },
  "none-form-link": {
    "phase": 2,
    "why": "2.18 text with no task must make no item"
  },
  "span-camping": {
    "phase": 2,
    "why": "2.12/2.19 spans, anchors and lists lose pieces"
  },
  "span-tet-holiday": {
    "phase": 2,
    "why": "2.12/2.19 spans, anchors and lists lose pieces"
  },
  "span-club-trip": {
    "phase": 2,
    "why": "2.12/2.19 spans, anchors and lists lose pieces"
  },
  "span-weekend-java": {
    "phase": 2,
    "why": "2.12/2.19 spans, anchors and lists lose pieces"
  },
  "span-exam-week": {
    "phase": 2,
    "why": "2.12/2.19 spans, anchors and lists lose pieces"
  },
  "multi-vi-three": {
    "phase": 2,
    "why": "2.12/2.19 spans, anchors and lists lose pieces"
  },
  "multi-drop-meeting": {
    "phase": 2,
    "why": "2.12/2.19 spans, anchors and lists lose pieces"
  },
  "multi-trip-prep": {
    "phase": 2,
    "why": "2.12/2.19 spans, anchors and lists lose pieces"
  },
  "dictation-this-week": {
    "phase": 2,
    "why": "2.12/2.19 spans, anchors and lists lose pieces"
  },
  "dnd-weekly-habit": {
    "phase": 2,
    "why": "2.12/2.19 spans, anchors and lists lose pieces"
  },
  "already-done": {
    "phase": 6,
    "why": "6.4 a done-already report is a command, not a task"
  },
  "social-chill": {
    "phase": 6,
    "why": "6.4 negation: 'no need to do anything' makes no task"
  },
  "social-invite": {
    "phase": 6,
    "why": "6.4 negation: 'no need to do anything' makes no task"
  },
  "group-ux-split": {
    "phase": 6,
    "why": "6.11 slots: people, parts and course of a group task"
  },
  "group-leader-ask": {
    "phase": 6,
    "why": "6.11 slots: people, parts and course of a group task"
  },
  "group-essay-en": {
    "phase": 6,
    "why": "6.11 slots: people, parts and course of a group task"
  },
  "none-info-ai-offer": {
    "phase": 6,
    "why": "6.9 intent before parsing: info, offers and questions are not tasks"
  },
  "none-question": {
    "phase": 6,
    "why": "6.9 intent before parsing: info, offers and questions are not tasks"
  },
  "noisy-pdf-info-only-ai-offer": {
    "phase": 6,
    "why": "6.9 intent before parsing: info, offers and questions are not tasks"
  },
  "multi-en-todo": {
    "phase": 6,
    "why": "6.12 English-only input"
  },
  "dictation-fix-day": {
    "phase": 6,
    "why": "6.5 self-correction and restarts"
  },
  "dictation-today-fix": {
    "phase": 6,
    "why": "6.5 self-correction and restarts"
  },
  "announce-milestones": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "announce-milestones-real": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "announce-health-form": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "announce-sunday-email": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "pdf-scholarship-break": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "pdf-page-junk": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "pdf-deliverables-en": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "exam-db-practical-email": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "exam-api-zalo-periods": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "exam-midterm-zalo-clock": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "exam-midterm-email-periods": {
    "phase": 5,
    "why": "5.15 official notices: forms, rounds, deadlines in long formal text"
  },
  "noisy-pdf-scholarship-glued": {
    "phase": 5,
    "why": "5.5-5.8 cleaning: mojibake, page chrome, glue, OCR digits"
  },
  "noisy-pdf-scg-ocr-mojibake": {
    "phase": 5,
    "why": "5.5-5.8 cleaning: mojibake, page chrome, glue, OCR digits"
  },
  "noisy-pdf-health-check-glued": {
    "phase": 5,
    "why": "5.5-5.8 cleaning: mojibake, page chrome, glue, OCR digits"
  },
  "noisy-pdf-sports-ocr-digits": {
    "phase": 5,
    "why": "5.5-5.8 cleaning: mojibake, page chrome, glue, OCR digits"
  },
  "noisy-pdf-club-report-spaces": {
    "phase": 5,
    "why": "5.5-5.8 cleaning: mojibake, page chrome, glue, OCR digits"
  },
  "noisy-pdf-hyphen-zero-width": {
    "phase": 5,
    "why": "5.5-5.8 cleaning: mojibake, page chrome, glue, OCR digits"
  },
  "noisy-pdf-english-notice": {
    "phase": 5,
    "why": "5.5-5.8 cleaning: mojibake, page chrome, glue, OCR digits"
  },
  "ocr-exam-table": {
    "phase": 5,
    "why": "5.9-5.11 tables: period columns, merged cells, headers"
  },
  "ocr-merged-cell": {
    "phase": 5,
    "why": "5.9-5.11 tables: period columns, merged cells, headers"
  },
  "ocr-table-one-row": {
    "phase": 5,
    "why": "5.9-5.11 tables: period columns, merged cells, headers"
  },
  "timetable-all-known": {
    "phase": 5,
    "why": "5.9-5.11 tables: period columns, merged cells, headers"
  }
};
