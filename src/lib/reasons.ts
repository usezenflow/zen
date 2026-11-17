// Words for the planner's reasons and solver steps: short, warm, like a friend noticing. Vietnamese only.
import { fill } from "./i18n";
import type { Kind, Reason, ReasonKey, Step } from "./types";

export const KIND_VI: Record<Kind, string> = { study: "học", exercise: "tập thể dục", chores: "việc nhà", social: "gặp gỡ", other: "việc khác", work: "công việc", errand: "việc vặt", finance: "tài chính", self: "bản thân" };

/** A kind as "việc …" ("việc học", "công việc", "việc nhà"), capitalised on ask: one wording for reasons and rhythm. */
export const kindW = (k: Kind, up = false) => { const w = /việc/.test(KIND_VI[k]) ? KIND_VI[k] : `việc ${KIND_VI[k]}`; return up ? w[0].toLocaleUpperCase("vi") + w.slice(1) : w; };

// Row sub line: 4 to 6 words. Detail: the full sentence. Negative w uses `neg` (what counts against this time).
// Each entry lists its wordings best first; the first whose {vars} are all known is said. Facts come in loose words, not minute math.
type W = { short: string[]; long: string[]; neg?: string };
const R: Record<ReasonKey, W> = {
  hour: { short: ["Giờ bạn hay xong việc", "Giờ bạn tập trung nhất"], long: ["{often} bạn xong việc quanh {hour}h", "Giờ này bạn hay làm xong việc"], neg: "Giờ khác hợp hơn một chút" },
  after: { short: ["Sau giờ {prev}, như mọi khi"], long: ["Bạn hay làm việc này sau khi {prev}"], neg: "Sau giờ {prev}, giờ khác hợp hơn" },
  similar: { short: ["Việc giống vậy bạn xong giờ này", "Việc tương tự xong giờ này"], long: ["Việc giống thế này bạn {oft} xong quanh {hour}h", "Việc giống thế này bạn hay làm xong lúc {hour}h"], neg: "Với việc tương tự, giờ khác hợp hơn" },
  energy: { short: ["Đúng lúc bạn khoẻ"], long: ["Gần giờ bạn làm được nhiều nhất"], neg: "Hơi xa giờ bạn khoẻ nhất" },
  weekend: { short: ["Cuối tuần thong thả"], long: ["Cuối tuần bạn hay có thời gian cho việc này"], neg: "Ngày thường hợp hơn một chút" },
  busy: { short: ["Ngày nhẹ lịch"], long: ["Hôm đó ít lịch, dễ thở hơn"], neg: "Hôm đó lịch đã dày" },
  kind: { short: ["Hợp {kind}"], long: ["Giờ này hợp với {kind}"], neg: "Giờ này ít hợp {kind}" },
  deadline: { short: ["{ahead}", "Hạn {due}, làm sớm"], long: ["Hạn {due}, {aheadLong}", "Hạn {due}, xếp sớm cho khỏi dồn vào phút chót"], neg: "Hơi sát hạn {due}" },
  pace: { short: ["Buổi {k}/{n}"], long: ["Buổi {k}/{n}, rải đều tới hạn"], neg: "Các buổi hơi dồn" },
  load: { short: ["Ngày này còn rộng"], long: ["Ngày này còn rộng, không quá tải"], neg: "Ngày này đã {h}h" },
  gap: { short: ["Có khoảng nghỉ"], long: ["Có khoảng nghỉ trước và sau"], neg: "Hơi sát {title}" },
  stable: { short: ["Giữ giờ cũ"], long: ["Giữ gần giờ bạn đã thấy, đỡ xáo trộn"] },
  late: { short: ["{ahead}", "Kịp hạn"], long: ["Hạn {due}, {aheadLong}", "Xong trước hạn"], neg: "Có thể trễ hạn {due}" },
  explore: { short: ["Thử giờ mới, một lần thôi"], long: ["Mình chưa rõ giờ này hợp không, thử một lần"] },
  rule: { short: ["Theo lời bạn dặn"], long: ["Bạn dặn: {text}"] },
  missed: { short: ["Lỡ lúc {time}, không sao"], long: ["Lúc {time} chưa làm được, mình dời sang đây"] },
  pinned: { short: ["Bạn đã ghim giờ này"], long: ["Bạn đã ghim giờ này, mình không dời"] },
  chose: { short: ["Giờ bạn chọn"], long: ["Bạn chọn giờ này, mình giữ nguyên"] },
  said: { short: ["Đúng buổi bạn nói"], long: ["Bạn nói làm vào buổi này"] },
  packed: { short: ["{was} kín, dời sang {to}"], long: ["{was} kín lịch rồi, nên mình dời sang {to}"] },
  fit: { short: ["Hạn {due}, làm gọn {lenW}", "{part} trống {lenW}", "Làm trước {lenW}"], long: ["Hạn {due} gần, mình xếp gọn {lenW} trước, làm thêm nếu còn sức", "Bạn chưa nói làm bao lâu, {part} trống chừng {lenW} nên làm trước chừng đó", "Bạn chưa nói làm bao lâu, mình xếp {lenW} trước"] },
  over: { short: ["Hôm nay dồn, làm muộn chút"], long: ["Hôm nay còn nhiều việc, nên làm muộn hơn mọi khi một chút"] },
  guess: { short: ["Rảnh sau {after}", "{part} còn trống", "Chỗ trống vừa {m}p"], long: ["Sau {after} bạn rảnh một khoảng, vừa cho việc này", "{part} còn trống, vừa đủ cho việc này", "Khoảng trống vừa {m}p, không đụng lịch của bạn"] },
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
  if (typeof v.len === "number") { const h = Math.floor(v.len / 60), r = v.len % 60; v.lenW = h ? `${h} tiếng${r >= 30 ? " rưỡi" : ""}` : v.len === 30 ? "nửa tiếng" : `${v.len} phút`; }
  if (typeof v.n === "number" && v.n >= 2) { v.often = v.n >= 5 ? "Bạn hay" : "Mấy lần gần đây"; v.oft = v.n >= 3 ? "hay" : "từng"; }
  return v;
};
const pick = (ws: string[], v: Record<string, string | number>) => ws.find((w) => [...w.matchAll(/\{(\w+)\}/g)].every((m) => v[m[1]] !== undefined && v[m[1]] !== "")) ?? ws[ws.length - 1];

/** One reason in words; `long` for the detail screen and the brief. */
export function reasonText(r: Reason, long = false): string {
  const e = R[r.key], v = vars(r);
  return fill(r.w < 0 && e.neg ? e.neg : pick(long ? e.long : e.short, v), v);
}

/** The top positive reason for the row's sub line, if it is worth saying. */
export const topReason = (why?: Reason[]) => why?.find((r) => r.w > 0);

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
