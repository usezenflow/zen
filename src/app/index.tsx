import { PdfPageImage } from "@dariyd/react-native-pdf-page-image";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { extractTextFromPage, getPageCount } from "expo-pdf-text-extract";
import { extractTextFromImage } from "expo-text-extractor";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Appearance, AppState, StyleSheet, Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Reanimated, { interpolate, useAnimatedStyle, useSharedValue, withTiming, ZoomIn, ZoomOut } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon, Logo } from "@/components/art";
import { Rhythm } from "@/components/rhythm";
import { addDays, live, mondayOf, monthLabel, onDay, short, startOfDay, weekday, type Hols } from "@/components/cal";
import { Day, DayPull, First } from "@/components/day";
import { Search, type Origin } from "@/components/search";
import { PdfView, PhotoMenu, PhotoView, TypeBar, Veil } from "@/components/capture";
import { Hold, type Aside, type HoldState } from "@/components/hold";
import type { Item } from "@/components/menu";
import { Month } from "@/components/month";
import { Brief, Live, NowCard, Steps, Story, Weekly, type Card } from "@/components/nowcard";
import { RowMenu } from "@/components/rowmenu";
import { fadeIn, fadeOut, glide, popIn, settle, Tap, EASE } from "@/components/tap";
import { Sweep, useSweep } from "@/components/sweep";
import { Toast } from "@/components/toast";
import { Swipe, Week } from "@/components/week";
import { apply, makeRoom, moveMine, pickNow, addRule, pin, putBack, removeRule, removeScope, scopeIds, swipeDone, swipeLater, take, type Result } from "@/lib/apply";
import { loadMoves, loadWarn, seeMoves } from "@/lib/moves";
import { reasonText, stepText, topReason } from "@/lib/reasons";
import { holidays } from "@/lib/holidays";
import { askMic, listenLive, micReset, type Heard } from "@/lib/ears";
import { t } from "@/lib/i18n";
import { marksOf, readErrors, readFull, readNotes } from "@/lib/nlu/adapt";
import { think } from "@/lib/nlu/commands";
import { affinityOf, calendarOf, committedRows, vocab } from "@/lib/nlu/context";
import { personalPrior } from "@/lib/nlu/reader/assemble";
import { isRule, readRule } from "@/lib/rules";
import { takeFlash } from "@/lib/flash";
import { keepBoth, pendingOverlaps, type Overlap } from "@/lib/overlap";
import * as store from "@/lib/store";
import { getMarks, onForeground, onSynced } from "@/lib/sync";
import { listenWidgets, pushWidgets } from "@/lib/widgets";
import { useTheme, font, space, ff } from "@/lib/theme";
import type { Move, Notice, Rule, Step, Task, Warn } from "@/lib/types";
import { dayLabel, day as dayName, when } from "@/lib/when";
import { insights, suggest, typeOf, type Insights } from "@/planner";

type View_ = "day" | "week" | "month" | "rhythm"; // rhythm sits apart on the right of the tabs, outside the swipe cycle
const VIEWS: View_[] = ["day", "week", "month"];
// A row says only what Zen learned or was told; "the day is free" on every row is noise, so that stays on the detail screen.
const ROW = new Set(["hour", "after", "similar", "kind", "energy", "weekend", "said", "pace", "rule", "pinned"]);
type ToastState = { text: string; sub?: string; error?: boolean; action?: { label?: string; run: () => void }; alt?: { label: string; run: () => void } };

const longDate = (ms: number) => { const d = new Date(ms); return `${d.getDate()} tháng ${d.getMonth() + 1}`; };
const dm = (ms: number) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };

export default function Home() {
  const th = useTheme();
  const inset = useSafeAreaInsets().top;
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
    const unseen = mv.filter((m) => !m.seen && all.some((x) => x.id === m.id && !x.deletedAt));
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
      if (why && !x.fixed && !trail[x.id] && (typeOf(x) !== "assignment" || ["pace", "explore", "rule", "pinned"].includes(why.key))) reason[x.id] = reasonText(why);
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
    setCard(cur && { task: cur, start: cur.start, end: cur.end });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToasts((q) => q.slice(1)), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const say = useCallback((text: string, r?: Result, extra?: { sub?: string; alt?: { label: string; run: () => void } }) => {
    setToasts((q) => [{
      text,
      sub: extra?.sub ?? r?.sub,
      alt: extra?.alt,
      action: r && { run: async () => { await r.undo(); setToasts((u) => [{ text: t("undone") }, ...u.slice(1)]); refresh(); } },
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
  const shuffle = useCallback(async (r?: Result, old = tasksRef.current) => {
    const id = (st: Step) => st.id;
    const steps = (r?.steps ?? []).slice(0, 4);
    if (shuf.current || !old.length || !steps.some(id)) return refresh();
    shuf.current = true;
    const fresh = new Map((await store.allTasks()).map((x) => [x.id, x]));
    // A step names the task; when it was split into sittings, its rows are the sittings (the parent only loses its time).
    const rows = (tid?: string) => { const x = tid ? fresh.get(tid) : undefined; return x ? [x, ...[...fresh.values()].filter((c) => c.parentId === tid && !c.deletedAt)] : []; };
    const firstAt = Math.min(...rows(steps.find((st) => id(st) && !old.some((o) => o.id === id(st)))?.id).flatMap((x) => x.start ?? []));
    setTasks(old);
    if (Number.isFinite(firstAt)) setSel(startOfDay(firstAt));
    setShufOn(true);
    setState("thinking");
    try {
      for (let i = 0; i < steps.length; i++) {
        await new Promise((ok) => setTimeout(ok, 350));
        setLines(steps.slice(0, i + 1).map(stepText));
        const xs = rows(id(steps[i]));
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
    void shuffle(r);
  }, [say, go, shuffle]);

  useFocusEffect(useCallback(() => {
    const f = takeFlash();
    if (f) say(f.text, f.r, { sub: f.sub });
    refresh();
    onForeground().then(landed).catch(() => {});
  }, [refresh, say, landed]));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") { onForeground().then(landed).catch(() => refresh()); pushWidgets(); }
    });
    return () => sub.remove();
  }, [refresh, landed]);
  useEffect(() => { pushWidgets(); return listenWidgets(refresh); }, [refresh]);
  // `now` otherwise moves only on a refresh: left open, rows would never turn late and "today" would not roll over at midnight.
  useEffect(() => {
    let day = startOfDay(Date.now());
    const i = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (startOfDay(n) !== day) { day = startOfDay(n); refresh(); }
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
    if (shuf.current) return;
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
      const ctx = all.filter((x) => !x.doneAt && !x.deletedAt && !x.parentId)
        .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))
        .map((x) => ({ id: x.id, title: x.title, start: x.start }));
      const nowD = new Date();
      // What the reader cannot know from the words: the timetable, what this user usually saves per title, and the marks.
      const old = JSON.parse((await store.kvGet("nlu.committed").catch(() => null)) ?? "[]");
      const extra = { calendar: calendarOf(all, nowD.getTime()), affinity: affinityOf((await getMarks().catch(() => null))?.marks ?? []), prior: personalPrior(old), alternatives };
      const source = via === "voice" ? "voice" : via === "photo" || via === "scan" ? "ocr" : via === "pdf" ? "paste" : "typed"; // ocr and paste: the reader reads a notice's lines and tables as such
      const actions = think(text, nowD, ctx, source, extra);
      // dev only: what the recognizer wrote and what was read from it, so a wrong day can be traced to its transcript
      if (__DEV__) console.log("[heard]", JSON.stringify({ via, text, alternatives, actions, readErrors }));
      const read = actions.some((a) => a.op === "create") ? readFull(text, nowD, source, { ...extra, alternatives: undefined }) : undefined; // offsets in the notes point into this transcript, not a winning alternative
      const notes = read ? readNotes(text, read) : {};
      if (!actions.length) return via === "photo" ? nothing("photo") : via === "pdf" || via === "scan" ? nothing("pdf") : say(t("huh"), undefined, { sub: t("huhSub") }); // a command naming no task we know
      const now = nowD.getTime();
      const r = await apply(actions, now);
      if (read?.items.length) store.kvSet("nlu.committed", JSON.stringify(committedRows(read.items, old))).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const titles = [...new Set(actions.filter((a) => a.op === "create" && a.title).map((a) => a.title!))];
      // Show where the new work landed: the day of its earliest placed piece, not today.
      const made = (await store.allTasks()).filter((x) => x.createdAt === now && x.source === "user" && !x.deletedAt && x.start !== undefined);
      const firstAt = Math.min(...made.map((x) => x.start!));
      const playing = (r.steps ?? []).some((st) => st.id); // the shuffle picks the day itself
      if (!playing && titles.length && Number.isFinite(firstAt)) setSel(startOfDay(firstAt));
      if (titles.length > 1) { // bulk: count, first two names, one Undo for all, no alt
        const k = titles.length - 2;
        say(t("addedN", { n: titles.length }), r, { sub: [titles.slice(0, 2).join(", ") + (k > 0 ? ` +${k}` : ""), r.sub, notes.sub].filter(Boolean).join(" · ") });
      } else if (titles.length === 1) {
        // The reader's own ask ("3 giờ": 15:00 or 03:00) takes the chip; else the planner's other slot.
        const alt = notes.alt && { alt: { label: notes.alt.label, run: async () => { await r.undo(); await run(notes.alt!.text, via); } } };
        say(titles[0], r, { sub: [Number.isFinite(firstAt) ? when(firstAt, now) : undefined, r.sub, notes.sub].filter(Boolean).join(" · ") || undefined, ...(alt ?? (await otherSlot(made, now))) });
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
      setPhoto({ uri, w: width, h: height });
      setState("thinking");
      const text = (await extractTextFromImage(uri)).map((l) => l.trim()).filter(Boolean).join("\n");
      if (!text) { setState("idle"); return nothing("photo"); }
      // capture.html 8: the read text with what the reader found lit up, held a beat so you see it, then added as usual.
      const marks = marksOf(text, readFull(text, new Date(), "ocr"));
      if (marks.length) { setPhoto({ uri, w: width, h: height, text, marks }); await new Promise((ok) => setTimeout(ok, 1400)); }
      await run(text, "photo");
    } catch (e) {
      setState("idle");
      fail(t("photoFail"), e);
    }
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
  const readPdf = async () => {
    let uri: string | undefined;
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
      if (r.canceled || !r.assets[0]) return;
      uri = r.assets[0].uri;
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

  // The planner's own second-best start for a single new flexible task.
  const otherSlot = async (made: Task[], now: number) => {
    const task = made.length === 1 && !made[0].fixed ? made[0] : undefined;
    const alt = task && (await store.loadModel(now)).placed[task.id]?.alt;
    if (!task || alt === undefined || alt === task.start) return;
    return { alt: { label: when(alt, now), run: async () => { const a = await apply([{ op: "edit", target: task.id, when: new Date(alt).toISOString() }]); say(task.title, a, { sub: when(alt, now) }); refresh(); } } };
  };

  const toggle = async (x: Task) => {
    const at = Date.now();
    gen.current++;
    setTasks((p) => p.map((a) => (a.id === x.id || a.parentId === x.id ? { ...a, doneAt: at } : a))); // ticks at once; the save confirms
    const r = await swipeDone(x.id);
    setPop((p) => new Set(p).add(x.id));
    setTimeout(() => setPop((p) => { const n = new Set(p); n.delete(x.id); return n; }), 1400);
    const left = tasks.filter((a) => live(a) && a.id !== x.id && a.start !== undefined && a.start < addDays(startOfDay(Date.now()), 1) && !tasks.some((c) => c.parentId === a.id)).length;
    say(t("doneTitle", { title: x.title }), r, { sub: t("leftToday", { n: left }) });
    refresh();
  };
  const edit = async (x: Task, a: { title?: string; when?: string }) => { const r = await apply([{ op: "edit", target: x.id, ...a }]); say(r.toast, r); refresh(); };
  const del = async (x: Task, scope: "this" | "following" | "all") => {
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
    ? [{ label: t("delThis"), onPress: () => del(x, "this") }, { label: t("delFollowing"), onPress: () => del(x, "following") }, { label: t("delAll"), destructive: true, onPress: () => del(x, "all") }]
    : [];
  // Long-press adds the lessons: put it back, take the other good time, pin.
  const itemsFor = (x: Task): Item[] => {
    const from = maps.froms[x.id], alt = maps.alts[x.id], out: Item[] = [];
    const done = (r: Result) => { say(r.toast, r); refresh(); };
    if (from !== undefined) out.push({ label: t("itemPutBack", { when: when(from, now) }), onPress: async () => done(await putBack(x.id, from)) });
    if (alt !== undefined) out.push({ label: t("itemAlt", { when: when(alt, now) }), onPress: async () => done(await apply([{ op: "edit", target: x.id, when: new Date(alt).toISOString() }])) });
    if (!x.fixed && !x.doneAt && (from !== undefined || alt !== undefined || maps.reason[x.id] || x.pinned)) out.push({ label: t(x.pinned ? "itemUnpin" : "itemPin"), onPress: async () => done(await pin(x.id, !x.pinned)) });
    return [...out, ...seriesItems(x)];
  };
  const rowActs = {
    // Edits show at once and persist behind: the list takes the new value now, and the refresh after the save confirms it.
    onToggle: toggle, onTitle: (x: Task, title: string) => { gen.current++; setTasks((p) => p.map((y) => (y.id === x.id ? { ...y, title } : y))); edit(x, { title }); }, itemsFor,
    onTime: (x: Task, at: Date) => {
      const d = new Date(x.start ?? Date.now()); d.setHours(at.getHours(), at.getMinutes(), 0, 0);
      const start = d.getTime(), len = x.start !== undefined && x.end !== undefined ? x.end - x.start : Math.max(30, x.effort || 30) * 60_000;
      gen.current++;
      setTasks((p) => p.map((y) => (y.id === x.id ? { ...y, start, end: start + len, pinned: true } : y)));
      edit(x, { when: d.toISOString() });
    },
    onOpen: (x: Task) => router.push(`/task/${x.id}`),
    // Swipe right: a plain task is deleted at once; a series opens the scope dropdown under the row.
    onSwipeDelete: (x: Task, bottom?: number) => (bottom === undefined ? del(x, "this") : setMenu({ task: x, top: bottom - inset + 4, items: seriesItems(x) })),
    onHold: (x: Task, bottom: number) => setMenu({ task: x, top: bottom - inset + 4, items: itemsFor(x) }), lifted: menu?.task.id,
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
  const finish = async (dir: "done" | "later") => { await commit(dir); cx.set(0); };
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
  const inView = (a: Task) => live(a) && a.start !== undefined && !tasks.some((c) => c.parentId === a.id);
  const count = (from: number, to: number, days = 0) => {
    const n = { a: 0, l: 0, e: 0 };
    for (const a of tasks) if (inView(a) && a.start! >= from && a.start! < to) { const ty = typeOf(a); n[ty === "lecture" ? "l" : ty === "exam" ? "e" : "a"]++; }
    const hs = [...hols].filter(([d]) => d >= from && d < to && days);
    if (!(n.a || n.l || n.e || hs.length)) return ""; // the caller says what an empty span reads as
    return [n.a ? t("nTasks", { n: n.a }) : "", n.l ? t("nLectures", { n: n.l }) : "", n.e ? t("nExams", { n: n.e }) : "", hs.length ? t("nHols", { n: hs.length, name: hs.some(([, h]) => /tết/i.test(h)) ? "Tết" : "lễ" }) : ""].filter(Boolean).join(", ");
  };
  // views.html "Day, empty" / "Day, all done": nothing left reads "Không có việc", everything ticked "5 việc, xong hết".
  const dayDone = (d: number) => {
    const n = tasks.filter((a) => a.doneAt && a.start !== undefined && a.start >= d && a.start < addDays(d, 1) && !tasks.some((c) => c.parentId === a.id)).length;
    return n ? t("nAllDone", { n }) : t("noTasks");
  };
  const sd = new Date(sel);
  const sun = addDays(mon, 6), sm = new Date(mon), em = new Date(sun);
  const head = view === "day"
    ? { hello: weekday(sel), h: longDate(sel), n: count(sel, addDays(sel, 1)) || dayDone(sel) }
    : view === "week"
      ? { hello: mon === mondayOf(today0) ? t("thisWeek") : mon === addDays(mondayOf(today0), 7) ? t("nextWeek") : t("yearN", { y: sm.getFullYear() }), h: t("rangeTo", { a: sm.getMonth() === em.getMonth() ? sm.getDate() : dm(mon), b: dm(sun) }), n: count(mon, addDays(mon, 7), 1) || t("nothingYet") }
      : view === "rhythm"
        ? { hello: t("rhythmHello"), h: t("rhythm"), n: mind?.i.golden ? t("goldenRange", { a: mind.i.golden.from, b: mind.i.golden.to }) : t("stillLearning") }
      : { hello: t("yearN", { y: sd.getFullYear() }), h: monthLabel(sel), n: count(new Date(sd.getFullYear(), sd.getMonth(), 1).getTime(), new Date(sd.getFullYear(), sd.getMonth() + 1, 1).getTime(), 1) || t("nothingYet") };
  const stepWeek = (d: -1 | 1) => setSel(addDays(sel, 7 * d));
  const stepMonth = (d: -1 | 1) => setSel(new Date(sd.getFullYear(), sd.getMonth() + d, 1).getTime());
  const stepDay = (d: -1 | 1) => setSel(addDays(sel, d));
  const share = { tasks, hols, now, pop, rules: mind?.rules ?? [], overlaps: over, onMove: async (o: Overlap) => { const r = await moveMine(o.mine.id); say(r.toast, r); refresh(); }, onKeep: async (o: Overlap) => { await keepBoth(o); refresh(); }, trail: maps.trail, reason: maps.reason, moves, onFix: async (w: Warn, f: Warn["fixes"][number]) => { const r = await makeRoom(f.id, w.deadline); say(r.toast, r); refresh(); }, ...rowActs };
  const isToday = sel === today0;
  const running = !!card && !card.gap && card.start! <= now && now < card.end!;
  const quiet = isToday && view === "day" && !running;
  const said = moves.filter((m) => !m.self); // the user's own moves keep the trail dot, not the brief
  const briefOn = quiet && said.length > 0; // the running card keeps priority
  const sunOn = quiet && !briefOn && !!wk;
  const showStory = briefOn && story;
  const closeStory = async () => { setStory(false); await seeMoves(said.map((m) => m.id)); refresh(); };
  const busy = state !== "idle";
  const listing = busy && !shufOn && !!words; // the day stays under the veil until words are heard; while the plan plays out the list stays, the dock keeps thinking
  const firstRun = !tasks.length && view === "day" && !busy; // views.html "Day, first launch"
  const selEmpty = !hols.has(sel) && !onDay(tasks, sel).length;
  // The first-launch card also teaches on any empty day with nothing ahead of it: no rows, nothing ticked, nothing coming.
  const nothingAhead = view === "day" && !busy && selEmpty && !(isToday && card)
    && !tasks.some((a) => a.doneAt && !a.deletedAt && a.start !== undefined && a.start >= sel && a.start < addDays(sel, 1))
    && !tasks.some((a) => inView(a) && a.start! >= Math.max(addDays(sel, 1), now));
  const weekEmpty = view === "week" && Array.from({ length: 7 }, (_, i) => addDays(mon, i)).every((d) => !hols.has(d) && !onDay(tasks, d).length);
  // Rest card only where the art card would sit: day view, and no now-card above it.
  const empty = weekEmpty ? "week" : view === "day" && selEmpty && !(isToday && card) && !briefOn && !sunOn ? "rest" : "inl";
  const hero = briefOn ? (story ? "story" : "brief") : sunOn ? "sun" : card ? card.task.id : "none";

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
              {briefOn ? (story ? <Story moves={said} now={now} onClose={closeStory} /> : <Brief moves={said} now={now} onOpen={() => setStory(true)} />) : sunOn ? <Weekly title={wk!.title} sub={wk!.sub} onPress={() => setView("rhythm")} /> : cardView}
            </Reanimated.View>
          )}
          {view === "rhythm" && mind && <Rhythm i={mind.i} rules={mind.rules} onForget={async (x) => { const r = await removeRule(x.id); say(r.toast, r); refresh(); }} />}
          {(view === "week" || view === "month") && (
            <Reanimated.View key={view} entering={fadeIn}>
              {view === "week"
                ? <Week tasks={tasks} hols={hols} rules={mind?.rules ?? []} now={now} monday={mon} selected={sel} onSelect={setSel} onStep={stepWeek} />
                : <Month tasks={tasks} hols={hols} now={now} selected={sel} onSelect={setSel} onStep={stepMonth} />}
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
      {!showStory && !finding && <View style={s.dock} pointerEvents="box-none"><Hold state={state} pinned={picking ? "photo" : ""} onAside={onAside} onStart={() => { setPressing(true); setPhoto(undefined); setPdf(undefined); if (!latched.current) void start(); }} onEnd={onEnd} idle={view === "rhythm" ? "holdRule" : "hold"} /></View>}
      {picking && <PhotoMenu onPick={readPhoto} />}
      {typing && <><Veil z={9} onPress={() => setTyping(false)} /><TypeBar onClose={() => setTyping(false)} onSend={(text) => { setTyping(false); void run(text, "type"); }} /></>}
      {lines.length > 0 && <Steps lines={lines} />}
      {finding && <Search origin={finding} tasks={tasks} now={now} acts={rowActs} onClose={() => setFinding(undefined)} />}
      {menu && <RowMenu items={menu.items} top={menu.top} onClose={() => setMenu(undefined)} />}
      {toast && <Toast key={`${toast.text}|${toast.sub ?? ""}`} onDismiss={() => setToasts((q) => q.slice(1))} error={toast.error} text={toast.text} sub={toast.sub} onAction={toast.action?.run} actionLabel={toast.action?.label} onAlt={toast.alt?.run} altLabel={toast.alt?.label} />}
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
