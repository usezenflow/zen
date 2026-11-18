import { MAX_SESSION_DAYS, SLOT_MINUTES } from "../shared";
// S4 assemble, S5 relevance, S6 confidence: one clause to items. Pure.
import {
  classifyWorkload,
  detectArtifacts,
  type DetectedArtifacts,
  STUDENT_ABBREVIATIONS,
  WORKLOAD_CONFIGS,
  type WorkloadCategory,
} from "../shared";
import { termNow } from "../../dlu/season";
import { fold } from "./fold";
import { canonPhrases, canonToken } from "./en";
import {
  addDays,
  dayNo,
  daysInMonth,
  dowOf,
  inferYear,
  lengthMin,
  minutesOf,
  round15,
  stamp,
} from "./calendar";
import {
  CORRECTION,
  correctionOf,
  findMentions,
  LUNAR_CONTEXT,
  type Found,
  withPart,
  type Val,
  writtenYear,
} from "./mentions";
import { resolvePeriods } from "./periods";
import { holidayOf, isHolidayDate, nextLunar } from "./holidays";
import { roleOf, withinDays } from "./roles";
import { every, exceptSpans, ruleBase, thisWeekCount, weekSessions, withBounds } from "./rules";
import type { CalDay } from "./daypick";
import { bareTitle, partLeads, timeOnly, valueKinds, type Clause } from "./segment";
import {
  IN_PART,
  PART,
  PART_ALT,
  partRuns,
  runParts,
  type PartSpec,
} from "./parts";
import { seriesTexts } from "./series";
import { clockRun, normalizeWeekdays } from "./clocks";
import { activityPm } from "./implied";
import { defaultMinutes } from "../size";
import type {
  ReaderDropped,
  ReaderDropReason,
  ReaderItem,
  ReaderFlag,
  ReaderItemType,
  ReaderSource,
  ReaderWindow,
  ReaderWC,
} from "../shared";

export interface Ctx {
  ref: ReaderWC;
  source: ReaderSource;
  /** Place lines per section number, used when the clause itself names none. */
  sectionPlace: Map<number, string>;
  /** Note text per section number, or -1 for document level. */
  sectionNote?: Map<number, string>;
  /** Section gate from the hint and the numbered sections. */
  gate: (c: Clause) => "keep" | "not_mine" | "menu";
  /** The document asks the reader to prepare: a class or exam it mentions is a preparation task. Pasted or OCR text only. */
  prepCue: boolean;
  docTopic?: string;
  courseTitle?: string;
  meetingUrl?: string;
  clauses?: Clause[];
  /** The whole input, folded or raw: exam prep reads the requirements in all of it. */
  fullText?: string;
  /** The requirements of the whole input, read once on first use. */
  req?: Requirements;
  /** Course multiplier of prep tasks by folded course title, from the marks. */
  affinity?: Map<string, number>;
  /** The user's classes and exams by day: a guessed exam or class start skips the slots they hold. */
  calendar?: CalDay[];
  /** Fixed blocks this read has made so far, by day, in minutes: a second exam that day takes the next usual start. */
  taken?: { day: string; start: number; end: number }[];
}

/** Where an exam or a class usually starts, tried in order when no clock is said: the first free one in the said part wins. */
const SLOTS: Partial<Record<ReaderItemType, [number, number][]>> = {
  EXAM: [[7, 30], [9, 30], [13, 0], [15, 0]],
  LECTURE: [[7, 30], [13, 0], [16, 45]],
};
/** The minutes of the day a part of it holds, for picking a slot: "tối" takes the 16:45 evening class. */
const SLOT_PART: Record<string, [number, number]> = {
  EARLY_MORNING: [0, 720], DAWN: [0, 720], MORNING: [0, 720], NOON: [660, 840],
  AFTERNOON: [720, 1020], EVENING: [990, 1440], NIGHT: [990, 1440], MIDNIGHT: [1320, 1440],
};

export interface Out {
  items: ReaderItem[];
  dropped: ReaderDropped[];
}

const MAX_TITLE = 60;
const PRECHECK = 0.85;
/** Folded words a title drops: cues and actors, not what the item is. */
const CUES = new Set([
  "morning",
  "noon",
  "afternoon",
  "evening",
  "night",
  "hours",
  "hour",
  "nho",
  "vui",
  "long",
  "de",
  "hay",
  "phai",
  "se",
  "da",
  "tranh",
  "gian",
  "thoi",
  "sinh",
  "vien",
  "cac",
  "ban",
  "em",
  "truoc",
  "han",
  "chot",
  "den",
  "het",
  "luc",
  "thu",
  "chieu",
  "sang",
  "trua",
  "dem",
  "ngay",
  "trong",
  "la",
  "deadline",
  "dl",
  "ddl",
  "trc",
  "hom",
  "nay",
  "can",
  "giup",
  "toi",
  "tui",
  "minh",
  "nhe",
  "roi",
  "sau",
  "neu",
  "tu",
  "som",
  "rang",
  "khuya",
]);
/** The raw spellings of a cue whose folded form other words share. */
// A cue that shares its folded form with a real word lists its own spellings, so the other word stays ("đèn" is no "đến", "túi" no "tui",
// "nhẹ" no "nhé"); a cue with no such twin ("trước", "trưa") leaves in any spelling, a wrong tone too.
const CUE_SPELLING: Record<string, string[]> = {
  de: ["để", "de"], ban: ["bạn", "ban"], thu: ["thứ", "thu"], han: ["hạn", "han"], minh: ["mình"],
  nho: ["nhớ"], long: ["lòng", "long"], phai: ["phải", "phai"], se: ["sẽ", "se"], da: ["đã", "da"], tranh: ["tránh"],
  thoi: ["thời", "thoi"], vien: ["viên", "vien"], den: ["đến", "den"], het: ["hết", "het"], luc: ["lúc", "luc"],
  chieu: ["chiều", "chieu"], sang: ["sáng", "sang"], dem: ["đêm", "dem"], ngay: ["ngày", "ngay"], trong: ["trong"], la: ["là", "la"],
  hom: ["hôm", "hom"], nay: ["nay", "này"], can: ["cần", "can"], toi: ["tôi", "tối", "tới", "toi"], tui: ["tui"], nhe: ["nhé", "nhe"],
  roi: ["rồi", "roi"], sau: ["sau"], tu: ["từ", "tu"], rang: ["rằng", "rang"],
};
/** Folded words that make "từ" part of a compound (từ vựng, từ điển), not a cue. */
const TU_WORDS = new Set(["vung", "dien", "khoa"]);
/** Folded word pairs whose cue word is part of a name. */
// "bạn" after a verb is the object, not the pronoun: "gặp bạn", "hẹn bạn"
const KEEP_PAIRS = new Set([
  "kham da",
  "sang tay",
  // "em" after a verb is the person: "đón em", "chở em"; "giao ban" is the briefing; "đi đến" the going
  "don em",
  "cho em",
  "dua em",
  "goi em",
  "gap em",
  "day em",
  "kem em",
  "tham em",
  "giao ban",
  "di den",
  "sinh nhat",
  "kham rang",
  "gap ban",
  "hen ban",
  "goi ban",
]);
const EXPAND: Record<string, string> = {
  ktra: "kiểm tra",
  bt: "bài tập",
  dk: "đăng ký",
  hp: "học phần",
  nop: "nộp",
};
const ME = /\b(sinh vien|cac ban|cac em|ban|em|sv|moi nguoi|all)\b/;
const OTHER =
  /\b(cac don vi|don vi|nha truong|ban can su|bcs|tro ly ctsv|ban to chuc|btc)\b|^(hoi dong|gvhd|gvpb|gvcn|tinh doan|khoa)\s*:/;
const OPTIONAL = /\b(neu|co the|quan tam|tuy)\b/;
const MODAL = /\b(bat buoc|phai|vui long|de nghi|can|han chot|luu y)\b/;
const DUE =
  /\b(truoc|han|deadline|dl|ddl|den het|chot|cham nhat|muon nhat|tre nhat|kip|trc|het(?=\s+(?:hom|ngay|mai|mot|thu|chu|cn|t[2-7]|tuan|thang|nam|\d|noel|tet|giang sinh|le))|(?<!ngay\s)trong\s+tuan|hoan thanh|hoan thien|by|before|due)\b/;
const ASSIGN =
  /\b(bai\s*tap|bt|btl|bai\s*tap\s*lon|(?<!phong\s+)lab|bai\s*lab|assignment|asm|homework|hw|tieu\s*luan|tl|do\s*an|khoa\s*luan|kltn|datn)\b|(?:\b(?:bao\s*cao|bc)\s+(?:mon|hoc\s*phan|lab|thuc\s*tap)\b)|(?:\b(?:nop|submit)\s+(?:bai|bai\s*tap|bt|lab|bao\s*cao|bc|slide|do\s*an|tieu\s*luan|khoa\s*luan|kltn|form|ho\s*so|don)\b)|(?:\b(?:lam|viet)\s+(?:bai\s*tap|bt|lab|bc\s+mon|bao\s*cao\s+mon|tieu\s*luan|do\s*an|khoa\s*luan|kltn)\b)|(?:\b(?:gui|hoan\s*thien)\s+(?:bao\s*cao|bc)\b.*?\bgv(?:pb|hd)?\b)|(?:\b(?:bao\s*cao|bc)\s+(?!toan\s+(?:van|bo|dien|cuc)\b)(?:vat\s*ly|toan|hoa|tin|sinh|su|dia|van|triet|kinh\s*te|web|csdl|mang|cntt)\b)|(?:\b(?:dien\s+(?:vao\s+)?form|nop\s+form)\b)|(?:\ble\s*phi\b)/i;
// "kiểm tra" is an exam only with a course, a part-term, a period or a number ("kiểm tra lại app" is a task)
const EXAM =
  /(?<!\bsieu\s)\b(thi(?!\s+(?:truong|xa|tran|luc|giac|hieu|nghiem|hanh)\b)|ktra|van dap|trac nghiem)\b|\bkiem tra\b(?=.*\b(mon|giua ky|cuoi ky|phut|tiet)\b|.*\d)|\d.*\bkiem tra\b/;
// "3 tiết" is a length, not a class
const LECT =
  /\b(buoi hoc|buoi cuoi|hoc mon|(?<!\d\s?)tiet|lop hoc|lich hoc|hoc bu|lop bu|day bu)\b/;
/** The only classes that are items: a makeup class or one moved online, and only with a stated clock or periods. */
const MAKEUP = /\b(hoc bu|lop bu|day bu|online|truc tuyen)\b/;
const PERIODS = /\btiet\s*:?\s*\d/;
const CANCELLATION =
  /\b(buoi\s+nghi|nghi\s+hoc|nghi\s+day|bao\s+nghi|tam\s+nghi|nghi\s+giang|huy|khong\s+(?:hoc|di|hop|gap|lam|nop))\b/i;
const DNDCUE =
  /\b((?<!\d )hop(?!\s+sua)|gap|hoi thao|trao|le|sinh hoat|su kien|clb|cau lac bo|thi dau|meeting|sinh nhat|noel|tet|nghi le|giang sinh|lien hoan|tiec|party)\b/;
/** A presentation with a clock and no due cue: the prep task that comes before it. */
const PRESENTATION_PREP_MINUTES = 120;
/** A study verb before a test makes a task: "ôn thi", "luyện kiểm tra". */
const STUDY_EXAM =
  /\b(on|hoc|luyen|doc|chuan bi)\s+(?:tap\s+)?(?:thi|kiem tra|ktra)\b/;
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
/** Titles for an item whose text left only time words: a stable pick by a hash of the input. */
export const PLAYFUL_TITLES = [
  "Làm gì đó",
  "Việc bí ẩn",
  "Gì đó quan trọng, chắc vậy",
  "Nhiệm vụ chưa đặt tên",
  "Việc để mai tính",
  "Kèo chưa rõ",
] as const;
export function hashText(s: string): number {
  let h = 0x811c9dc5;
  for (const ch of s)
    h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  return h >>> 0;
}
/** Words that name a time, a day or a count, never a title on their own. */
const TIME_WORD_RE =
  /^(\d+([.:hg]\d*)?|mai|nay|hom|sang|chieu|toi|trua|dem|khuya|gio|h|g|phut|p|ngay|nua|tuan|thang|thu|tieng|sau|truoc|luc|muoi|mot|hai|ba|bon|tu|nam|bay|tam|chin|ruoi|kem|dung|t[2-7]|cn|chu|nhat|tren|sang|va|tai|toi|den|ky|cuoi|dau|giua|ruoi|tua|tuoi|bua|mot|hom|qua|mai)$/;
/** A day word in the clause: a clock beside it is a time, not a length. */
const LENGTH_DAY =
  /\b(mai|nay|hom|sang|chieu|toi|trua|dem|khuya|tuan|thang|ngay|thu|cn|chu nhat|t[2-7]|nam|nua)\b/;
/** Words that make the clock before them a time, not a length: "lúc 9h30", "trước 9h30". */
export const LENGTH_CUE =
  /(luc|vao|dung|khoang|tam|tu|sau|truoc|trc|den|hen)\s*$/;
/** Cues for a whole day with no clock. */
const ALL_DAY_CUE =
  /\b(sinh nhat|nghi le|noel|giang sinh|tet|ngay le|ky niem)\b/;
/** The BYDAY codes of a weekday and the others listed with it ("t2, t4, t6"), Monday first. */
const bydayOf = (v: { dow: number; more?: number[] }) =>
  [v.dow, ...(v.more ?? [])]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => BYDAY[d])
    .join(",");
/** "trước ngày X", "trc ngày X": the day the requirement is due by. Folded text; day, month, year groups. */
const TRUOC_NGAY =
  /\b(?:truoc|trc) ngay\s+(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?!\d)/g;
/** Cues that make a part of the day the deadline's clock before it. */
const BEFORE_CUE = /\b(truoc|trc|cham nhat|muon nhat|tre nhat|kip)\b/;
const PHRASE_CUE =
  /\b(trong gio hanh chinh|ngoai gio hoc|dau tien (?=(?:moi |hang |cua )?thang)|cuoi cung (?=(?:moi |hang |cua )?thang)|cham nhat|muon nhat|tre nhat|kip|(?<!(?:kham|danh|nho|nieng|tram|lam|tay|chua|boc|nhuc|dau) )rang sang|sang som|buoi trua|giua trua|(?<!(?:rua|lai|sua|dat|di) )xe chieu|cuoi gio chieu|dau gio (?:sang|chieu)|chieu toi|nua dem|trong (?:vong |khoang )?\d{1,3} ?(?:ngay|tuan|thang)|\d{1,3} (?:buoi|lan)|bat dau|keo dai|ket thuc(?=\s*:|\s+\d)|mat(?=\s+(?:khoang\s+|hon\s+|gan\s+|tam\s+)?\d)|tong cong|tong(?=\s+(?:khoang\s+|hon\s+|gan\s+|tam\s+)?\d)|in total|sau (?:bua|an) (?:trua|toi)|truoc khi ngu|sau khi thuc day|viec dau tien)\b/g;
/** Raw spans of the deadline cues and multi-word parts of the day in `text`: they are cues, not title words. */
function phraseCueSpans(text: string): [number, number][] {
  // a list of parts ("sáng/tối", "sáng hoặc tối") is a cue too, separators included
  const pf = fold(text);
  const listSpans = partRuns(pf.text)
    .filter((r) => r.tokens.length >= 2)
    .map((r): [number, number] => [
      pf.map[r.start] ?? 0,
      (pf.map[r.end - 1] ?? 0) + 1,
    ]);
  return [
    ...listSpans,
    ...[...pf.text.matchAll(PHRASE_CUE)].map((m): [number, number] => [
      pf.map[m.index ?? 0],
      pf.map[(m.index ?? 0) + m[0].length - 1] + 1,
    ]),
  ];
}
/** Folded words that open a task with no date and no clock: "mua sữa", "nộp bài". */
export const TASK_VERB =
  /^(mua|di|nop|lam|hoc|goi|viet|doc|don|rua|giat|nau|tap|gui|chay|soan|on|tim|dat|dong|tra|lay|ghi|xem|sua|in|uong|ngu|an|quet|cat|ve)(?![a-z])/;
/** Task words anywhere in a piece: "nhớ", "chuẩn bị", "mua quà", "nộp bài". A holiday or birthday with one is a task. */
const TASK_WORD = /\b(nho|nhac|chuan bi|mua|nop|lam|viet|gui|soan|on bai)\b/;

/**
 * A clock typed alone, read as its next occurrence: 1–6 as PM, 7–11 as AM unless PM is still
 * before 21:00, 12 as noon, any of 1–11 as PM after "ngủ" (bedtime), 0 as the day's last minute. `evening` (an evening
 * activity) reads 7–11 as PM too. `off` is the day offset.
 */
export function nextClock(
  h: number,
  mi: number,
  ref: ReaderWC,
  sleep: boolean,
  evening = false,
  until = false,
  wake = false,
): { h: number; mi: number; part?: string; off: number } {
  const now = (ref.h ?? 0) * 60 + (ref.mi ?? 0);
  const later = (hh: number) => (hh * 60 + mi > now ? 0 : 1);
  if (h === 0 && mi === 0) return { h: 23, mi: 59, part: "toi", off: 0 };
  // "chơi game tới 1h": staying up until a small hour is after midnight, not 13:00
  if (until && h >= 1 && h <= 4) return { h, mi, off: later(h) };
  if (h === 12) return { h, mi, part: "trua", off: later(12) };
  // "ngủ dậy lúc 6h", "báo thức 5h": waking is in the morning
  if (wake && h >= 1 && h <= 11) return { h, mi, part: "sang", off: later(h) };
  if (h === 0 || h > 12) return { h, mi, off: later(h) };
  // "đi ngủ lúc 11h" is bedtime, never 11:00 in the morning
  if (h <= 6 || evening || sleep)
    return { h: h + 12, mi, part: "toi", off: later(h + 12) };
  if (later(h) === 0) return { h, mi, part: "sang", off: 0 };
  const pm = h + 12;
  if (later(pm) === 0 && (pm <= 21 || sleep))
    return { h: pm, mi, part: "toi", off: 0 };
  return { h, mi, part: "sang", off: 1 };
}

/** Parenthesised text blanked to spaces: offsets stay put, and "(xem lịch)" never reads as a date. */
export function blankParens(s: string): string {
  // a group with a digit may hold a date: it stays
  return s.replace(/\([^()]*\)/g, (m) =>
    /\d/.test(m) ? m : " ".repeat(m.length),
  );
}

/** Returns true if a title candidate is boilerplate (e.g. "Khi ban hành thông báo", "Thời gian thực hiện"). */
export function isBoilerplateTitle(s: string): boolean {
  const f = fold(s).text.trim();
  if (!f) return true;
  // who acts, not what: "Nhóm trưởng chịu trách nhiệm", "mỗi nhóm"
  if (/\b(chiu trach nhiem|nhom truong|moi nhom)\b/.test(f)) return true;
  if (/^(khi|ke tu khi|tu khi)\s+(?:ban\s+)?hanh\b/i.test(f)) return true;
  if (/^(thoi gian|thoi han)\s+thuc\s+hien\b/i.test(f)) return true;
  if (/^(thoi gian|thoi han|ngay|gio|lich|han chot|deadline)$/i.test(f))
    return true;
  if (/^(?:mot\s+so\s+)?(?:moc|thoi gian)\s+(?:can\s+)?luu\s+y\b/i.test(f))
    return true;
  if (
    /^(?:gui|chao|than\s+gui|kinh\s+gui)\s+(?:cac\s+)?(?:ban|em|sv|sinh\s+vien)\b/i.test(
      f,
    )
  )
    return true;
  return false;
}

const ANNOUNCEMENT_TOPIC_RE =
  /(?:thong\s*bao\b[^\n,.;]*?\bve\s+(?:viec\s+)?|(?:\bve\s+viec|\bv\/v)\s+)([^,.;\n]+)/i;

/** Extracts announcement topic, e.g. "thông báo... về việc cập nhật thông tin khám sức khỏe" -> "Cập nhật thông tin khám sức khỏe". */
export function findAnnouncementTopic(clauses: Clause[]): string | undefined {
  for (const c of clauses) {
    if (c.hint) continue;
    const f = fold(c.text);
    const m = f.text.match(ANNOUNCEMENT_TOPIC_RE);
    if (!m || m.index === undefined || !m[1]) continue;
    const g1 = m[1].trim();
    if (!g1) continue;
    const g1IdxInMatch = m[0].lastIndexOf(m[1]);
    const g1StartInFold = m.index + g1IdxInMatch;
    const g1EndInFold = g1StartInFold + m[1].length;
    const rawStart = f.map[g1StartInFold];
    const rawEnd = f.map[g1EndInFold - 1] + 1;
    let rawTopic = c.text.slice(rawStart, rawEnd).trim();
    rawTopic = rawTopic
      .replace(/^[–\-:;,.\s]+|[–\-:;,.\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!rawTopic) continue;
    rawTopic = rawTopic.charAt(0).toUpperCase() + rawTopic.slice(1);
    return shorten(rawTopic, MAX_TITLE);
  }
  return undefined;
}

/** Extracts course title from clauses, e.g. "Môn: Kiểm thử phần mềm (20CT3206)" -> "Kiểm thử phần mềm". */
export function findCourseTitle(clauses?: Clause[]): string | undefined {
  if (!clauses) return undefined;
  for (const c of clauses) {
    const raw = c.text;
    const m = raw.match(
      // a whole word: "mong" is not "môn"
      /\b(?:môn|mon|học phần|hoc phan)(?![\p{L}])\s*:?\s*([^,;:!?\n()]+)/iu,
    );
    if (m && m[1].trim()) {
      // "học bù môn web thứ 6 8h": the name ends where the day or clock begins
      const from = (m.index ?? 0) + m[0].length - m[1].length;
      const when = findMentions(raw).find(
        (x) => (x.kind === "date" || x.kind === "time") && x.start >= from,
      );
      let candidate = (when ? raw.slice(from, when.start) : m[1]).trim();
      if (candidate) {
        candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);
        return shorten(candidate, MAX_TITLE);
      }
    }
    const cm = findMentions(raw).find((x) => x.kind === "course");
    if (cm && cm.v.k === "course") {
      let candidate = cm.v.text
        .replace(/^(?:môn|mon|học phần|hoc phan)\s*:?\s*/i, "")
        .trim();
      if (candidate) {
        candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);
        return shorten(candidate, MAX_TITLE);
      }
    }
  }
  return undefined;
}

/** A title from the words of `text` that no span covers, minus cues. `tail` when nothing is left. */
/** Part-of-day words, and the verbs that take one as their object: "ăn trưa", "ngủ trưa". */
const PART_KEYS = new Set(["sang", "trua", "chieu", "toi", "dem"]);
const VERB_BEFORE = new Set(["an", "ngu"]);

/** Filler words before a command: "ờ tạo", "ừm nhắc". */
const LEAD_FILLER = new Set(["o", "u", "um", "uh", "a"]);
/** Leading command phrases as folded keys, longest first: "tạo ra", "nhắc tôi", "remind me to". */
const LEAD_PHRASES: string[][] = [
  ["tao", "lich", "co", "dinh"],
  ["tao", "lich"],
  ["remind", "me", "to"],
  ["i", "need", "to"],
  ["i", "have", "to"],
  ["set", "up"],
  ["remind", "me"],
  ["tao", "ra"],
  ["dat", "lich"],
  ["len", "lich"],
  ["xep", "lich"],
  ["lap", "lich"],
  ["ghi", "chu"],
  ["ghi", "lai"],
  ["nhac", "toi"],
  ["nhac", "minh"],
  ["nhac", "em"],
  ["giup", "toi"],
  ["giup", "minh"],
  ["cho", "toi"],
  ["cho", "minh"],
  ["toi", "muon"],
  ["minh", "muon"],
  ["toi", "can"],
  ["minh", "can"],
  ["em", "can"],
  ["tao"],
  ["them"],
  ["dat"],
  ["nhac"],
  ["hay"],
  ["add"],
  ["create"],
  ["schedule"],
].sort((a, b) => b.length - a.length);
/**
 * Edge words, matched on the lowercased raw word with its diacritics: "tới" (until) is a leftover, "tối"
 * ("ăn tối") is part of the title. Unaccented spellings count only when no accented word shares them
 * ("voi", "luc"; never "toi", which is both "tối" and "tới"). Leftovers of a removed date, time or place.
 */
const TRAIL_WORDS = new Set([
  "và",
  "với",
  "hoặc",
  "rồi",
  "vào",
  "lúc",
  "tại",
  "ở",
  "từ",
  "đến",
  "tới",
  "trong",
  "trước",
  "sau",
  "khi",
  "hôm",
  "ngày",
  "buổi",
  "đi",
  "là",
  "thì",
  "va",
  "voi",
  "hoac",
  "roi",
  "vao",
  "luc",
  "tai",
  "o",
  "truoc",
  "hom",
  "ngay",
  "buoi",
  "and",
  "or",
  "at",
  "on",
  "in",
  "by",
  "for",
  "to",
  "from",
  "the",
  "of",
  "with",
  "until",
  "before",
  "after",
]);
/** Sentence particles, compared raw: "nha" alone is the house "nhà". */
const TRAIL_PARTICLES = new Set(["nhé", "nhá", "nhe", "nhen", "nghen", "ạ"]);
/** Help and filler complements at the edge: "giúp", "giùm", "hộ", "cái", "coi", "đi" (raw, as TRAIL_WORDS). */
const TRAIL_COMPLEMENTS = new Set(["giúp", "giùm", "dùm", "hộ", "cái", "coi", "đi", "giup", "gium", "dum", "ho", "cai", "di"]);
/** Words that open a title only as a join of two parts: "còn" (not the noun "Con"), "xong". Raw, like TRAIL_WORDS. */
const LEAD_CONNECTORS = new Set([
  "đó",
  "do",
  "và",
  "với",
  "hoặc",
  "rồi",
  "còn",
  "xong",
  "va",
  "voi",
  "hoac",
  "roi",
  "at",
  "and",
  "or",
]);
/** Range bound words between two clocks: "sau 17h trước 22h", "đến trước 11h". Folded. */
const RANGE_BOUND =
  /(?<![a-z])(?:truoc|trc|sau|cham nhat|muon nhat|tre nhat)(?![a-z])/g;

/** Time fillers: "tí", "lát", "chút" ("a moment"). A filler is dropped only before a verb, so "lát bánh mì" and "Tí" stay. */
const TIME_FILLER = new Set(["ti", "ty", "lat", "chut", "xiu", "teo"]);
const DE_PRONOUN = new Set(["c", "co", "chi", "thay", "ca", "anh", "em"]);
/** Verbs a time filler leads: "tí về cho gà ăn", "lát nữa họp". "đi" is left out: "Tí đi học" is a name. */
const FILLER_VERBS = new Set("cho goi nhan lam an uong tuoi do don dua mua nau hoc hop gui nop viet don giat tam ngu tap choi doc rua lau quet chay nghe xem tra mo dong khoa bat tat kiem nhac".split(" "));

/** The index after a time filler at `j` with its "nữa" and "về|xong|rảnh", or `j` when none leads a verb. */
function timeFillerEnd(keys: string[], j: number): number {
  if (!TIME_FILLER.has(keys[j] ?? "")) return j;
  let k = j + 1;
  if (keys[k] === "nua") k++;
  if (["ve", "xong", "ranh"].includes(keys[k] ?? "")) return k + 1;
  return k > j + 1 || FILLER_VERBS.has(keys[k] ?? "") ? k : j;
}

/** The text opens with a time filler that leads a verb ("tí nữa nộp báo cáo", "lát về tưới cây"); "gặp Tí" and "lát bánh mì" do not. */
export function leadsFiller(text: string): boolean {
  const k = [...fold(text).text.matchAll(/\S+/g)].map((w) => w[0].replace(/[^a-z0-9]/g, ""));
  let j = 0;
  while (LEAD_FILLER.has(k[j] ?? "")) j++;
  return timeFillerEnd(k, j) > j;
}

/** Later today: after now, due at the end of the day, no day or clock said. */
export function laterToday(it: ReaderItem, ref: ReaderWC): void {
  if ((it.type !== "PLAN" && it.type !== "ASSIGNMENT") || it.startsAt || it.rrule) return;
  it.notBefore = stamp(ref, ref.h ?? 0, ref.mi ?? 0);
  it.deadline = stamp(ref, 23, 59);
  delete it.windows;
  it.inferred = [...new Set([...it.inferred, "deadline"])];
}

/** How many leading tokens are a filler and a command phrase, with the filler "cái" after it. */
function leadSkip(keys: string[]): number {
  let j = 0;
  while (LEAD_FILLER.has(keys[j] ?? "")) j++;
  const timed = timeFillerEnd(keys, j);
  if (timed > j) return timed;
  // "để c sửa báo cáo": the lead to the teacher or a friend, before the verb
  if (keys[j] === "de" && DE_PRONOUN.has(keys[j + 1] ?? "")) return j + 2;
  for (const p of LEAD_PHRASES) {
    if (!p.every((w, k) => keys[j + k] === w)) continue;
    const end = j + p.length;
    // "đặt vé xe", "đặt phòng": the verb books the thing, it is the task and not a command to the app
    if (
      p.length === 1 &&
      p[0] === "dat" &&
      /^(ve|phong|ban|hang|xe|do|com|tra|coc|tiec|cho|sach|banh|hoa|tour|khach|san|grab|taxi|mon)$/.test(
        keys[end] ?? "",
      )
    )
      return j;
    return keys[end] === "cai" ? end + 1 : end;
  }
  return 0;
}
/** A sound made before the task, with its mark so "Ô tô" keeps its word: "à họp nhóm", "ok họp nhóm". */
const LEAD_SOUND = /^(?:à|ờ|ừ|ừm|ờm|ơ|ok|oke|okay|okie)$/;

/** The title words with its leftover connectors and trailing cues removed from both ends. */
function edgesOf(kept: string[]): string {
  const arr = [...kept];
  const raw = (x: string) => x.toLowerCase().normalize("NFC");
  for (;;) {
    const last = arr.at(-1);
    if (last === undefined) break;
    // "nhé1": a particle with a stray digit; "thi thử" keeps its "thử". Unaccented "nha" is left out: it is also "nhà" (the house) typed without marks
    if (TRAIL_WORDS.has(raw(last)) || TRAIL_PARTICLES.has(raw(last).replace(/\d+$/, "")) || TRAIL_COMPLEMENTS.has(raw(last))) arr.pop();
    // "giúp mình" is one complement: "tưới cây giúp mình"
    else if (["mình", "minh"].includes(raw(last)) && ["giúp", "giup", "giùm", "dùm"].includes(raw(arr[arr.length - 2] ?? ""))) arr.length -= 2;
    else if (raw(last) === "thử" && raw(arr[arr.length - 2] ?? "") !== "thi") arr.pop();
    else if (
      arr.length >= 2 &&
      raw(arr[arr.length - 2]) === "với" &&
      raw(last) === "lại"
    )
      arr.length -= 2;
    else break;
  }
  while (arr.length && LEAD_CONNECTORS.has(raw(arr[0]))) arr.shift();
  return arr.join(" ").replace(/\s+/g, " ").trim();
}

function titleOf(
  text0: string,
  spans: [number, number][],
  tail: string,
): string {
  // a multi-word term is one token before the words around it are read as cues: "check in" is "Check-in"
  const text = canonPhrases(text0);
  const toks = [...text.matchAll(/\S+/g)];
  const keys = toks.map((w) => fold(w[0]).text.replace(/[^a-z0-9]/g, ""));
  const sound = toks.length > 1 && LEAD_SOUND.test(toks[0][0].toLowerCase().normalize("NFC").replace(/[,.!]+$/, "")) ? 1 : 0;
  const lead = leadSkip(keys) || sound;
  // the words from token `from` on, with the cues and spans removed
  const build = (from: number): string[] => {
    const kept: string[] = [];
    for (const [i, w] of toks.entries()) {
      if (i < from) continue;
      const s = w.index ?? 0;
      const e = s + w[0].length;
      if (spans.some(([a, b]) => s < b && e > a)) continue;
      // "@All", "@Lan": the people the message is for, never the task
      if (w[0].startsWith("@")) continue;
      // "để c sửa": the pronoun after the cue "để" is the speaker's address to the reader, not the task
      if (keys[i - 1] === "de" && DE_PRONOUN.has(keys[i])) continue;
      const key = keys[i];
      // "hạn nộp 20/11": the cue pair is the deadline, not a verb to keep
      if (
        key === "han" &&
        keys[i + 1] === "nop" &&
        /\d/.test(toks[i + 2]?.[0] ?? "")
      )
        continue;
      if (
        key === "nop" &&
        keys[i - 1] === "han" &&
        /\d/.test(toks[i + 1]?.[0] ?? "")
      )
        continue;
      // shorthand keeps its diacritics ("đa" is đồ án, "đã" is a cue), so it is matched raw
      const raw = w[0].toLowerCase().replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, "");
      if (Object.hasOwn(STUDENT_ABBREVIATIONS, raw)) {
        kept.push(STUDENT_ABBREVIATIONS[raw]);
        continue;
      }
      // "từ" is a cue ("từ thứ hai") except inside a word like "từ vựng"
      const isBanHanh = key === "ban" && keys[i + 1] === "hanh";
      // "sinh nhật", "khám răng": the cue word is the name
      const inName =
        KEEP_PAIRS.has(`${key} ${keys[i + 1] ?? ""}`) ||
        KEEP_PAIRS.has(`${keys[i - 1] ?? ""} ${key}`);
      // a part-of-day word right after a verb is the activity's name: "ăn trưa", "ngủ trưa"
      const partAfterVerb =
        PART_KEYS.has(key) && VERB_BEFORE.has(keys[i - 1] ?? "");
      if (
        !key ||
        (CUES.has(key) &&
          !partAfterVerb &&
          raw !== "đá" &&
          raw !== "đà" &&
          // "da bong" typed with no marks is "đá bóng", not the cue "đã"
          !(raw === "da" && /^(?:bong|banh|cau)$/.test(keys[i + 1] ?? "")) &&
          !inName &&
          !(key === "tu" && TU_WORDS.has(keys[i + 1] ?? "")) &&
          // a marked word that only folds to a cue stays: "đề cương" is no "để", "bán hàng" no "bạn", "thi thử" no "thứ"
          !(Object.hasOwn(CUE_SPELLING, key) && !CUE_SPELLING[key].includes(raw)) &&
          // "rửa chén sau khi ăn" keeps its "sau khi"
          !(key === "sau" && keys[i + 1] === "khi") &&
          !isBanHanh)
      )
        continue;
      kept.push(canonToken(EXPAND[key] ?? w[0].replace(/^[:;,.\-–]+|[:;,.\-–]+$/g, "")));
    }
    return kept;
  };
  let t = edgesOf(build(lead));
  // a title is never emptied by its command: the words of the whole text stand
  if (!t) t = edgesOf(build(0));
  t = canonPhrases(t);
  // "ở nhà học": the home is where the task is done, so it ends the title: "Học ở nhà"
  const ws = t.split(" ");
  if (
    ws.length > 2 &&
    ["o", "tai"].includes(fold(ws[0]).text) &&
    fold(ws[1]).text === "nha"
  )
    t = [...ws.slice(2), ws[0], ws[1]].join(" ");
  if (!t || isBoilerplateTitle(t)) t = tail;
  // a first word with its own capital is a term's form ("iOS", "TikTok"): it keeps it
  if (!/\p{Lu}/u.test(t.split(" ")[0].slice(1))) t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length <= 60) return t;
  const cut = t.slice(0, 60);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).trim();
}

/** `t` cut at a word boundary to at most `max` characters. */
function shorten(t: string, max: number): string {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).trim();
}

/** Remaps institutional hand-offs to student agency actions. Submissions are the student's own action and stay. */
export function remapInstitutionalTitle(
  title: string,
  isFixed = false,
): string {
  const f = fold(title).text.toLowerCase();
  // Fixed events (e.g. at 9pm or with a fixed clock) are the presentation/defense session itself.
  if (isFixed || /\b(nop|gui|submit)\b/.test(f)) return title.trim();
  // a title led by a task verb is the student's own work: "Viết báo cáo đồ án" keeps its noun
  if (
    TASK_VERB.test(f.trimStart()) ||
    /^hoan thien(?![a-z])/.test(f.trimStart())
  )
    return title.trim();
  // Bảo vệ đồ án / bảo vệ khóa luận / bảo vệ
  if (/(?:^|\s)bao\s+ve(?:\s+do\s+an|\s+khoa\s+luan)?(?:\s|$)/i.test(f)) {
    return title
      .replace(/(?:^|\s+)(?:bảo vệ|bao ve)(?:\s+|$)/i, (m) =>
        m.startsWith(" ") ? " Chuẩn bị bảo vệ " : "Chuẩn bị bảo vệ ",
      )
      .trim();
  }
  // Báo cáo tiến độ / Báo cáo đồ án
  if (
    /(?:^|\s)bao\s+cao\s+(?:tien\s+do|do\s+an)(?:\s|$)/i.test(f) ||
    /^(?:báo cáo|bao cao)(?:\s|$)/i.test(title.trim())
  ) {
    return title
      .replace(/(?:^|\s+)(?:báo cáo|bao cao)(?:\s+|$)/i, (m) =>
        m.startsWith(" ") ? " Chuẩn bị báo cáo " : "Chuẩn bị báo cáo ",
      )
      .trim();
  }
  // Thuyết trình
  if (/(?:^|\s)thuyet\s+trinh(?:\s|$)/i.test(f)) {
    return title
      .replace(/(?:^|\s+)(?:thuyết trình|thuyet trinh)(?:\s+|$)/i, (m) =>
        m.startsWith(" ")
          ? " Chuẩn bị thuyết trình "
          : "Chuẩn bị thuyết trình ",
      )
      .trim();
  }
  return title.trim();
}

/**
 * Multiplier of the course a prep text names: the longest folded course title it contains, else 1.
 * `affinity` keys are folded course titles.
 */
export function affinityOf(
  affinity: Map<string, number> | undefined,
  text: string,
): number {
  if (!affinity) return 1;
  const f = ` ${fold(text).text} `;
  let best: [number, number] | undefined;
  for (const [course, mult] of affinity)
    if (
      course &&
      f.includes(` ${course} `) &&
      (!best || course.length > best[0])
    )
      best = [course.length, mult];
  return best?.[1] ?? 1;
}

/**
 * Length of an inferred prep task: the base, scaled by the days left against the category's lead days
 * and by the course affinity (low marks and retakes read above 1), rounded to 30 minutes, never under an hour.
 */
export function prepMinutes(
  base: number,
  leadDays: number,
  due: ReaderWC,
  ref: ReaderWC,
  affinity = 1,
): number {
  const left = Math.min(1, (dayNo(due) - dayNo(ref)) / leadDays);
  return Math.max(
    60,
    Math.round((base * left * affinity) / SLOT_MINUTES) * SLOT_MINUTES,
  );
}

/** The words of `text` that no span covers, with their edge punctuation cut. */
function evidenceOf(text: string, spans: [number, number][]): string {
  return [...text.matchAll(/\S+/g)]
    .filter((w) => {
      const s = w.index ?? 0;
      const e = s + w[0].length;
      return !spans.some(([a, b]) => s < b && e > a);
    })
    .map((w) => w[0].replace(/^[:;,.\-–]+|[:;,.\-–]+$/g, ""))
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** The first link in a text, whole: its query stays ("view.php?id=123"), the sentence punctuation after it goes. */
export const firstUrl = (s: string) =>
  s.match(/https?:?\/\/\S+/)?.[0].replace(/[.,;!?)]+$/, "");

export interface Requirements {
  art: DetectedArtifacts;
  /** Every "trước ngày X" date in the input, earliest first. */
  dues: ReaderWC[];
  /** A day range next to an evaluation word: a window to prepare for. */
  window: boolean;
}

/** The requirements of a whole input, its artifacts counted only from this clause and the pieces with no date or clock of their own. */
function ownReq(all: Requirements, full: string | undefined, raw: string, ref: ReaderWC): Requirements {
  if (!full) return all;
  const pieces = full.split(/\s*[,;\n]\s*|\s+(?:và|va|and)\s+/i).filter((x) => x && (raw.includes(x) || new RegExp(TRUOC_NGAY.source).test(fold(x).text) || !findMentions(x).some((m) => m.kind === "date" || m.kind === "time")));
  return { ...all, art: detectArtifacts(pieces.join(", ") || raw) };
}

export function requirementsOf(full: string, ref: ReaderWC): Requirements {
  const dues = [...fold(full).text.matchAll(TRUOC_NGAY)]
    .map((m) => ({
      y: m[3]
        ? m[3].length === 2
          ? 2000 + +m[3]
          : +m[3]
        : inferYear(+m[2], +m[1], ref),
      m: +m[2],
      d: +m[1],
    }))
    .sort((a, b) => dayNo(a) - dayNo(b));
  const f = fold(full).text;
  const window =
    /\d{1,2}\s*(?:-|den|toi)\s*\d{1,2}[/.-]\d{1,2}/.test(f) &&
    /\b(thi|bao ve|van dap|lich bao cao|hoi dong|phong van)\b/.test(f);
  return { art: detectArtifacts(full), dues, window };
}

interface ExamWindow {
  title: string;
  /** "YYYY-MM-DD HH:mm" when the window opens. */
  at: string;
  day: ReaderWC;
  evidence: string;
}

/**
 * Prep tasks for an exam window, from the requirements the whole input names. Report and slides are due before
 * the window, a defense at its start. With none named, one prep task sized by the exam's category.
 */
/** A window's own title names it unless it is a schedule sentence: one led by an actor ("nhóm", "các", "thầy") is no name. */
const windowTitle = (t: string) => {
  const s = t
    .replace(/^Chuẩn bị\s+/, "")
    .replace(/^Lịch\s+(?:báo cáo|bảo vệ|thi|vấn đáp)\b\s*/i, "")
    .trim();
  return /^(?:nhóm|các|mỗi|thầy|cô|sinh viên|sv)(?:\s|$)/i.test(s)
    ? ""
    : s.charAt(0).toUpperCase() + s.slice(1);
};

export function examPreps(
  w: ExamWindow,
  ref: ReaderWC,
  req: Requirements,
  affinity?: Map<string, number>,
): ReaderItem[] {
  const { art, dues } = req;
  const mult = affinityOf(affinity, `${w.title} ${w.evidence}`);
  const clamp = (d: ReaderWC) => (dayNo(d) < dayNo(ref) ? ref : d);
  const eveDay = clamp(addDays(w.day, -1));
  const reportDay = dues[0] ? clamp(addDays(dues[0], -1)) : eveDay;
  const out: ReaderItem[] = [];
  const add = (
    label: string,
    cat: WorkloadCategory,
    deadline: string,
    due: ReaderWC,
  ) =>
    out.push({
      type: "PLAN",
      title: w.title ? shorten(`${label}: ${w.title}`, MAX_TITLE) : label,
      note: null,
      prep: true,
      deadline,
      durationMinutes: prepMinutes(
        WORKLOAD_CONFIGS[cat].baseMinutes,
        WORKLOAD_CONFIGS[cat].leadDaysMin,
        due,
        ref,
        mult,
      ),
      confidence: 0.8,
      inferred: ["durationMinutes"],
      flags: [],
      alternatives: [],
      evidence: w.evidence.trim().slice(0, 300),
      checked: false,
    });
  if (art.report)
    add("Viết báo cáo", "REPORT", stamp(reportDay, 23, 59), reportDay);
  if (art.slides) add("Soạn slide", "SLIDES", stamp(eveDay, 23, 59), eveDay);
  if (art.defense) add("Chuẩn bị vấn đáp", "INTERVIEW", w.at, w.day);
  if (!out.length)
    add(
      "Ôn tập",
      classifyWorkload(`${w.title} ${w.evidence}`) === "MIDTERM"
        ? "MIDTERM"
        : "FINAL_EXAM",
      w.at,
      w.day,
    );
  return out;
}

const words = (s: string) => s.split(" ").filter(Boolean).length;

interface DateRes {
  wc: ReaderWC;
  how: "explicit" | "short" | "rel" | "inherit";
  /** A written day past its month's end ("31/11"), read as the month's last day. */
  clamped?: boolean;
  /** The clock of the day when the phrase sets one: "2 tiếng nữa". */
  clock?: [number, number];
}

/** The Monday of the week `ref` is in. */
const mondayOf = (ref: ReaderWC): ReaderWC =>
  addDays(ref, -((dowOf(ref.y, ref.m, ref.d) + 6) % 7));

/** The days a span phrase covers: a week or month part, or a week from its offset. Null for anything else. */
export function spanOf(
  v: Val,
  ref: ReaderWC,
): { from: ReaderWC; to: ReaderWC } | null {
  const mon = mondayOf(ref);
  if (v.k === "week" && v.off >= 1)
    return { from: addDays(mon, 7 * v.off), to: addDays(mon, 7 * v.off + 6) };
  if (v.k !== "span") return null;
  const ny = ref.m === 12 ? ref.y + 1 : ref.y;
  const nm = ref.m === 12 ? 1 : ref.m + 1;
  const nextDay = (d: number): ReaderWC => ({ y: ny, m: nm, d });
  const thisDay = (d: number): ReaderWC => ({ y: ref.y, m: ref.m, d });
  // a span that already started begins today
  const notPast = (w: ReaderWC) => (dayNo(w) < dayNo(ref) ? ref : w);
  switch (v.key) {
    case "dau_tuan_sau":
      return { from: addDays(mon, 7), to: addDays(mon, 8) };
    case "giua_tuan_sau":
      return { from: addDays(mon, 9), to: addDays(mon, 10) };
    case "cuoi_tuan_sau":
      return { from: addDays(mon, 12), to: addDays(mon, 13) };
    case "cuoi_tuan":
      return { from: notPast(addDays(mon, 5)), to: addDays(mon, 6) };
    case "thang_sau":
      return { from: nextDay(1), to: nextDay(daysInMonth(ny, nm)) };
    case "dau_thang_sau":
      return { from: nextDay(1), to: nextDay(10) };
    case "giua_thang_sau":
      return { from: nextDay(11), to: nextDay(20) };
    case "cuoi_thang_sau":
      return { from: nextDay(21), to: nextDay(daysInMonth(ny, nm)) };
    case "cuoi_thang":
      return {
        from: notPast(thisDay(21)),
        to: thisDay(daysInMonth(ref.y, ref.m)),
      };
    case "nam_nay":
      return { from: notPast(ref), to: { y: ref.y, m: 12, d: 31 } };
    case "quy_nay": {
      const qEnd = Math.ceil(ref.m / 3) * 3;
      return {
        from: notPast(ref),
        to: { y: ref.y, m: qEnd, d: daysInMonth(ref.y, qEnd) },
      };
    }
    case "quy_sau": {
      // the quarter after this one: its first day to its last
      const sm = Math.ceil(ref.m / 3) * 3 + 1;
      const y = sm > 12 ? ref.y + 1 : ref.y;
      const m = sm > 12 ? 1 : sm;
      return { from: { y, m, d: 1 }, to: { y, m: m + 2, d: daysInMonth(y, m + 2) } };
    }
    case "hoc_ky_nay": {
      // the term holding now: its end is the next term's start (exclusive), so the last day is the day before
      const term = termNow(Date.UTC(ref.y, ref.m - 1, ref.d, ref.h ?? 0, ref.mi ?? 0) - 7 * 3_600_000);
      const [y, m, d] = term.end.split("-").map(Number);
      return { from: notPast(ref), to: addDays({ y, m, d }, -1) };
    }
    case "cuoi_nam":
      return {
        from: notPast({ y: ref.y, m: 12, d: 21 }),
        to: { y: ref.y, m: 12, d: 31 },
      };
    case "dau_nam_sau":
      return {
        from: { y: ref.y + 1, m: 1, d: 1 },
        to: { y: ref.y + 1, m: 1, d: 10 },
      };
    case "nam_sau":
      return { from: { y: ref.y + 1, m: 1, d: 1 }, to: { y: ref.y + 1, m: 12, d: 31 } };
    case "cuoi_nam_sau":
      return {
        from: { y: ref.y + 1, m: 12, d: 21 },
        to: { y: ref.y + 1, m: 12, d: 31 },
      };
    default: {
      // "đầu/giữa/cuối/trong tháng 12", "quý 1": the days of that part, from today when it has started
      // "trong tháng 12": the whole month
      const part = /^(dau|giua|cuoi|trong)_thang_(\d{1,2})$/.exec(v.key);
      if (part) {
        const m = +part[2];
        const [d1, d2] =
          part[1] === "trong"
            ? [1, 31]
            : part[1] === "dau"
            ? [1, 10]
            : part[1] === "giua"
              ? [11, 20]
              : [21, 31];
        const end = (y: number): ReaderWC => ({
          y,
          m,
          d: Math.min(d2, daysInMonth(y, m)),
        });
        const y = dayNo(end(ref.y)) < dayNo(ref) ? ref.y + 1 : ref.y;
        return { from: notPast({ y, m, d: d1 }), to: end(y) };
      }
      const q = /^quy_([1-4])$/.exec(v.key);
      if (q) {
        const m1 = 3 * (+q[1] - 1) + 1;
        const end = (y: number): ReaderWC => ({
          y,
          m: m1 + 2,
          d: daysInMonth(y, m1 + 2),
        });
        const y = dayNo(end(ref.y)) < dayNo(ref) ? ref.y + 1 : ref.y;
        return { from: notPast({ y, m: m1, d: 1 }), to: end(y) };
      }
      // "tuan_2_thang_12": days 8 to 14 of that month, in this year or the next
      const w = /^tuan_(\d)_thang_(\d{1,2})$/.exec(v.key);
      if (!w) return null;
      const y = +w[2] < ref.m ? ref.y + 1 : ref.y;
      const m = +w[2];
      const from = 1 + (+w[1] - 1) * 7;
      return {
        from: { y, m, d: from },
        to: { y, m, d: Math.min(from + 6, daysInMonth(y, m)) },
      };
    }
  }
}

export function resolveDate(f: Found, ref: ReaderWC): DateRes | null {
  const v = f.v;
  if (v.k === "date") {
    // a day past the month's end is its last day: "31/11" is 30/11
    // a written year is kept however far; a past one is flagged date_past
    const wy =
      v.form === "full" || (v.form === "long" && v.y)
        ? writtenYear(v.y as number)
        : undefined;
    if (wy !== undefined) {
      return {
        wc: { y: wy, m: v.m, d: Math.min(v.d, daysInMonth(wy, v.m)) },
        how: "explicit",
        ...(v.d > daysInMonth(wy, v.m) && { clamped: true }),
      };
    }
    const y = inferYear(v.m, v.d, ref);
    return {
      wc: { y, m: v.m, d: Math.min(v.d, daysInMonth(y, v.m)) },
      how: "short",
      ...(v.d > daysInMonth(y, v.m) && { clamped: true }),
    };
  }
  // a holiday name: its date in the shared calendar, next occurrence from ref (holidays.ts)
  if (v.k === "holiday") {
    const wc = holidayOf(v.phrase, ref);
    return wc ? { wc, how: "short" } : null;
  }
  if (v.k === "lunar") {
    const wc = nextLunar(v.m, v.d, ref);
    return wc ? { wc, how: "short" } : null;
  }
  // "ngày 20", "mùng 5": this month while the day is still to come, else the next month that has it ("ngày 31" in November is 31/12)
  if (v.k === "dom") {
    let y = ref.y;
    let m = ref.m;
    for (let k = 0; k < 12 && (v.d < (k ? 1 : (ref.d ?? 0)) || v.d > daysInMonth(y, m)); k++) {
      m = m === 12 ? 1 : m + 1;
      if (m === 1) y += 1;
    }
    return { wc: { y, m, d: Math.min(v.d, daysInMonth(y, m)) }, how: "short" };
  }
  // "hôm qua" reads as today; a clock already past rolls it on in the clause
  // between 0:00 and 4:00 "mai" still means the night just begun: today, and "mốt" the day after it
  if (v.k === "rel" && v.months) {
    const t = ref.m - 1 + v.months;
    const y = ref.y + Math.floor(t / 12);
    const m = (t % 12) + 1;
    return { wc: { y, m, d: Math.min(ref.d, daysInMonth(y, m)) }, how: "rel" };
  }
  if (v.k === "rel")
    return {
      wc: addDays(
        ref,
        (v.off === 1 || v.off === 2) && (ref.h ?? 0) < 4 ? v.off - 1 : Math.max(0, v.off),
      ),
      how: "rel",
    };
  if (v.k === "after") {
    // wall clock only: the minutes past midnight, carried into the day after when they pass it
    const t = (ref.h ?? 0) * 60 + (ref.mi ?? 0) + v.min;
    const day = Math.floor(t / 1440);
    return {
      wc: addDays(ref, day),
      how: "rel",
      clock: [Math.floor((t - day * 1440) / 60), t % 60],
    };
  }
  // "tuần này": the Sunday that ends this week. Other week words are spans, see spanOf
  if (v.k === "week" && v.off === 0)
    return { wc: addDays(mondayOf(ref), 6), how: "rel" };
  if (v.k === "weekend")
    return {
      wc: addDays(ref, (7 - dowOf(ref.y, ref.m, ref.d)) % 7),
      how: "rel",
    };
  if (v.k === "weekend_next")
    return {
      wc: addDays(ref, ((7 - dowOf(ref.y, ref.m, ref.d)) % 7) + 7),
      how: "rel",
    };
  if (v.k === "month_end")
    return {
      wc: { y: ref.y, m: ref.m, d: daysInMonth(ref.y, ref.m) },
      how: "rel",
    };
  if (v.k === "month_end_next") {
    const nextM = ref.m === 12 ? 1 : ref.m + 1;
    const nextY = ref.m === 12 ? ref.y + 1 : ref.y;
    return {
      wc: { y: nextY, m: nextM, d: daysInMonth(nextY, nextM) },
      how: "rel",
    };
  }
  if (v.k === "dow" && v.wk !== undefined) {
    // "t2 tuần sau": the weekday in that Monday-start week
    const monday = addDays(ref, -((dowOf(ref.y, ref.m, ref.d) + 6) % 7));
    let wc = addDays(monday, 7 * v.wk + ((v.dow + 6) % 7));
    // a weekday of this week already past is the coming one: "thứ 7 tuần này" on Sunday is the next Saturday
    if ((v.bare || v.wk === 0) && dayNo(wc) < dayNo(ref)) wc = addDays(wc, 7);
    return { wc, how: "rel" };
  }
  if (v.k === "dow")
    return {
      wc: addDays(ref, (v.dow - dowOf(ref.y, ref.m, ref.d) + 7) % 7),
      how: "rel",
    };
  return null;
}

/** A holiday name, or a written date the shared calendar holds as a holiday. */
function holidayMention(m: Found, ref: ReaderWC): boolean {
  if (m.kind !== "date") return false;
  if (m.v.k === "holiday") return true;
  const w = m.v.k === "date" ? resolveDate(m, ref)?.wc : undefined;
  return !!w && isHolidayDate(w);
}

/** The first day on or after `w` that a rule's BYDAY list names. */
function firstByDay(w: ReaderWC, rule: string): ReaderWC {
  const byday = /BYDAY=([A-Z,]+)/.exec(rule)?.[1];
  if (!byday) return w;
  const setpos = /BYSETPOS=(-?\d)/.exec(rule)?.[1];
  if (setpos) return firstNthDay(w, byday, +setpos);
  const days = byday.split(",");
  let d = w;
  for (let i = 0; i < 7 && !days.includes(BYDAY[dowOf(d.y, d.m, d.d)]); i++)
    d = addDays(d, 1);
  return d;
}

/** The n-th (or last, for n < 0) weekday of a month, in the month of `w` or a later one, on or after `w`. */
function firstNthDay(w: ReaderWC, code: string, n: number): ReaderWC {
  const dow = BYDAY.indexOf(code);
  for (let k = 0; k < 13; k++) {
    const y = w.y + Math.floor((w.m - 1 + k) / 12);
    const m = ((w.m - 1 + k) % 12) + 1;
    const hits = Array.from(
      { length: daysInMonth(y, m) },
      (_, i) => i + 1,
    ).filter((d) => dowOf(y, m, d) === dow);
    const d = n > 0 ? hits[n - 1] : hits[hits.length + n];
    if (d !== undefined && dayNo({ y, m, d }) >= dayNo(w)) return { y, m, d };
  }
  return w;
}

/** The day a holiday bound ends on: "đến hết Tết" is the fifth day of Tết, other names their day, `shift` moves it. */
function holidayEnd(
  m: Found,
  before: string,
  ref: ReaderWC,
  shift = 0,
): ReaderWC | undefined {
  if (m.v.k !== "holiday") return undefined;
  const day = resolveDate(m, ref)?.wc;
  if (!day) return undefined;
  const breakEnd =
    /^tet$/.test(fold(m.v.phrase).text) && /het\s*$/.test(fold(before).text);
  return addDays(day, shift + (breakEnd ? 4 : 0));
}

const OR_WORDS = new RegExp(`\\b(?:buoi\\s+)?(?:${PART_ALT})\\b`, "g");
/**
 * Days joined by OR ("t2 hoặc t4", "t2/t4", "t2-t4 hoặc t6"): one item listing each day, a dash expanding into its days.
 * Undefined when the dates are not one OR list.
 */
function dayOrDays(
  blank: string,
  resolved: { res: DateRes; f: Found }[],
): ReaderWC[] | undefined {
  if (resolved.length < 2) return undefined;
  const days = new Map<number, ReaderWC>();
  days.set(dayNo(resolved[0].res.wc), resolved[0].res.wc);
  let ors = 0;
  for (let i = 1; i < resolved.length; i++) {
    const prev = resolved[i - 1];
    const cur = resolved[i];
    const gap = fold(blank.slice(prev.f.end, cur.f.start))
      .text.replace(OR_WORDS, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (/^(?:\/|\||hoac la|hoac|hay|or)$/.test(gap)) {
      ors++;
      days.set(dayNo(cur.res.wc), cur.res.wc);
    } else if (gap === "-" && dayNo(cur.res.wc) >= dayNo(prev.res.wc)) {
      const from = dayNo(prev.res.wc);
      for (let k = from; k <= dayNo(cur.res.wc); k++)
        days.set(k, addDays(prev.res.wc, k - from));
    } else return undefined;
  }
  if (!ors) return undefined;
  return [...days.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}

/** Whether the text between two dates reads as a range: "đến hết", "-". */
function rangeGap(blank: string, a: Found, b: Found): boolean {
  return /^\s*(?:-\s*)?(?:den|toi|ket thuc|-)\s*:?\s*(?:het\s*)?(?:ngay\s*:?\s*)?$/.test(
    fold(blank.slice(a.end, b.start)).text,
  );
}

/** A piece's dates: an explicit date drops the relative and weekday words of the same piece. */
function ownDates(list: Found[]): Found[] {
  const explicit = list.some((m) => m.v.k === "date");
  return list.filter((m) => m.v.k === "date" || !explicit);
}

/** One clause to items. Each comma piece reads its own dates, times and title. */
/** Document-wide title fallbacks, computed once per read: scanning every clause for every piece is quadratic. */
const fallbackMemo = new WeakMap<
  Ctx,
  { docTopic?: string; courseTitle?: string }
>();
function clauseFallbacks(ctx: Ctx): {
  docTopic?: string;
  courseTitle?: string;
} {
  let m = fallbackMemo.get(ctx);
  if (!m) {
    m = {
      docTopic: ctx.clauses ? findAnnouncementTopic(ctx.clauses) : undefined,
      courseTitle: findCourseTitle(ctx.clauses),
    };
    fallbackMemo.set(ctx, m);
  }
  return m;
}

/** One clause to items. A series ("sáng và tối", "t2, t4") is one item per instance, all with one planKey. */
/**
 * A correction names a slot of the comma piece before its cue ("lsm code sau, à không mai"): the clause splits before that
 * piece, so the pieces before it keep their items. Null when no such slot is named.
 */
function correctionSplit(raw: string): [string, string] | undefined {
  const f = fold(raw);
  let last: RegExpExecArray | null = null;
  for (const m of f.text.matchAll(CORRECTION)) last = m;
  if (!last) return undefined;
  const s = f.map[last.index ?? 0];
  const e = f.map[(last.index ?? 0) + last[0].length - 1] + 1;
  // the piece the cue corrects: the words between the comma before it and the cue
  let p = s;
  while (p > 0 && /[\s,;]/.test(raw[p - 1])) p--;
  const q = Math.max(raw.lastIndexOf(",", p - 1), raw.lastIndexOf(";", p - 1));
  if (q <= 0 || !raw.slice(0, q).trim() || !raw.slice(q + 1, p).trim()) return undefined;
  // the cue must replace a slot: a day, a clock, a part, a length
  const slotAfter =
    findMentions(raw).some((m) => m.start >= e && ["date", "time", "dur", "period"].includes(m.kind)) ||
    /^(sang|trua|chieu|dem)\b/.test(fold(raw.slice(e)).text.trimStart());
  if (!slotAfter) return undefined;
  return [raw.slice(0, q), raw.slice(q + 1)];
}

export function clauseItems(c0: Clause, ctx: Ctx): Out {
  // a bare title on its own line or in a comma list is an item when the user typed or spoke it, not in pasted or OCR text
  const typedOrSpoken = ctx.source === "typed" || ctx.source === "voice";
  // a part of day that opens a task with no date or clock of its own moves after it: "tối dọn phòng" reads as "dọn phòng tối"
  // a comma list moves its part per piece below, not for the whole list: "A, chiều B" keeps A
  const moved = partLeads(c0.text) && !/[,;]\s/.test(c0.text)
    ? (() => {
        // "sáng sớm" is one part of the day: "sáng sớm dọn phòng" reads as "dọn phòng sáng sớm"
        const ws = c0.text.trim().split(/\s+/);
        const n = fold(ws.slice(0, 2).join(" ")).text === "sang som" ? 2 : 1;
        return `${ws.slice(n).join(" ")} ${ws.slice(0, n).join(" ")}`;
      })()
    : c0.text;
  const c: Clause = { ...c0, text: normalizeWeekdays(moved) };
  // a list of short (3 words or fewer) bare titles with no clock is one item per title: "b-tree code, lsm code"; a sentence with a colon or long pieces is not
  const bits = c.text.split(/\s*[,;]\s+/);
  if (
    bits.length > 1 &&
    typedOrSpoken &&
    !c.label &&
    !ctx.prepCue &&
    !c.text.includes(":") &&
    bits.every((b) => bareTitle(b) && b.trim().split(/\s+/).length <= 3)
  ) {
    const out: Out = { items: [], dropped: [] };
    for (const text of bits) {
      const sub = clauseItems({ ...c, text, piece: true }, ctx);
      out.items.push(...sub.items);
      out.dropped.push(...sub.dropped);
    }
    return out;
  }
  const split = correctionSplit(c.text);
  if (split) {
    const a = clauseItems({ ...c, text: split[0] }, ctx);
    // the piece before the correction keeps its words even when it names no task: "b-tree code, lsm code sau, à không mai"
    if (!a.items.length && split[0].trim()) a.items.push(fallbackTask(split[0].trim()));
    const b = clauseItems({ ...c, text: split[1] }, ctx);
    return { items: [...a.items, ...b.items], dropped: [...a.dropped, ...b.dropped] };
  }
  // clock ranges: OR is one item with the list, AND one item per range, a part range ("sáng - tối") one range
  const run = clockRun(c.text);
  if (run?.kind === "and") {
    const out: Out = { items: [], dropped: [] };
    const planKey = `series${hashText(c.text)}`;
    run.texts.forEach((text, k) => {
      const sub = clauseItems({ ...c, text }, ctx);
      out.dropped.push(...sub.dropped);
      for (const it of sub.items) {
        it.clocks = [run.clocks[k]];
        if (!it.rrule) it.planKey = planKey;
        out.items.push(it);
      }
    });
    return out;
  }
  if (run) {
    const sub = clauseItems({ ...c, text: run.rest }, ctx);
    for (const it of sub.items) it.clocks = run.clocks;
    return sub;
  }
  const one = clauseItemsOne(c, ctx);
  const flexible = one.items.some(
    (it) =>
      (it.type === "PLAN" || it.type === "ASSIGNMENT") &&
      !it.rrule &&
      !it.startsAt,
  );
  const texts = seriesTexts(c.text, flexible);
  if (!texts) return one;
  const planKey = `series${hashText(c.text)}`;
  const out: Out = { items: [], dropped: [] };
  for (const text of texts) {
    const sub = clauseItemsOne({ ...c, text }, ctx);
    out.dropped.push(...sub.dropped);
    for (const it of sub.items) {
      if (!it.rrule) it.planKey = planKey;
      // an instance is bounded to its own day
      if (
        !it.rrule &&
        !it.startsAt &&
        (it.type === "PLAN" || it.type === "ASSIGNMENT") &&
        it.deadline
      ) {
        const day = it.deadline.slice(0, 10);
        it.notBefore = `${day} 00:00`;
        it.deadline = `${day} 23:59`;
      }
      out.items.push(it);
    }
  }
  return out;
}

function clauseItemsOne(c: Clause, ctx: Ctx): Out {
  const out: Out = { items: [], dropped: [] };
  const raw = c.text;
  const folded = fold(raw).text;
  const gate = ctx.gate(c);
  const reqOf = (x: Ctx): Requirements =>
    (x.req ??= requirementsOf(x.fullText ?? raw, x.ref));

  // a correction keeps the words before its cue and replaces only the day or clock it names; without a replacement, only the words after the last cue count
  let blank = blankParens(raw);
  // "trừ thứ 4" leaves a day out of a rule: it names no day of its own
  for (const [s, e] of exceptSpans(raw))
    blank = blank.slice(0, s) + " ".repeat(e - s) + blank.slice(e);
  let cutRaw = 0;
  const fix = correctionOf(blank);
  if (fix) blank = fix.text;
  else {
    const fb = fold(blank);
    let lastCue: RegExpExecArray | null = null;
    for (const m of fb.text.matchAll(CORRECTION)) lastCue = m;
    if (lastCue)
      cutRaw = fb.map[lastCue.index + lastCue[0].length] ?? blank.length;
  }

  const headFold = fold(blank.slice(cutRaw)).text;
  const headVerb =
    !c.label && !ctx.prepCue && TASK_VERB.test(headFold.trimStart());
  const headTask = headVerb && !LENGTH_DAY.test(headFold);
  // "làm bài 1h30": after a task verb with no day or part word, a clock with minutes is a length
  const lengthOf = (m: Found): Found => {
    if (!headVerb || m.kind !== "time" || m.v.k !== "time" || m.v.part)
      return m;
    const word = fold(blank.slice(m.start, m.end)).text.replace(/\s+/g, "");
    // the end of a clock range is a clock: "dọn kho 21h - 2h"
    if (/(?:\d\s*(?:h|g|gio)\s*\d{0,2}|:\d\d)\s*(?:-|den|toi)\s*$/.test(fold(blank.slice(Math.max(cutRaw, m.start - 16), m.start)).text)) return m;
    // "học 2h hôm nay": 1h to 5h alone is a length, nobody means 2 am; any day word may follow
    const small = /^[1-5]h$/.test(word);
    // "đi khám 8h30" is half past eight: past five hours, a clock with minutes is a clock
    if (!small && !(headTask && m.v.h <= 5 && /^\d{1,2}h\d{2}$/.test(word))) return m;
    if (
      LENGTH_CUE.test(
        fold(blank.slice(Math.max(cutRaw, m.start - 8), m.start)).text,
      )
    )
      return m;
    return { ...m, kind: "dur", v: { k: "dur", min: m.v.h * 60 + m.v.mi } };
  };
  const all = findMentions(blank)
    .filter((m) => m.start >= cutRaw)
    .map((m) =>
      fix?.inherit && m.start >= fix.cut && m.kind === "time"
        ? withPart(m, fix.inherit)
        : m,
    )
    .map(lengthOf);
  // the part-of-day search reads the text with weekday phrases blanked: "thứ 6 tới" is a week, "thứ 6 tối" a part
  let noDow = blank;
  for (const m of all) {
    if (m.kind === "date" && m.v.k === "dow" && m.v.wk !== undefined)
      noDow =
        noDow.slice(0, m.start) +
        " ".repeat(m.end - m.start) +
        noDow.slice(m.end);
  }
  const dates = all.filter((m) => m.kind === "date");
  // a recurring line with no date is still a line: it starts today; a clock or a task verb with no date is one too
  // a labelled field ("Nội dung: ...") and a prep email's lines are notes, not tasks
  const taskLed =
    !c.label &&
    !ctx.prepCue &&
    TASK_VERB.test(fold(blank.slice(cutRaw)).text.trimStart());
  if (
    !dates.length &&
    !all.some((m) => m.kind === "recur") &&
    !taskLed &&
    !all.some((m) => m.kind === "time") &&
    !all.some((m) => m.kind === "period" && m.v.k === "period") &&
    !all.some((m) => m.kind === "dur" && !(m.v.k === "dur" && m.v.days))
  )
    // a comma piece of 2 or 3 words is a bare title of its own; its day comes from the line it sits in
    return c.piece && (ctx.source === "typed" || ctx.source === "voice") && !c.label && !ctx.prepCue && [2, 3].includes(folded.trim().split(/\s+/).length)
      ? { items: [fallbackTask(raw.trim())], dropped: [] }
      : out;

  // S5 relevance: the first of "I/you" or a unit decides whose item it is
  const me = folded.search(ME);
  const other = folded.search(OTHER);
  const notMine = other >= 0 && (me < 0 || other < me);
  const optional = OPTIONAL.test(folded);
  const modal = MODAL.test(folded);
  const r =
    ctx.source === "typed" || ctx.source === "voice"
      ? 1
      : Math.max(
          0,
          Math.min(
            1,
            0.5 +
              (me >= 0 ? 0.2 : 0) +
              (modal ? 0.15 : 0) -
              (optional ? 0.3 : 0),
          ),
        );

  // "từ thứ 2 đến thứ 6, 7h-9h": a weekday range keeps the clock after its comma
  const weekRange = (i: number) =>
    /\b(?:thu\s*[2-7]|t[2-7])\s*(?:den|toi|-)\s*(?:thu\s*[2-7]|t[2-7])\s*$/.test(
      fold(blank.slice(cutRaw, i)).text,
    ) && /^\s*\d{1,2}\s*(?:h|g|gio|:\d)/.test(fold(blank.slice(i + 1)).text);
  // comma pieces, as [from, to) in the blanked text
  const bounds = [cutRaw];
  // a weekday list ("t2, t4, t6") is one piece
  const inList = (i: number) =>
    all.some(
      (m) =>
        m.kind === "date" &&
        m.v.k === "dow" &&
        !!m.v.more?.length &&
        i >= m.start &&
        i < m.end,
    );
  const bf = fold(blank);
  const orRuns = partRuns(bf.text)
    .filter((r) => !r.and && r.tokens.length >= 2)
    .map((r): [number, number] => [
      bf.map[r.start] ?? 0,
      (bf.map[r.end - 1] ?? 0) + 1,
    ]);
  for (let i = cutRaw; i < blank.length; i++)
    if (
      blank[i] === "," &&
      !inList(i) &&
      // "sáng, tối": a comma inside a list of parts is no cut
      !orRuns.some(([s, e]) => i >= s && i < e) &&
      // the comma of a street address ("Lê Lợi, P. Bến Nghé") is inside its place
      !all.some((m) => m.kind === "place" && i >= m.start && i < m.end) &&
      !weekRange(i) &&
      !(/\d/.test(blank[i - 1] ?? "") && /\d/.test(blank[i + 1] ?? "")) &&
      // "bắt đầu 9h, kéo dài 90 phút" is one block: the length piece joins its clock
      !/^\s*keo dai\b/.test(fold(blank.slice(i + 1, i + 12)).text)
    )
      bounds.push(i + 1);
  // "họp 9h và 14h mai": two clocks joined by "và" are two pieces
  const fbl = fold(blank);
  for (const vm of fbl.text.matchAll(/\s+va\s+/g)) {
    const fi = vm.index ?? 0;
    const rawS = fbl.map[fi];
    const rawN = fbl.map[fi + vm[0].length];
    if (rawS === undefined || rawN === undefined || rawS < cutRaw) continue;
    const timeBefore = all.some(
      (m) => m.kind === "time" && m.start >= cutRaw && m.end <= rawS,
    );
    const timeAfter = all.some((m) => m.kind === "time" && m.start >= rawN);
    if (timeBefore && timeAfter) bounds.push(rawN);
  }
  // "sáng 9h chiều 3h": two clocks that each open with a part word are two pieces
  const clocks = all
    .filter((m) => m.kind === "time" && m.start >= cutRaw)
    .sort((x, y) => x.start - y.start);
  for (let k = 0; k + 1 < clocks.length; k++) {
    const [t1, t2] = [clocks[k], clocks[k + 1]];
    const gap = blank.slice(t1.end, t2.start);
    const word = fold(gap).text.trim();
    // "7h tới 17h" is a range, its "tới" is no evening word
    const range =
      word === "toi" &&
      /(?:\d\s*(?:h|g|gio)(?:\s*\d{1,2})?|:\d{2})$/.test(fold(blank.slice(t1.start, t1.end)).text.trim());
    // the part word between the clocks opens the second one: split before it
    if (word && !range && /^(?:sang|trua|chieu|toi|dem|khuya)$/.test(word))
      bounds.push(t1.end + gap.search(/\S/));
    else if (
      !word &&
      /^(?:sang|trua|chieu|toi|dem|khuya)\s/.test(
        fold(blank.slice(t2.start, t2.end)).text,
      )
    )
      bounds.push(t2.start);
  }
  bounds.push(blank.length + 1);
  bounds.sort((x, y) => x - y);
  // "nộp báo cáo, trước thứ 6": a comma piece of time words only joins the piece beside it, as in segment (mergeTimeOnly)
  // a labelled field ("Thời gian: …, ngày 28/10") keeps its own pieces
  for (let changed = !c.label; changed && bounds.length > 2; ) {
    changed = false;
    for (let p = 0; p + 1 < bounds.length && !changed; p++) {
      const seg = (k: number) => blank.slice(bounds[k], bounds[k + 1] - 1);
      if (!timeOnly(seg(p))) continue;
      const mine = valueKinds(seg(p));
      const fits = (k: number) => k >= 0 && k + 1 < bounds.length && ![...valueKinds(seg(k))].some((x) => mine.has(x));
      if (p > 0 && blank[bounds[p] - 1] === "," && fits(p - 1)) bounds.splice(p, 1);
      else if (p + 2 < bounds.length && blank[bounds[p + 1] - 1] === "," && fits(p + 1)) bounds.splice(p + 1, 1);
      else continue;
      changed = true;
    }
  }


  const clauseSpans = [
    ...all
      .filter((m) => m.kind !== "mask")
      .map((m): [number, number] => [m.start - cutRaw, m.end - cutRaw]),
    ...phraseCueSpans(blank.slice(cutRaw)),
  ];
  let clauseTitle = titleOf(blank.slice(cutRaw), clauseSpans, "");
  if (isBoilerplateTitle(clauseTitle)) clauseTitle = "";
  const clausePlace = all.find((m) => m.kind === "place");
  const location0 =
    clausePlace && clausePlace.v.k === "place"
      ? clausePlace.v.text
      : ctx.sectionPlace.get(c.section ?? -1);

  const pieceSpans: [number, number][] = [];
  for (let p = 0; p + 1 < bounds.length; p++)
    pieceSpans.push([bounds[p], bounds[p + 1] - 1]);
  const inPiece = (m: Found, a: number, b: number) =>
    m.start >= a && m.start < b;
  // a date after "đến/tới" in a recurring clause is the series' UNTIL, not its day: "… 8h và 14h đến 20/12" ends both
  const clauseRecur = all.some((m) => m.kind === "recur");
  const untilDate = clauseRecur
    ? all.find(
        (m) =>
          m.kind === "date" &&
          (m.v.k === "date" || m.v.k === "holiday" || m.v.k === "month_end") &&
          roleOf(
            blank.slice(0, m.start).replace(/\s*(?:ngày|ngay)\s*$/iu, ""),
          )?.role === "until",
      )
    : undefined;
  // "từ 1/12", "bắt đầu từ thứ 2 tuần sau" in a recurring piece: the day the series starts, not a day of it
  const fromDate = clauseRecur
    ? all.find(
        (m) =>
          m.kind === "date" &&
          m !== untilDate &&
          (m.v.k === "date" || m.v.k === "dow" || m.v.k === "rel") &&
          roleOf(
            blank.slice(0, m.start).replace(/\s*(?:ngày|ngay)\s*$/iu, ""),
          )?.role === "from",
      )
    : undefined;
  // a series' start and end are no piece's day
  const datesIn = (p: [number, number]) =>
    all.filter((m) => m.kind === "date" && m !== untilDate && m !== fromDate && inPiece(m, p[0], p[1]));
  const datedPieces = pieceSpans.filter((p) => datesIn(p).length > 0);
  const explicitPieces = datedPieces.filter((p) =>
    datesIn(p).some((m) => m.v.k === "date"),
  ).length;
  const titleOfPiece = ([a, b]: [number, number]) => {
    const spans = all
      .filter((m) => m.kind !== "mask" && inPiece(m, a, b))
      .map((m): [number, number] => [m.start - a, m.end - a]);
    const t = titleOf(blank.slice(a, b), spans, "");
    return isBoilerplateTitle(t) ? "" : t;
  };
  // with one explicit date, a weekday piece with no words of its own, or one before a bare date ("thứ 6, 20/11"), only checks that date
  const strayPieces =
    explicitPieces === 1
      ? pieceSpans.filter((p, i) => {
          const ds = datesIn(p);
          if (!ds.length || !ds.every((m) => m.v.k === "dow")) return false;
          if (!titleOfPiece(p)) return true;
          const next = pieceSpans[i + 1];
          if (!next) return false;
          const nextHasClock = all.some(
            (m) => m.kind === "time" && inPiece(m, next[0], next[1]),
          );
          return (
            datesIn(next).some((m) => m.v.k === "date") &&
            !titleOfPiece(next) &&
            !nextHasClock
          );
        })
      : [];
  const strayText = strayPieces
    .map(([a, b]) => fold(blank.slice(a, b)).text)
    .join(" ");
  // a piece with no date takes the date of the only dated piece; with several dated pieces it makes nothing
  const inherited =
    datedPieces.length === 1 ? ownDates(datesIn(datedPieces[0])) : [];
  // a time is the clock of the explicitly dated piece around it when its piece has no date, or only a weekday check
  const clockFree = (p: [number, number]) =>
    !datesIn(p).length || strayPieces.some((s) => s[0] === p[0]);
  const undatedTimes = all.filter(
    (m) =>
      m.kind === "time" &&
      pieceSpans.some((p) => inPiece(m, p[0], p[1]) && clockFree(p)),
  );
  // a length alone in a piece: "Học bài, 90 phút, sáng cn" is 90 minutes for the item
  const undatedDurs = all.filter(
    (m) =>
      m.kind === "dur" &&
      !(m.v.k === "dur" && m.v.days) &&
      pieceSpans.some(
        (p) => inPiece(m, p[0], p[1]) && !datesIn(p).length && !titleOfPiece(p),
      ),
  );
  const multi = pieceSpans.length > 1;
  // words of the pieces with no date: a description that names the action for the dated piece
  const datelessWords = pieceSpans
    .filter((p) => !datesIn(p).length)
    .map(([a, b]) => fold(blank.slice(a, b)).text)
    .join(" ");

  const produced: ReaderItem[] = [];
  // items of a piece with a said repeat, and of pieces with no day and no repeat of their own
  const ruledItems = new Set<ReaderItem>();
  const looseItems = new Set<ReaderItem>();
  // a piece with a date and no clock takes the clock and place of a clock-only piece after it: "Chủ nhật đi tình nguyện, tập trung 6h30 cổng trường"
  const absorbs = new Map<number, number>();
  const joined = new Set<number>();
  const hasTime = (p: [number, number]) =>
    all.some((m) => m.kind === "time" && m.start >= p[0] && m.start < p[1]);
  for (let p = 0; p + 1 < pieceSpans.length; p++) {
    const cur = pieceSpans[p];
    const nxt = pieceSpans[p + 1];
    if (
      datesIn(cur).length &&
      !hasTime(cur) &&
      !datesIn(nxt).length &&
      hasTime(nxt)
    ) {
      absorbs.set(p, p + 1);
      joined.add(p + 1);
    }
  }
  for (let pi = 0; pi < pieceSpans.length; pi++) {
    const [a, b] = pieceSpans[pi];
    if (joined.has(pi)) continue;
    const pieceText = blank.slice(a, b);
    // "tạo lịch học tiếng Anh …", "lên lịch thi …": the opening command names no class timetable and no exam schedule
    // "siêu thị", "thì", "thí nghiệm": only an untoned "thi" is the exam, so the toned ones are blanked for the cues (same length)
    const fpiece = fold(pieceText.replace(/(?<!\p{L})(th)[ịìíỉĩ](?!\p{L})/giu, "$1y")).text.replace(
      /^(\s*)(?:tao|dat|len|xep|lap)\s+lich(?=\s)/,
      (m) => " ".repeat(m.length),
    );
    if (
      CANCELLATION.test(fpiece) ||
      (CANCELLATION.test(folded) && !MAKEUP.test(fpiece))
    ) {
      continue;
    }
    if (strayPieces.some((p) => p[0] === a)) continue;

    const absorbed = absorbs.get(pi);
    const piece = all.filter(
      (m) =>
        (m.start >= a && m.start < b) ||
        (absorbed !== undefined &&
          m.start >= pieceSpans[absorbed][0] &&
          m.start < pieceSpans[absorbed][1]),
    );
    const seriesFrom = (fromDate && resolveDate(fromDate, ctx.ref)?.wc) || ctx.ref;
    const pieceDates = piece.filter(
      (m) => m.kind === "date" && m !== untilDate && m !== fromDate,
    );
    const holidayM = piece.find(
      (m) => m.kind === "date" && m.v.k === "holiday" && m !== untilDate,
    );
    // "trước Tết", "mua quà trước Noel": the holiday is the deadline's day, its eve the deadline
    const holidayBefore =
      !!holidayM && roleOf(blank.slice(a, holidayM.start))?.role === "before";
    const pieceExplicit = pieceDates.some((m) => m.v.k === "date");
    // "họp t2, t4 9h" with no repeat said: Monday and Wednesday, once each; a said repeat or a timetable row keeps the list for its weekly rule
    const listOnce = !piece.some((m) => m.kind === "recur") && !c.timetable;
    const pDates = ownDates(pieceDates).flatMap((m) => {
      const v = m.v;
      return listOnce && m.kind === "date" && v.k === "dow" && v.more?.length
        ? [v.dow, ...v.more].map((dow): Found => ({ ...m, v: { ...v, dow, more: undefined } }))
        : [m];
    });
    // a bare clock takes the one part of the day the piece names: "tối nay đi ăn lúc 7 giờ" is 19:00
    // "7h tới 17h": a "tới" between two clocks ends a range, it is no evening word
    // "tuần tới 8h": the "tới" of next week, month or year is no evening word either
    // "nhắc tôi … 8:30": "tôi" is the speaker, not the evening
    // "chơi game tới 1h": "tới" (until) is never "tối" either
    const pieceFold = fold(noDow.slice(a, b).replace(/(?<!\p{L})t(?:ôi|ới)(?!\p{L})/giu, "   "))
      .text.replace(/\btonight\b/g, "toi")
      .replace(/(?<=\b(?:tuan|thang|nam)\s+)toi\b/g, "   ")
      .replace(/(?<=\d\s*(?:h|g|gio)\s*)toi(?=\s+\d{1,2}\s*(?:h|g|gio|:\d))/g, " "); // "7h toi 17h"; "9h tối 20/11" stays the evening
    const pieceParts = new Set(
      [...pieceFold.matchAll(/\b(sang|trua|chieu|toi|dem)\b/g)].map(
        (x) => x[1],
      ),
    );
    const piecePart = pieceParts.size === 1 ? [...pieceParts][0] : undefined;
    const recur = piece.find((m) => m.kind === "recur");
    // no date, no part of day: a bare clock is its next occurrence ("8h" at 19:09 is 20:00 today)
    const pieceUndated = !pieceDates.length && !recur && !datedPieces.length;
    const firstTime = piece.find((m) => m.kind === "time");
    // going to bed: "ngủ dậy", "thức dậy" and the nap "ngủ trưa" are not
    const sleepy = /(?<![a-z])ngu(?![a-z])(?!\s+(?:day|trua)(?![a-z]))/.test(fpiece);
    const wake = /(?<![a-z])(?:ngu day|thuc day|bao thuc|day som)(?![a-z])/.test(fpiece);
    const eveningAct = activityPm(fpiece);
    // one clock after "đến/tới" is where the item ends
    const untilClock =
      piece.filter((m) => m.kind === "time").length === 1 &&
      !!firstTime &&
      roleOf(blank.slice(a, firstTime.start))?.role === "until";
    // "7h tới 17h": a bare start before a plain end clock is that range's start, not the next 7 o'clock (19:00)
    const endClock = piece.filter((m) => m.kind === "time")[1];
    const rangeHead =
      firstTime?.v.k === "time" &&
      endClock?.v.k === "time" &&
      (!!endClock.v.part || endClock.v.h > 12) &&
      firstTime.v.h * 60 + firstTime.v.mi < endClock.v.h * 60 + endClock.v.mi &&
      /^\s*(?:-|–|den|toi)\s*$/.test(fold(blank.slice(firstTime.end, endClock.start)).text);
    const bareNc =
      pieceUndated &&
      !piecePart &&
      !rangeHead &&
      firstTime?.v.k === "time" &&
      !firstTime.v.part
        ? nextClock(firstTime.v.h, firstTime.v.mi, ctx.ref, sleepy, eveningAct, untilClock, wake)
        : undefined;
    const clocks = piece.filter((m) => m.kind === "time");
    const pTimes = clocks
      .map((m, k) => {
        if (bareNc && m.v.k === "time" && !m.v.part) {
          let nc = nextClock(m.v.h, m.v.mi, ctx.ref, sleepy, eveningAct, untilClock, wake);
          // a bare end clock of a range reads after its start: "9h đến 11h" from 21:00 ends at 23:00
          const startMin = bareNc.h * 60 + bareNc.mi;
          if (k === 1 && nc.h < 12 && nc.h * 60 + nc.mi <= startMin) {
            const pm = nc.h + 12;
            if (pm * 60 + nc.mi > startMin)
              nc = { ...nc, h: pm, part: "toi", off: 0 };
          }
          return {
            ...m,
            v: { k: "time" as const, h: nc.h, mi: nc.mi, part: nc.part },
          };
        }
        if (!piecePart) return m;
        const w = withPart(m, piecePart);
        // "từ 11h đến 1h chiều": the part is the end's; a bare start it would push past that end stays in the morning
        const nx = clocks[k + 1] && withPart(clocks[k + 1], piecePart);
        const min = (f: Found) => (f.v.k === "time" ? f.v.h * 60 + f.v.mi : 0);
        return nx?.v.k === "time" && min(w) > min(nx) && min(m) < min(nx) ? m : w;
      });
    const periodMention =
      piece.find((m) => m.kind === "period" && m.v.k === "period") ??
      all.find((m) => m.kind === "period" && m.v.k === "period");
    const periodRes =
      periodMention && periodMention.v.k === "period"
        ? resolvePeriods(periodMention.v.p1, periodMention.v.p2)
        : null;
    const periodUnknown = !!periodMention && !periodRes;
    // a task with no date and no clock: no deadline, its length inferred
    const undatedTask =
      pieceUndated &&
      !pTimes.length &&
      ((taskLed || all.some((m) => m.kind === "dur")) &&
        (TASK_VERB.test(fpiece.trimStart()) ||
          piece.some((m) => m.kind === "dur")) ||
        !!periodMention);
    const weekday = pDates.find((m) => m.v.k === "dow");
    // a weekday list ("t2, t4, t6") repeats weekly on all its days
    // a weekday list ("t2, t4, t6") repeats weekly only with a said repeat; alone it is those days, once each
    const plainRule =
      weekday?.v.k === "dow" && weekday.v.more?.length && recur
        ? `FREQ=WEEKLY;BYDAY=${bydayOf(weekday.v)}`
        : c.timetable && weekday?.v.k === "dow"
          ? `FREQ=WEEKLY;BYDAY=${bydayOf(weekday.v)}`
          : recur?.v.k !== "recur"
            ? undefined
            : recur.v.freq === "MONTHLY"
              ? (() => {
                  const dm = piece.find(
                    (m) => m.kind === "date" && m.v.k === "dom",
                  );
                  return dm && dm.v.k === "dom"
                    ? `FREQ=MONTHLY;BYMONTHDAY=${dm.v.d}`
                    : /\bdau thang\b/.test(fpiece)
                      ? "FREQ=MONTHLY;BYMONTHDAY=1"
                      : "FREQ=MONTHLY";
                })()
              : recur.v.freq === "DAILY"
                ? every("DAILY", recur.v.interval ?? 1)
                : weekday?.v.k === "dow"
                  ? `FREQ=WEEKLY;BYDAY=${bydayOf(weekday.v)}`
                  : undefined;
    // a phrase rule (rules.ts) beats the plain one; a weekday names the days of a weekly rule without its own
    const phraseRule = recur ? ruleBase(fpiece, folded) : undefined;
    // "đến hết Tết" ends on the fifth day of Tết; "trước Tết" on the eve, the day before the holiday
    // "trong 120 ngày", "trong 3 tháng": a repeat that long from its first day ("trong 4 tuần" is a COUNT)
    const lasting = recur
      ? /(?<![a-z])trong\s+(?:vong\s+|khoang\s+)?(\d{1,3})\s+(ngay|thang)(?![a-z])/.exec(folded)
      : null;
    const untilWc =
      untilDate?.v.k === "date" || untilDate?.v.k === "month_end"
        ? resolveDate(untilDate, ctx.ref)?.wc
        : lasting
          ? addDays(seriesFrom, +lasting[1] * (lasting[2] === "thang" ? 30 : 1) - 1)
        : untilDate?.v.k === "holiday"
          ? holidayEnd(untilDate, blank.slice(a, untilDate.start), ctx.ref)
          : holidayBefore && holidayM
            ? holidayEnd(holidayM, "", ctx.ref, -1)
            : undefined;
    const baseRule =
      phraseRule && weekday?.v.k === "dow" && phraseRule === "FREQ=WEEKLY"
        ? `FREQ=WEEKLY;BYDAY=${bydayOf(weekday.v)}`
        : (phraseRule ?? plainRule);
    const rrule = baseRule ? withBounds(baseRule, fpiece, untilWc) : undefined;
    // a dateless piece makes nothing next to other dated pieces; alone, it takes their date when it has a clock
    if (
      !pieceDates.length &&
      !recur &&
      // said in one breath, a clock after a dated step is its own step on that day: "mai 8h họp, 9h tối gọi mẹ, mốt 7h đá bóng"
      ((datedPieces.length > 1 &&
        !(
          pTimes.length &&
          ctx.source !== "paste" &&
          ctx.source !== "ocr" &&
          datedPieces.some((p) => p[0] < a)
        )) ||
        !pTimes.length) &&
      !undatedTask
    )
      continue;
    const sortedTimes = [...pTimes].sort((x, y) => x.start - y.start);
    let timeRangeDur: number | undefined;
    // the clock a range ends at: "đến 11h", "trước 22h"
    let rangeEnd: [number, number] | undefined;
    // "đến 24:30" ends at 00:30 of the day after
    let rangeEndNext = false;
    if (sortedTimes.length >= 2) {
      const t1 = sortedTimes[0];
      const t2 = sortedTimes[1];
      const gap = fold(blank.slice(t1.end, t2.start)).text.trim();
      const core = gap.replace(RANGE_BOUND, " ").trim();
      if (
        /^(?:(?:den|toi|-|ket thuc)\s*:?\s*)?$/.test(core) &&
        (core !== "" || gap.match(RANGE_BOUND))
      ) {
        if (t1.v.k === "time" && t2.v.k === "time") {
          // both ends on the 15 minute grid the start snaps to: "7:20 - 9:10" is 7:15 - 9:15
          let diff = round15(t2.v.h * 60 + t2.v.mi) - round15(t1.v.h * 60 + t1.v.mi);
          if (diff < 0) diff += 1440;
          // a bare end clock read as PM that runs past 12 hours is the AM reading: "23h-1h" is 2 hours
          if (diff > 720 && t2.v.part === "toi") diff -= 720;
          // a bare end clock the 1-6 PM rule moved to the afternoon: "21h - 2h" ends at 2 in the night, not at 14:00
          else if (diff > 720 && !t2.v.part && t2.v.h > 12 && t2.v.h < 19) diff -= 720;
          if (diff > 0) {
            timeRangeDur = diff;
            rangeEnd = [t2.v.h, t2.v.mi];
            rangeEndNext = !!t2.v.next;
          }
        }
      }
    }
    // a recurring line with no date starts today; a daily clock already past starts tomorrow
    const firstClock = pTimes[0]?.v;
    // midnight ("12h đêm") ends the day it is named in, so it does not roll to the next one
    // a bare "12am" is the next midnight: today's has passed
    const startOff =
      firstClock?.k === "time" &&
      ((firstClock.h === 0 &&
        firstClock.mi === 0 &&
        firstClock.part === "sang" &&
        !pieceDates.length) ||
        (!(firstClock.h === 0 && firstClock.mi === 0) &&
          firstClock.h * 60 + firstClock.mi + (recur ? 0 : (timeRangeDur ?? 0)) <=
            (ctx.ref.h ?? 0) * 60 + (ctx.ref.mi ?? 0)))
        ? 1
        : 0;
    const dateList = pieceDates.length
      ? pDates
      : recur || (pieceUndated && pTimes.length)
        ? [
            {
              kind: "date" as const,
              start: a,
              end: a,
              v: { k: "rel" as const, off: bareNc?.off ?? startOff },
            },
          ]
        : inherited.length || ctx.source === "paste" || ctx.source === "ocr"
          ? inherited
          : // said in one breath, "mai 8h họp, 9h tối gọi mẹ, mốt 7h đá bóng": a clock with no day is on the day named last before it
            ownDates(
              datesIn(datedPieces.filter((p) => p[0] < a).at(-1) ?? [0, 0]),
            );
    if (!dateList.length && !undatedTask) continue;
    const dateHow: "own" | "inherit" = pieceDates.length ? "own" : "inherit";
    // only an explicit date takes the clock of a time-only piece; "mai" or "thứ năm" keep their own day
    const explicitHere = pDates.some((m) => m.v.k === "date");
    const timeFound =
      sortedTimes[0] ??
      (explicitHere && explicitPieces === 1 ? undatedTimes[0] : undefined);
    const hasTimeHint = !!timeFound || !!periodRes;
    // "đi Đà Lạt 3 ngày": a busy block of days, with a travel or rest word and a date
    const busyDur = piece.find(
      (m) => m.kind === "dur" && m.v.k === "dur" && !!m.v.days,
    );
    const busy =
      !!busyDur &&
      pieceDates.length > 0 &&
      /\b(di|nghi|du lich)\b/.test(fpiece);
    const dur =
      piece.find((m) => m.kind === "dur" && !(m.v.k === "dur" && m.v.days)) ??
      ((datedPieces.length === 1 && datesIn([a, b]).length > 0) ||
      !datedPieces.length
        ? undatedDurs[0]
        : undefined);
    const place = piece.find((m) => m.kind === "place");

    // "sau 9h", "từ 9h": the clock starts the work; a task with it is not a fixed event
    const fromCue =
      !!timeFound &&
      !timeRangeDur &&
      ((timeFound.v.k === "time" && timeFound.v.after === true) ||
        ["after", "from"].includes(
          roleOf(blank.slice(a, timeFound.start))?.role ?? "",
        ));
    // the part of the day of this piece, with "tuần"/"tháng" words and weekday phrases out of the way
    // "tới 20/11" is until a date; "tối" is the evening, and so is the "toi" of "ngày/hôm tối"
    const fpart = pieceFold.replace(
      /\b(?:sang\s+)?(?:tuan|thang)(?:\s+(?:nay|sau\s+nua|sau|toi|truoc))?\b|\b(?:ngay|hom|bua)\s+toi\b|\btoi(?=\s+\d{1,2}[/.-]\d)/g,
      // a toned "tối" before a date is the evening of it ("tối 20/11"): only "tới" or a toneless "toi" is until
      (m) => (m === "toi" && /(?<!\p{L})tối\s+\d{1,2}[/.-]\d/iu.test(pieceText) && !/(?<!\p{L})tới\s+\d/iu.test(pieceText) ? m : " "),
    );
    // a list of parts ("sáng/tối", "sáng hoặc tối") is one item in any of them; the earliest part sets the start, the latest the deadline
    const partRun = partRuns(fpart)[0];
    const partWords = partRun
      ? partRun.and
        ? runParts(partRun).slice(0, 1)
        : runParts(partRun)
      : [];
    const partSpec: PartSpec | undefined = partWords[0]
      ? PART[partWords[0]]
      : undefined;
    const partSpecs = partWords.map((w) => PART[w]).filter(Boolean);
    const partWindows = [...new Set(partSpecs.map((p) => p.window))];
    const lastSpec = partSpecs.reduce<PartSpec | undefined>(
      (a, p) =>
        !a || p.due[0] * 60 + p.due[1] > a.due[0] * 60 + a.due[1] ? p : a,
      partSpec,
    );
    const beforeCue = BEFORE_CUE.test(fpiece);
    const partClock = lastSpec && (beforeCue ? lastSpec.before : lastSpec.due);
    const inPart = !!partSpec && IN_PART.test(fpart);

    // dates: a span ("tuần sau", "cuối tháng"), a range "từ X đến Y", a part "trong sáng mai", else one item per listed date
    // "tuần sau 8h": a said clock needs one day, so a week or month word alone is the first day of it (Monday; the 1st;
    // today for "tuần này", a clock past rolls on), the same start a flexible "tuần sau" item gets, not the whole span
    const weekClock =
      dateList.length === 1 &&
      sortedTimes.some((m) => m.v.k === "time" && !m.v.after);
    const sorted = [...dateList]
      .sort((x, y) => x.start - y.start)
      .map((d) =>
        weekClock && d.v.k === "week"
          ? {
              ...d,
              v: d.v.count
                ? { k: "rel" as const, off: 7 * d.v.off }
                : d.v.off >= 1
                  ? { k: "dow" as const, dow: 1, wk: d.v.off }
                  : { k: "rel" as const, off: 0 },
            }
          : // "tháng sau 9h": the 1st of next month, not a deadline at its end
            weekClock && d.v.k === "span" && d.v.key === "thang_sau"
            ? { ...d, v: { k: "date" as const, form: "full" as const, d: 1, m: ctx.ref.m === 12 ? 1 : ctx.ref.m + 1, y: ctx.ref.m === 12 ? ctx.ref.y + 1 : ctx.ref.y } }
            : d,
      );
    const resolved: { res: DateRes; f: Found }[] = [];
    for (const d of sorted) {
      const res = resolveDate(d, ctx.ref);
      if (res)
        resolved.push({
          res: { ...res, how: dateHow === "inherit" ? "inherit" : res.how },
          f: d,
        });
    }
    // a written date already past, with a weekday stated beside it, takes that weekday's next day
    const stated = pieceDates.find((m) => m.v.k === "dow");
    for (const r of resolved) {
      if (r.f.v.k !== "date" || stated?.v.k !== "dow") continue;
      if (dayNo(r.res.wc) >= dayNo(ctx.ref)) continue;
      const next = resolveDate(stated, ctx.ref);
      if (next) r.res = next;
    }
    let span: { from: ReaderWC; to: ReaderWC } | null = null;
    for (const d of sorted) span ??= spanOf(d.v, ctx.ref);
    type Range = {
      from: DateRes;
      to: DateRes;
      start?: [number, number];
      end?: [number, number];
    };
    // "họp trong giờ hành chính": a flexible item between 8 and 17, never a fixed block
    const officeHours =
      !span && /\btrong gio hanh chinh\b/.test(fpart) && resolved.length === 1;
    // days joined by OR are one item listing them, not a range or one item per day
    const dayOr = span ? undefined : dayOrDays(blank, resolved);
    const range: Range | undefined = dayOr
      ? undefined
      : span
        ? {
            from: { wc: span.from, how: "rel" },
            to: { wc: span.to, how: "rel" },
          }
        : resolved.length >= 2 &&
            rangeGap(blank, resolved[0].f, resolved[1].f) &&
            // "Từ: 20/11 Đến: 22/11 nộp báo cáo" is one range; another label between two dates keeps them as two items
            (!fold(
              blank.slice(resolved[0].f.end, resolved[1].f.start),
            ).text.includes(":") ||
              (sortedTimes.length === 0 &&
                (/^\s*den\s*:\s*$/.test(
                  fold(blank.slice(resolved[0].f.end, resolved[1].f.start))
                    .text,
                ) ||
                  !ASSIGN.test(fpiece))))
          ? // a range written backwards ("từ 20/11 đến 19/11") is the same two days in order
            dayNo(resolved[1].res.wc) < dayNo(resolved[0].res.wc)
            ? { from: resolved[1].res, to: resolved[0].res }
            : { from: resolved[0].res, to: resolved[1].res }
          : inPart && partSpec && resolved.length === 1
            ? {
                from: resolved[0].res,
                to: resolved[0].res,
                start: partSpec.start,
                end: (lastSpec ?? partSpec).due,
              }
            : // "trong giờ hành chính": 8 to 17 on the day
              /\btrong gio hanh chinh\b/.test(fpart) && resolved.length === 1
              ? {
                  from: resolved[0].res,
                  to: resolved[0].res,
                  start: [8, 0],
                  end: [17, 0],
                }
              : undefined;
    // "20/11 9h đến 22/11 17h": each day from the first date to the last is the block between the two clocks
    const [t1, t2] = sortedTimes;
    const [d1, d2] = resolved.map((r) => r.f);
    const dayBlock =
      !range &&
      resolved.length === 2 &&
      sortedTimes.length === 2 &&
      t1.v.k === "time" &&
      t2.v.k === "time" &&
      t1.start >= d1.end &&
      t1.end <= d2.start &&
      t2.start >= d2.end &&
      /^\s*(?:luc\s+)?$/.test(fold(blank.slice(d2.end, t2.start)).text) &&
      /^\s*(?:luc\s+)?(?:den|toi|-)\s*(?:het\s*)?(?:ngay\s*)?(?:luc\s+)?$/.test(
        fold(blank.slice(t1.end, d2.start)).text,
      ) &&
      dayNo(resolved[1].res.wc) > dayNo(resolved[0].res.wc) &&
      dayNo(resolved[1].res.wc) - dayNo(resolved[0].res.wc) <= 60 &&
      t2.v.h * 60 + t2.v.mi > t1.v.h * 60 + t1.v.mi
        ? {
            start: [t1.v.h, t1.v.mi] as [number, number],
            min: t2.v.h * 60 + t2.v.mi - (t1.v.h * 60 + t1.v.mi),
          }
        : undefined;
    // the reader resolves silently: a weekday that disagrees with the written date is ignored, the date wins
    const flags: ReaderFlag[] = resolved.some((r) => r.res.clamped) ? ["date_clamped"] : [];
    const alternatives: string[] = [];
    const listed = range ? [] : dayOr ? resolved.slice(0, 1) : resolved;

    // S4 type: the words of the piece and of its section title
    // the piece's own cue words decide its type; a piece without any takes the clause's
    const shared = ` ${fold(c.sectionTitle ?? "").text} ${fold(c.labelWord ?? "").text}`;
    const pieceHasCue =
      ASSIGN.test(fpiece) ||
      EXAM.test(fpiece) ||
      LECT.test(fpiece) ||
      DNDCUE.test(fpiece);
    // one clause with commas is several actions: a piece borrows the clause's cue only when there is one piece
    // a dated piece reads its explicit neighbour's stray weekday words as its own cues
    const cueText = pieceHasCue
      ? fpiece + shared
      : multi && datedPieces.length <= 1
        ? `${shared} ${datelessWords}`
        : fpiece + shared + (pieceExplicit ? ` ${strayText}` : "");
    // "tháng này" is by the month's end, never on its last day ("đọc sách tháng này" is not a plan for 30/11)
    const due = DUE.test(fpiece) || DUE.test(cueText) || (!recur && sorted.some((d) => d.v.k === "month_end"));
    const isPresentation =
      /\b(bao cao|bao ve|thuyet trinh|pitching|seminar|hoi dong)\b/i.test(
        fpiece,
      ) &&
      !/\b(nop|submit|gui|upload|viet|soan|lam|hoan thien|hoan thanh|sua|chinh sua|cap nhat|ra soat|doc lai|tong hop)\b/i.test(
        fpiece,
      );
    const isOralOrDefense =
      /\b(bao ve|thuyet trinh|pitching|seminar|hoi dong)\b/i.test(fpiece) &&
      !/\b(nop|submit|gui|upload)\b/i.test(fpiece);
    const exam =
      EXAM.test(cueText) &&
      !/thi dau/.test(cueText) &&
      !STUDY_EXAM.test(cueText);
    let assign = ASSIGN.test(cueText);
    // "viết báo cáo web" is work to do, not a course submission
    if (
      /\b(viet|soan)\s+(bao\s*cao|bc)\b/.test(fpiece) &&
      !/\b(nop|submit|mon|hoc\s+phan)\b/.test(fpiece)
    )
      assign = false;
    if (isOralOrDefense) assign = false;
    if (exam && !/\b(nop|submit)\b/i.test(cueText)) assign = false;
    let type: ReaderItemType = assign
      ? "ASSIGNMENT"
      : exam
        ? "EXAM"
        : LECT.test(cueText) || !!periodRes || c.timetable
          ? "LECTURE"
          : DNDCUE.test(cueText) && !(holidayBefore && TASK_WORD.test(fpiece))
            ? "BUSY"
            : "PLAN";
    // one line the user said or typed, not a notice
    const said =
      ctx.source === "voice" ||
      (ctx.source === "typed" && (ctx.clauses?.length ?? 1) <= 1);
    // a period the table does not know (15 and up, or a span over them): no clock to give, so a plain task
    if (type === "LECTURE" && periodUnknown && !c.timetable) type = "PLAN";
    // said or typed in one line, "học môn web mai 8h" is the user's own plan, not a notice of a class the timetable already holds
    if (
      type === "LECTURE" &&
      !c.timetable &&
      !periodRes &&
      !LECT.test(cueText.replace(/\bhoc mon\b/g, "hoc")) &&
      said
    )
      type = "PLAN";
    if (type === "PLAN" && hasTimeHint && !due && !range && !fromCue)
      type = "BUSY";
    if (isPresentation && hasTimeHint && !due && !range) type = "BUSY";
    // a prepare-cue document: the class or exam is already on the timetable, what is new is the preparation
    // a regular class is never an item (the timetable syncs it); a makeup or online class with no clock takes a usual class start (SLOTS)
    const clock = !!timeFound || !!periodRes || PERIODS.test(fpiece);
    if (
      type === "LECTURE" &&
      !c.timetable &&
      !(MAKEUP.test(cueText) && !due && !range)
    ) {
      if (!(ctx.prepCue && !clock && !due && !range)) continue;
    }
    const prep =
      ctx.prepCue &&
      (type === "LECTURE" || type === "EXAM") &&
      !clock &&
      !due &&
      !range;
    if (prep) type = "PLAN";
    const fixed =
      (type === "EXAM" || type === "LECTURE" || type === "BUSY") &&
      !range &&
      !due;

    // Submission actions ("nộp", "submit") tied to schedules ("theo lịch thi", "xem lịch thi") or pure institutional
    // submission milestones are not the process of doing work. Never include them.
    // the report a windowed text submits is the window's report prep
    // a submission is its own item next to the prep tasks of its window
    const isScheduleSubmission =
      /\b(?:theo\s+lich|lich\s+thi|xem\s+lich)\b/i.test(fpiece) ||
      /\b(?:sinh\s+vien\s+)?(?:nop|submit)\s+(?:bao\s*cao|bai|do\s*an)?\s*(?:theo\s+lich|khoa)\b/i.test(
        fpiece,
      );
    if (isScheduleSubmission) continue;

    // title: the piece's own words, else the clause's, else the section's, else announcement topic
    // "nộp bài môn web": the course is part of what the task is called, so its words stay
    const innerPieceSpans = piece
      .filter((m) => m.kind !== "mask" && m.kind !== "course")
      .map((m): [number, number] => [m.start - a, m.end - a]);
    let title = titleOf(
      pieceText,
      [...innerPieceSpans, ...phraseCueSpans(pieceText)],
      "",
    );
    if (isBoilerplateTitle(title)) title = "";
    let borrowed = false;
    const memo = clauseFallbacks(ctx);
    const docTopic =
      ctx.docTopic ??
      (ctx.clauses ? memo.docTopic : findAnnouncementTopic([c]));
    const courseTitle = ctx.courseTitle ?? memo.courseTitle;
    // a notice's class is named by its "Môn:" line; a said one by its own words ("học bù môn web")
    if (words(title) < 2 || (type === "LECTURE" && courseTitle && !said)) {
      const sectionWords = titleOf(c.sectionTitle ?? "", [], "");
      const candidates = [
        courseTitle ?? "",
        clauseTitle,
        sectionWords,
        docTopic ?? "",
        c.labelWord ?? "",
      ].filter((t) => words(t) >= 2 && !isBoilerplateTitle(t));
      title =
        candidates[0] ??
        (courseTitle ||
          sectionWords ||
          docTopic ||
          c.labelWord ||
          clauseTitle ||
          title ||
          "");
      borrowed = true;
    }
    if (prep) {
      const course = all.find((m) => m.kind === "course" && m.v.k === "course");
      const subject =
        course && course.v.k === "course"
          ? course.v.text.replace(/^(môn|học phần)\s+/i, "")
          : title.charAt(0).toLowerCase() + title.slice(1);
      title = shorten(`Chuẩn bị ${subject}`.trim(), MAX_TITLE);
      borrowed = false;
    }
    // no words of its own: the piece's words minus its date and time
    if (!title) {
      const dt = piece
        .filter(
          (m) => m.kind === "date" || m.kind === "time" || m.kind === "dur",
        )
        .map((m): [number, number] => [m.start - a, m.end - a]);
      const timeOnly = piece
        .filter((m) => m.kind === "time")
        .map((m): [number, number] => [m.start - a, m.end - a]);
      // a span's joining words are not a title: "20/11 9h đến 22/11 17h" gets the playful default
      // a day word is no title: "9h mai ở KTX" keeps "ở KTX"; a holiday's name stays
      const dateOnly = piece
        .filter((m) => m.kind === "date" && m.v.k !== "holiday")
        .map((m): [number, number] => [m.start - a, m.end - a]);
      const bare = evidenceOf(pieceText, [
        ...timeOnly,
        ...dateOnly,
        ...phraseCueSpans(pieceText),
      ]).trim();
      const datesOnly = piece.filter((m) => m.kind === "date").length >= 2;
      const joinOnly = fold(evidenceOf(pieceText, dt))
        .text.split(/\s+/)
        .filter(Boolean)
        .every((w) =>
          [
            "den",
            "toi",
            "tu",
            "va",
            "trong",
            "het",
            "ngay",
            "luc",
            "-",
          ].includes(w),
        );
      title =
        datesOnly && joinOnly
          ? ""
          : shorten(bare.charAt(0).toUpperCase() + bare.slice(1), MAX_TITLE);
    }
    // a title that is only time words, or empty, gets a playful default
    const playfulTitle = fold(title)
      .text.split(/\s+/)
      .filter(Boolean)
      .every((w) => TIME_WORD_RE.test(w));
    if (playfulTitle)
      title =
        PLAYFUL_TITLES[hashText(ctx.fullText ?? raw) % PLAYFUL_TITLES.length];
    const holidayHere = piece.some((m) => holidayMention(m, ctx.ref));
    // the role the words before the piece's one written date or clock set (3i); a range takes its bounds from its clocks
    const anchorAt = Math.min(
      ...dateList.map((d) => d.start),
      ...(timeFound ? [timeFound.start] : []),
    );
    // a holiday named after the written date takes the role before it: "mua quà 20/11 trước nhà giáo"
    const cue =
      !range && dateList.length <= 1 && Number.isFinite(anchorAt)
        ? roleOf(blank.slice(a, holidayM ? holidayM.start : anchorAt))
        : undefined;
    const holidayCue = !!holidayM && !!cue;
    // "liên hoan Noel" is an event on the holiday, not the holiday alone
    const eventHere = /\b(lien hoan|tiec|party)\b/.test(fpiece);
    // "sau Noel họp lớp": a holiday with a role and an activity is a task from the day after, not a whole day
    // the title's words that are neither time words nor the holiday's own name
    const holidayWords = new Set(
      piece.flatMap((m) =>
        m.kind === "date" && m.v.k === "holiday"
          ? fold(m.v.phrase).text.split(" ")
          : [],
      ),
    );
    const activityWords = fold(title)
      .text.split(/\s+/)
      .filter((w) => w && !TIME_WORD_RE.test(w) && !holidayWords.has(w));
    // the role word must stand before the holiday itself: in "từ 2h đến 4h chiều 20/11" the "từ" opens the clock range
    const holidayDate = piece.find((m) => holidayMention(m, ctx.ref));
    const holidayRole = holidayDate
      ? roleOf(blank.slice(a, holidayDate.start))?.role
      : undefined;
    const afterHoliday =
      holidayHere &&
      (cue?.role === "after" || cue?.role === "from") &&
      (holidayRole === "after" || holidayRole === "from") &&
      activityWords.length > 0;
    // an event beside the holiday's own words: "họp lớp tết", "thi giáng sinh", "đi chơi noel" (a birthday alone is none)
    const eventWords = activityWords.join(" ").replace(ALL_DAY_CUE, " ");
    const holidayActivity =
      !playfulTitle && (DNDCUE.test(eventWords) || EXAM.test(eventWords) || /\b(choi|ve que|cung|thap huong|len chua|vieng|tao mo|hai loc|cau an|le chua)\b/.test(eventWords));
    const allDayHere =
      !hasTimeHint &&
      !range &&
      !eventHere &&
      !afterHoliday &&
      (!due || holidayBefore) &&
      (ALL_DAY_CUE.test(fpiece) || (holidayHere && type === "PLAN"));
    // a holiday or birthday with a task verb is a task due that day; alone it is no item
    // the verb may come after the date: "20/11 giặt đồ" opens with it once the date is out
    const taskHere =
      (TASK_VERB.test(fpiece.trimStart()) ||
        (!borrowed && TASK_VERB.test(fold(title).text)) ||
        TASK_WORD.test(fpiece)) &&
      !busy;
    title = remapInstitutionalTitle(
      title,
      fixed || /\b(nop|gui|submit)\b/.test(fpiece),
    );
    if (
      /^(?:sinh\s+vien\s+)?(?:nộp|nop|submit)\b.*?\btheo\s+lich/i.test(
        fold(title).text,
      )
    )
      continue;
    const generic = words(title) < 2;

    const time =
      (timeFound && timeFound.v.k === "time" ? timeFound.v : undefined) ??
      (periodRes ? { h: periodRes.h, mi: periodRes.mi } : undefined);
    const durMin =
      (dur && dur.v.k === "dur" ? dur.v.min : undefined) ??
      timeRangeDur ??
      (periodRes ? periodRes.durationMinutes : undefined);
    let location = place && place.v.k === "place" ? place.v.text : location0;
    const isOnline =
      /truc\s+tuyen|online|zoom|meet/i.test(cueText) ||
      /truc\s+tuyen|online/i.test(folded);
    const uPiece = firstUrl(pieceText);
    const uClause = firstUrl(raw);
    const uDoc = ctx.meetingUrl;
    const urlLocation = uPiece ?? uClause ?? uDoc;
    if (urlLocation && (isOnline || !location)) {
      location = urlLocation;
    }

    const emit = (
      kindIn: ReaderItemType,
      date: ReaderWC,
      how: DateRes["how"],
      to?: ReaderWC,
      at?: [number, number],
    ): ReaderItem => {
      // "họp sau thứ 6": a fixed kind with no clock can start after the day, so it is a task from there
      // "sau 9h họp nhóm" is a task that may not start before 9
      // "họp nhóm sáng thứ 2": with no clock said, a busy kind is a plan kept in its day or part, never a guessed fixed hour
      const kind: ReaderItemType =
        ((kindIn === "BUSY" || kindIn === "EXAM" || kindIn === "LECTURE") &&
          !at &&
          !rrule &&
          (fromCue || (!time && (cue?.role === "after" || cue?.role === "from")))) ||
        (kindIn === "BUSY" && !at && !time && (!to || !!span) && !periodMention && !/\bca (?:buoi|ngay)\b/.test(fpiece))
          ? "PLAN"
          : kindIn;
      // an offset moves a written date: "2 ngày trước 20/11" is 18/11
      if (cue?.days !== undefined && pieceDates.length && !to)
        date = addDays(date, cue.days);
      // "24:30" is 00:30 of the day after its date
      if (timeFound?.v.k === "time" && timeFound.v.next)
        date = addDays(date, 1);
      // a passed clock rolls on: a relative day to the next day (a weekday to next week); a written date stays in its nearest year
      const stop = at ?? (time ? [time.h, time.mi] : partClock);
      // 0:00 ("12h đêm nay", "midnight tonight") ends its day, so it is ahead all day; "12am" starts it
      const endsDay =
        !at &&
        !!stop &&
        stop[0] === 0 &&
        stop[1] === 0 &&
        !(time && "part" in time && time.part === "sang");
      // a range keeps its start: its end is what has to be ahead ("9h đến 1h chiều" at 10:00 is under way today)
      // "sáng sớm dọn phòng" said with no day is today's early morning, even after its 8:00 end
      const earlyToday = !time && !at && partWords[0] === "sang som" && pieceDates.every((d) => d.v.k === "rel" && d.v.off === 0);
      const passed =
        !to &&
        !earlyToday &&
        minutesOf({
          ...date,
          h: endsDay ? 23 : (stop?.[0] ?? 23),
          mi: endsDay ? 59 : (stop?.[1] ?? 59),
        }) +
          (time && !at && !endsDay ? (timeRangeDur ?? 0) : 0) <
          minutesOf(ctx.ref);
      // a said "hôm nay 8h", "3h chiều nay" keeps its day with a clock already past: flagged, never moved to tomorrow.
      // A part alone ("làm slide sáng nay" at 19:00) still rolls, and so does a small-hours clock ("đêm nay 1h" is after midnight).
      const saidToday =
        how === "rel" &&
        !!(at ?? time) &&
        (at ?? [time!.h])[0] >= 5 &&
        dayNo(date) <= dayNo(ctx.ref) &&
        dateList.some((m) => m.v.k === "rel" && m.v.off <= 0);
      // a weekday, its own or the one a piece inherits, that has passed is next week
      const byWeekday =
        weekday?.v.k === "dow" ||
        (how === "inherit" && inherited.some((m) => m.v.k === "dow"));
      if (passed && !saidToday && (how === "rel" || (how === "inherit" && byWeekday)))
        date = addDays(date, byWeekday ? 7 : 1);
      // a said start moves the series' first day; a relative start of a BYDAY rule is its first listed day
      if (recur && rrule && fromDate && dayNo(date) < dayNo(seriesFrom)) date = seriesFrom;
      if (recur && rrule && (how === "rel" || how === "inherit" || fromDate))
        date = firstByDay(date, rrule);
      const inferred: string[] = [];
      const noteHtml =
        ctx.sectionNote?.get(c.section ?? -1) ?? ctx.sectionNote?.get(-1);
      const item: ReaderItem = {
        type: kind,
        title,
        note: noteHtml || null,
        durationMinutes:
          durMin ??
          // a meeting made flexible keeps a meeting's length, not a task's
          defaultMinutes(kind, `${pieceText} ${c.sectionTitle ?? ""}`, kindIn === "BUSY"),
        location,
        confidence: 0,
        inferred,
        // a written year already gone ("20/11/1999") keeps its date, flagged like a passed "hôm nay"
        flags: passed && (saidToday || (how === "explicit" && dayNo(date) < dayNo(ctx.ref))) ? [...flags, "date_past"] : [...flags],
        alternatives: [...alternatives],
        evidence: pieceText.trim().slice(0, 300),
        checked: false,
      };
      if (!durMin) inferred.push("durationMinutes");
      const dateF = how === "explicit" ? 1 : how === "short" ? 0.95 : 0.9;
      let timeF = 1;
      // the clock of the item: a count from now ("at"), else the phrase's own time
      const clock: [number, number] | undefined =
        at ?? (time ? [time.h, time.mi] : undefined);
      // a clock of 0:00 ends its day: the deadline is the next day's midnight, but "12am" (0:00 in the morning) is the start of its day
      const amMidnight =
        !!time &&
        "part" in time &&
        time.part === "sang" &&
        time.h === 0 &&
        time.mi === 0;
      const on = (w: ReaderWC, c: [number, number]) =>
        c[0] === 0 && c[1] === 0 && !at && !amMidnight
          ? stamp(addDays(w, 1), 0, 0)
          : stamp(w, c[0], c[1]);
      // a start rounds to the 15-minute grid: 8:55 is 9:00, 9:10 is 9:15, 23:55 is midnight of the next day
      const gridStamp = (w: ReaderWC, c: [number, number]) => {
        const t = round15(c[0] * 60 + c[1]);
        return stamp(
          addDays(w, Math.floor(t / 1440)),
          Math.floor((t % 1440) / 60),
          t % 60,
        );
      };
      const startOn = (w: ReaderWC, c: [number, number]) =>
        c[0] === 0 && c[1] === 0 ? on(w, [0, 0]) : gridStamp(w, c); // only a said 0:00 ends its day: 00:05 starts it
      if (kind === "EXAM" || kind === "LECTURE" || kind === "BUSY") {
        let c: [number, number];
        const untilStart = !!clock && untilClock && !at && !timeRangeDur;
        if (untilStart) {
          // "chơi game tới 1h": the clock ends the block, which starts its length before
          const t = clock[0] * 60 + clock[1] - (item.durationMinutes ?? 60);
          if (t < 0) date = addDays(date, -1);
          c = [Math.floor(((t + 1440) % 1440) / 60), (t + 1440) % 60];
        } else if (clock) c = clock;
        else if (periodUnknown) {
          // the portal has no clock for this period: the day only, the app picks the hour
          item.days = [stamp(date, 0, 0).slice(0, 10)];
          timeF = 0.8;
        } else {
          c = partSpec ? partSpec.start : [8, 0];
          // an exam or a class: its usual starts in order, the first in the said part that is ahead and free of the user's classes, exams and this read's blocks
          const slots = SLOTS[kind];
          if (slots) {
            const len = item.durationMinutes ?? 90;
            const day = stamp(date, 0, 0).slice(0, 10);
            const cal = ctx.calendar?.find((d) => d.date === day);
            const held: [number, number][] = [
              ...(cal?.classes.map((x): [number, number] => [x.start, x.end]) ?? []),
              ...(cal?.exams.map((x): [number, number] => [x.start, x.start + 120]) ?? []),
              ...(ctx.taken ?? []).filter((x) => x.day === day).map((x): [number, number] => [x.start, x.end]),
            ];
            const [lo, hi] = partSpec ? SLOT_PART[partSpec.window] ?? [0, 1440] : [0, 1440];
            const ahead = dayNo(date) > dayNo(ctx.ref) ? -1 : (ctx.ref.h ?? 0) * 60 + (ctx.ref.mi ?? 0);
            const open = slots.filter(([h, mi]) => h * 60 + mi >= lo && h * 60 + mi < hi && h * 60 + mi > ahead);
            // every slot of the part taken: its first usual start still, so the clash shows, never an odd hour
            const free = open.find(([h, mi]) => !held.some(([a, b]) => h * 60 + mi < b && h * 60 + mi + len > a)) ?? open[0];
            if (free) c = free;
          }
          // a guessed start already past today moves to the next half hour: "thi cuối tuần" said Sunday 10:00 is 10:30
          const now = (ctx.ref.h ?? 0) * 60 + (ctx.ref.mi ?? 0);
          const next = Math.ceil((now + 1) / 30) * 30;
          if (dayNo(date) === dayNo(ctx.ref) && c[0] * 60 + c[1] < now && next < 1440)
            c = [Math.floor(next / 60), next % 60];
          if (partSpec) item.windows = partWindows;
          timeF = 0.8;
          inferred.push("startsAt");
        }
        // a fixed start rounds to the 15-minute grid: "9h10" is 9:15, "9h15" stays
        if (!periodUnknown || clock) {
          item.startsAt = untilStart ? gridStamp(date, c!) : startOn(date, c!);
          const s = +item.startsAt.slice(11, 13) * 60 + +item.startsAt.slice(14, 16);
          ctx.taken?.push({ day: item.startsAt.slice(0, 10), start: s, end: s + (item.durationMinutes ?? 60) });
        }
      } else if (range && to) {
        if (evalRange) {
          // Evaluation window: preparation must finish before the window opens
          const eve = addDays(date, -1);
          item.deadline = stamp(
            dayNo(eve) < dayNo(ctx.ref) ? ctx.ref : eve,
            23,
            59,
          );
          const prepStart = addDays(eve, -6);
          item.notBefore = stamp(
            dayNo(prepStart) < dayNo(ctx.ref) ? ctx.ref : prepStart,
            0,
            0,
          );
          inferred.push("deadline");
        } else {
          // "từ giờ đến …" starts at the clock of now
          const [sh, sm] = range.start ?? range.from.clock ?? [0, 0];
          item.notBefore = gridStamp(date, [sh, sm]);
          if (clock) item.deadline = on(to, clock);
          else {
            const [h, mi] = range.end ?? partClock ?? [23, 59];
            item.deadline = stamp(to, h, mi);
            if (partSpec) item.windows = partWindows;
            inferred.push("deadline");
          }
        }
      } else {
        if (prep || (isPresentation && !hasTimeHint && !due)) {
          // an event with no clock: prepare by the end of the day before, never earlier than today
          const eve = addDays(date, -1);
          item.deadline = stamp(
            dayNo(eve) < dayNo(ctx.ref) ? ctx.ref : eve,
            23,
            59,
          );
          inferred.push("deadline");
        } else if (
          fromCue &&
          (kind === "PLAN" || kind === "ASSIGNMENT") &&
          clock &&
          !at
        ) {
          // "sau 9h": the work starts at the clock and is due by the end of the day, or at the range's end clock
          item.notBefore = startOn(date, clock);
          item.deadline = stamp(date, 23, 59);
          inferred.push("deadline");
        } else if (
          rangeEnd &&
          clock &&
          !at &&
          (kind === "PLAN" || kind === "ASSIGNMENT")
        ) {
          // "sau 17h trước 22h": the work starts at the first clock and is due at the second
          item.notBefore = startOn(date, clock);
          item.deadline = stamp(
            rangeEndNext ? addDays(date, 1) : date,
            rangeEnd[0],
            rangeEnd[1],
          );
          inferred.push("deadline");
        } else if (
          cue &&
          (cue.role === "after" || cue.role === "from") &&
          !clock &&
          (kind === "PLAN" || kind === "ASSIGNMENT")
        ) {
          // "sau 20/11" starts the day after, "từ 20/11" that day: a start with no deadline
          // "sau Tết" is after the five-day break: lunar 1/6
          const afterBreak =
            holidayM?.v.k === "holiday" &&
            /^tet$/.test(fold(holidayM.v.phrase).text);
          item.notBefore = stamp(
            cue.role === "after" ? addDays(date, afterBreak ? 5 : 1) : date,
            0,
            0,
          );
        } else if (
          cue?.role === "before" &&
          holidayCue &&
          !clock &&
          cue.days === undefined
        ) {
          // "trước Tết", "mua quà 20/11 trước nhà giáo": the eve of the holiday
          item.deadline = stamp(addDays(date, -1), 23, 59);
          inferred.push("deadline");
        } else if (clock) {
          // "by midnight 20/11" is that day's last minute; "trước 0h 20/11" is the end of the day before
          const englishMidnight =
            !!timeFound &&
            /midnight/i.test(blank.slice(timeFound.start, timeFound.end));
          item.deadline = englishMidnight
            ? stamp(date, 23, 59)
            : cue?.role === "before" && clock[0] === 0 && clock[1] === 0
              ? // "trước 0h hôm nay" is tonight: never a day already gone
                stamp(dayNo(date) > dayNo(ctx.ref) ? addDays(date, -1) : date, 23, 59)
              : on(date, clock);
        } else {
          // several parts of the day end the day; one part keeps its own clock
          const [h, mi] =
            !due && partWindows.length > 1 ? [23, 59] : (partClock ?? [23, 59]);
          item.deadline = stamp(date, h, mi);
          // "cafe cn này": a task with no due cue happens on its day, not any time before
          // "ngày 20/11", "vào thứ 6": the at-words name the day the same way
          if (kind === "PLAN" && !due && (!cue || (cue.role === "at" && cue.days === undefined)))
            item.notBefore = stamp(date, 0, 0);
          if (partSpec) {
            // a due cue makes the part of the day a deadline clock only
            if (!due) item.windows = partWindows;
            timeF = 0.8;
          }
          inferred.push("deadline");
        }
      }
      const nucF = borrowed || generic ? 0.85 : 1;
      item.confidence =
        Math.round(dateF * timeF * nucF * (0.5 + 0.5 * r) * 100) / 100;
      item.checked =
        item.confidence + 1e-9 >= PRECHECK &&
        !inferred.includes("startsAt") &&
        !inferred.includes("deadline") &&
        !prep &&
        gate !== "menu";
      // a said repeat ("hàng tuần", "mỗi 2 tuần") repeats a flexible row too; a bare weekday list repeats only a fixed one
      if (rrule && (item.startsAt || recur)) item.rrule = rrule;
      item.inferred = [...new Set(inferred)];
      return item;
    };

    // an exam in a date range is a window to prepare for, like a defense: its prep tasks replace the window item
    const evalRange =
      !!range &&
      dayNo(range.to.wc) > dayNo(range.from.wc) &&
      /\b(bao ve|hoi dong|van dap|thi|cuoi ky|dot thi|phong van|pitching|lich bao cao)\b/i.test(
        fpiece,
      ) &&
      !/\b(nop|submit|gui|upload|dong phi)\b/i.test(fpiece) &&
      !STUDY_EXAM.test(fpiece);
    // a range window's prep is named for the topic of the document, the window's own title when it has none
    const examWin = { title, evidence: pieceText };
    // a date-only range of two or more days is one busy block from its first midnight, with no clock
    const dateSpan =
      !!range &&
      !span &&
      !evalRange &&
      resolved.length >= 2 &&
      !timeFound &&
      dayNo(range.to.wc) > dayNo(range.from.wc) &&
      !assign &&
      (type === "BUSY" ||
        (type === "PLAN" &&
          !due &&
          !TASK_WORD.test(fpiece) &&
          (!taskLed || /\b(di|du lich|nghi)\b/.test(fpiece))));
    const producedBefore = produced.length;
    if (dateSpan && range) {
      // a date range with no activity and no title is no item, like a holiday alone
      if (playfulTitle) continue;
      produced.push({
        ...emit("BUSY", range.from.wc, range.from.how, undefined, [0, 0]),
        durationMinutes: (dayNo(range.to.wc) - dayNo(range.from.wc) + 1) * 1440,
      });
    } else if (range) {
      // the window itself is a busy block of days, next to its prep tasks; a vague span ("thi tuần sau") blocks no week
      if (evalRange && !span) {
        produced.push({
          ...emit("BUSY", range.from.wc, range.from.how, undefined, [0, 0]),
          durationMinutes:
            (dayNo(range.to.wc) - dayNo(range.from.wc) + 1) * 1440,
        });
      }
      if (evalRange)
        produced.push(
          ...examPreps(
            {
              ...examWin,
              title: ctx.docTopic ?? ctx.courseTitle ?? windowTitle(title),
              at: stamp(range.from.wc, 0, 0),
              day: range.from.wc,
            },
            ctx.ref,
            reqOf(ctx),
            ctx.affinity,
          ),
        );
      else
        produced.push(
          emit(
            officeHours && type === "BUSY" ? "PLAN" : type,
            range.from.wc,
            range.from.how,
            range.to.wc,
          ),
        );
    } else if (recur && (type === "PLAN" || type === "ASSIGNMENT") && !fixed) {
      // a recurring task is one row per day to its deadline; with no date it is one daily rrule row
      const last = listed.at(-1)?.res.wc;
      const count =
        pieceDates.length && last ? dayNo(last) - dayNo(ctx.ref) + 1 : 7;
      const planKey = `recur${produced.length}`;
      const monthly = recur.v.k === "recur" && recur.v.freq === "MONTHLY";
      const inWeek = thisWeekCount(fpiece);
      const sessions = inWeek ? weekSessions(inWeek, ctx.ref) : [];
      if (sessions.length) {
        // "3 buổi trong tuần này": one row a session in the days left, a day with several keeps them in different parts
        const key = `week${produced.length}`;
        for (const { off, window } of sessions) {
          const it = emit("PLAN", addDays(ctx.ref, off), "rel");
          const day = stamp(addDays(ctx.ref, off), 0, 0).slice(0, 10);
          it.notBefore = `${day} 00:00`;
          it.deadline = `${day} 23:59`;
          if (window) it.windows = [window];
          else delete it.windows;
          delete it.rrule;
          produced.push(sessions.length > 1 ? { ...it, planKey: key } : it);
        }
      } else if (rrule && /;(?:UNTIL|COUNT)=/.test(rrule)) {
        // a bounded rule is one row: its UNTIL or COUNT ends the series; the row keeps its first day and its window, as an open one does
        produced.push({ ...emit("PLAN", ctx.ref, "rel"), rrule });
      } else if (!pieceDates.length)
        produced.push({ ...emit("PLAN", ctx.ref, "rel"), rrule });
      else if (monthly) {
        // one monthly row on the named day of the month
        const f = listed[0];
        produced.push({
          ...emit("PLAN", f.res.wc, f.res.how, undefined, f.res.clock),
          rrule,
        });
      } else if (rrule && !/FREQ=DAILY/.test(rrule)) {
        // a weekly repeat cue with a day list: one row with the rule, the backend expands it
        const f = listed[0];
        produced.push({
          ...emit("PLAN", f.res.wc, f.res.how, undefined, f.res.clock),
          rrule,
        });
      } else if (count > MAX_SESSION_DAYS && last)
        // a long run to a far deadline is one bounded row, not a row a day ("mỗi ngày trước 20/11/2031" was 1832 rows)
        produced.push({ ...emit("PLAN", ctx.ref, "rel"), rrule: withBounds(rrule ?? "FREQ=DAILY", "", last) });
      else if (count > 0)
        for (let k = 0; k < count; k++)
          produced.push({
            ...emit("PLAN", addDays(ctx.ref, k), "rel"),
            planKey,
          });
      else
        for (const { res } of listed)
          produced.push(emit(type, res.wc, res.how, undefined, res.clock));
    } else if (undatedTask) {
      // no date and no clock: no deadline, the length is the usual one
      // a fixed kind has no start without a clock: an undated task stays a task
      // "trong vòng 3 ngày" is due that many days out, by the end of the day
      const within = withinDays(fpiece);
      // an undated exam in a period stays an exam, with no day and no clock
      const keep = !!periodMention && type === "EXAM";
      const it = emit(
        !keep && (type === "BUSY" || type === "EXAM" || type === "LECTURE")
          ? "PLAN"
          : type,
        addDays(ctx.ref, within ?? 0),
        "rel",
      );
      if (keep) {
        delete it.days;
        delete it.startsAt;
        it.inferred = it.inferred.filter((x) => x !== "startsAt");
      }
      if (within === undefined) {
        delete it.deadline;
        it.inferred = it.inferred.filter((x) => x !== "deadline");
      }
      produced.push(it);
    } else if (dayBlock) {
      for (
        let d = resolved[0].res.wc;
        dayNo(d) <= dayNo(resolved[1].res.wc);
        d = addDays(d, 1)
      )
        produced.push({
          ...emit("BUSY", d, resolved[0].res.how, undefined, dayBlock.start),
          durationMinutes: dayBlock.min,
        });
    } else
      for (const { res, f } of rrule ? listed.slice(0, 1) : listed) {
        // a busy block of two or more days starts at its first midnight; a single day is never a whole-day block
        // "nghỉ tết": the five-day break from lunar 1/1, a span like a trip
        const breakSpan =
          holidayM?.v.k === "holiday" &&
          /^tet$/.test(fold(holidayM.v.phrase).text) &&
          /\bnghi\b/.test(fpiece);
        const spanMin = breakSpan
          ? 5 * 1440
          : busyDur?.v.k === "dur"
            ? busyDur.v.min
            : 0;
        const span = breakSpan || (busy && spanMin >= 2880);
        const wholeDay = !span && (allDayHere || busy);
        // a holiday or birthday alone is no item; with an activity ("họp lớp tết", "thi giáng sinh") it is one on that day
        // only the holiday's own date goes: a day word in the same piece still dates the item
        if (wholeDay && !taskHere && !holidayActivity && holidayMention(f, ctx.ref)) continue;
        const it = emit(
          span
            ? "BUSY"
            : wholeDay || afterHoliday
              ? "PLAN"
              : fixed
                ? type === "PLAN" || type === "ASSIGNMENT"
                  ? "BUSY"
                  : type
                : type,
          res.wc,
          res.how,
          undefined,
          span ? [0, 0] : res.clock,
        );
        if (span) it.durationMinutes = spanMin;
        if (playfulTitle) it.inferred.push("title");
        produced.push(it);
        if (type === "EXAM")
          produced.push(
            ...examPreps(
              {
                ...examWin,
                at: it.startsAt ?? it.deadline ?? stamp(res.wc, 0, 0),
                day: res.wc,
              },
              ctx.ref,
              // a sibling item with its own date ("nộp báo cáo trước thứ 6") is its own task, not this exam's report
              ownReq(reqOf(ctx), ctx.fullText, raw, ctx.ref),
              ctx.affinity,
            ),
          );
        // a presentation with a clock and no due cue: its prep task is due at the start
        if (
          isPresentation &&
          hasTimeHint &&
          !due &&
          it.type === "BUSY" &&
          it.startsAt
        ) {
          produced.push({
            type: "PLAN",
            title: remapInstitutionalTitle(title),
            note: it.note,
            prep: true,
            deadline: it.startsAt,
            durationMinutes: prepMinutes(
              PRESENTATION_PREP_MINUTES,
              1,
              res.wc,
              ctx.ref,
              affinityOf(ctx.affinity, title),
            ),
            confidence: it.confidence,
            inferred: ["durationMinutes"],
            flags: [],
            alternatives: [],
            evidence: it.evidence,
            checked: it.checked,
          });
        }
      }
    // a day OR list is one item: its days, bounded by the first and last day when it is a task
    if (dayOr) {
      for (const it of produced.slice(producedBefore)) {
        it.days = dayOr.map((w) => stamp(w, 0, 0).slice(0, 10));
        if (!it.startsAt && (it.type === "PLAN" || it.type === "ASSIGNMENT")) {
          it.notBefore = stamp(dayOr[0], 0, 0);
          it.deadline = stamp(dayOr.at(-1) ?? dayOr[0], 23, 59);
        }
      }
    }
    // "tí nữa nộp báo cáo": a leading time filler with no day, part of day or clock said means later today, flexible
    if (!pieceDates.length && !timeFound && !recur && !partWords.length) {
      if (leadsFiller(fpiece))
        for (const it of produced.slice(producedBefore)) laterToday(it, ctx.ref);
    }
    for (const it of produced.slice(producedBefore))
      if (recur) ruledItems.add(it);
      else if (!pieceDates.length) looseItems.add(it);
  }
  // "uống thuốc 7h sáng và 9h tối mỗi ngày": a same-titled piece with no day of its own repeats with the repeat beside it, from its first day
  const ruled = produced.find((it) => ruledItems.has(it) && it.rrule);
  // one series per title and clock: a piece that inherited each day of "T7 CN" is one row once it repeats
  const seriesKey = (it: ReaderItem) => `${fold(it.title).text}|${(it.startsAt ?? it.notBefore ?? "").slice(11)}|${it.windows?.join() ?? ""}|${it.rrule}`;
  const seen = new Set(produced.filter((it) => ruledItems.has(it)).map(seriesKey));
  if (ruled)
    for (const it of [...produced]) {
      if (!looseItems.has(it) || it.rrule || fold(it.title).text !== fold(ruled.title).text) continue;
      const at = it.startsAt ?? it.notBefore ?? it.deadline;
      if (!at) continue;
      const wc = (x: string): ReaderWC => ({ y: +x.slice(0, 4), m: +x.slice(5, 7), d: +x.slice(8, 10) });
      // a said start ("từ 1/12") holds every row; otherwise each clock starts on its own next day
      const start = fromDate && resolveDate(fromDate, ctx.ref)?.wc;
      const from = start && dayNo(wc(at)) < dayNo(start) ? start : wc(at);
      const n = dayNo(firstByDay(from, ruled.rrule!)) - dayNo(wc(at));
      const move = (x?: string) => x && stamp(addDays(wc(x), n), +x.slice(11, 13), +x.slice(14, 16));
      it.rrule = ruled.rrule;
      if (it.startsAt) it.startsAt = move(it.startsAt);
      if (it.notBefore) it.notBefore = move(it.notBefore);
      if (it.deadline) it.deadline = move(it.deadline);
      if (it.days) it.days = it.days.map((d) => stamp(addDays(wc(d), n), 0, 0).slice(0, 10));
      if (seen.has(seriesKey(it))) produced.splice(produced.indexOf(it), 1);
      else seen.add(seriesKey(it));
    }

  // S7 gates: relevance first, then expiry
  const reason: ReaderDropReason | undefined =
    notMine || gate === "not_mine"
      ? "not_mine"
      : optional
        ? "optional"
        : undefined;
  if (reason) {
    if (produced.length) out.dropped.push({ quote: raw.slice(0, 60), reason });
    return out;
  }
  const now = minutesOf(ctx.ref);
  // A far deadline keeps its real day ("nộp bài trung thu" is Trung thu); the planner places the work before it, within its own horizon.
  for (const item of produced) {
    const at = item.startsAt ?? item.deadline;
    if (
      at &&
      Math.round(Date.parse(`${at.replace(" ", "T")}:00Z`) / 60000) < now
    )
      item.checked = false;
    out.items.push(item);
  }
  return out;
}

/**
 * The item for text that made none: a free flexible task titled with the input. No date, clock or length,
 * so placement picks the slot. shortcut: title cut to 120 chars (Session.title), a longer column lifts it.
 */
/** A line with no item keeps its words; only a time filler before a verb and an edge complement ("giúp mình") go. */
function edgeTrimmed(text: string): string {
  const toks = text.split(/\s+/).filter(Boolean);
  const keys = toks.map((w) => fold(w).text.replace(/[^a-z0-9]/g, ""));
  const from = timeFillerEnd(keys, 0);
  // "nhắc tôi uống nước", "nhớ mua bánh mì", "đừng quên gọi Lan": the reminder words are not the task, when a task follows
  const lead = /^(?:(?:nhac|nho|ghi nho)(?: (?:toi|minh|em|tui|anh|chi))?(?: (?:la|phai))?|dung quen(?: (?:la|phai))?) /.exec(`${keys.slice(from).join(" ")} `);
  const n = lead && from + lead[0].trim().split(" ").length < toks.length ? lead[0].trim().split(" ").length : 0;
  const body = toks.slice(from + n).join(" ");
  const t = edgesOf(body.split(/\s+/).filter(Boolean)).replace(/[^\p{L}\d]+$/u, "");
  return t || text;
}

/** A first letter up, unless the first word has a capital of its own ("iOS", "TikTok"), as the reader's titles. */
const capFirst = (t: string) => (/\p{Lu}/u.test(t.split(" ")[0].slice(1)) ? t : t.charAt(0).toUpperCase() + t.slice(1));

export function fallbackTask(raw: string): ReaderItem {
  const text = raw.trim();
  return {
    type: "PLAN",
    // the terms still take their display form: "nâng cấp ram" is "nâng cấp RAM"
    // (not "ram" beside a lunar word: "cúng ram" is the full moon)
    title: capFirst(canonPhrases(edgeTrimmed(text).split(" ").map((w) => (LUNAR_CONTEXT.test(fold(text).text) ? w : canonToken(w))).join(" ")).slice(0, 120)),
    confidence: 0,
    inferred: [],
    flags: [],
    alternatives: [],
    evidence: text.slice(0, 300),
    checked: false,
  };
}

/** What the user usually saves for a title: median length, median part of day, most common type. */
export interface Prior {
  durationMinutes?: number;
  window?: ReaderWindow;
  type?: ReaderItemType;
}

/** A saved item, as stored in `CaptureItem.committed`. */
export interface Committed {
  title: string;
  type: ReaderItemType;
  durationMinutes?: number;
  window?: ReaderWindow;
}

/** Fewest saved rows of a title before the prior speaks. */
export const PRIOR_MIN_ROWS = 2;
/** Newest saved rows of a title the prior reads. */
export const PRIOR_ROWS = 5;
const WINDOW_ORDER: ReaderWindow[] = [
  "EARLY_MORNING",
  "DAWN",
  "MORNING",
  "NOON",
  "AFTERNOON",
  "EVENING",
  "NIGHT",
  "MIDNIGHT",
];

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

/** The prior per folded title from saved items, newest first. A title with fewer than `PRIOR_MIN_ROWS` rows has none. */
export function personalPrior(rows: Committed[]): Map<string, Prior> {
  const byKey = new Map<string, Committed[]>();
  for (const r of rows) {
    const key = fold(r.title).text.trim();
    const list = byKey.get(key) ?? [];
    if (key && list.length < PRIOR_ROWS) byKey.set(key, [...list, r]);
  }
  const out = new Map<string, Prior>();
  for (const [key, list] of byKey) {
    if (list.length < PRIOR_MIN_ROWS) continue;
    const durs = list.flatMap((r) => r.durationMinutes ?? []);
    const wins = list.flatMap((r) =>
      r.window ? [WINDOW_ORDER.indexOf(r.window)] : [],
    );
    // the newest row breaks a tie, as the first of the equally common
    const counts = new Map<ReaderItemType, number>();
    for (const r of list) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
    const type = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    out.set(key, {
      durationMinutes: durs.length ? lengthMin(median(durs)) : undefined,
      window: wins.length ? WINDOW_ORDER[median(wins)] : undefined,
      type,
    });
  }
  return out;
}

/** Fills what the text left open from the prior. Each filled field stays in `inferred`, so the app shows it as a ghost. */
export function applyPrior(it: ReaderItem, prior?: Map<string, Prior>): void {
  const p = prior?.get(fold(it.title).text.trim());
  if (!p) return;
  if (
    p.durationMinutes &&
    (it.durationMinutes === undefined ||
      it.inferred.includes("durationMinutes"))
  ) {
    it.durationMinutes = p.durationMinutes;
    if (!it.inferred.includes("durationMinutes"))
      it.inferred.push("durationMinutes");
  }
  // the saved parts of the day never fill in: no time of day in the text means any
  // only the default type moves, and only between the two deadline types
  if (
    p.type &&
    it.type === "PLAN" &&
    p.type === "ASSIGNMENT" &&
    !it.inferred.includes("type")
  ) {
    it.type = p.type;
    it.inferred.push("type");
  }
}
