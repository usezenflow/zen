// Words for the planner's reasons and solver steps: short, warm, like a friend noticing. Vietnamese only.
import { fill } from "./i18n";
import type { Kind, Reason, ReasonKey, Step } from "./types";

export const KIND_VI: Record<Kind, string> = { study: "học", exercise: "tập thể dục", chores: "việc nhà", social: "gặp gỡ", other: "việc khác" };

// Row sub line: 4 to 6 words. Detail: the full sentence. Negative w uses `neg` (what counts against this time).
const R: Record<ReasonKey, { short: string; long: string; neg?: string }> = {
  hour: { short: "Giờ bạn tập trung nhất", long: "Giờ này bạn hay làm xong việc", neg: "Giờ này bạn hay bỏ dở" },
  after: { short: "Sau {prev}, như mọi khi", long: "Bạn hay làm việc này sau khi {prev}", neg: "Sau {prev} bạn hay mệt" },
  similar: { short: "Việc tương tự xong giờ này", long: "Việc giống thế này bạn hay làm xong lúc {hour} giờ", neg: "Việc tương tự hay bị dời giờ này" },
  energy: { short: "Đúng lúc bạn khoẻ", long: "Gần giờ bạn làm được nhiều nhất", neg: "Hơi xa giờ bạn khoẻ nhất" },
  weekend: { short: "Cuối tuần thong thả", long: "Cuối tuần bạn hay có thời gian cho việc này", neg: "Cuối tuần bạn ít làm việc này" },
  busy: { short: "Ngày nhẹ lịch", long: "Hôm đó ít lịch, dễ thở hơn", neg: "Hôm đó lịch đã dày" },
  kind: { short: "Hợp việc {kind}", long: "Giờ này hợp với việc {kind}", neg: "Giờ này ít hợp việc {kind}" },
  deadline: { short: "Hạn {due}, làm sớm", long: "Hạn {due}. Làm sớm cho đỡ dồn", neg: "Hơi sát hạn {due}" },
  pace: { short: "Buổi {k}/{n}", long: "Buổi {k}/{n}, rải đều tới hạn", neg: "Các buổi hơi dồn" },
  load: { short: "Ngày này còn rộng", long: "Ngày này còn rộng, không quá tải", neg: "Ngày này đã {h} tiếng" },
  gap: { short: "Có khoảng nghỉ", long: "Có khoảng nghỉ trước và sau", neg: "Hơi sát {title}" },
  stable: { short: "Giữ giờ cũ", long: "Giữ gần giờ bạn đã thấy, đỡ xáo trộn" },
  late: { short: "Kịp hạn", long: "Xong trước hạn", neg: "Có thể trễ hạn" },
  explore: { short: "Thử giờ mới, một lần thôi", long: "Mình chưa rõ giờ này hợp không, thử một lần" },
  rule: { short: "Theo lời bạn dặn", long: "Bạn dặn: {text}" },
  missed: { short: "Lỡ lúc {time}, không sao", long: "Lúc {time} chưa làm được, mình dời sang đây" },
  pinned: { short: "Bạn đã ghim giờ này", long: "Bạn đã ghim giờ này, mình không dời" },
  said: { short: "Đúng buổi bạn nói", long: "Bạn nói làm vào buổi này" },
  guess: { short: "Mình đoán giờ này hợp", long: "Mình chưa biết nhiều về bạn, nên đoán giờ này hợp" },
};

const vars = (r: Reason) => {
  const v = { ...r.vars };
  if (typeof v.prev === "string" && v.prev in KIND_VI) v.prev = KIND_VI[v.prev as Kind];
  if (typeof v.kind === "string" && v.kind in KIND_VI) v.kind = KIND_VI[v.kind as Kind];
  return v;
};

/** One reason in words; `long` for the detail screen and the brief. */
export function reasonText(r: Reason, long = false): string {
  const e = R[r.key];
  return fill(r.w < 0 && e.neg ? e.neg : long ? e.long : e.short, vars(r));
}

/** The top positive reason for the row's sub line, if it is worth saying. */
export const topReason = (why?: Reason[]) => why?.find((r) => r.w > 0);

const S: Record<Step["key"], string> = {
  read: "Đọc lịch {what}",
  place: "Đặt {title} vào {time}",
  move: "Dời {title} sang {time}",
  lighten: "{day} đã {h} tiếng, để nhẹ bớt",
  swap: "Đổi {a} với {b}",
  chain: "Dời {b} để {a} có giờ đẹp",
  rule: "Giữ {text}",
  missed: "Dời {title} vì lỡ mất",
};

export const stepText = (s: Step) => fill(S[s.key], s.vars);
