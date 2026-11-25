// Words for the planner's reasons and solver steps: short, warm, like a friend noticing. Vietnamese only.
import { fill, lenW } from "./i18n";
import type { Kind, Reason, ReasonKey, Step } from "./types";

export const KIND_VI: Record<Kind, string> = { study: "học", exercise: "tập thể dục", chores: "việc nhà", social: "gặp gỡ", other: "việc khác", work: "công việc", errand: "việc vặt", finance: "tài chính", self: "bản thân" };

/** A kind as a short label for grids and bars. */
export const KIND_SHORT: Record<Kind, string> = { study: "Học", exercise: "Thể dục", chores: "Việc nhà", social: "Gặp gỡ", other: "Khác", work: "Công việc", errand: "Việc vặt", finance: "Tài chính", self: "Bản thân" };

/** A kind as "việc …" ("việc học", "công việc", "việc nhà"), capitalised on ask: one wording for reasons and rhythm. */
export const kindW = (k: Kind, up = false) => { const w = /việc/.test(KIND_VI[k]) ? KIND_VI[k] : `việc ${KIND_VI[k]}`; return up ? w[0].toLocaleUpperCase("vi") + w.slice(1) : w; };

// Row sub line: 4 to 6 words. Detail: the full sentence. Negative w uses `neg` (what counts against this time).
// Each entry lists its wordings best first; the first whose {vars} are all known is said. Facts come in loose words, not minute math.
type W = { short: string[]; long: string[]; neg?: string };
const R: Record<ReasonKey, W> = {
  hour: { short: ["Hay xong việc buổi {pn}", "Giờ bạn hay làm", "Giờ bạn tập trung"], long: ["{often} bạn xong việc vào buổi {pn}", "{often} bạn xong việc quanh {hour}h", "Giờ này bạn hay xong việc"], neg: "Giờ khác hợp hơn" }, // no day type: no weekday or weekend said
  after: { short: ["Sau giờ {prev}, như mọi khi"], long: ["Bạn hay làm việc này sau khi {prev}"], neg: "Sau giờ {prev}, giờ khác hợp hơn" },
  similar: { short: ["Giống việc trước", "Việc tương tự buổi {pn}"], long: ["Việc giống vậy bạn {oft} xong vào buổi {pn}", "Việc giống vậy bạn hay xong lúc {hour}h"], neg: "Việc tương tự hợp giờ khác" },
  energy: { short: ["Lúc bạn khoẻ"], long: ["Buổi {pn} là lúc bạn khoẻ nhất", "Gần giờ bạn làm tốt nhất"], neg: "Hơi xa giờ bạn khoẻ" },
  weekend: { short: ["Ngày thong thả hơn"], long: ["Hôm đó thong thả"], neg: "Hôm đó bận hơn" }, // no weekday names: day load, not the calendar
  busy: { short: ["Ngày nhẹ"], long: ["Hôm đó ít lịch"], neg: "Ngày khá kín" },
  kind: { short: ["Hợp {kind}"], long: ["Buổi {pn} hợp {kind}", "Giờ này hợp {kind}"], neg: "Giờ này ít hợp {kind}" },
  deadline: { short: ["{ahead}", "Hạn {due}, làm sớm"], long: ["Hạn {due}, {aheadLong}", "Hạn {due}, làm sớm cho nhẹ"], neg: "Hơi sát hạn {due}" },
  pace: { short: ["Buổi {k}/{n}"], long: ["Buổi {k}/{n}, rải đều tới hạn"], neg: "Các buổi hơi dồn" },
  load: { short: ["Ngày còn rộng"], long: ["Ngày còn rộng"], neg: "Ngày đã {h}h" },
  gap: { short: ["Có khoảng nghỉ"], long: ["Có nghỉ trước và sau"], neg: "Hơi sát {title}" },
  stable: { short: ["Giữ giờ cũ"], long: ["Gần giờ cũ"] },
  late: { short: ["{ahead}", "Kịp hạn"], long: ["Hạn {due}, {aheadLong}", "Xong trước hạn"], neg: "Có thể trễ hạn {due}" },
  explore: { short: ["Đang thử giờ này"], long: ["Zen chưa có đủ dữ liệu về loại việc này nên đang thử giờ này"] },
  rule: { short: ["Theo lời bạn dặn"], long: ["Bạn dặn: {text}"] },
  missed: { short: ["Lỡ {time}, không sao"], long: ["Lúc {time} chưa làm được, dời sang đây"] },
  missed3: { short: ["Lỡ {n} lần, đổi giờ"], long: ["Lỡ {n} lần buổi {part}, thử giờ khác"] },
  pinned: { short: ["Bạn đã ghim"], long: ["Bạn ghim giờ này, mình giữ"] },
  chose: { short: ["Giờ bạn chọn"], long: ["Bạn chọn giờ này, mình giữ"] },
  said: { short: ["Đúng buổi bạn nói"], long: ["Bạn nói làm buổi này"] },
  packed: { short: ["{was} kín, dời sang {to}"], long: ["{was} kín, nên dời sang {to}"] },
  fit: { short: ["Hạn {due}, làm {lenW}", "{part} trống {lenW}", "Làm trước {lenW}"], long: ["Hạn {due} gần, {slow}, xếp {lenW} trước", "Hạn {due} gần, xếp {lenW} trước, làm thêm nếu còn sức", "{part} trống chừng {lenW}, làm trước chừng đó", "Xếp {lenW} trước"] },
  over: { short: ["Hôm nay dồn, hơi muộn"], long: ["Hôm nay nhiều việc, nên làm muộn hơn chút"] },
  batch: { short: ["Gộp với {title}"], long: ["Làm liền với {title} cho gọn"] },
  holiday: { short: ["Để nhẹ ngày {title}"], long: ["Ngày {title} xếp nhẹ, việc này dời sang đây"] }, // said on the day it moved to, not the holiday
  exam: { short: ["Để nhẹ hôm trước thi"], long: ["Hôm trước thi xếp nhẹ, việc này dời sang đây"] },
  guess: { short: ["Rảnh sau {after}", "{part} còn trống", "Đang rảnh"], long: ["Sau {after} bạn rảnh", "{part} còn trống", "Giờ này đang rảnh"] },
};

// Loose words for the planner's numbers: "còn 3 ngày", "mấy lần gần đây", never "sớm 2h15p".
const vars = (r: Reason) => {
  const v: Record<string, string | number> = { ...r.vars };
  if (typeof v.prev === "string" && v.prev in KIND_VI) v.prev = KIND_VI[v.prev as Kind];
  if (typeof v.kind === "string" && v.kind in KIND_VI) v.kind = kindW(v.kind as Kind); // "Hợp việc nhà", "Hợp công việc"
  else if (typeof v.kind === "string" && !/việc/.test(v.kind)) v.kind = `việc ${v.kind}`; // a label already said (policy's own)
  if (typeof v.left === "number") { // minutes from the end of this block to the due
    const d = Math.floor(v.left / 1440);
    v.ahead = d >= 2 ? `Còn ${d} ngày tới hạn, làm dần` : v.left >= 180 ? "Xong sớm, còn dư giờ" : "Vừa kịp hạn";
    v.aheadLong = d >= 2 ? `làm từ giờ là còn ${d} ngày thong thả` : v.left >= 180 ? "làm giờ này là còn dư thời gian" : "giờ này là vừa kịp";
  }
  if (typeof v.slow === "number") v.slow = "bạn hay cần lâu hơn dự kiến"; // the ratio is never said as a number
  if (typeof v.len === "number") v.lenW = lenW(v.len); // "45p", "1h30" (i18n units)
  if (typeof v.n === "number" && v.n >= 2) { v.often = v.n >= 5 ? "Bạn hay" : "Mấy lần gần đây"; v.oft = v.n >= 3 ? "hay" : "từng"; }
  return v;
};
const pick = (ws: string[], v: Record<string, string | number>) => ws.find((w) => [...w.matchAll(/\{(\w+)\}/g)].every((m) => v[m[1]] !== undefined && v[m[1]] !== "")) ?? ws[ws.length - 1];

/** One reason in words; `long` for the detail screen and the brief. */
export function reasonText(r: Reason, long = false): string {
  const e = R[r.key], v = vars(r);
  return fill(r.w < 0 && e.neg ? e.neg : pick(long ? e.long : e.short, v), v);
}

/** Reasons that word a model weight as a habit ("Bạn hay…", "Hợp…"): never said. What the outcomes really show comes from the
 *  insight miner (planner/mine.ts), checked when it is shown. They stay in the planner's score and its stored why for its own use. */
export const LEARNED: ReadonlySet<ReasonKey> = new Set<ReasonKey>(["hour", "after", "similar", "energy", "weekend", "busy", "kind"]);
export const sayable = (why?: Reason[]) => (why ?? []).filter((r) => !LEARNED.has(r.key));

/** The top positive reason for the row's sub line, if it is worth saying. */
export const topReason = (why?: Reason[]) => sayable(why).find((r) => r.w > 0);

const S: Record<Step["key"], string> = {
  read: "Đọc lịch {what}",
  place: "Đặt {title} vào {time}",
  series: "Xếp {n} buổi {title}, {from} - {to}",
  move: "Dời {title} sang {time}",
  lighten: "{day} đã {h}h, để nhẹ bớt",
  swap: "Đổi {a} với {b}",
  chain: "Dời {b} để {a} có giờ đẹp",
  rule: "Giữ {text}",
  missed: "Dời {title} vì lỡ mất",
};

export const stepText = (s: Step) => fill(S[s.key], s.vars);
