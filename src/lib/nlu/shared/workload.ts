/**
 * Academic workload categories, sizing and keyword rules for typed and LMS items.
 */

export type WorkloadCategory =
  | "ADMIN"
  | "LAB"
  | "GROUP_WORK"
  | "REPORT"
  | "ESSAY"
  | "SLIDES"
  | "MIDTERM"
  | "FINAL_EXAM"
  | "INTERVIEW"
  | "THESIS";

export interface SizingConfig {
  category: WorkloadCategory;
  baseMinutes: number;
  defaultSittings: number;
  leadDaysMin: number;
  leadDaysMax: number;
  windowType: "SUBMISSION" | "EVALUATION";
}

/** Base minutes and lead days, 1 credit is 50 study hours (Thông tư 08/2021/TT-BGDĐT). */
export const WORKLOAD_CONFIGS: Record<WorkloadCategory, SizingConfig> = {
  ADMIN: {
    category: "ADMIN",
    baseMinutes: 30,
    defaultSittings: 1,
    leadDaysMin: 1,
    leadDaysMax: 2,
    windowType: "SUBMISSION",
  },
  LAB: {
    category: "LAB",
    baseMinutes: 240,
    defaultSittings: 2,
    leadDaysMin: 3,
    leadDaysMax: 5,
    windowType: "SUBMISSION",
  },
  GROUP_WORK: {
    category: "GROUP_WORK",
    baseMinutes: 600,
    defaultSittings: 2,
    leadDaysMin: 5,
    leadDaysMax: 10,
    windowType: "SUBMISSION",
  },
  REPORT: {
    category: "REPORT",
    baseMinutes: 270,
    defaultSittings: 3,
    leadDaysMin: 7,
    leadDaysMax: 14,
    windowType: "SUBMISSION",
  },
  ESSAY: {
    category: "ESSAY",
    baseMinutes: 1200,
    defaultSittings: 6,
    leadDaysMin: 10,
    leadDaysMax: 21,
    windowType: "SUBMISSION",
  },
  SLIDES: {
    category: "SLIDES",
    baseMinutes: 90,
    defaultSittings: 1,
    leadDaysMin: 3,
    leadDaysMax: 5,
    windowType: "SUBMISSION",
  },
  MIDTERM: {
    category: "MIDTERM",
    baseMinutes: 600,
    defaultSittings: 4,
    leadDaysMin: 7,
    leadDaysMax: 10,
    windowType: "EVALUATION",
  },
  FINAL_EXAM: {
    category: "FINAL_EXAM",
    baseMinutes: 1200,
    defaultSittings: 8,
    leadDaysMin: 14,
    leadDaysMax: 21,
    windowType: "EVALUATION",
  },
  INTERVIEW: {
    category: "INTERVIEW",
    baseMinutes: 360,
    defaultSittings: 5,
    leadDaysMin: 4,
    leadDaysMax: 7,
    windowType: "EVALUATION",
  },
  THESIS: {
    category: "THESIS",
    baseMinutes: 1800,
    defaultSittings: 20,
    leadDaysMin: 14,
    leadDaysMax: 28,
    windowType: "EVALUATION",
  },
};

/** Lowercases, strips Vietnamese diacritics and maps đ to d. */
function fold(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đð]/g, "d");
}

/** Classifies freeform text into an academic workload category. */
export function classifyWorkload(text: string): WorkloadCategory {
  const f = fold(text);

  // 1. Thesis / Capstone
  if (
    /khoa\s+luan|luan\s+van|do\s+an\s+tot\s+nghiep|kltn|datn|bao\s+ve\s+tot\s+nghiep|capstone/i.test(
      f,
    )
  ) {
    return "THESIS";
  }

  // 2. Final Exam
  if (
    /thi\s+cuoi\s+k[yi]|on\s+thi\s+hoc\s+k[yi]|final\s+exam|ket\s+thuc\s+hoc\s+phan|thi\s+het\s+mon|\bck\b/i.test(
      f,
    )
  ) {
    return "FINAL_EXAM";
  }

  // 3. Midterm / Class Test / Quiz
  if (
    /thi\s+giua\s+k[yi]|kiem\s+tra\s+giua\s+k[yi]|kiem\s+tra|ktra|\bkt\b|bai\s+kiem\s+tra|midterm|\bgk\b/i.test(
      f,
    )
  ) {
    return "MIDTERM";
  }

  // 4. Interview / Oral Exam
  if (
    /van\s+dap|thi\s+van\s+dap|oral\s+exam|bao\s+ve\s+tien\s+do|\bvd\b/i.test(f)
  ) {
    return "INTERVIEW";
  }

  // 5. Essay / Monograph
  if (
    /tieu\s+luan|luan\s+cuong|chuyen\s+de|bai\s+thu\s+hoach|soan\s+giao\s+an|\btl\b/i.test(
      f,
    )
  ) {
    return "ESSAY";
  }

  // 6. Group Work
  if (
    /hop\s+nhom|chia\s+viec\s+btl|ghep\s+slide|chay\s+thu\s+demo|tap\s+giang|cham\s+cheo/i.test(
      f,
    )
  ) {
    return "GROUP_WORK";
  }

  // 7. Lab
  if (/thuc\s+hanh|\blab\b|thi\s+nghiem|coding\s+bai\s+tap|\bth\b|\bbtvn\b|\bbt\b/i.test(f)) {
    return "LAB";
  }

  // 8. Admin / Registration
  if (
    /nop\s+form|dang\s+ky\s+mon|khao\s+sat|nop\s+minh\s+chung|ke\s+khai|luu\s+chieu|drl|diem\s+ren\s+luyen/i.test(
      f,
    )
  ) {
    return "ADMIN";
  }

  // 9. Report / Project / Default
  return "REPORT";
}

export interface DetectedArtifacts {
  report: boolean;
  slides: boolean;
  defense: boolean;
}

const ARTIFACT_RULES: Record<keyof DetectedArtifacts, RegExp> = {
  report: /\b(bao\s+cao|word|cuon|tieu\s+luan|ban\s+thao)\b/,
  slides: /\b(slides?|powerpoint|pptx|deck)\b/,
  defense:
    /\b(van\s+dap|tra\s+loi\s+cau\s+hoi|bao\s+ve|phan\s+bien|demo|thuyet\s+trinh)\b/,
};

/** Flags the deliverables a text asks for: a written report, slides, or a defense. */
export function detectArtifacts(text: string): DetectedArtifacts {
  const f = fold(text);
  return {
    report: ARTIFACT_RULES.report.test(f),
    slides: ARTIFACT_RULES.slides.test(f),
    defense: ARTIFACT_RULES.defense.test(f),
  };
}
