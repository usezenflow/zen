import { PdfPageImage } from "@dariyd/react-native-pdf-page-image";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { extractTextFromPage, getPageCount } from "expo-pdf-text-extract";
import { extractTextFromImage } from "expo-text-extractor";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Appearance, AppState, Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useIncomingShare } from "expo-sharing";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Reanimated, { interpolate, useAnimatedStyle, useSharedValue, withTiming, ZoomIn, ZoomOut } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { artOf, covered, Icon, Logo } from "@/components/art";
import { Rhythm, rhythmHead } from "@/components/rhythm";
import { addDays, live, mondayOf, monthLabel, onDay, parents, short, startOfDay, weekday, type Hols } from "@/components/cal";
import { Day, DayPull, First, RestCard, mins } from "@/components/day";
import { gapPick, restLine, worked } from "@/lib/rest";
import { foldRepeats } from "@/components/fold";
import { useDragDay } from "@/components/dragday";
import { Search, type Origin } from "@/components/search";
import { PdfView, PhotoMenu, PhotoView, TypeBar, Veil } from "@/components/capture";
import { Hold, type Aside, type HoldState } from "@/components/hold";
import { OutlinePreview } from "@/components/outline";
import { pageText } from "@/components/webtext";
import { actionsOf, outline, type Group } from "@/lib/nlu/reader/outline";
import type { Item } from "@/components/menu";
import { Month } from "@/components/month";
import { kindItems, Live, MovesPill, NowCard, SeriesAsk, Story, Weekly, type Card } from "@/components/nowcard";
import { RowMenu, menuTop, sittingItems } from "@/components/rowmenu";
import { fadeIn, fadeOut, glide, popIn, settle, Tap, EASE } from "@/components/tap";
import { Sweep, useSweep } from "@/components/sweep";
import { Toast } from "@/components/toast";
import { Swipe, Week } from "@/components/week";
import { SERIES_NO, acceptSeries, addWorked, apply, markRolled, reshapeSeries, declineSeries, retime, forgetWhen, makeRoom, moveMine, moveToDay, pickNow, addRule, addSitting, dropSitting, loadClassMult, needMore, pin, putBack, removeRule, removeScope, scopeIds, swipeDone, swipeLater, take, type Result, applyProposal, canRebalance, dismissProposal, maybeRebalance, proposalFor, proposeRebalance } from "@/lib/apply";
import { briefMoves, loadMoves, loadWarn, seeMoves } from "@/lib/moves";
import { reasonText, stepText, topReason } from "@/lib/reasons";
import { narration, thinkHold } from "@/lib/apply";
import { holidays } from "@/lib/holidays";
import { askMic, listenLive, micReset, type Heard } from "@/lib/ears";
import { WEEKDAY_VI, t } from "@/lib/i18n";
import { seriesOffer, type SeriesOffer } from "@/lib/series";
import { rolledPick } from "@/lib/rolled";
import { marksOf, readErrors, readFull, readNotes, sizedSub } from "@/lib/nlu/adapt";
import { think } from "@/lib/nlu/commands";
import { askOf, kinOf, learn, splitHeard, VERB_VI, type Command, type Learned, type SeriesScope } from "@/lib/nlu/intent";
import { fold } from "@/lib/nlu/reader/fold";
import { affinityOf, calendarOf, committedRows, vocab } from "@/lib/nlu/context";
import { personalPrior } from "@/lib/nlu/reader/assemble";
import { isRule, readRule } from "@/lib/rules";
import { sharedOf, viaOf } from "@/lib/share";
import { onLeftSaved, takeFlash, takeHomeDay } from "@/lib/flash";
import { compose, inferred, whereOf, type Ctx } from "@/lib/say";
import { keepBoth, pendingOverlaps, type Overlap } from "@/lib/overlap";
import * as store from "@/lib/store";
import { getMarks, onForeground, onSynced, onTick } from "@/lib/sync";
import { overdue } from "@/lib/nudges";
import { GRACE } from "@/planner/policy";
import { listenWidgets, pushWidgets } from "@/lib/widgets";
import { useTheme, font, space, ff, fd } from "@/lib/theme";
import type { Action, Move, Notice, Rule, Step, Task, Warn } from "@/lib/types";
import { repeatText } from "@/components/detail-html";
import { dayLabel, day as dayName, endAt, hm, when } from "@/lib/when";
import { grounded, insights, typeOf, type Insights } from "@/planner";
import type { Model } from "@/planner/model";

/** What the picked anchor sets on the item: its deadline (before) or its start bound / predecessor (after). */
const anchorPatch = ([, rel, kind]: string[], c: Task) => {
  const iso = (ms: number) => new Date(ms).toISOString();
  if (rel === "after") return kind === "task" ? { after: c.id } : { notBefore: iso(c.end ?? c.start!) };
  if (kind === "task") return { deadline: iso(c.deadline ?? c.start!) };
  return { deadline: iso(c.start!), ...(c.fixed === "exam" ? { anchor: c.id } : {}) };
};

type View_ = "day" | "week" | "month" | "rhythm"; // rhythm sits apart on the right of the tabs, outside the swipe cycle
const VIEWS: View_[] = ["day", "week", "month"];
// A row says only what Zen learned or was told; "the day is free" on every row is noise, so that stays on the detail screen.
const FIT = new Set(["packed", "fit", "over"]); // what came of what was asked, said in the add toast too
const ROW = new Set(["hour", "after", "similar", "kind", "energy", "weekend", "said", "pace", "rule", "pinned", "chose", "packed", "fit", "over"]);
type ToastState = { text: string; sub?: string; error?: boolean; art?: ReturnType<typeof artOf>; action?: { label?: string; run: () => void }; alt?: { label: string; run: () => void; plain?: boolean } };

const longDate = (ms: number) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };
const dm = (ms: number) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };

// One key per toast, not per text: a same-text toast after a swiped-away one must mount fresh, not inherit its off-screen pan.
const toastKeys = new WeakMap<object, number>();
let nextToastKey = 0;
const toastKey = (x: object) => { let k = toastKeys.get(x); if (k === undefined) toastKeys.set(x, (k = nextToastKey++)); return k; };

export default function Home() {
  const th = useTheme();
  const insets = useSafeAreaInsets(), inset = insets.top;
  // The app draws under Android's nav bar (edge-to-edge): lift the dock above it. iOS's 93px mic centre already counts the home indicator.
  const navLift = Platform.OS === "android" ? insets.bottom : 0;
  const win = useWindowDimensions();
  const menuAt = (bottom: number, top: number, items: Item[]) => ({ top: menuTop(bottom, top, items.length, win.height, inset, insets.bottom), items });
  const [menu, setMenu] = useState<{ task: Task; top: number; items: Item[]; right?: boolean } | undefined>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [card, setCard] = useState<Card | undefined>();
  const [ask, setAsk] = useState<SeriesOffer | undefined>(); // the weekly repeat offer, in the card slot until answered
  // magic.html 17b: today's work reached the line, so the art slot rests. Kept for the swipe that moves the line (17c).
  const [rest, setRest] = useState<{ w: number; line: number; more: number } | undefined>();
  const [state, setState] = useState<HoldState>("idle");
  const [words, setWords] = useState("");
  const [toasts, setToasts] = useState<ToastState[]>([]); // [0] is showing, the rest wait their turn
  // Chips under the toast: which task a line meant, or which exam an anchor points at. One tap, then they go.
  const [chips, setChips] = useState<{ ask?: string; sub?: string; row?: boolean; options: { label: string; detail?: string; on?: boolean; run: () => void }[] }>();
  const toast = toasts[0];
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<View_>("day");
  const [finding, setFinding] = useState<Origin>(); // set = searching, from the circle at this window point (views.html "Search, opening")
  const findBtn = useRef<ComponentRef<typeof View>>(null);
  const [findQ, setFindQ] = useState<string>(); // a question said ("mai có gì") opens search with it
  const lastIds = useRef<string[]>([]); // the tasks just made or changed: what "xoá nó" means
  const lastUndo = useRef<(() => Promise<void>) | undefined>(undefined); // what "hoàn tác" undoes
  const askQ = useRef<{ cmd: Command; text: string; via: "voice" | "type" | "photo" | "pdf" | "scan" }[]>([]); // a line's later asks, one at a time
  const [sel, setSel] = useState(() => startOfDay(Date.now()));
  const [over, setOver] = useState<Overlap[]>([]);
  const [pop, setPop] = useState<Set<string>>(new Set());
  const level = useSharedValue(0); // real mic level 0..1 for the listening wave
  const [moves, setMoves] = useState<Move[]>([]); // unseen only
  const [warns, setWarns] = useState<Warn[]>([]);
  const [rebal, setRebal] = useState<Move[]>(); // a fresh rebalance proposal: nothing moved until Áp dụng
  const [rebalOpen, setRebalOpen] = useState(false);
  const [maps, setMaps] = useState<{ trail: Record<string, string>; froms: Record<string, number>; reason: Record<string, string>; alts: Record<string, number> }>({ trail: {}, froms: {}, reason: {}, alts: {} });
  const [wk, setWk] = useState<{ title: string; sub: string } | undefined>(); // Sunday card
  // The story is open for one view and day only: leaving them folds it back (the moves stay until seen).
  const [storyAt, setStoryAt] = useState("");
  const story = storyAt === `${view}${sel}`;
  const setStory = (on: boolean) => setStoryAt(on ? `${view}${sel}` : "");
  const [mine, setMine] = useState<{ moves: Move[]; r: Result }>(); // what the user's own change just moved, opened from its toast (magic.html 7d)
  const shuf = useRef(false); // the plan is playing out on the list; no second run until it ends
  const [shufOn] = useState(false);
  const tasksRef = useRef<Task[]>([]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const [mind, setMind] = useState<{ i: Insights; rules: Rule[]; m: Model }>();
  // capture.html: the thumb on a satellite, the type field, the photo dropdown, the photo or PDF being read.
  const [aside, setAside] = useState<Aside>("");
  const asideRef = useRef<Aside>("");
  const [pressing, setPressing] = useState(false); // finger down on the mic: the veil rises (capture.html 2)
  const [typing, setTyping] = useState(false);
  useEffect(() => { covered.set(typing || !!menu || !!finding); }, [typing, menu, finding]); // the drifting arts hold while a blur or the keyboard is over them
  const [picking, setPicking] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; w: number; h: number; text?: string; marks?: { start: number; end: number }[] }>();
  const [pdf, setPdf] = useState<{ page: number; pages: number; text?: string; marks?: { start: number; end: number }[]; image?: string }>();
  const [lined, setLined] = useState<{ groups: Group[]; from: string }>(); // a list read as an outline: the preview until it is added or closed

  // A refresh that began before a newer edit or refresh must not land after it with older tasks.
  const gen = useRef(0);
  const refresh = useCallback(async () => {
    const now = Date.now(), mine = ++gen.current;
    setNow(now);
    const all = await store.allTasks();
    if (mine !== gen.current) return;
    setTasks(all);
    setOver(await pendingOverlaps(now));
    // Moves and the model load once per refresh; rows get plain maps.
    const [model, mv, wn, rp] = await Promise.all([store.loadModel(now), loadMoves(), loadWarn(), proposalFor(all)]);
    if (mine !== gen.current) return; // a newer refresh began while these loaded
    // A notice is stale once its task sits somewhere else (moved again since, by hand or by another replan): it goes, never to come back.
    const stale = mv.filter((m, i) => !m.seen && (mv.slice(i + 1).some((n) => n.id === m.id) || all.some((x) => x.id === m.id && x.start !== m.to)));
    if (stale.length) void seeMoves(stale.map((m) => m.id).filter((id) => !mv.some((n) => n.id === id && !stale.includes(n))));
    const unseen = mv.filter((m) => !m.seen && !stale.includes(m) && all.some((x) => x.id === m.id && !x.deletedAt));
    const trail: Record<string, string> = {}, froms: Record<string, number> = {}, reason: Record<string, string> = {}, alts: Record<string, number> = {};
    for (const m of unseen) { froms[m.id] = m.from; trail[m.id] = m.why?.[0]?.key === "missed" ? reasonText(m.why[0]) : t("trailFrom", { when: when(m.from, now) }); }
    for (const x of all) {
      const p = model.placed[x.id];
      if (!p || x.doneAt || x.deletedAt || x.start === undefined) continue;
      if (p.alt !== undefined && p.alt !== x.start) alts[x.id] = p.alt;
      let why = p.explore ? { key: "explore" as const, w: 1 } : topReason(grounded(p.why, { task: x, start: x.start, rules: model.rules ?? [], tasks: all }).filter((r) => ROW.has(r.key)));
      // "Buổi k/n" is the plan's count from when it was made; after a delete it renumbers from the sittings left, and a lone one drops it.
      if (why?.key === "pace" && x.parentId) {
        const left = all.filter((c) => c.parentId === x.parentId && !c.doneAt && !c.deletedAt).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
        why = left.length > 1 ? { ...why, vars: { k: left.findIndex((c) => c.id === x.id) + 1, n: left.length } } : undefined;
      }
      // Assignments keep the due-date sub unless the reason says more than "do it early".
      if (why && !x.fixed && !trail[x.id] && (typeOf(x) !== "assignment" || ["pace", "explore", "rule", "pinned", "chose", "packed", "fit", "over"].includes(why.key))) reason[x.id] = reasonText(why);
    }
    const ins = insights(model, now), wkAgo = now - 7 * 86400_000, w = new Date(now).getDay() === 0 ? t("sundayLab") : undefined; // Sundays only
    setMind({ i: ins, rules: model.rules ?? [], m: model });
    // A saved card outlives its task until the next re-plan: drop it once the task is gone or ticked, or it was never short of time.
    const open = (id: string) => all.some((x) => x.id === id && !x.doneAt && !x.deletedAt);
    setMoves(unseen); setRebal(rp); if (!rp) setRebalOpen(false); setWarns(wn.filter((w) => open(w.id) && (w.deadline <= now || w.free < w.need))); setMaps({ trail, froms, reason, alts });
    const k = ins.keep;
    setWk(w ? { title: w, sub: (k ? t("sundayKeep", { pct: k.pct, delta: `${k.delta > 0 ? "+" : ""}${k.delta}%` }) : t("sundaySub", { done: all.filter((x) => x.doneAt && x.doneAt >= wkAgo).length, moved: mv.filter((m) => m.at >= wkAgo).length })) + (ins.sunday ? `\n${ins.sunday}` : "") } : undefined);
    setAsk(seriesOffer(all, now, JSON.parse((await store.kvGet(SERIES_NO)) ?? "[]")));
    const cur = pickNow(all, now);
    if (cur && cur.start === undefined) { setRest(undefined); const s = Math.ceil(now / 60_000) * 60_000; return setCard({ task: cur, start: s, end: s + cur.effort * 60_000 }); } // unscheduled: shown from now for its length
    if (cur && cur.start! <= now) { setRest(undefined); return setCard({ task: cur, start: cur.start, end: cur.end }); }
    // views.html "Day, all done": a task of another day is not today's art card; the rest card takes its slot and names tomorrow.
    const day0 = startOfDay(now), next = cur && startOfDay(cur.start!) === day0 ? cur : undefined;
    if (next && !next.fixed) { setRest(undefined); return setCard({ task: next, start: next.start, end: next.end }); }
    // magic.html 17-17c: no own work left today. Under the line a later task fits the gap (swiped: not today); past it, rest.
    const [more, off] = await Promise.all([store.kvGet("rest.more"), store.kvGet("gap.off")]);
    if (mine !== gen.current) return;
    const done = worked(all, day0, now), m = Number(more) || 0, line = restLine(all, now, m);
    const g = done < line && off !== String(day0) ? gapPick(all, now, next?.start) : undefined;
    if (g) { const s = Math.ceil(now / 60_000) * 60_000; setRest(undefined); return setCard({ task: g.task, start: s, end: s + g.len, gap: mins(g.free / 60_000) }); }
    setRest(!next && done >= line ? { w: done, line, more: m } : undefined);
    setCard(next ? { task: next, start: next.start, end: next.end } : undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToasts((q) => q.slice(1)), toast.action ? 8000 : 6000);
    return () => clearTimeout(id);
  }, [toast]);

  // Every toast's words come from say.ts: this only shows what compose() decided. "Xem" opens the story of what moved, on today.
  const say = useCallback((text: string, r?: Result, ctx: Ctx = {}) => {
    const out = compose(r, { ...ctx, title: text, see: r && (() => { setMine({ moves: r.moves ?? [], r }); setView("day"); setSel(startOfDay(Date.now())); }) });
    // a double tap, or a tap and a said "hoàn tác", undoes once
    const once = r && (() => { let done = false; return async () => { if (done) return; done = true; await r.undo(); setToasts((u) => [{ text: t("undone") }, ...u.slice(1)]); refresh(); }; })();
    if (once) lastUndo.current = once;
    setToasts((q) => [{
      text: out.title,
      sub: out.sub,
      art: ctx.art,
      alt: out.alt ?? out.more,
      action: once && { run: once },
    }, ...q.slice(1)]);
  }, [refresh]);

  // Red toast; the sub carries the real reason so failures are not all "model not ready".
  const fail = useCallback((text: string, e?: unknown, sub?: string) => {
    if (e) console.warn(text, e);
    setToasts((q) => [{ text, error: true, sub: sub ?? (e instanceof Error ? e.message : e ? String(e) : undefined) }, ...q.slice(1)]);
  }, []);

  const go = useCallback((route: string) => {
    if (route.startsWith("day:")) { setView("day"); setSel(startOfDay(Number(route.slice(4)))); } else router.push(route as "/marks");
  }, []);
  // Plan done: the list returns in its old state, then one task at a time moves to its new place under a step line; the rest lands at once.
  const shuffle = useCallback(async (r?: Result, old = tasksRef.current, jump = true) => {
    const id = (st: Step) => st.id;
    const steps = (r?.steps ?? []).slice(0, 4);
    if (!old.length || !steps.some(id)) return refresh();
    thinkHold(true); // the veil holds from the plan to the last step line: no gap, no second veil
    try {
      const fresh = new Map((await store.allTasks()).map((x) => [x.id, x]));
      // A step names the task; when it was split into sittings, its rows are the sittings (the parent only loses its time).
      const one = (tid?: string) => { const x = tid ? fresh.get(tid) : undefined; return x ? [x, ...[...fresh.values()].filter((c) => c.parentId === tid && !c.deletedAt)] : []; };
      const rows = (st?: Step) => (st?.ids ?? [st?.id]).flatMap(one); // a series line lands every occurrence at once
      const firstAt = Math.min(...rows(steps.find((st) => id(st) && !old.some((o) => o.id === id(st)))).flatMap((x) => x.start ?? []));
      if (jump && Number.isFinite(firstAt)) setSel(startOfDay(firstAt));
      // Thinking out loud (magic 4, 29): the old list stays, then one task at a time moves under a step line.
      setTasks(old);
      for (let i = 0; i < steps.length; i++) {
        await new Promise((ok) => setTimeout(ok, 350));
        narration.set(steps.slice(0, i + 1).map(stepText));
        const xs = rows(steps[i]);
        if (!xs.length) continue;
        setTasks((p) => [...p.filter((a) => !xs.some((x) => x.id === a.id)), ...xs]);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      await new Promise((ok) => setTimeout(ok, 350));
      await refresh();
    } finally {
      narration.set([]);
      thinkHold(false);
    }
  }, [refresh]);
  // A sync result: every notice gets its own toast with "Xem"; otherwise the plain result.
  const landed = useCallback((r?: Result & { notices?: Notice[] }) => {
    if (r?.notices?.length) setToasts((q) => [...q, ...r.notices!.map((n): ToastState => ({ text: n.title, sub: n.sub, action: n.route ? { label: t("view"), run: () => go(n.route!) } : undefined }))]);
    else if (r && !r.silent && r.toast !== t("nothing")) say(r.toast, r); // a sync that found nothing to do says nothing
    // a result nobody asked for (a sync, a series topped up 120 days out) keeps the day in view
    if (r) void shuffle(r, undefined, false).then(() => maybeRebalance()).then((p) => { if (p) void refresh(); }, () => {}); // nothing landed: focus already refreshed, resume refreshes itself; an overloaded or at-risk replan may offer a rebalance (once a day)
  }, [say, go, shuffle, refresh]);

  useFocusEffect(useCallback(() => {
    const d = takeHomeDay();
    if (d !== undefined) setSel(startOfDay(d));
    const f = takeFlash();
    if (f) say(f.text, f.r, { sub: f.sub });
    refresh();
    onForeground().then((r) => (r ? landed(r) : refresh())).catch(() => refresh()); // re-read even when it changed nothing: the first refresh may have raced the replan
  }, [refresh, say, landed]));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") { onForeground().then((r) => (r ? landed(r) : refresh())).catch(() => refresh()); pushWidgets(); }
    });
    return () => sub.remove();
  }, [refresh, landed]);
  useEffect(() => { pushWidgets(); return listenWidgets(refresh); }, [refresh]);
  useEffect(() => onLeftSaved(refresh), [refresh]); // the detail screen's last edits, saved as it closed
  // Rolled five times: a flexible task the planner has moved past its block five times is asked once, the question over the chips (Bỏ / Chia nhỏ / Giữ).
  useEffect(() => {
    const x = rolledPick(tasks);
    if (!x || ask || chips) return; // chips up (a voice or typed command): skip; still unasked, so a later tick offers it
    void markRolled(x.id).then((first) => {
      if (!first) return; // asked already, or another refresh got here first
      setChips({ ask: t("rolledAsk", { title: x.title }), sub: t("rolledSub"), row: true, options: [
        { label: t("rolledDrop"), run: () => { setChips(undefined); void removeScope(x.id, "this").then((r) => { say(r.toast, r); refresh(); }, () => {}); } },
        { label: t("rolledSplit"), run: () => { setChips(undefined); void addSitting(x.id).then((r) => { say(r.toast, r); refresh(); }, () => {}); } },
        { label: t("rolledKeep"), on: true, run: () => setChips(undefined) },
      ] });
    }, () => {});
  }, [tasks, ask, chips, say, refresh]);
  // calm.html "Hết giờ": a block that ran out unticked (overdue: its end plus the grace) is the now card until it is extended, moved or ticked.
  // The card's swipe and buttons act on the same task (cardRef), so they never reach the next block by mistake.
  const late = overdue(tasks, now + GRACE)[0];
  const lateNext = late ? pickNow(tasks.filter((x) => x.id !== late.id), now) : undefined;
  const shown = late && late.start !== undefined ? { task: late, start: late.start, end: late.end } : card;
  const cardRef = useRef(shown);
  useEffect(() => { cardRef.current = shown; });
  // `now` otherwise moves only on a refresh: left open, rows would never turn late and "today" would not roll over at midnight.
  useEffect(() => {
    let day = startOfDay(Date.now());
    const i = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (startOfDay(n) !== day) { const was = day; day = startOfDay(n); setSel((v) => (v === was ? day : v)); onForeground().then((r) => (r ? landed(r) : refresh())).catch(() => refresh()); } // a new day also gives waiting tasks their slots // today rolls over; a day picked on purpose stays
      else onTick(n).then((r) => { if (r) landed(r); else if (cardRef.current?.end !== undefined && cardRef.current.end <= n) refresh(); }).catch(() => {}); // a block ended: the card moves on // the clock's replans: a block ended, an idle gap, the 21:30 sweep
    }, 30_000);
    return () => clearInterval(i);
  }, [refresh, landed]);
  useEffect(() => onSynced(landed), [landed]); // the campus queue lands its changes here whenever a drain ends
  const monthKey = new Date(sel).getFullYear() * 12 + new Date(sel).getMonth();
  const hols = useMemo<Hols>(() => { // public holidays across the month grid
    const first = mondayOf(new Date(Math.floor(monthKey / 12), monthKey % 12, 1).getTime());
    return holidays(first, addDays(first, 42));
  }, [monthKey]);

  const stopRec = useRef<(() => Promise<Heard>) | undefined>(undefined);
  const held = useRef(false);
  // Opened from the talk widget (zen:///?listen=1): already listening, so the next touch on the button ends it.
  const latched = useRef(false);
  const { listen, scan, type, view: openView, h: openHour, at: openAt, day: openDay } = useLocalSearchParams<{ listen?: string; scan?: string; type?: string; view?: string; h?: string; at?: string; day?: string }>();
  // "Xem nhịp của bạn" from a task's why: each new link opens Nhịp once (set while rendering, React's pattern for state from props)
  const [opened, setOpened] = useState<string>();
  const openKey = openView === "rhythm" ? `${openHour ?? ""}@${openAt ?? ""}` : undefined; // `at`: a second tap reopens it
  if (openKey !== undefined && openKey !== opened) { setOpened(openKey); setView("rhythm"); }
  // The night-before notice's "Xem ngày mai": opens that day once.
  const [openedDay, setOpenedDay] = useState<string>();
  if (openDay !== undefined && openDay !== openedDay) { setOpenedDay(openDay); setView("day"); setSel(startOfDay(Number(openDay))); }

  useEffect(() => { micReset(); }, []);
  useEffect(() => { // once: the on-device models (whisper, Qwen, e5) are gone; their ~1.6 GB must not linger
    import("expo-file-system").then(({ Directory, Paths }) => { const d = new Directory(Paths.document, "models"); if (d.exists) d.delete(); }).catch(() => {});
  }, []);
  // Drop the take: close the mic, clear the veil. Leaving the app mid-hold, or a tap on the veil when a press got stuck.
  const cancel = () => {
    held.current = false;
    latched.current = false;
    asideRef.current = "";
    const stop = stopRec.current;
    stopRec.current = undefined;
    level.set(0);
    setPressing(false);
    setAside("");
    setWords("");
    setState("idle");
    if (stop) stop().catch(() => {}); // no stop yet: start() sees held=false and closes it
  };
  const cancelRef = useRef(cancel);
  useEffect(() => { cancelRef.current = cancel; });
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => { if (st !== "active" && held.current) cancelRef.current(); });
    return () => sub.remove();
  }, []);
  const start = async () => {
    if (shuf.current) return;
    held.current = true;
    if (!(await askMic())) { held.current = false; return say(t("mic")); }
    if (!held.current || asideRef.current) return;
    setWords("");
    setState("listening"); // at once, before the recognizer is up, so the button never reads as broken
    try {
      const rec = await listenLive({ hints: vocab(await store.allTasks()), onPartial: setWords, onLevel: (l: number) => level.set(withTiming(l, { duration: 90 })) });
      if (!held.current || asideRef.current) return void rec.stop().catch(() => {}); // released, or moved to a satellite, while the mic was starting
      stopRec.current = rec.stop;
    } catch (e) {
      held.current = false;
      setState("idle");
      fail(t("micFail"), e);
    }
  };

  useEffect(() => {
    if (listen !== "1") return;
    latched.current = true;
    // After mount, not inside the effect body; clearing the param here would cancel this timer.
    const id = setTimeout(() => { router.setParams({ listen: undefined }); void start(); }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen]);

  const end = async () => {
    if (!held.current) return;
    held.current = false;
    const stop = stopRec.current;
    stopRec.current = undefined;
    if (!stop) return setState("idle"); // start() sees held=false and closes the mic itself
    setState("thinking");
    level.set(0);
    let heard: Heard;
    try { heard = await stop(); } catch (e) { setState("idle"); return fail(t("thinkFail"), e); }
    if (!heard.text) { setState("idle"); return say(t("heardNothing"), undefined, { sub: t("heardNothingSub") }); }
    await run(heard.text, "voice", heard.alternatives);
  };

  // Applies a command and says what changed, with its own undo (the toast's action).
  const applyCommand = async (actions: Action[]) => {
    setChips(undefined);
    const r = await apply(actions, Date.now());
    lastIds.current = actions.flatMap((a) => (a.target ? [a.target] : []));
    say(r.toast, r);
    refresh();
  };
  // What picks and undos taught (intent.ts `learn`), kept across launches.
  const loadLearned = async (): Promise<Learned> => { try { return JSON.parse((await store.kvGet("nlu.cmdLearn")) ?? "{}") ?? {}; } catch { return {}; } };
  const teach = async (key: string | undefined, id: string | undefined, how: "pick" | "undo") => {
    const x = id ? tasksRef.current.find((y) => y.id === id) : undefined;
    if (key && x) await store.kvSet("nlu.cmdLearn", JSON.stringify(learn(await loadLearned(), key, kinOf(x), how))).catch(() => {});
  };
  // The next ask of the same line, once this one is answered.
  const nextAsk = () => { const n = askQ.current.shift(); if (n) offerCommand(n.cmd, n.text, n.via); };
  const then = (p: unknown) => void Promise.resolve(p).then(nextAsk);
  // A series said whole ("xoá hết gym", "xoá gym từ giờ"): its scope, as the long-press does, so top-up does not bring it back.
  const delSeries = (sc: SeriesScope) => { setChips(undefined); const x = tasks.find((y) => y.id === sc.id); if (x) void del(x, sc.scope); };
  // Bulk asks first, with a count. A choice shows one chip per task, and "Tạo việc mới" makes the line a new task.
  const artById = (id?: string) => { const x = id ? tasks.find((y) => y.id === id) : undefined; return x && artOf(x); }; // the task's palette for its toast
  const offerCommand = (cmd: Command, text: string, via: "voice" | "type" | "photo" | "pdf" | "scan") => {
    if (cmd.kind === "bulk") {
      // calm.html "Command, many at once": the question with Thôi and the verb as pills, nothing happens until the tap
      setChips({ ask: cmd.label ?? `${VERB_VI[cmd.verb]} ${cmd.count} việc?`, row: true, options: [
        { label: "Thôi", run: () => setChips(undefined) },
        { label: `${VERB_VI[cmd.verb]} ${cmd.count} việc`, on: true, run: () => then(cmd.series ? delSeries(cmd.series) : applyCommand(cmd.actions)) },
      ] });
      return;
    }
    if (cmd.kind === "rule") {
      // a series' weekdays change from a day on: confirmed, then one undo for the end and the new days
      const go = async () => { try { const r = await reshapeSeries(cmd.id, cmd.from, cmd.rrule, Date.now()); lastIds.current = [cmd.id]; say(r.toast, r, { art: artById(cmd.id) }); refresh(); } catch (e) { fail("Mình chưa đổi được lịch lặp", e); } };
      setToasts((q) => [...q, { text: cmd.label, action: { label: "Đổi", run: () => then(go()) }, alt: { label: "Huỷ", run: () => then(setChips(undefined)), plain: true } }]);
      return;
    }
    if (cmd.kind === "choose") {
      if (cmd.ask) setToasts((q) => [...q, { text: cmd.ask! }]);
      setChips({ options: [...cmd.options.map((o, i) => ({ label: o.label, detail: o.detail, on: i === 0, run: () => { void teach(cmd.key, o.actions[0]?.target ?? o.series?.id, "pick"); then(o.series ? delSeries(o.series) : applyCommand(o.actions)); } })), { label: "Tạo việc mới", run: () => then(run(text, via, undefined, true)) }] });
    }
  };
  // A session added to a series: one-off, with the "mỗi tuần" alt chip to make it weekly. A weekly line makes it weekly at once.
  const addSession = async (cmd: Extract<Command, { kind: "session" }>) => {
    const now = Date.now();
    const r = await apply(cmd.actions, now);
    const weekly = t("seriesDays", { title: cmd.title, days: cmd.days }), art = artById(cmd.actions[0].target);
    if (!cmd.alt) say(weekly, r, { art });
    else say(t("sessionAdded", { n: cmd.count, title: cmd.title }), r, { art, sub: t("sessionSub", { when: when(new Date(cmd.actions[0].notBefore!).getTime(), now), title: cmd.title }), alt: { label: t("sessionAlt"), run: async () => { await r.undo(); say(weekly, await apply(cmd.alt!, Date.now())); refresh(); } } });
    refresh();
  };

  // One reader for every way in: what was said, typed, or read off a photo or a PDF (its text layer, or a scan read like a photo).
  // The outline preview's Thêm: one parent per group, its leaves chained where the list is ordered.
  const saveLined = async (gs: Group[]) => {
    setLined(undefined);
    const now = Date.now();
    try {
      const acts = actionsOf(gs);
      const r = await apply(acts, now);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      say(t("addedN", { n: acts.filter((a) => a.ref?.startsWith("l")).length }), r);
      refresh();
    } catch (e) {
      fail("Mình chưa lưu được danh sách", e);
    }
  };

  // plain: the line is a new task even when it names one (the "Tạo việc mới" chip).
  const run = async (text: string, via: "voice" | "type" | "photo" | "pdf" | "scan", alternatives?: string[], plain = false) => {
    // A link typed or shared: its page's text is read in its place.
    if (/^https?:\/\/\S+$/.test(text.trim())) {
      setState("thinking");
      let body: string;
      try { body = await pageText(text.trim()); } catch (e) { setState("idle"); fail("Mình chưa mở được liên kết", e); return; }
      return run(body, via, alternatives);
    }
    while (shuf.current) await new Promise((r) => setTimeout(r, 150)); // the plan is still playing out: wait for it, never drop what was said
    const said = fold(text).text.trim().replace(/[.!?]+$/, "");
    // "cái thứ 2", "số 1": a chip on screen, picked by voice or typing
    const nth = chips && /^(?:cai |so |chon |lua chon )?(?:thu )?(\d|mot|nhat|hai|ba|bon|tu|nam)$/.exec(said);
    const pickN = nth ? (/^\d$/.test(nth[1]) ? +nth[1] : ({ mot: 1, nhat: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5 } as Record<string, number>)[nth[1]]) : 0;
    if (chips && pickN && chips.options[pickN - 1]) { setState("idle"); chips.options[pickN - 1].run(); return; }
    // "hoàn tác", "undo": the last change, as the toast's Undo would
    if (/^(hoan tac|undo|hoan tac lai)$/.test(said)) {
      const u = lastUndo.current;
      lastUndo.current = undefined;
      setState("idle");
      if (u) await u(); else say(t("nothingToUndo"));
      return;
    }
    // "mai có gì": a question opens search with it, never a new task
    const asked = via === "voice" || via === "type" ? askOf(text) : undefined;
    if (asked) {
      setState("idle");
      setFindQ(asked);
      if (findBtn.current) findBtn.current.measureInWindow((x, y) => setFinding({ x, y })); else setFinding({ x: 0, y: 0 });
      return;
    }
    setState("thinking");
    setChips(undefined);
    setWords(text);
    try {
      // Nhịp hears every sentence as a standing rule; home sends only rule-sounding ones, and falls back to tasks when they don't parse.
      if (view === "rhythm" || isRule(text)) {
        const rules = (await store.loadModel(new Date().getTime())).rules ?? [];
        const said = readRule(text, rules);
        if (said) {
          const r = "add" in said ? await addRule(said.add) : await removeRule(said.forget.map((x) => x.id));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          say(r.toast, r);
          refresh();
          return;
        }
        if (view === "rhythm") { say(t("ruleHuh"), undefined, { sub: t("ruleHuhSub") }); return; }
      }
      // A list (a note, a chat, a page, a scan) goes to the outline preview; anything else reads as before.
      const ol = via === "voice" ? undefined : outline(text, new Date());
      if (ol) {
        setPdf(undefined);
        setLined({ groups: ol.groups, from: via === "photo" || via === "scan" ? "ảnh" : via === "pdf" ? "PDF" : "văn bản" });
        setState("idle");
        return;
      }
      const all = await store.allTasks();
      const nowD = new Date();
      // What the reader cannot know from the words: the timetable, what this user usually saves per title, and the marks.
      const old = JSON.parse((await store.kvGet("nlu.committed").catch(() => null)) ?? "[]");
      const extra = { tasks: all, calendar: calendarOf(all, nowD.getTime()), affinity: affinityOf((await getMarks().catch(() => null))?.marks ?? []), prior: personalPrior(old), classMult: await loadClassMult().catch(() => ({})), alternatives };
      const source = via === "voice" ? "voice" : via === "photo" || via === "scan" ? "ocr" : via === "pdf" ? "paste" : "typed"; // ocr and paste: the reader reads a notice's lines and tables as such
      // A line that names tasks but is not sure of one: a bulk confirm, or chips to pick from. Anything clear is applied below.
      // A line may hold several parts: the clear commands and the rest as creates, one toast and one undo; a part not sure of its task asks after.
      // a voice line also tries the recognizer's other guesses when the heard one was a command it could not place
      const sp = plain ? undefined : splitHeard(text, via === "voice" ? alternatives ?? [] : undefined, nowD.getTime(), all, { ...(await loadLearned()), last: lastIds.current });
      if (sp?.session) return addSession(sp.session);
      // A split line applies its own parts only: a chip's part is never applied as a create behind the chips.
      const actions = sp ? [...sp.ones.flatMap((o) => o.actions), ...(sp.rest ? think(sp.rest, nowD, source, extra) : [])] : think(text, nowD, source, extra);
      if (sp) {
        if (actions.length) {
          const r = await apply(actions, nowD.getTime());
          // an undo right after a command says it took the wrong task: those words ask next time
          const t0 = nowD.getTime(), undo = r.undo;
          r.undo = async () => {
            if (Date.now() - t0 < 10_000) {
              if (__DEV__) console.log("[undo-after-command]", JSON.stringify({ via, text, ones: sp.ones })); // scripts/mine-heard.ts reads these
              for (const o of sp.ones) await teach(o.key, o.actions[0]?.target, "undo");
            }
            await undo();
          };
          const made = (await store.allTasks()).filter((x) => x.createdAt === nowD.getTime() && x.source === "user" && !x.parentId).map((x) => x.id);
          if (__DEV__) console.log("[heard]", JSON.stringify({ via, text, alternatives, actions }));
          lastIds.current = [...sp.ones.flatMap((o) => o.actions.flatMap((a) => (a.target ? [a.target] : []))), ...made];
          say(t("commandsDone", { list: [...sp.ones.map((o) => o.label), ...actions.filter((a) => a.op === "create").map((a) => `thêm ${a.title}`)].join(", ") }), r);
          refresh();
        }
        // "hoãn gym": the planner finds each a later time, as a swipe does
        for (const id of (sp.later ?? []).flatMap((l) => l.ids)) { const r = await swipeLater(id); say(r.toast, r); lastIds.current = [id]; }
        if (sp.later?.length) refresh();
        if (sp.cancelled && !actions.length && !sp.asks.length) say(t("commandCancelled"));
        setState("idle");
        askQ.current = sp.asks.slice(1).map((a) => ({ ...a, via }));
        if (sp.asks[0]) offerCommand(sp.asks[0].cmd, sp.asks[0].text, via);
        return;
      }
      // dev only: what the recognizer wrote and what was read from it, so a wrong day can be traced to its transcript
      if (__DEV__) console.log("[heard]", JSON.stringify({ via, text, alternatives, actions, readErrors }));
      let read: ReturnType<typeof readFull> | undefined; // offsets in the notes point into this transcript, not a winning alternative
      try { read = readFull(text, nowD, source, { ...extra, alternatives: undefined }); } catch { /* the tasks are made without the hints */ }
      const notes = read ? readNotes(text, read) : {};
      const now = nowD.getTime();
      const r = await apply(actions, now);
      if (read?.items.length) store.kvSet("nlu.committed", JSON.stringify(committedRows(read.items, old))).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const titles = [...new Set(actions.filter((a) => a.op === "create" && a.title).map((a) => a.title!))];
      const anchor = actions.find((a) => a.flags?.includes("anchor-ambiguous") && a.alternatives?.length);
      // Show where the new work landed: the day of its earliest placed piece, not today.
      const made = (await store.allTasks()).filter((x) => x.createdAt === now && x.source === "user" && !x.deletedAt && x.start !== undefined);
      const firstAt = Math.min(...made.map((x) => x.start!));
      // Said but no free time anywhere it may go: say so, never "added" with a time it does not have.
      const mine = (await store.allTasks()).filter((x) => x.createdAt === now && x.source === "user" && !x.deletedAt && !x.parentId);
      const stuck = mine.filter((x) => !made.some((y) => y.id === x.id || y.parentId === x.id));
      lastIds.current = mine.map((x) => x.id);
      const stuckDay = stuck.length && !made.length ? startOfDay(Math.max(now, (stuck[0].deadline ?? stuck[0].notAfter ?? now + 1) - 1)) : undefined;
      if (stuckDay !== undefined) setSel(stuckDay);
      // A deadline past the 7-day horizon is kept as the due date; the sittings land inside the horizon. Said once, for the furthest one.
      const far = Math.max(0, ...(await store.allTasks()).filter((x) => x.createdAt === now && x.source === "user" && !x.deletedAt && x.deadline !== undefined && x.deadline > addDays(now, 7)).map((x) => x.deadline!));
      const farSub = far ? t("farDue", { date: dayLabel(far).slice(4) }) : undefined; // dayLabel: "T6, 21/11" → "21/11"
      // An anchor the reader could not pin ("ôn trước kỳ thi Toán" with two Toán exams): the chips pick one, and its start becomes the deadline.
      if (anchor) {
        const target = mine.find((x) => x.title === anchor.title);
        const how = anchor.flags!.find((f) => f.startsWith("anchor:"))?.split(":") ?? []; // the cue said: before or after a task, class or exam
        const options = anchor.alternatives!.flatMap((id) => { const c = all.find((x) => x.id === id); return c?.start !== undefined ? [c] : []; });
        if (target && options.length) setChips({ options: options.map((c) => ({ label: c.title, detail: dayLabel(c.start!), run: () => void applyCommand([{ op: "edit", target: target.id, ...anchorPatch(how, c) }]) })) });
      }
      const playing = (r.steps ?? []).some((st) => st.id); // the shuffle picks the day itself
      if (!playing && titles.length && Number.isFinite(firstAt)) setSel(startOfDay(firstAt));
      // The sized sub (exam, shared end, span or due with sittings) names what the sizer did; else the time of the first piece.
      const sized = sizedSub(actions.filter((a) => a.op === "create" && a.title), now);
      const understood = inferred(actions.filter((a) => a.op === "create" && a.title), sized); // only what was worked out beyond the words
      if (titles.length > 1) { // bulk: count, one Undo for all, no alt
        say(t("addedN", { n: titles.length }), r, { stuck: stuck.length ? t("noRoomN", { n: stuck.length }) : undefined, understood, notes: notes.sub, far: farSub });
      } else if (titles.length === 1 && stuck.length) {
        say(t("added", { title: titles[0] }), r, { name: titles[0], stuck: t("noRoom"), alt: { label: t("pickTime"), run: async () => router.push(`/task/${encodeURIComponent(stuck[0].id)}`) } });
      } else if (titles.length === 1) {
        // The reader's own ask ("3 giờ": 15:00 or 03:00) takes the chip; else the planner's other slot.
        const alt = notes.alt && { alt: { label: notes.alt.label, run: async () => { await r.undo(); await run(notes.alt!.text, via); } } };
        // Not where or as long as it was asked: the reason says why at once ("Sáng mai kín, dời sang chiều mai").
        const first = made.find((x) => x.start === firstAt), fitWhy = first && (await store.loadModel(now)).placed[first.id]?.why?.find((x) => FIT.has(x.key));
        // Every instance, not the first: a repeat says its pattern, sittings each their day and time (the first four, then "+n").
        const pieces = made.filter((x) => !x.fixed).sort((a, b) => a.start! - b.start!), head = pieces[0], until = /UNTIL=\d{4}(\d\d)(\d\d)/.exec(head?.rrule ?? "");
        const all_ = head?.rrule ? `${repeatText(head.rrule, head.start!)}, ${hm(head.start!)}${until ? ` · ${t("untilDate", { d: `${+until[2]}/${+until[1]}` })}` : ""}`
          : pieces.length > 1 ? [...pieces.slice(0, 4).map((x) => when(x.start!, now)), ...(pieces.length > 4 ? [`+${pieces.length - 4}`] : [])].join("\n") : undefined;
        say(t("added", { title: titles[0] }), r, { name: titles[0], when: all_, reason: fitWhy && reasonText(fitWhy), understood, where: Number.isFinite(firstAt) ? whereOf(firstAt, now) : undefined, notes: notes.sub, far: farSub, ...(alt ?? (await otherSlot(made, now))) });
      } else say(r.toast, r);
      setPhoto(undefined);
      setPdf(undefined);
      await shuffle(r, all);
    } catch (e) {
      fail(t("thinkFail"), e);
    } finally {
      if (!shuf.current) setState("idle");
    }
  };

  // capture.html frame 11: nothing readable, so keep the photo (or the PDF page) and offer the keyboard.
  const nothing = (what: "photo" | "pdf") => setToasts((q) => [{ text: t(what === "pdf" ? "pdfNothing" : "photoNothing"), sub: t(what === "pdf" ? "pdfNothingSub" : "photoNothingSub"), action: { label: t("satType"), run: () => { setPhoto(undefined); setPdf(undefined); setTyping(true); } } }, ...q.slice(1)]);

  // The thumb moved onto a satellite (drop the take) or back onto the mic (listen again).
  const onAside = (a: Aside) => {
    asideRef.current = a;
    setAside(a);
    if (!a) { if (held.current) void start(); return; }
    const stop = stopRec.current;
    stopRec.current = undefined;
    level.set(0);
    setWords("");
    setState("idle");
    if (stop) stop().catch(() => {});
  };
  const onEnd = (a: Aside) => {
    setPressing(false);
    latched.current = false;
    asideRef.current = "";
    setAside("");
    if (!a) return void end();
    held.current = false;
    if (a === "type") setTyping(true); else if (a === "pdf") void readPdf(); else setPicking(true);
  };
  const readPhoto = async (src: "camera" | "library") => {
    setPicking(false);
    try {
      if (src === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return say(t("camDenied"));
      const r = await (src === "camera" ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: ["images"] });
      if (r.canceled || !r.assets[0]) return;
      const { uri, width, height } = r.assets[0];
      await readImage(uri, width, height);
    } catch (e) {
      setState("idle");
      fail(t("photoFail"), e);
    }
  };

  // Ảnh, and a picture shared in: the same read under the same sweep (w and h are 0 when unknown: the photo keeps its own shape).
  const readImage = async (uri: string, width: number, height: number) => {
    setPhoto({ uri, w: width, h: height });
    setState("thinking");
    const text = (await extractTextFromImage(uri)).map((l) => l.trim()).filter(Boolean).join("\n");
    if (!text) { setState("idle"); return nothing("photo"); }
    // capture.html 8: the read text with what the reader found lit up, held a beat so you see it, then added as usual.
    const marks = marksOf(text, readFull(text, new Date(), "ocr"));
    if (marks.length) { setPhoto({ uri, w: width, h: height, text, marks }); await new Promise((ok) => setTimeout(ok, 1400)); }
    await run(text, "photo");
  };

  // zen:///?type=1: the type bar straight away (the hold-and-slide gesture's "type" satellite, for links and e2e).
  useEffect(() => {
    if (type !== "1") return;
    const id = setTimeout(() => { router.setParams({ type: undefined }); setTyping(true); }, 0);
    return () => clearTimeout(id);
  }, [type]);

  // Opened from the capture widget (zen:///?scan=1): the camera straight away.
  useEffect(() => {
    if (scan !== "1") return;
    const id = setTimeout(() => { router.setParams({ scan: undefined }); void readPhoto("camera"); }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan]);

  // capture.html 5 and 12: the system picker straight away, then every page read on the phone, nothing uploaded.
  // A PDF shared in (shared) skips the picker and is read the same way.
  const readPdf = async (shared?: string) => {
    let uri: string | undefined = shared;
    try {
      if (!uri) {
        const r = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
        if (r.canceled || !r.assets[0]) return;
        uri = r.assets[0].uri;
      }
      setState("thinking");
      const pages = await getPageCount(uri);
      setPdf({ page: 1, pages });
      const beat = Math.min(1400, 2800 / pages); // a beat on each page with finds, the whole file held under 3 s
      const texts: string[] = [];
      for (let n = 1; n <= pages; n++) {
        const text = (await extractTextFromPage(uri, n)).trim();
        texts.push(text);
        if (!text) continue;
        const marks = marksOf(text, readFull(text, new Date(), "paste"));
        setPdf({ page: n, pages, text, marks });
        if (marks.length) await new Promise((ok) => setTimeout(ok, beat));
      }
      let all = texts.filter(Boolean).join("\n\n"), via: "pdf" | "scan" = "pdf";
      if (!all) { // no text layer: a scan, each page drawn and read like a photo, under the same sweep
        via = "scan";
        const lines: string[] = [];
        for (let n = 0; n < pages; n++) {
          const img = await PdfPageImage.generate(uri, n, 2, { maxDimension: 2400 });
          setPdf({ page: n + 1, pages, image: img.uri });
          lines.push(...(await extractTextFromImage(img.uri)).map((l) => l.trim()).filter(Boolean));
        }
        all = lines.join("\n");
      }
      if (!all) { setState("idle"); return nothing("pdf"); }
      await run(all, via);
    } catch (e) {
      setState("idle");
      setPdf(undefined);
      fail(t("pdfFail"), e);
    } finally {
      if (uri) PdfPageImage.close(uri).catch(() => {}); // drops the drawn pages; a no-op for a text PDF
    }
  };

  // A share from another app (expo-sharing, routed here by src/app/+native-intent.ts): read it as Gõ, Ảnh or PDF would, then clear it so it is read once.
  // shortcut: only the first item of a share is read (the share filters allow one), a second one waits for its own share.
  const { resolvedSharedPayloads, isResolving, clearSharedPayloads } = useIncomingShare();
  useEffect(() => {
    if (isResolving || !resolvedSharedPayloads.length) return;
    const item = sharedOf(resolvedSharedPayloads[0]);
    void (async () => {
      try {
        if (!item) return;
        const via = viaOf(item);
        if (via === "type") { // text or a link: the flat page with its finds lit, then the typed reader
          setState("thinking");
          const marks = marksOf(item.value, readFull(item.value, new Date(), "typed"));
          setPdf({ page: 1, pages: 0, text: item.value, marks });
          if (marks.length) await new Promise((ok) => setTimeout(ok, 1400));
          await run(item.value, "type");
        } else if (via === "photo") { // a picture: its own size keeps its shape, else the photo read takes it as it is
          try {
            const { w, h } = await new Promise<{ w: number; h: number }>((ok) => Image.getSize(item.value, (w, h) => ok({ w, h }), () => ok({ w: 0, h: 0 })));
            await readImage(item.value, w, h);
          } catch (e) {
            setState("idle");
            fail(t("photoFail"), e);
          }
        } else await readPdf(item.value);
      } catch (e) {
        setState("idle"); setPdf(undefined);
        fail(t("photoFail"), e);
      } finally {
        clearSharedPayloads(); // after the read: clearing deletes zen's copy of the shared file
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arriving share; the readers it calls are current for this render
  }, [resolvedSharedPayloads, isResolving]);

  // The planner's own second-best start for a single new flexible task.
  const otherSlot = async (made: Task[], now: number) => {
    const task = made.length === 1 && !made[0].fixed ? made[0] : undefined;
    const alt = task && (await store.loadModel(now)).placed[task.id]?.alt;
    if (!task || alt === undefined || alt === task.start || alt <= Date.now()) return;
    return { alt: { label: when(alt, now), run: async () => { const a = await apply([{ op: "edit", target: task.id, when: new Date(alt).toISOString() }]); say(task.title, a, { sub: when(alt, now) }); refresh(); } } };
  };

  // A failed write must not leave the list showing a change that never landed: say so and reload what is stored.
  const failed = () => { say(t("saveFailed")); refresh(); };
  const toggle = (x: Task) => toggleNow(x).catch(failed);
  const toggleNow = async (x: Task) => {
    const at = Date.now();
    gen.current++;
    setTasks((p) => p.map((a) => (a.id === x.id || a.parentId === x.id ? { ...a, doneAt: at } : a))); // ticks at once; the save confirms
    const r = await swipeDone(x.id);
    setPop((p) => new Set(p).add(x.id));
    setTimeout(() => setPop((p) => { const n = new Set(p); n.delete(x.id); return n; }), 1400);
    const ps = parents(tasks);
    const left = tasks.filter((a) => live(a) && a.id !== x.id && a.start !== undefined && a.start < addDays(startOfDay(Date.now()), 1) && !ps.has(a.id)).length;
    if (!left) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); // the day's last one: a second buzz
    say(t("doneTitle", { title: x.title }), r, { sub: left ? t("leftToday", { n: left }) : t("leftNone") });
    refresh();
  };
  const edit = (x: Task, a: { title?: string }) => apply([{ op: "edit", target: x.id, ...a }]).then((r) => { say(r.toast, r); refresh(); }, failed);
  const del = (x: Task, scope: "this" | "following" | "all") => delNow(x, scope).catch(failed);
  const delNow = async (x: Task, scope: "this" | "following" | "all") => {
    const gone = new Set(scopeIds(tasks, x.id, scope)), stamp = Date.now();
    gen.current++;
    setTasks((p) => p.map((a) => (gone.has(a.id) ? { ...a, deletedAt: stamp } : a))); // leaves the list at once; the save confirms
    const r = await removeScope(x.id, scope);
    const at = x.start ?? x.deadline;
    const sub = scope === "all" ? t("allSessions") : scope === "following" ? t("fromOn", { day: at !== undefined ? dayName(at, now) : "" }) : at !== undefined ? when(at, now) : undefined;
    say(t(scope === "all" ? "removedAll" : "removed", { title: x.title }), r, { sub });
    refresh();
  };
  // Series (campus section, repeat, or split sittings): long-press or swipe opens three scopes. Plain tasks: swipe deletes. Undo is the net.
  const seriesItems = (x: Task): Item[] => x.section || x.rrule || x.parentId
    ? [{ label: t("delThis"), icon: "minus", onPress: () => del(x, "this") }, { label: t("delFollowing"), icon: "toEnd", onPress: () => del(x, "following") }, { label: t("delAll"), icon: "trash", destructive: true, onPress: () => del(x, "all") }]
    : [];
  // Long-press adds the lessons: put it back, take the other good time, pin.
  const itemsFor = (x: Task): Item[] => {
    // a time already gone is no choice: neither "put back" nor "another time" is offered for it
    const ahead = (ts?: number) => (ts !== undefined && ts > Date.now() ? ts : undefined);
    const from = ahead(maps.froms[x.id]), alt = ahead(maps.alts[x.id]), out: Item[] = [];
    const done = (r: Result) => { say(r.toast, r); refresh(); };
    if (from !== undefined && !x.fixed) out.push({ label: t("itemPutBack", { when: when(from, now) }), icon: "undo", onPress: async () => done(await putBack(x.id, from)) });
    if (alt !== undefined && !x.fixed) out.push({ label: t("itemAlt", { when: when(alt, now) }), icon: "clock", onPress: async () => done(await apply([{ op: "edit", target: x.id, when: new Date(alt).toISOString() }])) });
    if (!x.fixed && !x.doneAt && (from !== undefined || alt !== undefined || maps.reason[x.id] || x.pinned)) out.push({ label: t(x.pinned ? "itemUnpin" : "itemPin"), icon: x.pinned ? "pinOff" : "pin", onPress: async () => done(await pin(x.id, !x.pinned)) });
    // A sitting or split task: one more sitting, or one less; "more" also teaches the class multiplier the parent's length was short.
    const sits = sittingItems(x, tasks, {
      more: async (p) => { const r = await addSitting(p.id); say(r.toast, r); refresh(); await needMore(p); },
      less: async (p) => done(await dropSitting(p.id)),
    });
    return [...out, ...sits, ...seriesItems(x)];
  };
  // A time that lands on a class keeps your time: the toast names the class, as the detail screen does.
  const clashSub = (r: Result): Ctx | undefined => (r.clashes?.length ? { clash: t("previewClash", { title: r.clashes[0].fixed.title }) } : undefined); // compose() keeps a learned line over this
  const rowActs = {
    // Edits show at once and persist behind: the list takes the new value now, and the refresh after the save confirms it.
    onToggle: toggle, onTitle: (x: Task, title: string) => { gen.current++; setTasks((p) => p.map((y) => (y.id === x.id ? { ...y, title } : y))); edit(x, { title }); }, itemsFor,
    onTime: (x: Task, at: Date) => {
      const d = new Date(x.start ?? Date.now()); d.setHours(at.getHours(), at.getMinutes(), 0, 0);
      const start = d.getTime(), len = x.start !== undefined && x.end !== undefined ? x.end - x.start : Math.max(30, x.effort || 30) * 60_000;
      gen.current++;
      setTasks((p) => p.map((y) => (y.id === x.id ? { ...y, start, end: start + len, pinned: true } : y)));
      retime(x.id, start, Math.round(len / 60_000)).then((r) => { if (r) { say(r.toast, r, clashSub(r)); refresh(); } }, failed); // saved at once; the toast and reload when it rests
    },
    // The end's own dial: the start stays, the length follows (an end before the start runs past midnight, as on the detail screen).
    onEnd: (x: Task, at: Date) => {
      if (x.start === undefined || x.end === undefined) return;
      const end = Math.max(x.start + 15 * 60_000, endAt(x.start, x.end, at));
      gen.current++;
      setTasks((p) => p.map((y) => (y.id === x.id ? { ...y, end, pinned: true } : y)));
      retime(x.id, x.start, Math.round((end - x.start) / 60_000)).then((r) => { if (r) { say(r.toast, r, clashSub(r)); refresh(); } }, failed);
    },
    onOpen: (x: Task) => router.push(`/task/${encodeURIComponent(x.id)}`),
    // Swipe right: a plain task is deleted at once; a series opens the scope dropdown under the row.
    onSwipeDelete: (x: Task, bottom?: number, top = bottom) => (bottom === undefined ? del(x, "this") : setMenu({ task: x, ...menuAt(bottom, top!, seriesItems(x)) })),
    onHold: (x: Task, bottom: number, top: number) => setMenu({ task: x, ...menuAt(bottom, top, itemsFor(x)) }), lifted: menu?.task.id,
  };

  // "Làm luôn" on the next block: that very sitting moves to the next 5-minute mark (its old slot goes to whatever waits for a time).
  const startBlock = async (task: Task, start: number, end: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Early means the next 5-minute mark (11:23 gives 11:25), a moment to settle rather than a start this second; never past the block's own start.
    const now = Date.now(), next5 = Math.ceil(now / 300_000) * 300_000, at = start > now ? Math.min(next5, start) : now < end ? start : Math.ceil(now / 60_000) * 60_000; // a block already begun (the tap landed late) keeps its own start
    const r = await take(task.id, at, at + (end - start));
    say(r.toast, r);
    await shuffle(r);
  };
  const startNow = async () => {
    const c = cardRef.current;
    if (!c || c.start === undefined || c.end === undefined) return;
    await startBlock(c.task, c.start, c.end);
  };
  // "Làm luôn" on an elapsed row: its block starts now, from any day's list, as often as needed.
  const startTask = (x: Task) => { if (x.start !== undefined && x.end !== undefined) void startBlock(x, x.start, x.end); };
  // "Có" makes the weekly repeat through the series path; "Không" is remembered and the card goes back to the day.
  const answerSeries = async (yes: boolean) => {
    const o = ask;
    if (!o) return;
    setAsk(undefined);
    if (!yes) { await declineSeries(o.key); return refresh(); }
    const r = await acceptSeries(o);
    say(r.toast, r);
    refresh();
  };
  const restRef = useRef(rest);
  useEffect(() => { restRef.current = rest; }, [rest]);
  // magic.html 17c: swiping the rest card away moves the line 30p past today's work, at once; Hoàn tác puts it back.
  const moreRest = async () => {
    const r = restRef.current;
    if (!r) return;
    const more = Math.max(r.more + 30 * 60_000, r.w + 30 * 60_000 - (r.line - r.more));
    await store.kvSet("rest.more", String(more));
    let undone = false;
    setToasts((q) => [{ text: t("restMore"), sub: t("restLearned", { h: mins((r.line - r.more + more) / 60_000) }), action: { run: async () => {
      if (undone) return; undone = true;
      await store.kvSet("rest.more", String(r.more)); setToasts((u) => [{ text: t("undone") }, ...u.slice(1)]); refresh();
    } } }, ...q.slice(1)]);
    refresh();
  };
  const commit = async (dir: "done" | "later") => {
    const c = cardRef.current;
    if (!c) return moreRest();
    if (c.gap) { await store.kvSet("gap.off", String(startOfDay(Date.now()))); return refresh(); } // a swiped gap card: not today
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    // The card leaves and the task ticks at once; the save and replan confirm (a failure reloads what is stored, see finish).
    gen.current++;
    if (dir === "done") { const at = Date.now(); setTasks((p) => p.map((a) => (a.id === c.task.id || a.parentId === c.task.id ? { ...a, doneAt: at } : a))); }
    setCard(undefined);
    let r: Result | undefined;
    r = await (dir === "done" ? swipeDone(c.task.id) : swipeLater(c.task.id));
    if (r) say(r.toast, r);
    await shuffle(r);
  };
  const cx = useSharedValue(0);
  const noDone = useSharedValue(false); // a fixed lecture, exam or busy block is never ticked, so a right swipe springs back
  useEffect(() => { noDone.set(!!shown?.task.fixed && !shown.gap); }, [shown, noDone]);
  const committing = useRef(false);
  // The card comes back even when the save fails, and a second tap mid-save does nothing.
  const finish = async (dir: "done" | "later") => {
    if (committing.current) return;
    committing.current = true;
    try { await commit(dir); } catch { failed(); } finally { cx.set(0); committing.current = false; }
  };
  const swipe = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onUpdate: (e) => { "worklet"; cx.set(e.translationX); },
    onDeactivate: (e) => {
      "worklet";
      if (Math.abs(e.translationX) <= 110 || (e.translationX > 0 && noDone.get())) { cx.set(settle(0)); return; }
      const dir = e.translationX > 0 ? "done" : "later";
      cx.set(withTiming(e.translationX > 0 ? 500 : -500, { duration: 180 }, (ok) => { if (ok) scheduleOnRN(finish, dir); }));
    },
  });
  const flick = useAnimatedStyle(() => ({ transform: [{ translateX: cx.get() }, { rotate: `${interpolate(cx.get(), [-300, 300], [-8, 8]).toFixed(2)}deg` }] }));

  const mon = mondayOf(sel);
  const today0 = startOfDay(now);
  const ps = useMemo(() => parents(tasks), [tasks]);
  const inView = (a: Task) => live(a) && a.start !== undefined && !ps.has(a.id);
  const count = (from: number, to: number, days = 0) => {
    const n = { a: 0, l: 0, e: 0 };
    for (const a of tasks) if (inView(a) && a.start! >= from && a.start! < to) { const ty = typeOf(a); n[ty === "lecture" ? "l" : ty === "exam" ? "e" : "a"]++; }
    const hs = [...hols].filter(([d]) => d >= from && d < to && days);
    if (!(n.a || n.l || n.e || hs.length)) return ""; // the caller says what an empty span reads as
    return [n.a ? t("nTasks", { n: n.a }) : "", n.l ? t("nLectures", { n: n.l }) : "", n.e ? t("nExams", { n: n.e }) : "", hs.length ? t("nHols", { n: hs.length, name: hs.some(([, h]) => /tết/i.test(h)) ? "Tết" : "lễ" }) : ""].filter(Boolean).join(", ");
  };
  // views.html "Day, empty" / "Day, all done": nothing left reads "Không có việc", everything ticked "5 việc, xong hết".
  const dayDone = (d: number) => {
    const n = tasks.filter((a) => a.doneAt && a.start !== undefined && a.start >= d && a.start < addDays(d, 1) && !ps.has(a.id)).length;
    return n ? t("nAllDone", { n }) : t("noTasks");
  };
  const sd = new Date(sel);
  // Week and month: a row held and moved lands on the day it is let go over, at its own time of day; the list then shows that day.
  // A drop moves the task to that day and keeps its part of the day; the planner picks the slot. The list follows only once the move lands.
  const dropOn = (x: Task, d: number) => {
    if (shuf.current) return; // a plan is playing out on the list: no second write over it
    gen.current++;
    moveToDay(x.id, d).then((r) => { say(r.toast, r); if (r.changed) setSel(d); refresh(); }, failed);
  };
  const dd = useDragDay(view === "week" || view === "month" ? view : undefined, sel, dropOn);
  const sun = addDays(mon, 6), sm = new Date(mon), em = new Date(sun);
  const head = view === "day"
    ? { hello: weekday(sel), h: longDate(sel), n: count(sel, addDays(sel, 1)) || dayDone(sel) }
    : view === "week"
      ? { hello: mon === mondayOf(today0) ? t("thisWeek") : mon === addDays(mondayOf(today0), 7) ? t("nextWeek") : t("yearN", { y: sm.getFullYear() }), h: t("rangeTo", { a: sm.getMonth() === em.getMonth() ? sm.getDate() : dm(mon), b: dm(sun) }), n: count(mon, addDays(mon, 7), 1) || t("nothingYet") }
      : view === "rhythm"
        ? { hello: t("rhythmHello"), h: t("learnedTitle"), n: mind ? rhythmHead(mind.i, mind.rules) : "" }
      : { hello: t("yearN", { y: sd.getFullYear() }), h: monthLabel(sel), n: count(new Date(sd.getFullYear(), sd.getMonth(), 1).getTime(), new Date(sd.getFullYear(), sd.getMonth() + 1, 1).getTime(), 1) || t("nothingYet") };
  const stepWeek = (d: -1 | 1) => setSel(addDays(sel, 7 * d));
  const stepMonth = (d: -1 | 1) => setSel(new Date(sd.getFullYear(), sd.getMonth() + d, 1).getTime());
  const stepDay = (d: -1 | 1) => setSel(addDays(sel, d));
  const share = { tasks, hols, now, pop, rules: mind?.rules ?? [], overlaps: over, onMove: async (o: Overlap) => { const r = await moveMine(o.mine.id); say(r.toast, r); refresh(); }, onKeep: async (o: Overlap) => { await keepBoth(o); refresh(); }, trail: maps.trail, moves, onFix: async (w: Warn, f: Warn["fixes"][number]) => { const r = await makeRoom(f.id, w.deadline); say(r.toast, r); refresh(); }, ...rowActs, onStartNow: startTask, drag: dd.drag };
  const isToday = sel === today0;
  const running = !!card && card.start! <= now && now < card.end!;
  const quiet = isToday && view === "day" && !running;
  // magic 1: every move not yet briefed is one pill under the tabs, the same in day, week and month; it never takes the now card's place.
  // Retired only on story close or swipe; `unseen` drives the dots until the story is closed.
  const fresh = moves.filter((m) => !m.briefed), unseen = moves.filter((m) => !m.seen).map((m) => m.id);
  const pillOn = fresh.length > 0 && !mine && (view === "day" || view === "week" || view === "month");
  const sunOn = quiet && !!wk;
  const showStory = !!mine || (story && pillOn) || (rebalOpen && !!rebal); // the list becomes the story, in place
  const dismissBrief = () => { void briefMoves(fresh.map((m) => m.id)).then(refresh); }; // magic 1b: swiped away for good
  // Rebalance: "Để nguyên" keeps the calendar and is not offered again until it changes; "Áp dụng" moves exactly what was shown, undoable.
  const keepRebal = () => { setRebalOpen(false); setRebal(undefined); void dismissProposal().then(refresh); };
  const applyRebal = () => { setRebalOpen(false); setRebal(undefined); void applyProposal().then((r) => { if (r) say(r.toast, r); refresh(); }, (e) => { fail(t("saveFailed"), e); refresh(); }); };
  // The week's own link: a proposal now, even one dismissed before; nothing to offer says so.
  const rebalanceWeek = () => { void proposeRebalance(Date.now(), true).then((p) => { if (p) { setRebal(p); setRebalOpen(true); } else setToasts((q) => [{ text: t("rebalNone") }, ...q.slice(1)]); }, (e) => fail(t("saveFailed"), e)); };
  // The week's link shows only when a dry plan has something to move: asked on entering week view and when tasks change, never stored.
  const [weekReb, setWeekReb] = useState(false);
  useEffect(() => {
    if (view !== "week") return;
    let live = true;
    // the dry plan is heavy: after the switch has painted, so the tap itself stays instant
    const h = setTimeout(() => { void canRebalance(Date.now()).then((ok) => { if (live) setWeekReb(ok); }, () => { if (live) setWeekReb(false); }); }, 250);
    return () => { live = false; clearTimeout(h); };
  }, [view, tasks]);
  const closeStory = async () => { setStory(false); await seeMoves(fresh.map((m) => m.id)); await briefMoves(fresh.map((m) => m.id)); refresh(); };
  const busy = state !== "idle";
  const listing = busy && !shufOn && !!words; // the day stays under the veil until words are heard; while the plan plays out the list stays, the dock keeps thinking
  const firstRun = !tasks.length && view === "day" && !busy; // views.html "Day, first launch"
  const folded = useMemo(() => foldRepeats(tasks, now), [tasks, now]); // a folded repeat's day is not empty: its row sits there
  const selEmpty = !hols.has(sel) && !onDay(tasks, sel).some((x) => !folded.hidden.has(x.id)) && !folded.folds.some((f) => f.first === sel);
  // The first-launch card also teaches on any empty day with nothing ahead of it: no rows, nothing ticked, nothing coming.
  const nothingAhead = view === "day" && !busy && selEmpty && !(isToday && card)
    && !tasks.some((a) => a.doneAt && !a.deletedAt && a.start !== undefined && a.start >= sel && a.start < addDays(sel, 1))
    && !tasks.some((a) => inView(a) && a.start! >= Math.max(addDays(sel, 1), now));
  const weekEmpty = view === "week" && Array.from({ length: 7 }, (_, i) => addDays(mon, i)).every((d) => !hols.has(d) && !onDay(tasks, d).length);
  // Rest card only where the art card would sit: day view, and no now-card above it.
  const empty = weekEmpty ? "week" : view === "day" && selEmpty && !(isToday && card) && !sunOn ? "rest" : "inl";
  const closeMine = () => { if (mine) void seeMoves(mine.moves.map((m) => m.id)).then(refresh); setMine(undefined); };
  const undoMine = async () => { const r = mine?.r; setMine(undefined); await r?.undo(); setToasts((u) => [{ text: t("undone") }, ...u.slice(1)]); refresh(); };
  const hero = mine ? "mine" : sunOn ? "sun" : shown ? shown.task.id : rest ? "rest" : "none";

  const restView = rest && (
    <GestureDetector gesture={swipe}>
      <Reanimated.View style={flick}>
        <RestCard lab={selEmpty ? t("today") : undefined} title={t("restT")} sub={t("restSub")} leaf="color" art="clay" />
      </Reanimated.View>
    </GestureDetector>
  );
  // Hết giờ: Thêm 15 phút lengthens the block by 15 (the replan moves what clashes); Chuyển việc is Để sau for it; the kind chip opens the kind menu beside it.
  const cardView = shown && (
    <GestureDetector gesture={swipe}>
      <Reanimated.View style={flick}>
        <NowCard still={!!menu || !!finding} card={shown} over={late ? { next: lateNext } : undefined} onDone={shown.gap ? startNow : () => void finish("done")} onStart={startNow} onLater={() => void finish("later")} onMicroRest={(min) => void addWorked(shown.task.id, min).then(refresh, () => {})}
          onExtend={() => late && void retime(late.id, late.start!, late.effort + 15).then((r) => { if (r) say(r.toast, r); refresh(); }, failed)}
          onKind={(x, top, bottom) => setMenu({ task: x, right: true, ...menuAt(bottom, top, kindItems((k) => void apply([{ op: "edit", target: x.id, kind: k }]).then((r) => { say(r.toast, r); refresh(); }, failed))) })} />
      </Reanimated.View>
    </GestureDetector>
  );

  const first = (hello: string, h: string, sub?: string) => (
    <View style={s.top}>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
        <Text style={{ color: th.muted, fontSize: font.label, fontFamily: ff("300") }}>{hello}</Text>
        <Text numberOfLines={2} style={[s.h, { color: th.ink }]}>{h}</Text>
        {!!sub && <Text style={[s.sub, { color: th.muted }]}>{sub}</Text>}
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexShrink: 0 }}>
        {/* Hidden while open: the field grows out of this circle and shrinks back into it. */}
        <View ref={findBtn} collapsable={false} style={{ opacity: finding ? 0 : 1 }}>
          <Tap onPress={() => findBtn.current?.measureInWindow((x, y) => setFinding({ x, y }))} hitSlop={8} style={[s.o, { borderColor: th.line, backgroundColor: th.bg }]} accessibilityRole="button" accessibilityLabel={t("search")}>
            <Icon name="search" size={20} color={th.ink} />
          </Tap>
        </View>
        <ThemeTap />
        <Tap onPress={() => router.push("/settings")} hitSlop={8} style={[s.o, { borderColor: th.line, backgroundColor: th.bg }]} accessibilityRole="button" accessibilityLabel={t("settings")}>
          <Icon name="gear" size={20} color={th.ink} />
        </Tap>
      </View>
      {/* Back to today from any other day: bottom right, level with the count line. */}
      {!firstRun && view !== "rhythm" && !isToday && (
        <Tap onPress={() => setSel(today0)} hitSlop={8} accessibilityRole="button" style={[s.go, { borderColor: th.line }]}>
          <Text style={{ color: th.ink, fontSize: font.md - 1, fontFamily: ff("500") }}>{t("today")}</Text>
        </Tap>
      )}
    </View>
  );
  const header = (
      <>
        {/* Swipe the header left/right to switch day / week / month (wraps around); the grids below keep their own swipes. */}
        <Swipe slideIn={false} stepKey={VIEWS.indexOf(view)} onStep={(d) => setView(VIEWS[(VIEWS.indexOf(view) + d + 3) % 3])}>
        {firstRun ? first(t("hello"), `${short[(new Date(sel).getDay() + 6) % 7]}, ${dm(sel)}`, t("nothingYet")) : first(head.hello, head.h, head.n)}
        <Reanimated.View entering={fadeIn} style={s.tabs}>
          <View style={s.tabL}>
            {VIEWS.map((v) => (
              <Tap key={v} onPress={() => setView(v)} hitSlop={10} accessibilityRole="tab" accessibilityState={{ selected: view === v }} style={{ paddingVertical: 10 }}>
                <Text numberOfLines={1} style={{ fontSize: font.md, fontFamily: ff(view === v ? "500" : "500"), color: view === v ? th.ink : th.muted }}>{t(v === "day" ? "tabDay" : v === "week" ? "tabWeek" : "tabMonth")}</Text>
                {view === v && <Reanimated.View entering={ZoomIn.duration(180).easing(EASE)} exiting={ZoomOut.duration(120)} style={[s.tabDot, { backgroundColor: th.ink }]} />}
              </Tap>
            ))}
          </View>
          {/* Not a calendar view: a hairline pill with the leaf, so it reads as Zen talking about you. */}
          <Tap onPress={() => setView("rhythm")} hitSlop={7} accessibilityRole="tab" accessibilityState={{ selected: view === "rhythm" }} accessibilityLabel={t("rhythm")}
            style={[s.mind, view === "rhythm" ? { backgroundColor: th.ink, borderColor: th.ink } : { borderColor: th.line }]}>
            <Logo size={14} mode="line" color={view === "rhythm" ? th.bg : th.ink} />
            <Text style={{ fontSize: 14, fontFamily: ff("500"), color: view === "rhythm" ? th.bg : th.ink }}>{t("rhythmTab")}</Text>
          </Tap>
        </Reanimated.View>
        </Swipe>
      </>
    );

  return (
    <Sweep>
    <SafeAreaView style={[s.root, { backgroundColor: th.bg }]}>
      {photo ? (
        <PhotoView key="photo" uri={photo.uri} w={photo.w} h={photo.h} text={photo.text} marks={photo.marks} reading={busy} />
      ) : pdf ? (
        <PdfView key="pdf" {...pdf} />
      ) : listing ? (
        // Listening / thinking: only the live words (views.html "Day, listening").
        <Reanimated.View key="busy" entering={fadeIn} exiting={fadeOut} style={s.pad}>
          <Live state={state} words={words} level={level} />
        </Reanimated.View>
      ) : (
        <Reanimated.View key="list" entering={fadeIn} exiting={fadeOut} style={s.root}>
        <DayPull
          enabled={view === "day"} dayKey={sel} onStep={stepDay}
          prevLabel={dayLabel(addDays(sel, -1))} nextLabel={dayLabel(addDays(sel, 1))}
        >
          {header}
          {/* "Which one" chips (calm.html pick): in the list under the header, so a long list scrolls with it. */}
          {chips && <View style={[s.chips, { borderColor: th.line, backgroundColor: th.bg }]}>{chips.ask && <Text style={[s.chipAsk, { color: th.ink }]}>{chips.ask}</Text>}{chips.sub && <Text style={[s.chipSub, { color: th.muted }]}>{chips.sub}</Text>}<View style={chips.row ? s.chipRow : s.chipCol}>{chips.options.map((o) => <Pressable key={o.label} onPress={o.run} style={[chips.row ? s.chipR : s.chip, { borderColor: th.line, backgroundColor: o.on ? th.ink : "transparent" }]}><Text numberOfLines={1} ellipsizeMode="tail" style={[s.chipT, chips.row && s.chipRT, { color: o.on ? th.bg : th.ink, fontFamily: ff(o.on ? "600" : "500") }]}>{o.label}</Text>{o.detail && <Text numberOfLines={1} style={[s.chipD, { color: o.on ? th.bg : th.ink }]}>{o.detail}</Text>}</Pressable>)}</View></View>}
          {view === "day" && isToday && (
            // Keyed per branch so hero swaps cross-fade; a new now-card lands with a small pop.
            <Reanimated.View key={hero} entering={card && hero === card.task.id ? popIn : fadeIn} exiting={fadeOut} layout={glide}>
              {mine ? <Story moves={mine.moves} now={now} onClose={closeMine} onUndo={undoMine} /> : ask ? <SeriesAsk title={t("seriesAsk", { title: ask.title })} sub={t("seriesSub", { title: ask.title, day: WEEKDAY_VI[ask.weekday] })} yes={t("seriesYes", { day: WEEKDAY_VI[ask.weekday] })} onYes={() => void answerSeries(true)} onNo={() => void answerSeries(false)} /> : sunOn ? <Weekly title={wk!.title} sub={wk!.sub} onPress={() => setView("rhythm")} /> : cardView ?? restView}
            </Reanimated.View>
          )}
          {/* Moves not yet briefed, under the now card (or the header when no card): the story opens in its place. */}
          {(view === "day" || view === "month") && pillOn && (story
            ? <Story moves={fresh} now={now} onClose={closeStory} />
            : <MovesPill moves={fresh} now={now} onOpen={() => setStory(true)} onDismiss={dismissBrief} />)}
          {(view === "day" || view === "week" || view === "month") && !!rebal && !mine && (rebalOpen
            ? <Story moves={rebal} now={now} onClose={() => setRebalOpen(false)} onKeep={keepRebal} onApply={applyRebal} />
            : <MovesPill moves={rebal} now={now} onOpen={() => setRebalOpen(true)} onDismiss={keepRebal} head={t("rebalPill", { n: rebal.length })} sub={t("rebalSub")} />)}
          {view === "rhythm" && mind && <Rhythm i={mind.i} rules={mind.rules} m={mind.m} hour={openHour !== undefined ? Number(openHour) : undefined} onForget={async (x) => { const r = await removeRule(x.id); say(r.toast, r); refresh(); }} onForgetWhen={async (w) => { const r = await forgetWhen(w); say(r.toast, r); refresh(); }} />}
          {(view === "week" || view === "month") && (
            <Reanimated.View key={view} entering={fadeIn}>
              {view === "week"
                ? <>
                    {story && pillOn && <Story moves={fresh} now={now} onClose={closeStory} />}
                    <Week tasks={tasks} hols={hols} rules={mind?.rules ?? []} now={now} monday={dd.anchor} selected={sel} onSelect={setSel} onStep={stepWeek} gridRef={dd.gridRef} hover={dd.hover} moves={unseen} brief={pillOn && !story ? fresh : []} onMoves={() => setStory(true)} onDismiss={dismissBrief} onRebalance={weekReb ? rebalanceWeek : undefined} />
                  </>
                : <Month tasks={tasks} hols={hols} now={now} selected={sel} anchor={dd.anchor} onSelect={setSel} onStep={stepMonth} gridRef={dd.gridRef} hover={dd.hover} />}
            </Reanimated.View>
          )}
          {firstRun || (nothingAhead && !sunOn) ? <First onSchool={() => router.push("/settings")} /> : !showStory && view !== "rhythm" && (
            <Reanimated.View entering={fadeIn} exiting={fadeOut} layout={glide} style={{ marginTop: empty === "rest" || empty === "week" ? 0 : isToday && view === "day" && warns.length ? 20 : view === "month" ? 24 : 28 }}>
              <Day {...share} empty={empty} noCard={isToday && !!rest} warns={isToday ? warns : []} day={sel} label={view === "day" ? (isToday ? (card && !sunOn ? t("after") : t("today")) : dayLabel(sel)) : dayLabel(sel)} />
            </Reanimated.View>
          )}
        </DayPull>
        </Reanimated.View>
      )}
      <Svg style={s.fade} pointerEvents="none" width="100%" height={120}>
        <Defs><LinearGradient id="fd" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={th.bg} stopOpacity={0} /><Stop offset="0.6" stopColor={th.bg} stopOpacity={1} /></LinearGradient></Defs>
        <Rect width="100%" height={120} fill="url(#fd)" />
      </Svg>
      {/* The finger on the mic owns the touch, so the veil only hears a tap once a press is stuck: that tap lets go. Steps sit on it too. */}
      {(pressing || aside || picking) && <Veil onPress={picking ? () => setPicking(false) : pressing || aside ? cancel : undefined} />}
      {/* Over a photo or PDF too: thinking while it is read (capture.html 9, 12), then pressing it puts it away and listens, no close button. */}
      {!showStory && !finding && <View style={[s.dock, { bottom: navLift }]} pointerEvents="box-none"><Hold state={state} pinned={picking ? "photo" : ""} onAside={onAside} onStart={() => { setPressing(true); setPhoto(undefined); setPdf(undefined); if (!latched.current) void start(); }} onEnd={onEnd} idle={view === "rhythm" ? "holdRule" : "hold"} /></View>}
      {picking && <PhotoMenu onPick={readPhoto} />}
      {typing && <><Veil z={9} onPress={() => setTyping(false)} /><TypeBar onClose={() => setTyping(false)} onSend={(text) => { setTyping(false); void run(text, "type"); }} /></>}
      {lined && <OutlinePreview groups={lined.groups} from={lined.from} onSave={saveLined} onClose={() => setLined(undefined)} />}
      {finding && <Search origin={finding} tasks={tasks} now={now} acts={rowActs} initial={findQ} onClose={() => { setFinding(undefined); setFindQ(undefined); }} />}
      {dd.ghost}
      {menu && <RowMenu items={menu.items} top={menu.top} right={menu.right} onClose={() => setMenu(undefined)} />}
      {toast && <Toast key={toastKey(toast)} onDismiss={() => setToasts((q) => q.slice(1))} error={toast.error} text={toast.text} sub={toast.sub} onAction={toast.action?.run} actionLabel={toast.action?.label} onAlt={toast.alt?.run} altLabel={toast.alt?.label} altPlain={toast.alt?.plain} art={toast.art} ms={toast.action ? 8000 : 6000} />}
    </SafeAreaView>
    </Sweep>
  );
}

/** Sun in light, moon in dark: flips the theme with the same circle sweep as Settings, grown from the tap. */
function ThemeTap() {
  const th = useTheme();
  const run = useSweep();
  const flip = () => { const m = th.dark ? "light" : "dark"; Appearance.setColorScheme(m); store.kvSet("theme", m); };
  return (
    <Tap onPress={(e) => run(e.nativeEvent.pageX, e.nativeEvent.pageY, flip)} hitSlop={8} style={[s.o, { borderColor: th.line, backgroundColor: th.bg }]} accessibilityRole="button" accessibilityLabel={t(th.dark ? "themeLight" : "themeDark")}>
      <Icon name={th.dark ? "moon" : "sun"} size={20} color={th.ink} />
    </Tap>
  );
}

const s = StyleSheet.create({
  // calm.html .find + .pills.blk .pl: a bordered card, the question, then full-width outlined pills (name left, day right)
  chips: { marginTop: 16, borderRadius: 22, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 18 },
  chip: { height: 44, width: "100%", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, borderRadius: 99, borderWidth: 1 },
  chipCol: { marginTop: 12, gap: 8 },
  chipRow: { marginTop: 14, flexDirection: "row", gap: 8 }, // .find .acts: the answers in one row of pills
  chipR: { height: 40, flexShrink: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1 },
  chipRT: { flex: 0, textAlign: "center" },
  chipAsk: { fontSize: 17, lineHeight: 23, fontFamily: ff("500") },
  chipSub: { marginTop: 6, fontSize: 15, lineHeight: 21, fontFamily: ff("400") },
  chipT: { flex: 1, minWidth: 0, fontSize: 15, fontFamily: ff("500") },
  chipD: { flexShrink: 0, opacity: 0.7, fontSize: 15, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  root: { flex: 1 },
  pad: { padding: space.gutter, paddingTop: 0 }, // .scr: the safe area stands in for its 54px top
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 },
  h: { fontSize: font.h, lineHeight: 40, fontFamily: fd("700"), letterSpacing: -1.05, marginTop: 2 },
  go: { position: "absolute", right: 0, bottom: 0, height: 36, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sub: { marginTop: 6, fontFamily: ff(), fontSize: font.md },
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 2 },
  tabs: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18 }, // magic.html .tabs: text and the Nhịp pill share a centre line
  tabL: { flexDirection: "row", gap: 20, flexShrink: 1 },
  mind: { flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 99, borderWidth: 1 }, // magic.html .mind: 30 high, the touch reach is the hitSlop (7)
  tabDot: { position: "absolute", bottom: 0, left: "50%", width: 5, height: 5, marginLeft: -2.5, borderRadius: 3 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
