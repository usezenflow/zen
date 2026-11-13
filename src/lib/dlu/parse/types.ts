export type IngestedSessionType = "ASSIGNMENT" | "EXAM" | "LECTURE" | "PLAN";

export interface ParsedBlock {
  externalKey: string;
  title: string;
  type: IngestedSessionType;
  /** Start instant on the 15 min grid; the exact due instant for a PLAN. */
  scheduledStartTime: Date;
  /** Multiple of 15, 0 for a PLAN. */
  durationMinutes: number;
  location: string | null;
  note: string | null;
}

export interface ParsedLmsCourse {
  lmsCourseId: number;
  fullName: string;
  shortName: string | null;
}

export interface ParsedLmsItem extends ParsedBlock {
  lmsCourse: ParsedLmsCourse | null;
  /** PLAN only: the student already submitted. */
  submitted?: boolean;
}

export interface ParsedPortalItem extends ParsedBlock {
  scheduleStudyUnitId: string | null;
  legacyExternalKey?: string | null;
  examFormat?: string | null;
  examCredits?: number | null;
  examRetake?: boolean | null;
  meetingDate?: string | null;
  periodId?: number | null;
  numberOfPeriods?: number | null;
}

export interface ParsedPortalSection {
  scheduleStudyUnitId: string;
  curriculumId: string | null;
  curriculumName: string;
  yearStudy: string;
  termId: string;
  groupNo: string | null;
  teacherName: string | null;
  roomId: string | null;
  buildingName: string | null;
  campusName: string | null;
}

export interface SkippedItem {
  ref: string;
  reason: string;
}
