export type Lang = "vi" | "en";
let lang: Lang = "vi";
export const getLang = () => lang;
export const setLang = (l: Lang) => void (lang = l);

const S = {
  planned: ["Planned {n} sittings across {d} days", "Đã xếp {n} buổi trong {d} ngày"],
  added: ["Added {title}", "Đã thêm {title}"],
  done: ["Done. Nice.", "Xong. Tốt lắm."],
  later: ["Moved later", "Đã dời lại"],
  noted: ["Note saved", "Đã lưu ghi chú"],
  deleted: ["Deleted {title}", "Đã xóa {title}"],
  moved: ["Moved {title} to {time}", "Đã dời {title} sang {time}"],
  synced: ["Timetable changed, moved {n} tasks", "Lịch học đổi, đã dời {n} việc"],
  syncedNew: ["Timetable updated", "Đã cập nhật lịch học"],
  morning: ["New day, plan refreshed", "Ngày mới, đã sắp lại lịch"],
  nothing: ["Nothing to do", "Chưa có gì để làm"],
  undo: ["Undo", "Hoàn tác"],
  undone: ["Undone", "Đã hoàn tác"],
  empty: ["Hold and tell me your week", "Giữ nút và kể tuần này của bạn"],
  allDone: ["Nothing left today", "Hôm nay xong rồi"],
  hold: ["Hold to talk", "Giữ để nói"],
  listening: ["Listening", "Đang nghe"],
  thinking: ["Thinking", "Đang nghĩ"],
  today: ["Today", "Hôm nay"],
  notes: ["Notes", "Ghi chú"],
  until: ["Until {time}", "Đến {time}"],
  gap: ["{n} min free, {title} fits", "{n} phút trống, hợp làm {title}"],
  downloading: ["Downloading models {p}%", "Đang tải mô hình {p}%"],
  offlineModel: ["Model not ready", "Mô hình chưa sẵn sàng"],
  mic: ["Allow the microphone", "Cho phép micro"],
  loginChanged: ["Campus login changed", "Đăng nhập trường đã đổi"],
  settings: ["Settings", "Cài đặt"],
  language: ["Language", "Ngôn ngữ"],
  campus: ["Connect campus", "Kết nối trường"],
  studentId: ["Student ID", "Mã sinh viên"],
  password: ["Password", "Mật khẩu"],
  save: ["Save", "Lưu"],
  disconnect: ["Disconnect", "Ngắt kết nối"],
  connected: ["Connected", "Đã kết nối"],
  stats: ["Share anonymous stats", "Chia sẻ thống kê ẩn danh"],
  bug: ["Report a bug", "Báo lỗi"],
  back: ["Back", "Quay lại"],
  empty2: ["Nothing yet", "Chưa có gì"],
} as const;
export type Key = keyof typeof S;

export const t = (k: Key, v: Record<string, string | number> = {}, l: Lang = lang) =>
  fill(S[k][l === "vi" ? 1 : 0], v);

export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

// Planner insight templates are English; this maps them to Vietnamese.
const INSIGHT_VI: Record<string, string> = {
  "You do {prev} before {kind}, so {title} moved to {time}": "Bạn hay làm {prev} trước {kind}, nên {title} dời sang {time}",
  "{title} matches when similar tasks got done, so it moved to {time}": "{title} hợp giờ bạn hay làm việc tương tự, nên dời sang {time}",
  "You tend to push {kind} later, so {title} moved earlier to {time}": "Bạn hay dời {kind}, nên {title} được xếp sớm hơn lúc {time}",
};
export const insight = (template: string, vars: Record<string, string | number>, l: Lang = lang) =>
  fill(l === "vi" ? (INSIGHT_VI[template] ?? template) : template, vars);
