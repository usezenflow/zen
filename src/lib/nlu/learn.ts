// Online NLU learner: combines 1) LinUCB-style Bayesian Ridge over structured (title + note) features,
// 2) time-decayed semantic + phrase k-NN statistics, and 3) token-alignment NLP for iOS-style title auto-correction.
// Pure and zero-dependency; persisted in kv("nlu.learn") so backups and resets carry it automatically.
import type { Kind } from "../types";
import type { ReaderItem, ReaderRepair, ReaderWC } from "./shared";
import { DIM, embed } from "./embed";
import { frameOf, type TaskClass } from "./frame";
import { fold, osa } from "./reader/fold";
import { isMicro, r30, snapGuess, T } from "./size";

const rowOf = (cls?: string) => (cls && cls in T ? T[cls as TaskClass] : undefined);

const DAY = 86_400_000;
const VN = 7 * 3_600_000;
export const NLU_KEY = "nlu.learn";
export const HALF_LIFE_NLU = 45 * DAY;
export const D_NLU = 14;
export const LAMBDA_NLU = 2;
const ALPHA_CONSERVATIVE = 0.25;
const ALPHA_LOC = 0.35;
const MAX_LEX = 200;
const MAX_SAMPLES = 160;
const MAX_LOCS = 24;

export interface RidgeArm {
  A: number[]; // D_NLU x D_NLU row-major precision matrix
  b: number[]; // D_NLU response-weighted feature sum
}

export interface LexRule {
  from: string;
  to: string;
  good: number;
  bad: number;
  /** True when the rule's target carries mid-sentence capitalization (proper noun or acronym). */
  cased?: boolean;
  at: number;
}

export interface LocArm {
  label: string;
  arm: RidgeArm;
  count: number;
  at: number;
}

export interface NluSample {
  taskId?: string;
  vec: number[]; // quantized 96-dim contextVec(title, note)
  phrases: string[]; // salient unigrams & bigrams from title + note
  cls?: string;
  kind?: Kind;
  minutes?: number;
  baseMin?: number;
  sitMin?: number;
  /** Positive days offset when user set a deadline; null when user explicitly cleared a deadline. */
  dueDays?: number | null;
  baseDays?: number;
  /** Location string when user set one; null when user explicitly cleared it. */
  loc?: string | null;
  durR?: number;
  dueR?: number;
  gateR?: number;
  at: number;
}

export interface NluLearned {
  v: 1;
  at: number;
  lex: Record<string, LexRule>;
  rejected: Record<string, number>;
  dur: RidgeArm;
  due: RidgeArm;
  dueGate: RidgeArm;
  locs: Record<string, LocArm>;
  samples: NluSample[];
}

export function coldRidge(): RidgeArm {
  const A = new Array<number>(D_NLU * D_NLU).fill(0);
  for (let i = 0; i < D_NLU; i++) A[i * D_NLU + i] = LAMBDA_NLU;
  return { A, b: new Array<number>(D_NLU).fill(0) };
}

export function newNluLearned(now = 0): NluLearned {
  return {
    v: 1,
    at: now,
    lex: {},
    rejected: {},
    dur: coldRidge(),
    due: coldRidge(),
    dueGate: coldRidge(),
    locs: {},
    samples: [],
  };
}

export function parseNluLearned(raw: string | null | undefined, now = 0): NluLearned {
  if (!raw) return newNluLearned(now);
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || j.v !== 1) return newNluLearned(now);
    const okArm = (a: unknown): a is RidgeArm =>
      !!a && Array.isArray((a as RidgeArm).A) && (a as RidgeArm).A.length === D_NLU * D_NLU && Array.isArray((a as RidgeArm).b) && (a as RidgeArm).b.length === D_NLU;
    return {
      v: 1,
      at: typeof j.at === "number" ? j.at : now,
      lex: j.lex && typeof j.lex === "object" ? j.lex : {},
      rejected: j.rejected && typeof j.rejected === "object" ? j.rejected : {},
      dur: okArm(j.dur) ? j.dur : coldRidge(),
      due: okArm(j.due) ? j.due : coldRidge(),
      dueGate: okArm(j.dueGate) ? j.dueGate : coldRidge(),
      locs: j.locs && typeof j.locs === "object" ? j.locs : {},
      samples: Array.isArray(j.samples) ? j.samples : [],
    };
  } catch {
    return newNluLearned(now);
  }
}

function decayRidge(arm: RidgeArm, f: number): void {
  const cold = coldRidge();
  for (let k = 0; k < D_NLU * D_NLU; k++) arm.A[k] = cold.A[k] + f * (arm.A[k] - cold.A[k]);
  for (let i = 0; i < D_NLU; i++) arm.b[i] *= f;
}

export function decayNlu(m: NluLearned, now: number): void {
  const dt = now - m.at;
  if (dt <= 0) return;
  if (m.at > 0) {
    const f = 0.5 ** (dt / HALF_LIFE_NLU);
    decayRidge(m.dur, f);
    decayRidge(m.due, f);
    decayRidge(m.dueGate, f);
    for (const loc of Object.values(m.locs)) decayRidge(loc.arm, f);
  }
  m.at = now;
}

function updateRidge(arm: RidgeArm, x: number[], r: number, w = 1): void {
  for (let i = 0; i < D_NLU; i++) {
    const xi = x[i];
    if (!xi) continue;
    for (let j = 0; j < D_NLU; j++) arm.A[i * D_NLU + j] += w * xi * x[j];
    arm.b[i] += w * r * xi;
  }
}

function adjustRidgeB(arm: RidgeArm, x: number[], deltaR: number): void {
  for (let i = 0; i < D_NLU; i++) arm.b[i] += deltaR * x[i];
}

function invertRidge(A: number[]): Float64Array {
  const n = D_NLU;
  const M = Array.from({ length: n }, (_, i) => [
    ...A.slice(i * n, i * n + n),
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || LAMBDA_NLU;
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] = M[i][n + j];
  return out;
}

/** Posterior mean and epistemic standard deviation sqrt(x^T A^-1 x) for a LinUCB/Ridge arm. */
export function evalRidge(arm: RidgeArm, x: number[]): { mean: number; std: number } {
  const inv = invertRidge(arm.A);
  let mean = 0;
  let q = 0;
  for (let i = 0; i < D_NLU; i++) {
    const xi = x[i];
    if (!xi) continue;
    let th = 0;
    let vx = 0;
    const row = i * D_NLU;
    for (let j = 0; j < D_NLU; j++) {
      th += inv[row + j] * arm.b[j];
      vx += inv[row + j] * x[j];
    }
    mean += th * xi;
    q += xi * vx;
  }
  return { mean, std: Math.sqrt(Math.max(0, q)) };
}

/** Shrinks posterior mean toward 0 by alpha * std (LCB on magnitude), so uncertain directions stay at the prior. */
function conservative(arm: RidgeArm, x: number[], alpha = ALPHA_CONSERVATIVE): number {
  const { mean, std } = evalRidge(arm, x);
  const mag = Math.max(0, Math.abs(mean) - alpha * std);
  return mean < 0 ? -mag : mag;
}

/** Strips HTML from reader notes so task notes and reader notes produce identical features and embeddings. */
export const plainNote = (note?: string | null): string =>
  note
    ? note
        .replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .trim()
    : "";

/** Blends title and note embeddings (title primary, note 0.45 weight), L2-normalized. */
export function contextVec(title: string, note?: string | null): Float32Array {
  const vt = embed(title);
  const nt = plainNote(note).slice(0, 400);
  if (!nt) return vt;
  const vn = embed(nt);
  let hasT = false;
  let hasN = false;
  for (let i = 0; i < DIM; i++) {
    if (vt[i]) hasT = true;
    if (vn[i]) hasN = true;
  }
  if (!hasN) return vt;
  if (!hasT) return vn;
  const out = new Float32Array(DIM);
  let n = 0;
  for (let i = 0; i < DIM; i++) {
    const v = vt[i] + 0.45 * vn[i];
    out[i] = v;
    n += v * v;
  }
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < DIM; i++) out[i] /= n;
  return out;
}

const quantizeVec = (v: ArrayLike<number>): number[] => Array.from(v, (x) => Math.round(x * 1000) / 1000);

function cos(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 0;
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

const TIME_STOP = new Set([
  "nay", "mai", "hom", "qua", "kia", "sang", "trua", "chieu", "toi", "dem", "khuya", "som",
  "gio", "phut", "tieng", "ngay", "tuan", "thang", "nam", "thu", "cn", "luc", "vao", "truoc",
  "trc", "han", "chot", "deadline", "dl", "ddl", "den", "het", "trong", "sau", "khi", "moi",
  "hang", "buoi", "lan", "nhe", "nha", "giup", "gium", "minh", "tui", "em", "anh", "chi",
  "ghi", "chu", "luu", "note",
]);
const GENERIC = new Set([
  "lam", "viec", "hoc", "bai", "tap", "mon", "cho", "cua", "voi", "va", "vs", "hay", "hoac",
  "cai", "con", "mot", "hai", "ba", "bon", "nam", "sau", "bay", "tam", "chin", "muoi",
  "nhung", "cac", "can", "phai", "nho", "xem", "doc", "viet", "gui", "nop", "mua", "di",
  "tao", "them", "sua", "len", "dat", "the", "and", "for", "with", "from", "into", "this",
  "that", "new", "build", "make", "work", "task", "todo", "bang", "dung", "cung",
]);
const SHORT_DOMAIN = new Set(["ai", "ui", "ux", "fe", "be", "qa", "pr", "cv", "hr", "db", "os", "ml", "go", "js", "ts"]);

/** Extracts salient unigrams and adjacent content bigrams from (title, note) for phrase-level personalization. */
export function phrasesOf(title: string, note?: string | null): string[] {
  const out = new Set<string>();
  const scan = (src: string, limit: number) => {
    const toks = (fold(src.slice(0, 300)).text.match(/[a-z0-9]+/g) ?? []).filter(
      (w) => !/^\d+$/.test(w) && !/^t[2-7]$/.test(w) && !/^\d+[hgp]/.test(w) && !TIME_STOP.has(w),
    );
    for (let i = 0; i < toks.length && out.size < limit; i++) {
      const w = toks[i];
      if (!GENERIC.has(w) && (w.length >= 3 || SHORT_DOMAIN.has(w))) out.add(w);
      const nx = toks[i + 1];
      if (nx && (!GENERIC.has(w) || !GENERIC.has(nx)) && (w.length >= 2 && nx.length >= 2)) {
        out.add(`${w} ${nx}`);
      }
    }
  };
  scan(title, 10);
  const nt = plainNote(note);
  if (nt) scan(nt, 16);
  return [...out];
}

/** 14-dim structured context vector for LinUCB/Ridge heads from (title, note). */
export function nluFeatures(title: string, note?: string | null): number[] {
  const nt = plainNote(note);
  const f = frameOf(title, nt);
  const row = f.cls && T[f.cls] ? T[f.cls] : undefined;
  const shape = row?.shape ?? "errand";
  const dom = f.domain;
  const lines = nt ? nt.split(/\r?\n/).filter((l) => l.trim()).length : 0;
  return [
    1,
    shape === "project" ? 1 : 0,
    shape === "practice" ? 1 : 0,
    shape === "errand" ? 1 : 0,
    shape === "event" ? 1 : 0,
    dom === "study" ? 1 : 0,
    dom === "work" ? 1 : 0,
    dom === "home" || dom === "errand" || dom === "social" ? 1 : 0,
    dom === "health" || dom === "growth" || dom === "finance" || dom === "admin" ? 1 : 0,
    f.hard ? 1 : 0,
    f.group ? 1 : 0,
    f.qty ? Math.min(1, Math.log1p(f.qty.n) / 3) : 0,
    nt ? Math.min(1, lines / 4) : 0,
    f.stakes ? 1 : 0,
  ];
}

function sampleSim(qVec: ArrayLike<number>, qPhrases: string[], s: NluSample): number {
  const cVec = cos(qVec, s.vec);
  const sSet = new Set(s.phrases);
  let bi = 0;
  let uni = 0;
  const qUni = qPhrases.filter((p) => !p.includes(" "));
  const sUni = s.phrases.filter((p) => !p.includes(" "));
  for (const p of qPhrases) {
    if (!sSet.has(p)) continue;
    if (p.includes(" ")) bi++;
    else uni++;
  }
  const dice = qUni.length + sUni.length > 0 ? (2 * uni) / (qUni.length + sUni.length) : 0;
  const cLex = bi > 0 ? Math.min(1, 0.74 + 0.1 * (bi - 1) + 0.15 * dice) : 0.85 * dice;
  return Math.min(1, Math.max(cVec, cLex, 0.55 * cVec + 0.55 * cLex));
}

function weightedMedian(items: { v: number; w: number }[]): number {
  const sorted = [...items].sort((a, b) => a.v - b.v);
  const half = sorted.reduce((s, x) => s + x.w, 0) / 2;
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= half) return x.v;
  }
  return sorted[sorted.length - 1].v;
}

// --- iOS-style Title Auto-Correction & Shorthand Expansion ---

const normKey = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
const stripEdge = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const hasUpperInside = (s: string) => /\p{Lu}/u.test(s.slice(1));

/** True when `from` ("sp", "btvn", "fe", "side prj") plausibly abbreviates or mistypes `to` ("side project", "frontend"). */
function plausibleExpansion(fromFold: string, toFold: string, sharedContext: boolean): boolean {
  if (!fromFold || !toFold || /^\d+$/.test(fromFold) || TIME_STOP.has(fromFold)) return false;
  if (fromFold === toFold) return true;
  if (fromFold.length >= 3 && osa(fromFold, toFold) <= 2) return true;
  const fw = fromFold.split(" ");
  const tw = toFold.split(" ");
  // Acronym / initialism: "sp" -> "side project", "kltn" -> "khoa luan tot nghiep"
  if (fw.length === 1 && tw.length >= 2 && fw[0].length === tw.length && tw.every((w, i) => w[0] === fw[0][i])) return true;
  // Prefix completion: "fe" / "front" -> "frontend", "proj" -> "project", "bs" in "bs" -> "bac si"
  if (fw.length === 1 && fw[0].length >= 2 && tw.some((w) => w.startsWith(fw[0]))) return true;
  if (fw.length === 1 && tw.length === 2 && fw[0].length === 2 && fw[0][0] === tw[0][0] && tw[1].includes(fw[0][1])) return true;
  // Multi-word partial completion or anchored phrase replacement inside a shared sentence context
  return sharedContext && fromFold.length >= 2;
}

/** Learns title corrections, shorthand completions, reverts, and rejected reader repairs from a user's title edit. */
export function learnTitle(
  m: NluLearned,
  prevTitle: string,
  nextTitle: string,
  repairs?: { was: string; to: string }[],
  now = Date.now(),
): void {
  const prev = prevTitle.trim();
  const next = nextTitle.trim();
  if (!prev || !next || prev === next) return;
  decayNlu(m, now);

  // 1. Reader repair rejection: if NLU repaired `was` -> `to` and the user put `was` back into the title.
  if (repairs?.length) {
    const prevF = ` ${fold(prev).text} `;
    const nextF = ` ${fold(next).text} `;
    for (const r of repairs) {
      const wf = fold(r.was).text.trim();
      const tf = fold(r.to).text.trim();
      if (wf && wf !== tf && prevF.includes(` ${tf} `) && !nextF.includes(` ${tf} `) && nextF.includes(` ${wf} `)) {
        m.rejected[wf] = (m.rejected[wf] ?? 0) + 1;
      }
    }
  }

  const pt = prev.split(/\s+/).map(stripEdge).filter(Boolean);
  const nt = next.split(/\s+/).map(stripEdge).filter(Boolean);
  if (!pt.length || !nt.length) return;

  const recordPair = (fromWords: string[], toWords: string[], atStart: boolean, shared: boolean) => {
    const fromRaw = fromWords.join(" ");
    const toRaw = toWords.join(" ");
    if (!fromRaw || !toRaw || fromRaw === toRaw) return;
    // Ignore sentence-initial auto-capitalization alone
    if (atStart && fromRaw.slice(1) === toRaw.slice(1) && normKey(fromRaw) === normKey(toRaw) && !hasUpperInside(toRaw)) return;

    const revKey = normKey(toRaw);
    const rev = m.lex[revKey];
    const isRevert =
      !!rev &&
      normKey(fromRaw) !== rev.from &&
      (fold(rev.from).text !== fold(rev.to).text ? fold(rev.to).text === fold(fromRaw).text : fromRaw === rev.to);
    if (isRevert) {
      rev.bad += 1;
      rev.at = now;
      return;
    }

    const key = normKey(fromRaw);
    const ff = fold(fromRaw).text;
    const tf = fold(toRaw).text;
    if (!plausibleExpansion(ff, tf, shared)) return;

    const cased = !atStart ? /\p{Lu}/u.test(toRaw[0]) || hasUpperInside(toRaw) : hasUpperInside(toRaw);
    const cleanTo = atStart && !cased ? toRaw[0].toLocaleLowerCase("vi") + toRaw.slice(1) : toRaw;
    const cur = m.lex[key];
    if (cur && fold(cur.to).text === tf) {
      cur.good += 1;
      if (!atStart || cased) {
        cur.to = cleanTo;
        cur.cased = cased;
      }
      cur.at = now;
    } else {
      m.lex[key] = { from: key, to: cleanTo, good: 1, bad: 0, cased, at: now };
    }
  };

  // Same word count: learn each token (or 2-token casing) that changed while neighbours stayed.
  if (pt.length === nt.length) {
    const diffs: number[] = [];
    for (let i = 0; i < pt.length; i++) if (pt[i] !== nt[i]) diffs.push(i);
    if (diffs.length === 1) {
      const i = diffs[0];
      recordPair([pt[i]], [nt[i]], i === 0, pt.length > 1);
    } else if (diffs.length === 2 && diffs[1] === diffs[0] + 1) {
      const i = diffs[0];
      // If each token only changed casing/diacritics (e.g. "hop clb" -> "Họp CLB"), record per token too when folded matches.
      if (fold(pt[i]).text === fold(nt[i]).text && fold(pt[i + 1]).text === fold(nt[i + 1]).text) {
        recordPair([pt[i]], [nt[i]], i === 0, true);
        recordPair([pt[i + 1]], [nt[i + 1]], false, true);
      }
      recordPair(pt.slice(i, i + 2), nt.slice(i, i + 2), i === 0, pt.length > 2);
    }
    pruneLex(m);
    return;
  }

  // Different word count: peel shared prefix and suffix to isolate the corrected span.
  let pre = 0;
  while (pre < pt.length && pre < nt.length && fold(pt[pre]).text === fold(nt[pre]).text) pre++;
  let suf = 0;
  while (
    suf < pt.length - pre &&
    suf < nt.length - pre &&
    fold(pt[pt.length - 1 - suf]).text === fold(nt[nt.length - 1 - suf]).text
  )
    suf++;

  const fromSpan = pt.slice(pre, pt.length - suf);
  const toSpan = nt.slice(pre, nt.length - suf);
  if (fromSpan.length >= 1 && fromSpan.length <= 2 && toSpan.length >= 1 && toSpan.length <= 4) {
    recordPair(fromSpan, toSpan, pre === 0, pre + suf >= 1);
  }
  pruneLex(m);
}

function pruneLex(m: NluLearned): void {
  const entries = Object.entries(m.lex);
  if (entries.length <= MAX_LEX) return;
  entries.sort((a, b) => b[1].good - 2 * b[1].bad - (a[1].good - 2 * a[1].bad) || b[1].at - a[1].at);
  m.lex = Object.fromEntries(entries.slice(0, MAX_LEX));
}

export const isLexActive = (r: LexRule | undefined): boolean => !!r && r.good - 2 * r.bad >= 2;

/** Applies learned iOS-style word/phrase auto-corrections to a title, returning the updated title and applied pairs. */
export function correctTitle(
  title: string,
  m?: NluLearned,
): { title: string; applied: { from: string; to: string }[] } {
  if (!m || !title.trim()) return { title, applied: [] };
  const parts = title.split(/(\s+)/);
  // Word indices in `parts` are even: 0, 2, 4, ...
  const wordCount = (parts.length + 1) >> 1;
  const splitToken = (tok: string) => {
    const match = /^([^\p{L}\p{N}]*)([\p{L}\p{N}]+(?:[-'.][\p{L}\p{N}]+)*)([^\p{L}\p{N}]*)$/u.exec(tok);
    return match ? { lead: match[1], core: match[2], trail: match[3] } : { lead: "", core: tok, trail: "" };
  };
  const parsed = Array.from({ length: wordCount }, (_, wi) => splitToken(parts[wi * 2] ?? ""));
  const applied: { from: string; to: string }[] = [];

  for (let wi = 0; wi < wordCount; wi++) {
    // Try 2-word rule first, then 1-word rule.
    let matchedLen = 0;
    let rule: LexRule | undefined;
    if (wi + 1 < wordCount && !parsed[wi].trail && !parsed[wi + 1].lead) {
      const k2 = normKey(`${parsed[wi].core} ${parsed[wi + 1].core}`);
      if (isLexActive(m.lex[k2])) {
        rule = m.lex[k2];
        matchedLen = 2;
      }
    }
    if (!rule) {
      const k1 = normKey(parsed[wi].core);
      if (isLexActive(m.lex[k1])) {
        rule = m.lex[k1];
        matchedLen = 1;
      }
    }
    if (!rule) continue;

    // Guard against double-expanding when the expansion tail is already right after this word.
    const toWords = rule.to.split(" ");
    if (toWords.length > matchedLen && wi + toWords.length - matchedLen < wordCount) {
      const tailAlreadyThere = toWords
        .slice(matchedLen)
        .every((tw, k) => fold(parsed[wi + matchedLen + k].core).text === fold(tw).text);
      if (tailAlreadyThere) continue;
    }

    let rep = rule.to;
    const atSentenceStart = wi === 0 && /\p{Lu}/u.test(parsed[0].core[0] ?? "");
    if (atSentenceStart && !rule.cased && !hasUpperInside(rep)) {
      rep = rep[0].toLocaleUpperCase("vi") + rep.slice(1);
    }
    const rawWas = matchedLen === 2 ? `${parsed[wi].core} ${parsed[wi + 1].core}` : parsed[wi].core;
    if (rawWas === rep) continue;
    applied.push({ from: rawWas, to: rep });
    if (matchedLen === 2) {
      parts[wi * 2] = `${parsed[wi].lead}${rep}${parsed[wi + 1].trail}`;
      parts[wi * 2 + 1] = "";
      parts[(wi + 1) * 2] = "";
      wi++;
    } else {
      parts[wi * 2] = `${parsed[wi].lead}${rep}${parsed[wi].trail}`;
    }
  }
  return { title: applied.length ? parts.join("").replace(/\s{2,}/g, " ").trim() : title, applied };
}

/** Folded words rejected >= 2 times, passed into `ReadOpts.rejected`. */
export function rejectedSet(m?: NluLearned): Set<string> | undefined {
  if (!m) return undefined;
  const keys = Object.entries(m.rejected).filter(([, n]) => n >= 2).map(([k]) => k);
  return keys.length ? new Set(keys) : undefined;
}

/** Maps applied title corrections onto raw text spans so capture toasts can display `"sp" -> side project`. */
export function titleRepairsInRaw(raw: string, applied: { from: string; to: string }[], existing: ReaderRepair[]): ReaderRepair[] {
  if (!applied.length) return existing;
  const out = [...existing];
  let searchFrom = 0;
  for (const a of applied) {
    const idx = raw.toLowerCase().indexOf(a.from.toLowerCase(), searchFrom);
    if (idx < 0) continue;
    const end = idx + a.from.length;
    const beforeOk = idx === 0 || !/[\p{L}\p{N}]/u.test(raw[idx - 1]);
    const afterOk = end >= raw.length || !/[\p{L}\p{N}]/u.test(raw[end]);
    if (beforeOk && afterOk && !out.some((r) => idx < r.end && end > r.start)) {
      out.push({ start: idx, end, to: a.to });
      searchFrom = end;
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

// --- Online Learning from Task Corrections (Duration, Deadline, Location, Kind, Note) ---

function ensureSample(m: NluLearned, taskId: string | undefined, title: string, note?: string | null, cls?: string, kind?: Kind, now = Date.now()): NluSample {
  const vec = quantizeVec(contextVec(title, note));
  const phrases = phrasesOf(title, note);
  const existing = taskId ? m.samples.find((s) => s.taskId === taskId) : undefined;
  if (existing) {
    existing.vec = vec;
    existing.phrases = phrases;
    if (cls) existing.cls = cls;
    if (kind) existing.kind = kind;
    existing.at = now;
    return existing;
  }
  const s: NluSample = { ...(taskId ? { taskId } : {}), vec, phrases, ...(cls ? { cls } : {}), ...(kind ? { kind } : {}), at: now };
  m.samples = [s, ...m.samples].slice(0, MAX_SAMPLES);
  return s;
}

/** Refreshes a task's stored sample context when its title or note is edited after other fields were already corrected. */
export function refreshSampleContext(m: NluLearned, taskId: string, title: string, note?: string | null, now = Date.now()): void {
  const s = m.samples.find((x) => x.taskId === taskId);
  if (!s) return;
  s.vec = quantizeVec(contextVec(title, note));
  s.phrases = phrasesOf(title, note);
  s.at = now;
}

export function learnDuration(
  m: NluLearned,
  task: { id?: string; title: string; note?: string | null; cls?: string; kind?: Kind; guessMin?: number },
  minutes: number,
  sitMin?: number,
  now = Date.now(),
): void {
  if (!(minutes > 0)) return;
  decayNlu(m, now);
  const f = frameOf(task.title, task.note);
  const cls = task.cls ?? f.cls;
  const baseMin = task.guessMin ?? rowOf(cls)?.base ?? 60;
  const x = nluFeatures(task.title, task.note);
  const r = Math.max(-1.6, Math.min(1.6, Math.log(minutes / Math.max(15, baseMin))));
  const s = ensureSample(m, task.id, task.title, task.note, cls, task.kind, now);
  if (s.durR !== undefined) adjustRidgeB(m.dur, x, r - s.durR);
  else updateRidge(m.dur, x, r);
  s.durR = r;
  s.minutes = Math.max(15, Math.min(6000, Math.round(minutes)));
  s.baseMin = baseMin;
  if (sitMin && sitMin >= 15) s.sitMin = sitMin;
}

export function learnDeadline(
  m: NluLearned,
  task: { id?: string; title: string; note?: string | null; cls?: string; kind?: Kind },
  dueDays: number | null,
  now = Date.now(),
): void {
  decayNlu(m, now);
  const f = frameOf(task.title, task.note);
  const cls = task.cls ?? f.cls;
  const baseDays = rowOf(cls)?.days ?? 7;
  const x = nluFeatures(task.title, task.note);
  const s = ensureSample(m, task.id, task.title, task.note, cls, task.kind, now);
  const gateR = dueDays === null ? -1 : 1;
  if (s.gateR !== undefined) adjustRidgeB(m.dueGate, x, gateR - s.gateR);
  else updateRidge(m.dueGate, x, gateR);
  s.gateR = gateR;

  if (dueDays === null) {
    s.dueDays = null;
    return;
  }
  const clamped = Math.max(0.5, Math.min(90, dueDays));
  const r = Math.max(-2, Math.min(2, Math.log(clamped / baseDays)));
  if (s.dueR !== undefined) adjustRidgeB(m.due, x, r - s.dueR);
  else updateRidge(m.due, x, r);
  s.dueR = r;
  s.dueDays = clamped;
  s.baseDays = baseDays;
}

export function learnLocation(
  m: NluLearned,
  task: { id?: string; title: string; note?: string | null; cls?: string; kind?: Kind },
  loc: string | null,
  prevLoc?: string,
  now = Date.now(),
): void {
  decayNlu(m, now);
  const x = nluFeatures(task.title, task.note);
  const s = ensureSample(m, task.id, task.title, task.note, task.cls, task.kind, now);
  if (prevLoc?.trim() && prevLoc.trim() !== (loc ?? "").trim()) {
    const pk = fold(prevLoc).text.trim();
    if (pk && m.locs[pk]) updateRidge(m.locs[pk].arm, x, -1, 0.75);
  }
  if (!loc?.trim()) {
    s.loc = null;
    return;
  }
  const clean = loc.trim();
  const key = fold(clean).text.trim();
  if (!key) return;
  let entry = m.locs[key];
  if (!entry) {
    const keys = Object.keys(m.locs);
    if (keys.length >= MAX_LOCS) {
      keys.sort((a, b) => m.locs[a].count - m.locs[b].count || m.locs[a].at - m.locs[b].at);
      delete m.locs[keys[0]];
    }
    entry = m.locs[key] = { label: clean, arm: coldRidge(), count: 0, at: now };
  }
  entry.label = clean;
  entry.count += 1;
  entry.at = now;
  updateRidge(entry.arm, x, 1);
  s.loc = clean;
}

export function learnKind(
  m: NluLearned,
  task: { id?: string; title: string; note?: string | null; cls?: string },
  kind: Kind,
  now = Date.now(),
): void {
  decayNlu(m, now);
  ensureSample(m, task.id, task.title, task.note, task.cls, kind, now);
}

// --- Inference on Reader Items & Actions ---

const p2 = (n: number) => String(n).padStart(2, "0");
const msOf = (s: string) => Date.parse(`${s.replace(" ", "T")}:00Z`) - VN;
const ymd = (ms: number) => new Date(ms + VN).toISOString().slice(0, 10);
const nowOf = (r: ReaderWC) => msOf(`${r.y}-${p2(r.m)}-${p2(r.d)} ${p2(r.h ?? 0)}:${p2(r.mi ?? 0)}`);

function markInferred(it: ReaderItem, key: string): void {
  if (!it.inferred.includes(key)) it.inferred.push(key);
}

/** Infers duration, sitting size, deadline offset, and location on one reader item using LinUCB + statistics + (title, note) NLP. */
export function applyLearnedItem(it: ReaderItem, m: NluLearned | undefined, ref: ReaderWC): void {
  if (!m || (!m.samples.length && !Object.keys(m.locs).length)) return;
  const now = nowOf(ref);
  const note = plainNote(it.note);
  const qVec = contextVec(it.title, note);
  const qPhrases = phrasesOf(it.title, note);
  const x = nluFeatures(it.title, note);
  const f = frameOf(it.title, note);
  const row = f.cls && T[f.cls] ? T[f.cls] : undefined;

  const neighbors = m.samples
    .map((s) => {
      const sim = sampleSim(qVec, qPhrases, s);
      const decay = 0.5 ** (Math.max(0, now - s.at) / HALF_LIFE_NLU);
      return { s, sim, w: sim >= 0.6 ? ((sim - 0.45) / 0.55) * decay : 0 };
    })
    .filter((n) => n.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, 15);

  // 1. Duration & sitting inference (never overrides a duration said in the text).
  const openDur =
    (it.type === "PLAN" || it.type === "ASSIGNMENT" || it.type === "BUSY") &&
    !it.prep &&
    (it.durationMinutes === undefined || it.inferred.includes("durationMinutes"));
  if (openDur && row?.shape !== "practice") {
    const durNbs = neighbors.filter((n) => n.s.minutes !== undefined);
    const nEff = durNbs.reduce((s, n) => s + n.w, 0);
    const ridgeLog = conservative(m.dur, x);
    if (nEff > 0 || Math.abs(ridgeLog) > 0.02) {
      const curMin = it.durationMinutes ?? 60;
      const yRidge = Math.log(curMin) + ridgeLog;
      const wKnn = durNbs.length >= 2 && nEff >= 0.8 ? 1 : nEff >= 0.35 ? 0.5 : 0;
      const yKnn = wKnn > 0 ? weightedMedian(durNbs.map((n) => ({ v: Math.log(n.s.minutes!), w: n.w }))) : yRidge;
      const rawPred = Math.exp(wKnn * yKnn + (1 - wKnn) * yRidge);
      const snapped = isMicro(it.cls ?? f.cls) && wKnn < 0.5 ? 15 : snapGuess(rawPred);
      if (snapped !== it.durationMinutes) {
        it.durationMinutes = snapped;
        markInferred(it, "durationMinutes");
        it.sized = true;
      }
      const sitNbs = durNbs.filter((n) => n.s.sitMin !== undefined);
      if (sitNbs.length >= 2 && it.durationMinutes > 60) {
        it.sittingMinutes = r30(weightedMedian(sitNbs.map((n) => ({ v: n.s.sitMin!, w: n.w }))));
      } else if (!it.sittingMinutes && it.durationMinutes >= 180) {
        it.sittingMinutes = row?.per || 90;
      }
    }
  }

  // 2. Deadline offset inference (only when no date, clock, window, repeat or anchor was stated in the text).
  const openDue =
    (it.type === "PLAN" || it.type === "ASSIGNMENT") &&
    !it.prep &&
    !it.startsAt &&
    !it.rrule &&
    !it.days?.length &&
    !it.clocks?.length &&
    !it.windows?.length &&
    !it.anchor &&
    row?.shape !== "event" &&
    row?.shape !== "practice" &&
    (!it.deadline || it.defaultDue);

  if (openDue) {
    const dueNbs = neighbors.filter((n) => n.s.dueDays !== undefined);
    const posNbs = dueNbs.filter((n) => typeof n.s.dueDays === "number");
    const clrNbs = dueNbs.filter((n) => n.s.dueDays === null);
    const posW = posNbs.reduce((s, n) => s + n.w, 0);
    const clrW = clrNbs.reduce((s, n) => s + n.w, 0);
    const gate = evalRidge(m.dueGate, x);
    const from = it.notBefore ? Math.max(now, msOf(it.notBefore)) : now;

    if (it.defaultDue && clrNbs.length >= 2 && clrW >= 0.8 && clrW / (posW + clrW) >= 0.7 && gate.mean - 0.15 * gate.std < 0) {
      // User consistently clears default deadlines on tasks like this.
      it.deadline = undefined;
      it.defaultDue = undefined;
      it.learnedDue = undefined;
      it.inferred = it.inferred.filter((k) => k !== "deadline");
    } else if (it.defaultDue || (posNbs.length >= 2 && posW >= 0.8 && posW / (posW + clrW) >= 0.65 && gate.mean - 0.1 * gate.std > 0)) {
      const baseDays = row?.days ?? 7;
      const ridgeDue = conservative(m.due, x);
      const wKnn = posNbs.length >= 2 && posW >= 0.8 ? 1 : posW >= 0.35 ? 0.5 : 0;
      if (wKnn > 0 || (it.defaultDue && Math.abs(ridgeDue) > 0.05)) {
        const yRidge = Math.log(baseDays) + ridgeDue;
        const yKnn = wKnn > 0 ? weightedMedian(posNbs.map((n) => ({ v: Math.log(n.s.dueDays as number), w: n.w }))) : yRidge;
        const days = Math.max(1, Math.min(90, Math.round(Math.exp(wKnn * yKnn + (1 - wKnn) * yRidge))));
        const nextDue = `${ymd(from + days * DAY)} 23:59`;
        const changed = nextDue !== it.deadline;
        it.deadline = nextDue;
        it.defaultDue = true;
        if (changed) it.learnedDue = true;
        markInferred(it, "deadline");
      }
    }
  }

  // 3. Location inference via Disjoint LinUCB LCB + semantic/phrase k-NN (only when text named no location).
  if (!it.location) {
    const locNbs = neighbors.filter((n) => n.s.loc !== undefined);
    if (locNbs.length >= 2) {
      const totalW = locNbs.reduce((s, n) => s + n.w, 0);
      const byLoc = new Map<string, { label: string; w: number; count: number }>();
      for (const n of locNbs) {
        if (!n.s.loc) continue; // null = explicitly cleared location, counts in totalW against guessing
        const k = fold(n.s.loc).text.trim();
        const cur = byLoc.get(k) ?? { label: n.s.loc, w: 0, count: 0 };
        cur.w += n.w;
        cur.count += 1;
        byLoc.set(k, cur);
      }
      let best: { label: string; score: number } | undefined;
      let second = -Infinity;
      for (const [k, cand] of byLoc) {
        if (cand.count < 2 || cand.w < 0.8) continue;
        const share = cand.w / totalW;
        if (share < 0.65) continue;
        const arm = m.locs[k]?.arm;
        const lcb = arm ? (() => { const e = evalRidge(arm, x); return e.mean - ALPHA_LOC * e.std; })() : 0;
        const score = 0.7 * share + 0.3 * Math.max(-1, Math.min(1, lcb));
        if (!best || score > best.score) {
          if (best) second = best.score;
          best = { label: cand.label, score };
        } else if (score > second) {
          second = score;
        }
      }
      if (best && best.score >= 0.45 && best.score - (Number.isFinite(second) ? second : 0) >= 0.15) {
        it.location = best.label;
        markInferred(it, "location");
      }
    }
  }
}

/** Infers a user-preferred Kind when similar tasks (by title + note) had their kind explicitly set. */
export function learnedKindOf(title: string, note: string | null | undefined, m?: NluLearned, now = Date.now()): Kind | undefined {
  if (!m?.samples.length) return undefined;
  const qVec = contextVec(title, note);
  const qPhrases = phrasesOf(title, note);
  const byKind = new Map<Kind, { w: number; count: number }>();
  let total = 0;
  for (const s of m.samples) {
    if (!s.kind) continue;
    const sim = sampleSim(qVec, qPhrases, s);
    if (sim < 0.62) continue;
    const w = ((sim - 0.5) / 0.5) * 0.5 ** (Math.max(0, now - s.at) / HALF_LIFE_NLU);
    total += w;
    const cur = byKind.get(s.kind) ?? { w: 0, count: 0 };
    cur.w += w;
    cur.count += 1;
    byKind.set(s.kind, cur);
  }
  const ranked = [...byKind.entries()].sort((a, b) => b[1].w - a[1].w);
  const top = ranked[0];
  if (!top) return undefined;
  if (top[1].count >= 2 && top[1].w >= 0.8 && top[1].w / total >= 0.65) return top[0];
  return undefined;
}
