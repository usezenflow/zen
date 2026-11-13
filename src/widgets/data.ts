// Contract between the app and its widgets (mockups/widgets.html). Every widget gets the same props.
// The widget runtime cannot import or format, so every string arrives ready to print.
export type ArtType = "plan" | "lecture" | "exam" | "assignment" | "busy";

export interface WRow {
  id: string;
  title: string; // "Báo cáo nhóm"
  type: ArtType;
  time: string; // "16:00"
  check: boolean; // plan/assignment: hairline circle that ticks in place; others: art swatch
  done: boolean;
  url: string; // "zen:///task/<id>"
}

export interface WNext {
  id: string;
  title: string; // "Ôn Giải tích"
  type: ArtType;
  label: string; // "Tiếp theo"
  big: string; // "10 phút" while going, else "14:30"
  small: string; // "đến 14:30" while going, else "45 phút"
  mins: string; // "10′" (medium card, lock circle)
  at: string; // "14:30"
  fill: number; // 0..1, battery meter and lock ring
  rect: string; // lock rectangular second line: "14:30, còn 10 phút"
  left: string; // large card label tail: "còn 10 phút" while going, else "45 phút"
  url: string;
}

export interface WExam {
  id: string;
  title: string; // "Giải tích 2"
  big: string; // "11 ngày"
  small: string; // "T6 27/11 08:00"
  fill: number; // 0..1, fuller as it nears (14 days = empty)
  inline: string; // "Thi Giải tích 2 còn 11 ngày"
  url: string;
}

export interface WidgetData {
  weekday: string; // "Thứ hai"
  date: string; // "16 tháng 11"
  short: string; // "T2 16"
  summary: string; // "5 việc, 1 tiết học"
  count: string; // "5 việc"
  next?: WNext; // undefined = nothing left today: "Xong hết hôm nay"
  rows: WRow[]; // today after `next`, start order, at most 6
  doneLabel: string; // "Xong (2)", "" when none
  tomorrow: string; // "Mai: Cấu trúc dữ liệu 07:00", "" when none
  exam?: WExam;
  art: Record<ArtType, { square: string; wide: string }>; // file:// PNGs in the shared widgets directory
  ticked: string[]; // ids ticked on the widget, not yet seen by the app
  home: string; // "zen:///"
  listen: string; // "zen:///?listen=1"
}

export const WIDGET_NAMES = ["ZenNext", "ZenTalk", "ZenExam", "ZenToday", "ZenLock"] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];
/** Interaction target for a tick: `done:<id>`. */
export const DONE = "done:";
