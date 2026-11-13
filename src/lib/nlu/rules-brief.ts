// The rule reader's tables as a short Vietnamese glossary for the model's static prompt. Built from the tables so it never drifts.
import { ACTIVITIES } from "./reader/implied";
import { PART } from "./reader/parts";
import { PERIOD_TABLE } from "./reader/periods";
import { SPREAD } from "./reader/rules";

const VI: Record<string, string> = {
  "sang som": "sáng sớm", sang: "sáng", trua: "trưa", chieu: "chiều", "chieu toi": "chiều tối", toi: "tối", dem: "đêm", khuya: "khuya",
};
const hm = ([h, m]: [number, number] | number[]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const clock = (min: number) => hm([Math.floor(min / 60), min % 60]);
// "(?<!mua )\bhop\b|\bmeeting\b" -> "hop"
const word = (re: RegExp) => re.source.split("|")[0].replace(/\(\?<!.*?\)|\\b/g, "");

const parts = Object.entries(PART)
  .map(([k, p]) => `${VI[k] ?? k} ${hm(p.start)} (trước ${hm(p.before)}, hạn ${hm(p.due)})`)
  .join("; ");
const periods = Object.entries(PERIOD_TABLE).map(([n, p]) => `tiết ${n}=${clock(p.start)}-${clock(p.end)}`).join(", ");
const acts = ACTIVITIES.map((a) => `${word(a.pattern)} ${a.minutes}p`).join(", ");
const spread = Object.entries(SPREAD).slice(0, 5).map(([n, d]) => `${n} buổi/tuần=BYDAY=${d}`).join(", ");

export const RULES_VI = [
  "Quy ước (giờ địa phương):",
  `Buổi: giờ bắt đầu (trước buổi, hạn trong buổi): ${parts}.`,
  `Tiết học: ${periods}.`,
  `Thời lượng mặc định: ${acts}; 1 chương 60p, 1 bài 30p, 1 trang 5p.`,
  `Lặp: mỗi ngày=FREQ=DAILY, mỗi tuần=FREQ=WEEKLY, ngày thường=BYDAY=MO,TU,WE,TH,FR, cuối tuần=BYDAY=SA,SU, ${spread}.`,
  "Thứ 2..7 = MO..SA, CN = SU. Ngày lễ (Tết, Trung thu, Giỗ Tổ, Quốc khánh, 20/11...) là một ngày; rules đã tính sẵn.",
  "kind: thi, bài tập, học, ôn, đọc, báo cáo, môn học -> study; gym, chạy bộ, bơi, đá bóng -> exercise; dọn, giặt, nấu, đi chợ -> chores; gặp, hẹn, gọi, cà phê, ăn với ai -> social.",
  "Nếu có rules: tin ngày giờ của rules, chỉ sửa title, op, target, kind khi câu nói khác.",
].join("\n");
