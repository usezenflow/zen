// Campus payloads, dated from `now` so the same data lands in the current week/month in jest (fixed clock) and e2e (real clock).
// Shapes and values follow the captured fixtures in src/lib/dlu/parse/*.spec.ts. Plain TS with no path aliases: test/msw/serve.ts runs it under bare Node.
import { isoWeek, vnDate } from "../../src/lib/dlu/season.ts";
import type { PortalExamRow, PortalTimetableRow } from "../../src/lib/dlu/parse/portal.ts";
import type { MoodleCalendarEvent, MoodleMonthlyView } from "../../src/lib/dlu/parse/lms.ts";
import type { PortalMarksYear, PortalStudyProgramRow } from "../../src/lib/dlu/parse/student.ts";
import type { PortalFeeRow } from "../../src/lib/dlu/client.ts";

const DAY = 86_400_000;
const VN = 7 * 3_600_000;
/** `YYYY-MM-DD` → `dd/MM/yyyy`, the portal's date format. */
const dmy = (s: string) => s.split("-").reverse().join("/");
const mondayOf = (s: string) => { const d = new Date(Date.parse(s)).getUTCDay() || 7; return vnDate(Date.parse(s) - VN + (1 - d) * DAY); };

export const STUDENT = "2112345";
export const COURSE = "Lập trình Web";
export const LMS_COURSE = "Trí tuệ nhân tạo - CTK45";
export const ASSIGNMENT = "Bài tập lớn 01";

/** Today and tomorrow (VN) at period 1 (07:00): one lecture each. Only the rows of the asked ISO week come back. */
export function lectureRows(now: number, tuan?: number): PortalTimetableRow[] {
  return [0, 1].map((k) => vnDate(now + k * DAY)).filter((d) => tuan === undefined || isoWeek(mondayOf(d)) === tuan).map((d, i) => ({
    CurriculumName: COURSE,
    WeekScheduleID: 600001 + i,
    ScheduleStudyUnitID: "99910AB100101",
    PeriodID: 1,
    NumberOfPeriods: 3,
    Ngay: dmy(d),
    RoomID: "A27.101",
    CampusName: "CS1",
    FullName: "Nguyễn Văn A",
    BuildingName: "A27",
    YearStudy: "2026-2027",
    TermID: "HK01",
    TKHHienThi: `<span>${COURSE} (10AB1001)</span><br/><span>- Nhóm: 01</span><br/><span>- Tiết: 1-3</span><br/><span>- Phòng: A27.101</span><br/><span>- GV: Nguyễn Văn A</span>`,
  }));
}

/** One exam ten days out, 07:30, 90 minutes. */
export const examRows = (now: number): PortalExamRow[] => [{
  ScheduleStudyUnitID: "99910AB100101",
  CurriculumID: "10AB1001",
  CurriculumName: COURSE,
  NgayThi: dmy(vnDate(now + 10 * DAY)),
  GioThi: "07g30",
  PhongThi: "A27.201",
  DiaDiem: "Cơ sở 1",
  Examination: "500001",
  ThoiLuong: "90",
  HinhThucThi: "Tự luận",
} as PortalExamRow];

export const programs: PortalStudyProgramRow[] = [{ StudentID: STUDENT, StudyProgramID: "CTDT1", StudyProgramName: "Công nghệ thông tin", Type: 1 }];

const mark = (over: Record<string, string | null>) => ({
  StudentID: STUDENT, ScheduleStudyUnitID: "23120CT110103", YearStudy: "2025-2026", TermID: "HK01", CurriculumID: "20CT1101",
  CurriculumName: "Nhập môn ngành CNTT", Credits: "3", DiemTK_10: "9.4", DiemTK_4: "4.0", DiemTK_Chu: "A", IsPass: "x",
  TB_HK_4: "3.60", TB_HK_10: "8.70", TB_TL_TN: "3.60", TB_TL_HK_10: "8.70", T_TC_TL_TN: "6", ...over,
});
/** One term, two passed courses: cumulative GPA 3.60. */
export const marksYears: PortalMarksYear[] = [{
  NamHoc: "2025-2026",
  DanhSachDiem: [{ HocKy: "HK01", DanhSachDiemHK: [mark({}), mark({ ScheduleStudyUnitID: "23120CT110203", CurriculumID: "20CT1102", CurriculumName: "Toán rời rạc", DiemTK_10: "8.0", DiemTK_4: "3.2", DiemTK_Chu: "B+" })] }],
}];
export const GPA = "3.60";

/** One paid line and one owing 4.500.000 đ. */
export const feeRows: PortalFeeRow[] = [
  { FeeName: "Học phí HK01", DebtAmount: 4_500_000, PaidAmount: 0, PaidLeft: 4_500_000, ConNo: 4_500_000, DaGiam: 0, PaidDate: null, YearStudy: "2026-2027", TermID: "HK01" },
  { FeeName: "Học phí HK02", DebtAmount: 4_200_000, PaidAmount: 4_200_000, PaidLeft: 0, ConNo: 0, DaGiam: 0, PaidDate: "2026-03-01T00:00:00", YearStudy: "2025-2026", TermID: "HK02" },
];
export const OWED = 4_500_000;

/** An unsubmitted assignment due in two days at 23:59 VN. */
export function lmsEvents(now: number): MoodleCalendarEvent[] {
  const due = Date.parse(vnDate(now + 2 * DAY)) - VN + (23 * 60 + 59) * 60_000;
  return [{
    id: 700001, name: `${ASSIGNMENT} đến hạn`, url: "https://lms.dlu.edu.vn/mod/assign/view.php?id=800001", modulename: "assign", instance: 800001,
    eventtype: "due", timestart: due / 1000, timesort: due / 1000, description: "<p>Nộp file <strong>.zip</strong></p>",
    course: { id: 90001, fullname: LMS_COURSE, shortname: "10AB1002_CTK45" }, action: { name: "Thêm bài nộp", actionable: true },
  }];
}
/** The month's events in Moodle's weeks → days → events shape. */
export function lmsMonth(now: number, year: number, month: number): MoodleMonthlyView {
  const events = lmsEvents(now).filter((e) => vnDate(e.timestart * 1000).startsWith(`${year}-${String(month).padStart(2, "0")}`));
  return { weeks: [{ days: [{ events }] }] };
}
