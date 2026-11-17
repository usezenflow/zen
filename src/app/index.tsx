import { PdfPageImage } from "@dariyd/react-native-pdf-page-image";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { extractTextFromPage, getPageCount } from "expo-pdf-text-extract";
import { extractTextFromImage } from "expo-text-extractor";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Appearance, AppState, Image, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useIncomingShare } from "expo-sharing";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Reanimated, { interpolate, useAnimatedStyle, useSharedValue, withTiming, ZoomIn, ZoomOut } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon, Logo } from "@/components/art";
import { Rhythm, rhythmHead } from "@/components/rhythm";
import { addDays, live, mondayOf, monthLabel, onDay, parents, short, startOfDay, weekday, type Hols } from "@/components/cal";
import { Day, DayPull, First } from "@/components/day";
import { foldRepeats } from "@/components/fold";
import { useDragDay } from "@/components/dragday";
import { Search, type Origin } from "@/components/search";
import { PdfView, PhotoMenu, PhotoView, TypeBar, Veil } from "@/components/capture";
import { Hold, type Aside, type HoldState } from "@/components/hold";
import type { Item } from "@/components/menu";
import { Month } from "@/components/month";
import { Brief, Live, NowCard, Steps, Story, Weekly, type Card } from "@/components/nowcard";
import { RowMenu, menuTop, sittingItems } from "@/components/rowmenu";
import { fadeIn, fadeOut, glide, popIn, settle, Tap, EASE } from "@/components/tap";
import { Sweep, useSweep } from "@/components/sweep";
import { Toast } from "@/components/toast";
import { Swipe, Week } from "@/components/week";
import { apply, retime, makeRoom, moveMine, pickNow, addRule, addSitting, dropSitting, loadClassMult, needMore, pin, putBack, removeRule, removeScope, scopeIds, swipeDone, swipeLater, take, type Result } from "@/lib/apply";
import { briefMoves, loadMoves, loadWarn, seeMoves } from "@/lib/moves";
import { reasonText, stepText, topReason } from "@/lib/reasons";
import { holidays } from "@/lib/holidays";
import { askMic, listenLive, micReset, type Heard } from "@/lib/ears";
import { t } from "@/lib/i18n";
import { marksOf, readErrors, readFull, readNotes, sizedSub } from "@/lib/nlu/adapt";
import { think } from "@/lib/nlu/commands";
import { affinityOf, calendarOf, committedRows, vocab } from "@/lib/nlu/context";
import { personalPrior } from "@/lib/nlu/reader/assemble";
import { isRule, readRule } from "@/lib/rules";
import { sharedOf, viaOf } from "@/lib/share";
import { onLeftSaved, takeFlash, takeHomeDay } from "@/lib/flash";
import { keepBoth, pendingOverlaps, type Overlap } from "@/lib/overlap";
import * as store from "@/lib/store";
import { getMarks, onForeground, onSynced } from "@/lib/sync";
import { listenWidgets, pushWidgets } from "@/lib/widgets";
import { useTheme, font, space, ff } from "@/lib/theme";
import type { Move, Notice, Rule, Step, Task, Warn } from "@/lib/types";
import { dayLabel, day as dayName, endAt, when } from "@/lib/when";
import { insights, suggest, typeOf, type Insights } from "@/planner";

type View_ = "day" | "week" | "month" | "rhythm"; // rhythm sits apart on the right of the tabs, outside the swipe cycle
const VIEWS: View_[] = ["day", "week", "month"];
// A row says only what Zen learned or was told; "the day is free" on every row is noise, so that stays on the detail screen.
const FIT = new Set(["packed", "fit", "over"]); // what came of what was asked, said in the add toast too
const ROW = new Set(["hour", "after", "similar", "kind", "energy", "weekend", "said", "pace", "rule", "pinned", "chose", "packed", "fit", "over"]);
type ToastState = { text: string; sub?: string; error?: boolean; action?: { label?: string; run: () => void }; alt?: { label: string; run: () => void; plain?: boolean } };

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
  const [menu, setMenu] = useState<{ task: Task; top: number; items: Item[] } | undefined>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [card, setCard] = useState<Card | undefined>();
  const [state, setState] = useState<HoldState>("idle");
  const [words, setWords] = useState("");
  const [toasts, setToasts] = useState<ToastState[]>([]); // [0] is showing, the rest wait their turn
  const toast = toasts[0];
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<View_>("day");
  const [finding, setFinding] = useState<Origin>(); // set = searching, from the circle at this window point (views.html "Search, opening")
  const findBtn = useRef<ComponentRef<typeof View>>(null);
  const [sel, setSel] = useState(() => startOfDay(Date.now()));
  const [over, setOver] = useState<Overlap[]>([]);
  const [pop, setPop] = useState<Set<string>>(new Set());
  const level = useSharedValue(0); // real mic level 0..1 for the listening wave
  const dismissed = useRef(new Set<string>());
  const [moves, setMoves] = useState<Move[]>([]); // unseen only
  const [warns, setWarns] = useState<Warn[]>([]);
  const [maps, setMaps] = useState<{ trail: Record<string, string>; froms: Record<string, number>; reason: Record<string, string>; alts: Record<string, number> }>({ trail: {}, froms: {}, reason: {}, alts: {} });
  const [wk, setWk] = useState<{ title: string; sub: string } | undefined>(); // Sunday card
  const [story, setStory] = useState(false);
  const briefed = useRef<string[]>([]);
  const [mine, setMine] = useState<{ moves: Move[]; r: Result }>(); // what the user's own change just moved, opened from its toast (magic.html 7d)
  const shuf = useRef(false); // the plan is playing out on the list; no second run until it ends
  const [shufOn, setShufOn] = useState(false);
  const tasksRef = useRef<Task[]>([]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const [lines, setLines] = useState<string[]>([]); // narrated solver steps while thinking
  const [mind, setMind] = useState<{ i: Insights; rules: Rule[] }>();
  // capture.html: the thumb on a satellite, the type field, the photo dropdown, the photo or PDF being read.
  const [aside, setAside] = useState<Aside>("");
  const asideRef = useRef<Aside>("");
  const [pressing, setPressing] = useState(false); // finger down on the mic: the veil rises (capture.html 2)
  const [typing, setTyping] = useState(false);
  const [picking, setPicking] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; w: number; h: number; text?: string; marks?: { start: number; end: number }[] }>();
  const [pdf, setPdf] = useState<{ page: number; pages: number; text?: string; marks?: { start: number; end: number }[]; image?: string }>();

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
    const [model, mv, wn] = await Promise.all([store.loadModel(now), loadMoves(), loadWarn()]);
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
      let why = p.explore ? { key: "explore" as const, w: 1 } : topReason(p.why?.filter((r) => ROW.has(r.key)));
      // "Buổi k/n" is the plan's count from when it was made; after a delete it renumbers from the sittings left, and a lone one drops it.
      if (why?.key === "pace" && x.parentId) {
        const left = all.filter((c) => c.parentId === x.parentId && !c.doneAt && !c.deletedAt).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
        why = left.length > 1 ? { ...why, vars: { k: left.findIndex((c) => c.id === x.id) + 1, n: left.length } } : undefined;
      }
      // Assignments keep the due-date sub unless the reason says more than "do it early".
      if (why && !x.fixed && !trail[x.id] && (typeOf(x) !== "assignment" || ["pace", "explore", "rule", "pinned", "chose", "packed", "fit", "over"].includes(why.key))) reason[x.id] = reasonText(why);
    }
    const ins = insights(model, now), wkAgo = now - 7 * 86400_000, w = new Date(now).getDay() === 0 ? ins.weekly : undefined;
    setMind({ i: ins, rules: model.rules ?? [] });
    // A saved card outlives its task until the next re-plan: drop it once the task is gone or ticked, or it was never short of time.
    const open = (id: string) => all.some((x) => x.id === id && !x.doneAt && !x.deletedAt);
    setMoves(unseen); setWarns(wn.filter((w) => open(w.id) && (w.deadline <= now || w.free < w.need))); setMaps({ trail, froms, reason, alts });
    setWk(w ? { title: w, sub: t("sundaySub", { done: all.filter((x) => x.doneAt && x.doneAt >= wkAgo).length, moved: mv.filter((m) => m.at >= wkAgo).length }) } : undefined);
    const cur = pickNow(all, now);
    if (cur && cur.start! <= now) return setCard({ task: cur, start: cur.start, end: cur.end });
    const s = suggest(all.filter((x) => !dismissed.current.has(x.id)), [], model, now);
    if (s) return setCard({ task: s.task, start: s.start, end: s.end, gap: true });
    // views.html "Day, all done": a task of another day is not today's art card; the rest card takes its slot and names tomorrow.
    setCard(cur && startOfDay(cur.start!) === startOfDay(now) ? { task: cur, start: cur.start, end: cur.end } : undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToasts((q) => q.slice(1)), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const say = useCallback((text: string, r?: Result, extra?: { sub?: string; alt?: { label: string; run: () => void } }) => {
    // It moved other things (a knock-on has a cause): "Xem" opens the story on today, where it can be read and undone.
    const ms = r?.moves ?? [], see = ms.length > 1 || ms.some((m) => m.cause) ? { label: t("briefSee"), plain: true, run: () => { setMine({ moves: ms, r: r! }); setView("day"); setSel(startOfDay(Date.now())); } } : undefined;
    setToasts((q) => [{
      text,
      sub: extra?.sub ?? r?.sub,
      alt: extra?.alt ?? see,
      action: r && { run: (() => { let done = false; return async () => { if (done) return; done = true; await r.undo(); setToasts((u) => [{ text: t("undone") }, ...u.slice(1)]); refresh(); }; })() }, // a double tap undoes once
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
    if (shuf.current || !old.length || !steps.some(id)) return refresh();
    shuf.current = true;
    const fresh = new Map((await store.allTasks()).map((x) => [x.id, x]));
    // A step names the task; when it was split into sittings, its rows are the sittings (the parent only loses its time).
    const one = (tid?: string) => { const x = tid ? fresh.get(tid) : undefined; return x ? [x, ...[...fresh.values()].filter((c) => c.parentId === tid && !c.deletedAt)] : []; };
    const rows = (st?: Step) => (st?.ids ?? [st?.id]).flatMap(one); // a series line lands every occurrence at once
    const firstAt = Math.min(...rows(steps.find((st) => id(st) && !old.some((o) => o.id === id(st)))).flatMap((x) => x.start ?? []));
    setTasks(old);
    if (jump && Number.isFinite(firstAt)) setSel(startOfDay(firstAt));
    setShufOn(true);
    setState("thinking");
    try {
      for (let i = 0; i < steps.length; i++) {
        await new Promise((ok) => setTimeout(ok, 350));
        setLines(steps.slice(0, i + 1).map(stepText));
        const xs = rows(steps[i]);
        if (!xs.length) continue;
        setTasks((p) => [...p.filter((a) => !xs.some((x) => x.id === a.id)), ...xs]);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      await new Promise((ok) => setTimeout(ok, 350));
      await refresh();
    } finally {
      shuf.current = false;
      setShufOn(false);
      setLines([]);
      setState("idle");
    }
  }, [refresh]);
  // A sync result: every notice gets its own toast with "Xem"; otherwise the plain result.
  const landed = useCallback((r?: Result & { notices?: Notice[] }) => {
    if (r?.notices?.length) setToasts((q) => [...q, ...r.notices!.map((n): ToastState => ({ text: n.title, sub: n.sub, action: n.route ? { label: t("view"), run: () => go(n.route!) } : undefined }))]);
    else if (r) say(r.toast, r);
    // a result nobody asked for (a sync, a series topped up 120 days out) keeps the day in view
    if (r) void shuffle(r, undefined, false); // nothing landed: focus already refreshed, resume refreshes itself
  }, [say, go, shuffle]);

  useFocusEffect(useCallback(() => {
    const d = takeHomeDay();
    if (d !== undefined) setSel(startOfDay(d));
    const f = takeFlash();
    if (f) say(f.text, f.r, { sub: f.sub });
    refresh();
    onForeground().then(landed).catch(() => {});
  }, [refresh, say, landed]));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") { onForeground().then((r) => (r ? landed(r) : refresh())).catch(() => refresh()); pushWidgets(); }
      // a brief is shown for one visit: leaving the app retires it (magic.html 1)
      else if (s === "background" && briefed.current.length) { const ids = briefed.current; briefed.current = []; setStory(false); void briefMoves(ids).then(refresh); }
    });
    return () => sub.remove();
  }, [refresh, landed]);
  useEffect(() => { pushWidgets(); return listenWidgets(refresh); }, [refresh]);
  useEffect(() => onLeftSaved(refresh), [refresh]); // the detail screen's last edits, saved as it closed
  // `now` otherwise moves only on a refresh: left open, rows would never turn late and "today" would not roll over at midnight.
  useEffect(() => {
    let day = startOfDay(Date.now());
    const i = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (startOfDay(n) !== day) { const was = day; day = startOfDay(n); setSel((v) => (v === was ? day : v)); refresh(); } // today rolls over; a day picked on purpose stays
    }, 30_000);
    return () => clearInterval(i);
  }, [refresh]);
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
  const { listen, scan, type } = useLocalSearchParams<{ listen?: string; scan?: string; type?: string }>();

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

  // One reader for every way in: what was said, typed, or read off a photo or a PDF (its text layer, or a scan read like a photo).
  const run = async (text: string, via: "voice" | "type" | "photo" | "pdf" | "scan", alternatives?: string[]) => {
    while (shuf.current) await new Promise((r) => setTimeout(r, 150)); // the plan is still playing out: wait for it, never drop what was said
    setState("thinking");
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
      const all = await store.allTasks();
      const nowD = new Date();
      // What the reader cannot know from the words: the timetable, what this user usually saves per title, and the marks.
      const old = JSON.parse((await store.kvGet("nlu.committed").catch(() => null)) ?? "[]");
      const extra = { calendar: calendarOf(all, nowD.getTime()), affinity: affinityOf((await getMarks().catch(() => null))?.marks ?? []), prior: personalPrior(old), classMult: await loadClassMult().catch(() => ({})), alternatives };
      const source = via === "voice" ? "voice" : via === "photo" || via === "scan" ? "ocr" : via === "pdf" ? "paste" : "typed"; // ocr and paste: the reader reads a notice's lines and tables as such
      const actions = think(text, nowD, source, extra);
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
      // Show where the new work landed: the day of its earliest placed piece, not today.
      const made = (await store.allTasks()).filter((x) => x.createdAt === now && x.source === "user" && !x.deletedAt && x.start !== undefined);
      const firstAt = Math.min(...made.map((x) => x.start!));
      // Said but no free time anywhere it may go: say so, never "added" with a time it does not have.
      const mine = (await store.allTasks()).filter((x) => x.createdAt === now && x.source === "user" && !x.deletedAt && !x.parentId);
      const stuck = mine.filter((x) => !made.some((y) => y.id === x.id || y.parentId === x.id));
      const stuckDay = stuck.length && !made.length ? startOfDay(Math.max(now, (stuck[0].deadline ?? stuck[0].notAfter ?? now + 1) - 1)) : undefined;
      if (stuckDay !== undefined) setSel(stuckDay);
      // A deadline past the 30-day horizon is kept as the due date; the sittings land inside the horizon. Said once, for the furthest one.
      const far = Math.max(0, ...(await store.allTasks()).filter((x) => x.createdAt === now && x.source === "user" && !x.deletedAt && x.deadline !== undefined && x.deadline > addDays(now, 30)).map((x) => x.deadline!));
      const farSub = far ? t("farDue", { date: dayLabel(far).slice(4) }) : undefined; // dayLabel: "T6, 21/11" → "21/11"
      const playing = (r.steps ?? []).some((st) => st.id); // the shuffle picks the day itself
      if (!playing && titles.length && Number.isFinite(firstAt)) setSel(startOfDay(firstAt));
      // The sized sub (exam, shared end, span or due with sittings) names what the sizer did; else the time of the first piece.
      const sized = sizedSub(actions.filter((a) => a.op === "create" && a.title), now);
      if (titles.length > 1) { // bulk: count, the shared end if all share one, one Undo for all, no alt
        say(t("addedN", { n: titles.length }), r, { sub: [stuck.length ? t("noRoomN", { n: stuck.length }) : sized, r.sub, notes.sub, farSub].filter(Boolean).join(" · ") || undefined });
      } else if (titles.length === 1 && stuck.length) {
        say(t("added", { title: titles[0] }), r, { sub: [t("noRoom"), r.sub].filter(Boolean).join(" · "), alt: { label: t("pickTime"), run: async () => router.push(`/task/${stuck[0].id}`) } });
      } else if (titles.length === 1) {
        // The reader's own ask ("3 giờ": 15:00 or 03:00) takes the chip; else the planner's other slot.
        const alt = notes.alt && { alt: { label: notes.alt.label, run: async () => { await r.undo(); await run(notes.alt!.text, via); } } };
        // Not where or as long as it was asked: the reason says why at once ("Sáng mai kín, dời sang chiều mai").
        const first = made.find((x) => x.start === firstAt), fitWhy = first && (await store.loadModel(now)).placed[first.id]?.why?.find((x) => FIT.has(x.key));
        say(t("added", { title: titles[0] }), r, { sub: [sized ?? (Number.isFinite(firstAt) ? when(firstAt, now) : undefined), fitWhy && reasonText(fitWhy), r.sub, notes.sub, farSub].filter(Boolean).join(" · ") || undefined, ...(alt ?? (await otherSlot(made, now))) });
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
    say(t("doneTitle", { title: x.title }), r, { sub: t("leftToday", { n: left }) });
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
  const rowActs = {
    // Edits show at once and persist behind: the list takes the new value now, and the refresh after the save confirms it.
    onToggle: toggle, onTitle: (x: Task, title: string) => { gen.current++; setTasks((p) => p.map((y) => (y.id === x.id ? { ...y, title } : y))); edit(x, { title }); }, itemsFor,
    onTime: (x: Task, at: Date) => {
      const d = new Date(x.start ?? Date.now()); d.setHours(at.getHours(), at.getMinutes(), 0, 0);
      const start = d.getTime(), len = x.start !== undefined && x.end !== undefined ? x.end - x.start : Math.max(30, x.effort || 30) * 60_000;
      gen.current++;
      setTasks((p) => p.map((y) => (y.id === x.id ? { ...y, start, end: start + len, pinned: true } : y)));
      retime(x.id, start, Math.round(len / 60_000)).then((r) => { if (r) { say(r.toast, r); refresh(); } }, failed); // saved at once; the toast and reload when it rests
    },
    // The end's own dial: the start stays, the length follows (an end before the start runs past midnight, as on the detail screen).
    onEnd: (x: Task, at: Date) => {
      if (x.start === undefined || x.end === undefined) return;
      const end = Math.max(x.start + 15 * 60_000, endAt(x.start, x.end, at));
      gen.current++;
      setTasks((p) => p.map((y) => (y.id === x.id ? { ...y, end, pinned: true } : y)));
      retime(x.id, x.start, Math.round((end - x.start) / 60_000)).then((r) => { if (r) { say(r.toast, r); refresh(); } }, failed);
    },
    onOpen: (x: Task) => router.push(`/task/${x.id}`),
    // Swipe right: a plain task is deleted at once; a series opens the scope dropdown under the row.
    onSwipeDelete: (x: Task, bottom?: number, top = bottom) => (bottom === undefined ? del(x, "this") : setMenu({ task: x, ...menuAt(bottom, top!, seriesItems(x)) })),
    onHold: (x: Task, bottom: number, top: number) => setMenu({ task: x, ...menuAt(bottom, top, itemsFor(x)) }), lifted: menu?.task.id,
  };

  const cardRef = useRef(card);
  useEffect(() => { cardRef.current = card; }, [card]);
  const commit = async (dir: "done" | "later") => {
    const c = cardRef.current;
    if (!c) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    let r: Result | undefined;
    if (c.gap) {
      if (dir === "done") r = await take(c.task.id, c.start!, c.end!);
      else dismissed.current.add(c.task.id);
    } else r = await (dir === "done" ? swipeDone(c.task.id) : swipeLater(c.task.id));
    if (r) say(r.toast, r);
    await shuffle(r);
  };
  const cx = useSharedValue(0);
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
      if (Math.abs(e.translationX) <= 110) { cx.set(settle(0)); return; }
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
  const dropOn = (x: Task, d: number) => {
    const start = d + (x.start! - startOfDay(x.start!)), len = (x.end ?? x.start! + x.effort * 60_000) - x.start!;
    gen.current++;
    setTasks((p) => p.map((y) => (y.id === x.id ? { ...y, start, end: start + len, pinned: true } : y)));
    setSel(d);
    apply([{ op: "edit", target: x.id, when: new Date(start).toISOString() }]).then((r) => { say(r.toast, r); refresh(); }, failed);
  };
  const dd = useDragDay(view === "week" || view === "month" ? view : undefined, sel, dropOn);
  const sun = addDays(mon, 6), sm = new Date(mon), em = new Date(sun);
  const head = view === "day"
    ? { hello: weekday(sel), h: longDate(sel), n: count(sel, addDays(sel, 1)) || dayDone(sel) }
    : view === "week"
      ? { hello: mon === mondayOf(today0) ? t("thisWeek") : mon === addDays(mondayOf(today0), 7) ? t("nextWeek") : t("yearN", { y: sm.getFullYear() }), h: t("rangeTo", { a: sm.getMonth() === em.getMonth() ? sm.getDate() : dm(mon), b: dm(sun) }), n: count(mon, addDays(mon, 7), 1) || t("nothingYet") }
      : view === "rhythm"
        ? { hello: t("rhythmHello"), h: t("rhythm"), n: mind ? rhythmHead(mind.i) : t("stillLearning") }
      : { hello: t("yearN", { y: sd.getFullYear() }), h: monthLabel(sel), n: count(new Date(sd.getFullYear(), sd.getMonth(), 1).getTime(), new Date(sd.getFullYear(), sd.getMonth() + 1, 1).getTime(), 1) || t("nothingYet") };
  const stepWeek = (d: -1 | 1) => setSel(addDays(sel, 7 * d));
  const stepMonth = (d: -1 | 1) => setSel(new Date(sd.getFullYear(), sd.getMonth() + d, 1).getTime());
  const stepDay = (d: -1 | 1) => setSel(addDays(sel, d));
  const share = { tasks, hols, now, pop, rules: mind?.rules ?? [], overlaps: over, onMove: async (o: Overlap) => { const r = await moveMine(o.mine.id); say(r.toast, r); refresh(); }, onKeep: async (o: Overlap) => { await keepBoth(o); refresh(); }, trail: maps.trail, reason: maps.reason, moves, onFix: async (w: Warn, f: Warn["fixes"][number]) => { const r = await makeRoom(f.id, w.deadline); say(r.toast, r); refresh(); }, ...rowActs, drag: dd.drag };
  const isToday = sel === today0;
  const running = !!card && !card.gap && card.start! <= now && now < card.end!;
  const quiet = isToday && view === "day" && !running;
  // The latest change only, the user's own knock-ons included: the toast fades, the card stays until seen. Older ones retire with it.
  const fresh = moves.filter((m) => !m.briefed), last = Math.max(0, ...fresh.map((m) => m.at));
  const said = fresh.filter((m) => m.at === last);
  const briefOn = quiet && said.length > 0; // the running card keeps priority
  const sunOn = quiet && !briefOn && !!wk;
  useEffect(() => { if (briefOn) briefed.current = fresh.map((m) => m.id); }); // what this visit has shown: retired on leaving
  // Seen, then left for another view or day: it goes, as on leaving the app.
  const away = view !== "day" || !isToday;
  useEffect(() => { if (away && briefed.current.length) { const ids = briefed.current; briefed.current = []; setStory(false); void briefMoves(ids).then(refresh); } }, [away]); // eslint-disable-line react-hooks/exhaustive-deps -- on leaving only
  const showStory = (briefOn && story) || !!mine; // the list becomes the story, in place
  const dismissBrief = () => { const ids = fresh.map((m) => m.id); briefed.current = []; void briefMoves(ids).then(refresh); }; // magic 1b: swiped away for good
  const closeStory = async () => { setStory(false); await seeMoves(said.map((m) => m.id)); await briefMoves(fresh.map((m) => m.id)); refresh(); };
  const busy = state !== "idle";
  const listing = busy && !shufOn && !!words; // the day stays under the veil until words are heard; while the plan plays out the list stays, the dock keeps thinking
  const firstRun = !tasks.length && view === "day" && !busy; // views.html "Day, first launch"
  const folded = foldRepeats(tasks, now); // a folded repeat's day is not empty: its row sits there
  const selEmpty = !hols.has(sel) && !onDay(tasks, sel).some((x) => !folded.hidden.has(x.id)) && !folded.folds.some((f) => f.first === sel);
  // The first-launch card also teaches on any empty day with nothing ahead of it: no rows, nothing ticked, nothing coming.
  const nothingAhead = view === "day" && !busy && selEmpty && !(isToday && card)
    && !tasks.some((a) => a.doneAt && !a.deletedAt && a.start !== undefined && a.start >= sel && a.start < addDays(sel, 1))
    && !tasks.some((a) => inView(a) && a.start! >= Math.max(addDays(sel, 1), now));
  const weekEmpty = view === "week" && Array.from({ length: 7 }, (_, i) => addDays(mon, i)).every((d) => !hols.has(d) && !onDay(tasks, d).length);
  // Rest card only where the art card would sit: day view, and no now-card above it.
  const empty = weekEmpty ? "week" : view === "day" && selEmpty && !(isToday && card) && !briefOn && !sunOn ? "rest" : "inl";
  const closeMine = () => { if (mine) void seeMoves(mine.moves.map((m) => m.id)).then(refresh); setMine(undefined); };
  const undoMine = async () => { const r = mine?.r; setMine(undefined); await r?.undo(); setToasts((u) => [{ text: t("undone") }, ...u.slice(1)]); refresh(); };
  const hero = mine ? "mine" : briefOn ? (story ? "story" : "brief") : sunOn ? "sun" : card ? card.task.id : "none";

  const cardView = card && (
    <GestureDetector gesture={swipe}>
      <Reanimated.View style={flick}>
        <NowCard card={card} onDone={() => commit("done")} />
      </Reanimated.View>
    </GestureDetector>
  );

  const first = (hello: string, h: string, sub?: string) => (
    <View style={s.top}>
      <View>
        <Text style={{ color: th.ink, fontSize: font.md, fontFamily: ff("500") }}>{hello}</Text>
        <Text style={[s.h, { color: th.ink }]}>{h}</Text>
        {!!sub && <Text style={[s.sub, { color: th.muted }]}>{sub}</Text>}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
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
          <Text style={{ color: th.ink, fontSize: font.md - 1, fontFamily: ff("600") }}>{t("today")}</Text>
        </Tap>
      )}
    </View>
  );
  const header = (
      <>
        {/* Swipe the header left/right to switch day / week / month (wraps around); the grids below keep their own swipes. */}
        <Swipe stepKey={VIEWS.indexOf(view)} onStep={(d) => setView(VIEWS[(VIEWS.indexOf(view) + d + 3) % 3])}>
        {firstRun ? first(t("hello"), `${short[(new Date(sel).getDay() + 6) % 7]}, ${dm(sel)}`, t("nothingYet")) : first(head.hello, head.h, head.n)}
        <Reanimated.View entering={fadeIn} style={s.tabs}>
          <View style={s.tabL}>
            {VIEWS.map((v) => (
              <Tap key={v} onPress={() => setView(v)} hitSlop={10} accessibilityRole="tab" accessibilityState={{ selected: view === v }} style={{ paddingVertical: 10 }}>
                <Text style={{ fontSize: font.md, fontFamily: ff(view === v ? "600" : "500"), color: view === v ? th.ink : th.muted }}>{t(v === "day" ? "tabDay" : v === "week" ? "tabWeek" : "tabMonth")}</Text>
                {view === v && <Reanimated.View entering={ZoomIn.duration(180).easing(EASE)} exiting={ZoomOut.duration(120)} style={[s.tabDot, { backgroundColor: th.seal }]} />}
              </Tap>
            ))}
          </View>
          {/* Not a calendar view: a hairline pill with the leaf, so it reads as Zen talking about you. */}
          <Tap onPress={() => setView("rhythm")} hitSlop={8} accessibilityRole="tab" accessibilityState={{ selected: view === "rhythm" }} accessibilityLabel={t("rhythm")}
            style={[s.mind, view === "rhythm" ? { backgroundColor: th.ink, borderColor: th.ink } : { borderColor: th.line }]}>
            <Logo size={14} mode="line" color={view === "rhythm" ? th.bg : th.ink} />
            <Text style={{ fontSize: 14, fontFamily: ff("600"), color: view === "rhythm" ? th.bg : th.ink }}>{t("rhythmTab")}</Text>
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
          {view === "day" && isToday && (
            // Keyed per branch so hero swaps cross-fade; a new now-card lands with a small pop.
            <Reanimated.View key={hero} entering={card && hero === card.task.id ? popIn : fadeIn} exiting={fadeOut} layout={glide}>
              {mine ? <Story moves={mine.moves} now={now} onClose={closeMine} onUndo={undoMine} /> : briefOn ? (story ? <Story moves={said} now={now} onClose={closeStory} /> : <Brief moves={said} now={now} onOpen={() => setStory(true)} onDismiss={dismissBrief} />) : sunOn ? <Weekly title={wk!.title} sub={wk!.sub} onPress={() => setView("rhythm")} /> : cardView}
            </Reanimated.View>
          )}
          {view === "rhythm" && mind && <Rhythm i={mind.i} rules={mind.rules} onForget={async (x) => { const r = await removeRule(x.id); say(r.toast, r); refresh(); }} />}
          {(view === "week" || view === "month") && (
            <Reanimated.View key={view} entering={fadeIn}>
              {view === "week"
                ? <Week tasks={tasks} hols={hols} rules={mind?.rules ?? []} now={now} monday={dd.anchor} selected={sel} onSelect={setSel} onStep={stepWeek} gridRef={dd.gridRef} hover={dd.hover} />
                : <Month tasks={tasks} hols={hols} now={now} selected={sel} anchor={dd.anchor} onSelect={setSel} onStep={stepMonth} gridRef={dd.gridRef} hover={dd.hover} />}
            </Reanimated.View>
          )}
          {firstRun || (nothingAhead && !briefOn && !sunOn) ? <First onSchool={() => router.push("/settings")} /> : !showStory && view !== "rhythm" && (
            <Reanimated.View entering={fadeIn} exiting={fadeOut} layout={glide} style={{ marginTop: empty === "rest" || empty === "week" ? 0 : isToday && view === "day" && warns.length ? 20 : view === "month" ? 24 : 28 }}>
              <Day {...share} empty={empty} warns={isToday ? warns : []} day={sel} label={view === "day" ? (isToday ? (card && !briefOn && !sunOn ? t("after") : t("today")) : dayLabel(sel)) : dayLabel(sel)} />
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
      {(pressing || aside || picking || lines.length > 0) && <Veil onPress={picking ? () => setPicking(false) : pressing || aside ? cancel : undefined} />}
      {/* Over a photo or PDF too: thinking while it is read (capture.html 9, 12), then pressing it puts it away and listens, no close button. */}
      {!showStory && !finding && <View style={[s.dock, { bottom: navLift }]} pointerEvents="box-none"><Hold state={state} pinned={picking ? "photo" : ""} onAside={onAside} onStart={() => { setPressing(true); setPhoto(undefined); setPdf(undefined); if (!latched.current) void start(); }} onEnd={onEnd} idle={view === "rhythm" ? "holdRule" : "hold"} /></View>}
      {picking && <PhotoMenu onPick={readPhoto} />}
      {typing && <><Veil z={9} onPress={() => setTyping(false)} /><TypeBar onClose={() => setTyping(false)} onSend={(text) => { setTyping(false); void run(text, "type"); }} /></>}
      {lines.length > 0 && <Steps lines={lines} />}
      {finding && <Search origin={finding} tasks={tasks} now={now} acts={rowActs} onClose={() => setFinding(undefined)} />}
      {dd.ghost}
      {menu && <RowMenu items={menu.items} top={menu.top} onClose={() => setMenu(undefined)} />}
      {toast && <Toast key={toastKey(toast)} onDismiss={() => setToasts((q) => q.slice(1))} error={toast.error} text={toast.text} sub={toast.sub} onAction={toast.action?.run} actionLabel={toast.action?.label} onAlt={toast.alt?.run} altLabel={toast.alt?.label} altPlain={toast.alt?.plain} />}
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
  root: { flex: 1 },
  pad: { padding: space.gutter, paddingTop: 0 }, // .scr: the safe area stands in for its 54px top
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 },
  h: { fontSize: font.h, lineHeight: 36, fontFamily: ff("600"), letterSpacing: -0.75, marginTop: 2 },
  go: { position: "absolute", right: 0, bottom: 0, height: 30, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sub: { marginTop: 6, fontFamily: ff(), fontSize: font.md },
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 2 },
  tabs: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18 }, // magic.html .tabs: text and the Nhịp pill share a centre line
  tabL: { flexDirection: "row", gap: 20 },
  mind: { flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 99, borderWidth: 1 }, // magic.html .mind
  tabDot: { position: "absolute", bottom: 0, left: "50%", width: 5, height: 5, marginLeft: -2.5, borderRadius: 3 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
