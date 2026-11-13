import { describe, expect, it } from "vitest";
import { parseMarks, parseStudentInfo, weak } from "./student";

const row = (over: Record<string, string | null> = {}) => ({
  StudentID: "2000000",
  ScheduleStudyUnitID: "23120CT110103",
  YearStudy: "2023-2024",
  TermID: "HK01",
  CurriculumID: "20CT1101",
  CurriculumName: "Nhập môn ngành CNTT",
  Credits: "3",
  DiemTK_10: "9.4",
  DiemTK_4: "4.0",
  DiemTK_Chu: "A",
  IsPass: "x",
  OlogyName: "CÔNG NGHỆ THÔNG TIN",
  ChuyenNganh: "Công nghệ thông tin",
  TenXepLoai: "Xuất sắc",
  TB_HK_4: "4.00",
  TB_HK_10: "9.23",
  Dat_HK: "13",
  TB_TL_TN: "3.85",
  TB_TL_HK_10: "9.10",
  T_TC_TL_TN: "101",
  DiemRenLuyenHK: "75",
  // Fields that must never reach storage.
  MobilePhone: "0900000000",
  BirthDay: "01/01/2005",
  ...over,
});

describe("parseStudentInfo", () => {
  it("reads name, gender, cohort and class", () => {
    expect(
      parseStudentInfo({
        sinhVien: {
          HoTen: " Name ",
          GioiTinh: "Nam",
          KhoaHoc: "Khóa 47",
          LopSinhVien: "CTK47A",
        },
      }),
    ).toEqual({
      fullName: "Name",
      gender: "Nam",
      cohort: "Khóa 47",
      className: "CTK47A",
    });
  });

  it("returns null when the portal sends no name", () => {
    expect(parseStudentInfo({})).toBeNull();
    expect(parseStudentInfo({ sinhVien: { HoTen: " " } })).toBeNull();
  });
});

describe("parseMarks", () => {
  const years = [
    {
      NamHoc: "2023-2024",
      DanhSachDiem: [
        {
          HocKy: "HK01",
          DanhSachDiemHK: [
            row(),
            row({
              ScheduleStudyUnitID: "261SHCD-CK435",
              CurriculumName: "Sinh hoạt công dân 4",
              Credits: "0",
              DiemTK_10: null,
              DiemTK_4: null,
              DiemTK_Chu: null,
              IsPass: null,
            }),
          ],
        },
      ],
    },
  ];

  it("keeps normalised course fields and an ungraded course as nulls", () => {
    const { marks } = parseMarks(years);
    expect(marks).toHaveLength(2);
    expect(marks[0]).toEqual({
      scheduleStudyUnitId: "23120CT110103",
      yearStudy: "2023-2024",
      termId: "HK01",
      curriculumId: "20CT1101",
      curriculumName: "Nhập môn ngành CNTT",
      credits: 3,
      score10: 9.4,
      score4: 4,
      letter: "A",
      passed: true,
      note: null,
    });
    expect(marks[1]).toMatchObject({
      credits: 0,
      score10: null,
      letter: null,
      passed: null,
    });
  });

  it("takes term and cumulative figures from the latest row", () => {
    const parsed = parseMarks(years);
    expect(parsed.terms).toEqual([
      {
        yearStudy: "2023-2024",
        termId: "HK01",
        gpa4: 4,
        gpa10: 9.23,
        creditsEarned: 13,
        cumulativeGpa4: 3.85,
        cumulativeGpa10: 9.1,
        cumulativeCredits: 101,
        conductScore: 75,
      },
    ]);
    expect(parsed).toMatchObject({
      studentId: "2000000",
      faculty: "CÔNG NGHỆ THÔNG TIN",
      major: "Công nghệ thông tin",
      ranking: "Xuất sắc",
      gpa4: 3.85,
      gpa10: 9.1,
      creditsEarned: 101,
    });
  });

  it("never carries the student's phone or birthday", () => {
    const text = JSON.stringify(parseMarks(years));
    expect(text).not.toContain("0900000000");
    expect(text).not.toContain("01/01/2005");
  });

  it("skips rows with no section id", () => {
    expect(
      parseMarks([
        {
          NamHoc: "2023-2024",
          DanhSachDiem: [
            {
              HocKy: "HK01",
              DanhSachDiemHK: [row({ ScheduleStudyUnitID: null })],
            },
          ],
        },
      ]).marks,
    ).toEqual([]);
  });
});

describe("weak", () => {
  const m = (gpa4: number | null, letters: (string | null)[]) => ({
    gpa4,
    marks: letters.map((letter) => ({ letter })) as never,
  });
  it("is 0.5 without marks", () => {
    expect(weak(null)).toBe(0.5);
    expect(weak(m(null, ["A"]))).toBe(0.5);
    expect(weak(m(3, [null]))).toBe(0.5);
  });
  it("blends gpa and the share of D and F", () => {
    expect(weak(m(4, ["A", "A"]))).toBe(0);
    expect(weak(m(2, ["D", "B"]))).toBeCloseTo(0.5);
    expect(weak(m(0, ["F", "D+"]))).toBe(1);
  });
});
