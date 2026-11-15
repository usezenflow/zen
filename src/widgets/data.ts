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
  big: string; // "10 phút": minutes to the end while going, else to the start
  small: string; // "đến 14:30": the end while going, else the start
  mins: string; // "10′" (medium card, lock circle)
  at: string; // "14:30"
  fill: number; // 0..1, battery meter and lock ring: share done while going, else the last 30 min draining
  rect: string; // lock rectangular second line: "14:30, còn 10 phút"
  left: string; // large card label tail: "còn 10 phút"
  url: string;
}

export interface WExam {
  id: string;
  title: string; // "Giải tích 2"
  big: string; // "11 ngày"
  small: string; // "T6 27/11 08:00"
  fill: number; // 0..1, fuller as it nears (28 days = empty)
  inline: string; // "Thi GT2 còn 11 ngày"
  n: string; // medium meter: "11", "08:00" on the day
  unit: string; // "ngày nữa", "hôm nay" on the day
  url: string;
}

export interface WidgetData {
  weekday: string; // "Thứ hai"
  date: string; // "16 tháng 11"
  short: string; // "T2 16"
  summary: string; // "5 việc, 1 tiết học"
  count: string; // "5 việc", classes not counted
  next?: WNext; // undefined = nothing left today: "Xong hết hôm nay"
  rows: WRow[]; // today after `next`, start order, at most 6
  doneLabel: string; // "Xong (2)", "" when none
  tomorrow: string; // the next day with anything, within a week: "Mai: Cấu trúc dữ liệu 07:00", "T6: …" this week, "T6 27/11: …" past it; "" when none
  // Medium with nothing left today: the next day that has anything, within a week.
  ahead: WRow[]; // its first three, start order
  aheadHead: string; // "Mai", "Thứ tư" this week, "Thứ tư 2/12" past it; "" when nothing is ahead at all
  aheadCount: string; // "2 việc, 1 tiết học"
  doneCount: string; // "5 việc xong", "" when none: all done; else a free day
  dayName: string; // "Thứ bảy 14", the free day's ink card
  exam?: WExam;
  art: Record<ArtType, { square: string; wide: string }>; // file:// PNGs in the shared widgets directory
  ticked: string[]; // ids ticked on the widget, not yet seen by the app
  home: string; // "zen:///"
  listen: string; // "zen:///?listen=1"
  // Android only: what the widget shows from each time on (epoch ms), the same entries an iOS timeline gets. The layout shows the one due
  // now and the expo-widgets patch redraws at the next, so it rolls without the app. `art` and `ticked` stay on the top level.
  tl?: { at: number; p: Omit<WidgetData, "art" | "ticked" | "tl"> }[];
}

export const WIDGET_NAMES = ["ZenNext", "ZenTalk", "ZenScan", "ZenExam", "ZenToday", "ZenLock"] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];
/** Interaction target for a tick: `done:<id>`. */
export const DONE = "done:";
