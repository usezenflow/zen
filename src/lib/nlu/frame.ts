// One reading of a task title: its verb, objects, count, stakes, group, difficulty and class. Pure and order-free:
// the verb may come after its objects, accents are optional, and a 1-letter typo in a keyword of 4+ letters still reads.
import { fold } from "./reader/fold";
import { parseSpokenNumber } from "./reader/spoken";
import { isSyllable } from "./reader/syllables";
import { EN_WORDS } from "./reader/en";
import { classify } from "./classify";

export type Domain = "study" | "work" | "home" | "finance" | "health" | "growth" | "social" | "admin" | "errand";
export type Shape = "project" | "practice" | "errand" | "event";
export type TaskClass =
  | "code" | "project" | "fix" | "review_code" | "write_doc" | "essay" | "slides" | "thesis" | "exam_review" | "homework" | "read"
  | "language" | "skill" | "workout_gym" | "workout_run" | "workout_yoga" | "workout_swim" | "habit_read" | "habit_meditate"
  | "habit_journal" | "clean" | "laundry" | "cook" | "shop" | "bill" | "budget" | "tax" | "paperwork" | "call" | "email"
  | "meeting" | "appointment"
  | "content" | "design" | "sales" | "report" | "plan" | "interview" | "deploy" | "research" | "spec" | "presentation" | "admin_work"
  | "pet" | "plants" | "trash" | "meds" | "pickup" | "repair" | "selfcare"
  | "meal_breakfast" | "meal_lunch" | "meal_dinner" | "cafe";
export type Unit = "trang" | "chuong" | "bai" | "cau" | "slide" | "chu" | "cuon" | "km" | "buoi" | "lan";
export interface Frame {
  verb?: string;
  objects: string[];
  qty?: { n: number; unit: Unit };
  domain?: Domain;
  cls?: TaskClass;
  stakes?: "quiz" | "mid" | "final" | "deliverable" | "thesis";
  group: boolean;
  hard: boolean;
  /** A lab or practical: a homework that takes a long sitting (LAB size). */
  lab?: boolean;
}

type Stake = NonNullable<Frame["stakes"]>;

const UNITS = new Map<string, Unit>([
  ["trang", "trang"], ["chuong", "chuong"], ["bai", "bai"], ["cau", "cau"], ["slide", "slide"], ["slides", "slide"],
  ["chu", "chu"], ["cuon", "cuon"], ["km", "km"], ["buoi", "buoi"], ["lan", "lan"],
]);
/** Units of a book that reads as a read (not a habit). */
const READ_UNITS = new Set<Unit>(["chuong", "trang", "cuon"]);
/** Words a 1-letter typo may stand for: keyword words of 4+ letters. */
const VOCAB = [
  "thesis", "luan", "tieu", "essay", "slide", "thuyet", "powerpoint", "report", "proposal", "viet", "tai", "lieu", "doc",
  "read", "tieng", "ielts", "toeic", "code", "lap", "trinh", "implement", "debug", "fix", "review", "gym", "yoga", "chay",
  "guitar", "piano", "nhay", "swim", "meditation", "journal", "nhat", "clean", "lau", "laundry", "cook", "shop", "budget",
  "ngan", "sach", "thue", "tax", "giay", "email", "mail", "meeting", "standup", "appointment", "kham", "homework", "bai",
  "tap", "dien", "nuoc", "mang", "internet", "call", "quiz", "midterm", "final", "cuoi",
  "reel", "caption", "design", "thiet", "interview", "tuyen", "deploy", "release", "research", "nghien", "phan", "tich",
  "analysis", "pitch", "roadmap", "invoice", "contract", "trash", "garbage", "repair", "pickup", "thuoc", "uong", "tuoi",
  "sales", "presentation", "breakfast", "lunch", "dinner", "coffee", "cafe", "sang", "hop",
];
const VOCAB_SET = new Set(VOCAB);

/** Optimal-string-alignment distance <= 1: one insert, delete, substitute or adjacent swap. */
export function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let i = 0;
    while (a[i] === b[i]) i++;
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

// Class keywords, first match wins: the more specific class comes first.
const CLASSES: [TaskClass, RegExp][] = [
  ["thesis", /\b(?:luan van|khoa luan|do an tot nghiep|datn|kltn|lv|thesis)\b/],
  ["essay", /\b(?:tieu luan|essay|bai luan)\b/],
  ["language", /\b(?:(?:hoc|luyen|on) )?(?:tieng anh|anh van|tieng nhat|tieng trung|tieng han|ielts|toeic)\b/],
  // a bare "ôn" is a review, but "cảm ơn" is thanks
  ["exam_review", /\b(?:hoc bai thi|on thi|on tap|luyen de|(?<!cam )on)\b/],
  ["homework", /\b(?:(?:lam )?bai tap(?: ve nha)?|btvn|bt|homework|lab|thuc hanh)\b/],
  ["review_code", /\breview (?:pr|code|pull request)\b/],
  // work before the study words: "báo cáo tuần" is a report, "viết tài liệu kỹ thuật" a spec
  ["report", /\b(?:(?:bao cao|report) (?:tuan|thang|quy|ngay)|(?:weekly|monthly|daily|quarterly) (?:bao cao|report))\b/],
  ["plan", /\b(?:okr|kpi|roadmap|ke hoach (?:quy|thang|tuan|nam|q[1-4]|kinh doanh|marketing|san pham|team|du an|ban hang))\b/],
  ["spec", /\b(?:spec|specs|prd|rfc|tai lieu ky thuat)\b/],
  ["fix", /\b(?:fix(?: bug)?|sua loi|debug)\b/],
  // "đọc code" reads code; it is no coding task
  ["read", /\bdoc (?:code|source)\b/],
  ["code", /\b(?:code|lap trinh|lam api|implement|viet ham|cai dat(?: thuat toan)?)\b/],
  ["slides", /\b(?:slides?|thuyet trinh|powerpoint|pptx|deck)\b/],
  ["presentation", /\b(?:pitch|pitching|present|presentation)\b/],
  ["write_doc", /\b(?:viet (?:bao cao|tai lieu|doc|proposal)|bao cao|report|proposal)\b/],
  ["skill", /\b(?:hoc )?(?:guitar|piano|ghi ta|nhay|boi loi)\b|\bhoc dan\b|\bdan (?:guitar|piano|bau)\b|\bhoc ve\b|\bve tranh\b/],
  ["workout_gym", /\b(?:gym|tap ta)\b/],
  ["workout_yoga", /\byoga\b/],
  ["workout_run", /\b(?:chay bo|chay|run|running)\b/],
  ["workout_swim", /\b(?:boi|swim)\b/],
  ["habit_meditate", /\b(?:(?<!hoan )thien|meditation|meditate)\b/],
  ["habit_journal", /\b(?:viet nhat ky|nhat ky|journal)\b/],
  ["pet", /\b(?:cho (?:ga|cho|meo|ca|chim|tho) an|cho an (?:ga|cho|meo|ca|chim|tho))\b/],
  ["plants", /\b(?:tuoi (?:cay|hoa|rau|vuon|cay canh)|water (?:the )?plants?)\b/],
  ["trash", /\b(?:do rac|vut rac|bo rac|trash|garbage)\b/],
  ["meds", /\b(?:uong thuoc|thuoc|meds|medicine)\b/],
  ["pickup", /\b(?:(?:don|dua) (?:con|em|be)|di (?:don|dua) (?:con|em|be)|pick ?up|drop ?off)\b/],
  ["repair", /\b(?:sua (?:xe|dien|may|nha|dien thoai|ong nuoc|tu lanh|dieu hoa|laptop)|repair)\b/],
  ["selfcare", /\b(?:cat toc|goi dau|go toc|hair ?cut|barber|massage|nhuom toc|uon toc|lam mong)\b/],
  ["clean", /\b(?:don nha|don phong|don bep|don dep|lau nha|lau bep|clean)\b/],
  ["laundry", /\b(?:giat do|giat ui|phoi do|laundry)\b/],
  ["cook", /\b(?:nau an|nau com|nau canh|cook)\b/],
  ["shop", /\b(?:di cho|di sieu thi|sieu thi|mua|shop)\b/],
  ["bill", /\b(?:(?:dong|tra|nop) (?:tien )?(?:dien|nuoc|mang|net|internet|nha|hoc phi)|hoc phi|(?:tra|dong) (?:the|no)|tien (?:dien|nuoc|mang|net|internet|nha))\b/],
  ["budget", /\b(?:lap ngan sach|ngan sach|tinh chi tieu|budget)\b/],
  ["tax", /\b(?:khai thue|quyet toan thue|tax)\b/],
  ["design", /\b(?:thiet ke|design|banner|logo|poster|mockup)\b/],
  ["content", /\b(?:post|reel|reels|short|shorts|caption|fanpage|(?:edit|quay|lam) video)\b/],
  ["sales", /\b(?:sales?|ban hang|bao gia|chao hang|chot don|client|quotation)\b/],
  ["interview", /\b(?:phong van|interview|tuyen dung|recruit|recruiting|ung vien|screening)\b/],
  ["deploy", /\b(?:deploy|release|rollout|hotfix|len prod|phat hanh)\b/],
  ["research", /\b(?:nghien cuu|research|phan tich|analysis|analyze|khao sat|survey)\b/],
  ["admin_work", /\b(?:hop dong|hoa don|cham cong|invoice|contract|bang cong)\b/],
  ["paperwork", /\b(?:lam giay to|giay to|gia han|nop ho so|ho so|lam ho chieu|ho chieu|cccd|nop form)\b/],
  ["email", /\b(?:gui mail|gui email|tra loi (?:mail|email)|email|mail|nhan tin)\b/],
  ["call", /\b(?:goi dien|goi cho|goi|call)\b/],
  ["meeting", /\b(?:(?<!mua )hop|meeting|standup|stand up|sync|one on one|1 on 1)\b/],
  ["appointment", /\b(?:kham|di kham|nha si|bac si|appointment)\b/],
  ["read", /\b(?:doc|read)\b/],
  // eating and coffee come after the workouts and reads, so "chạy bộ sau bữa tối" stays a run
  ["meal_breakfast", /\b(?:an sang|bua sang|breakfast)\b/],
  ["meal_lunch", /\b(?:an trua|bua trua|lunch)\b/],
  ["meal_dinner", /\b(?:an toi|bua toi|dinner)\b/],
  ["cafe", /\b(?:ca phe|cafe|cf|coffee)\b/],
  // last: a course or work project when nothing more specific (meeting, homework, report) named it
  ["project", /\b(?:do an|bai tap lon|btl|capstone|du an)\b/],
];

// Flags on the whole title, each removed from the objects.
const STAKES: [RegExp, Stake][] = [
  [/\b(?:luan van|khoa luan|do an tot nghiep|datn|kltn|thesis)\b/, "thesis"],
  [/\b(?:giua ki|giua ky|gk|midterm)\b/, "mid"],
  [/\b(?:cuoi ki|cuoi ky|ck|final|thi hoc ky)\b/, "final"],
  [/\b(?:quiz|kiem tra|15 ?p|15 phut)\b/, "quiz"],
  [/\b(?:do an|project)\b/, "deliverable"],
];
const GROUP = /\b(?:ca nhom|nhom|team)\b/;
const HARD = /\b(?:kho khan|kho|lai tu dau|chua biet gi|tu con so 0|tu con so khong|mat goc)\b/;

const DOMAIN: Record<TaskClass, Domain> = {
  code: "study", project: "study", fix: "study", review_code: "study", write_doc: "study", essay: "study", slides: "study",
  thesis: "study", exam_review: "study", homework: "study", read: "study",
  language: "growth", skill: "growth", habit_read: "growth", habit_meditate: "growth", habit_journal: "growth",
  workout_gym: "health", workout_run: "health", workout_yoga: "health", workout_swim: "health", appointment: "health",
  clean: "home", laundry: "home", cook: "home", shop: "errand", bill: "finance", budget: "finance", tax: "finance",
  paperwork: "admin", call: "social", email: "work", meeting: "work",
  content: "work", design: "work", sales: "work", report: "work", plan: "work", interview: "work", deploy: "work",
  research: "work", spec: "work", presentation: "work", admin_work: "work",
  pet: "home", plants: "home", trash: "home", repair: "home", meds: "growth", pickup: "errand", selfcare: "growth",
  meal_breakfast: "home", meal_lunch: "home", meal_dinner: "home", cafe: "social",
};

/** Words of the patterns above: a token of these is never fuzzed, so "khai" stays "khai" and not "khoa". */
const KNOWN = new Set(
  [...CLASSES.map(([, re]) => re), ...STAKES.map(([re]) => re), GROUP, HARD].flatMap((re) => re.source.match(/[a-z]+/g) ?? []),
);

const fuzz = (t: string): string => {
  if (VOCAB_SET.has(t) || t.length < 4 || !/^[a-z]+$/.test(t) || KNOWN.has(t)) return t;
  const hits = VOCAB.filter((v) => within1(t, v));
  return hits.length === 1 ? hits[0] : t;
};

// "làm" is a verb and "từ" a preposition here, never the numbers "lăm" and "tư".
const NOT_NUMBER = new Set(["lam", "tu"]);

/** Takes the first count and its unit ("10 cuốn", "ba chương", "mười trang") out of the tokens. */
function takeQty(toks: string[]): Frame["qty"] {
  for (let i = 0; i < toks.length; i++) {
    const unit = UNITS.get(toks[i]);
    if (!unit) continue;
    for (let k = Math.max(0, i - 3); k < i; k++) {
      const words = toks.slice(k, i);
      if (words.includes("|") || words.some((w) => NOT_NUMBER.has(w))) continue;
      const text = words.join(" ");
      const n = /^\d+$/.test(text) ? Number(text) : parseSpokenNumber(text);
      if (n && n > 0) {
        toks.splice(k, i - k + 1);
        return { n, unit };
      }
    }
  }
  return undefined;
}

/** Token span [start, end) of the first match of `re` in the tokens, or undefined. */
function spanOf(toks: string[], re: RegExp): [number, number] | undefined {
  const s = toks.join(" ");
  const m = re.exec(s);
  if (!m) return undefined;
  const pre = s.slice(0, m.index);
  const start = pre === "" ? 0 : pre.endsWith(" ") ? pre.trimEnd().split(" ").length : pre.split(" ").length - 1;
  return [start, start + m[0].split(" ").length];
}

function removeAll(toks: string[], re: RegExp): void {
  let sp: [number, number] | undefined;
  while ((sp = spanOf(toks, re))) toks.splice(sp[0], sp[1] - sp[0]);
}

/** Reads a task title into its frame. Objects keep their own spelling: only class words are fuzzed. */
export function frameOf(title: string): Frame {
  // "đa" is the shorthand for đồ án; matched raw, since folded it is also "đã" (already).
  const raw = title.normalize("NFC").replace(/(?<!\p{L})đa(?!\p{L})/giu, " đồ án ");
  const toks = fold(raw).text
    .replace(/[.;:!?()"“”']/g, " ")
    .replace(/\s*(?:[,&+]|\bva\b|\bvs\b)\s*/g, " | ")
    .split(" ")
    .filter(Boolean);

  const qty = takeQty(toks);
  const str = toks.join(" ");
  const stakes = STAKES.find(([re]) => re.test(str))?.[1];
  const group = GROUP.test(str);
  const hard = HARD.test(str);

  let cls: TaskClass | undefined;
  let verb: string | undefined;
  // a word typed with its marks that is a Vietnamese syllable, or an English word, is never a typo: "chắc" is not "chạy"
  const kept = new Set(raw.split(/\s+/).map((w) => w.replace(/[.;:!?()"“”',&+]/g, "")).filter((w) => w && ((isSyllable(w) && fold(w).text !== w.toLowerCase()) || EN_WORDS.has(w.toLowerCase()))).map((w) => fold(w).text));
  const fz = toks.map((t) => (kept.has(t) ? t : fuzz(t)));
  for (const [c, re] of CLASSES) {
    const sp = spanOf(fz, re);
    if (!sp) continue;
    cls = c;
    verb = fz.slice(sp[0], sp[1]).join(" ");
    toks.splice(sp[0], sp[1] - sp[0]);
    break;
  }
  // "đọc sách" is a habit; "đọc 3 chương" or "đọc giáo trình" is a read.
  // a habit reads a book or paper ("đọc sách", "đọc báo"); "đọc lá thư" is one reading, not a habit
  if (cls === "read" && !(qty && READ_UNITS.has(qty.unit)) && !/\b(?:tai lieu|giao trinh|bai bao)\b/.test(str) && /\b(?:sach|truyen|bao|tieu thuyet|tap chi)\b/.test(str)) cls = "habit_read";
  if (!cls) {
    const gv = spanOf(fz, /\b(?:hoc|lam)\b/);
    if (gv) {
      verb = fz[gv[0]];
      toks.splice(gv[0], gv[1] - gv[0]);
    }
    if (qty?.unit === "slide") cls = "slides";
    else if (qty?.unit === "bai") cls = "homework";
  }
  // Words the rules don't know ("deploy kubernetes", "nộp thuế TNCN", a typo'd keyword): the on-device classifier, only when sure.
  if (!cls) cls = classify(title).cls;

  const lab = /\b(?:lab|thuc hanh)\b/.test(str) || undefined;
  if (lab) removeAll(toks, /\b(?:lab|thuc hanh)\b/);
  for (const [re] of STAKES) removeAll(toks, re);
  removeAll(toks, GROUP);
  removeAll(toks, HARD);

  const objects = toks.join(" ").split("|").map((s) => s.trim()).filter(Boolean);
  return { verb, objects, qty, domain: cls && DOMAIN[cls], cls, stakes, group, hard, ...(lab ? { lab } : {}) };
}
