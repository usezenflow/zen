import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import Reanimated, { useSharedValue, withTiming, ZoomIn, ZoomOut } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon, Logo } from "@/components/art";
import { Rhythm } from "@/components/rhythm";
import { addDays, live, mondayOf, monthLabel, onDay, startOfDay, weekday, type Hols } from "@/components/cal";
import { Day, DayPull, First } from "@/components/day";
import { Hold, type HoldState } from "@/components/hold";
import type { Item } from "@/components/menu";
import { Month } from "@/components/month";
import { Brief, Live, NowCard, Steps, Story, Weekly, type Card } from "@/components/nowcard";
import { RowMenu } from "@/components/rowmenu";
import { fadeIn, fadeOut, glide, popIn, Tap } from "@/components/tap";
import { Toast } from "@/components/toast";
import { Swipe, Week } from "@/components/week";
import { apply, makeRoom, moveMine, pickNow, addRule, pin, putBack, removeRule, removeScope, swipeDone, swipeLater, take, type Result } from "@/lib/apply";
import { loadMoves, loadWarn, seeMoves } from "@/lib/moves";
import { reasonText, stepText, topReason } from "@/lib/reasons";
import { allDay, dropOldCalendar, readBusy } from "@/lib/calendar";
import { askMic, listenLive, micReset } from "@/lib/ears";
import { t } from "@/lib/i18n";
import { think } from "@/lib/nlu/commands";
import { isRule, readRule } from "@/lib/rules";
import { takeFlash } from "@/lib/flash";
import { keepBoth, pendingOverlaps, type Overlap } from "@/lib/overlap";
import * as store from "@/lib/store";
import { onForeground } from "@/lib/sync";
import { listenWidgets, pushWidgets } from "@/lib/widgets";
import { useTheme, font, space, ff } from "@/lib/theme";
import type { Move, Notice, Rule, Task, Warn } from "@/lib/types";
import { dayLabel, day as dayName, when } from "@/lib/when";
import { insights, suggest, typeOf, type Insights } from "@/planner";

type View_ = "day" | "week" | "month" | "rhythm"; // rhythm sits apart on the right of the tabs, outside the swipe cycle
const VIEWS: View_[] = ["day", "week", "month"];
type ToastState = { text: string; sub?: string; error?: boolean; action?: { label?: string; run: () => void }; alt?: { label: string; run: () => void } };

const longDate = (ms: number) => { const d = new Date(ms); return `${d.getDate()} tháng ${d.getMonth() + 1}`; };
const dm = (ms: number) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };

export default function Home() {
  const th = useTheme();
  const inset = useSafeAreaInsets().top;
  const [menu, setMenu] = useState<{ task: Task; top: number } | undefined>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [card, setCard] = useState<Card | undefined>();
  const [state, setState] = useState<HoldState>("idle");
  const [words, setWords] = useState("");
  const [toasts, setToasts] = useState<ToastState[]>([]); // [0] is showing, the rest wait their turn
  const toast = toasts[0];
  const [hols, setHols] = useState<Hols>(new Map());
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<View_>("day");
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
  const [lines, setLines] = useState<string[]>([]); // narrated solver steps while thinking
  const [mind, setMind] = useState<{ i: Insights; rules: Rule[] }>();

  const refresh = useCallback(async () => {
    const now = Date.now();
    setNow(now);
    const all = await store.allTasks();
    setTasks(all);
    setOver(await pendingOverlaps(now));
    // Moves and the model load once per refresh; rows get plain maps.
    const [model, mv, wn] = await Promise.all([store.loadModel(now), loadMoves(), loadWarn()]);
    const unseen = mv.filter((m) => !m.seen && all.some((x) => x.id === m.id && !x.deletedAt));
    const trail: Record<string, string> = {}, froms: Record<string, number> = {}, reason: Record<string, string> = {}, alts: Record<string, number> = {};
    for (const m of unseen) { froms[m.id] = m.from; trail[m.id] = t("trailFrom", { when: when(m.from, now) }); }
    for (const x of all) {
      const p = model.placed[x.id];
      if (!p || x.doneAt || x.deletedAt || x.start === undefined) continue;
      if (p.alt !== undefined && p.alt !== x.start) alts[x.id] = p.alt;
      const why = p.explore ? { key: "explore" as const, w: 1 } : topReason(p.why);
      // Assignments keep the due-date sub unless the reason says more than "do it early".
      if (why && !x.fixed && !trail[x.id] && (typeOf(x) !== "assignment" || ["pace", "explore", "rule", "pinned"].includes(why.key))) reason[x.id] = reasonText(why);
    }
    const ins = insights(model, now), wkAgo = now - 7 * 86400_000, w = new Date(now).getDay() === 0 ? ins.weekly : undefined;
    setMind({ i: ins, rules: model.rules ?? [] });
    setMoves(unseen); setWarns(wn); setMaps({ trail, froms, reason, alts });
    setWk(w ? { title: w, sub: t("sundaySub", { done: all.filter((x) => x.doneAt && x.doneAt >= wkAgo).length, moved: mv.filter((m) => m.at >= wkAgo).length }) } : undefined);
    const cur = pickNow(all, now);
    if (cur && cur.start! <= now) return setCard({ task: cur, start: cur.start, end: cur.end });
    const s = suggest(all.filter((x) => !dismissed.current.has(x.id)), await readBusy(now, now + 8 * 3600_000), model, now);
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
  // A sync result: every notice gets its own toast with "Xem"; otherwise the plain result.
  const landed = useCallback((r?: Result & { notices?: Notice[] }) => {
    if (r?.notices?.length) setToasts((q) => [...q, ...r.notices!.map((n): ToastState => ({ text: n.title, sub: n.sub, action: n.route ? { label: t("view"), run: () => go(n.route!) } : undefined }))]);
    else if (r) say(r.toast, r);
    refresh();
  }, [say, go, refresh]);

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
  useEffect(() => { // once: older builds mirrored tasks into a "Zen" phone calendar
    store.kvGet("cal.dropped").then(async (v) => { if (v !== "1" && (await dropOldCalendar())) await store.kvSet("cal.dropped", "1"); }).catch(() => {});
  }, []);

  const monthKey = new Date(sel).getFullYear() * 12 + new Date(sel).getMonth();
  useEffect(() => { // holidays and all-day phone events across the month grid
    const first = mondayOf(new Date(new Date(sel).getFullYear(), new Date(sel).getMonth(), 1).getTime());
    allDay(first, addDays(first, 42)).then((l) => setHols(new Map(l.map((h) => [startOfDay(h.day), h.title])))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  const stopRec = useRef<(() => Promise<string>) | undefined>(undefined);
  const held = useRef(false);
  // Opened from the talk widget (zen:///?listen=1): already listening, so the next touch on the button ends it.
  const latched = useRef(false);
  const { listen } = useLocalSearchParams<{ listen?: string }>();

  useEffect(() => { micReset(); }, []);
  useEffect(() => { // once: the on-device models (whisper, Qwen, e5) are gone; their ~1.6 GB must not linger
    import("expo-file-system").then(({ Directory, Paths }) => { const d = new Directory(Paths.document, "models"); if (d.exists) d.delete(); }).catch(() => {});
  }, []);
  useEffect(() => { // leaving the app mid-hold: close the mic and drop the take, nobody is there to see it parsed
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active" || !held.current) return;
      held.current = false;
      latched.current = false;
      const stop = stopRec.current;
      stopRec.current = undefined;
      level.set(0);
      setState("idle");
      if (stop) stop().catch(() => {}); // no stop yet: start() sees held=false and closes it
    });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async () => {
    held.current = true;
    if (!(await askMic())) { held.current = false; return say(t("mic")); }
    if (!held.current) return;
    setWords("");
    setState("listening"); // at once, before the recognizer is up, so the button never reads as broken
    try {
      const rec = await listenLive({ onPartial: setWords, onLevel: (l: number) => level.set(withTiming(l, { duration: 90 })) });
      if (!held.current) return void rec.stop().catch(() => {}); // released while the mic was starting
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
    try {
      const text = await stop();
      if (!text) return say(t("heardNothing"), undefined, { sub: t("heardNothingSub") });
      setWords(text);
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
      const actions = think(text, nowD, ctx);
      if (!actions.length) return say(t("huh"), undefined, { sub: t("huhSub") }); // a command naming no task we know
      const now = nowD.getTime();
      const applied = await apply(actions, now);
      const said = (applied.steps ?? []).slice(0, 4).map(stepText);
      for (let i = 1; i <= said.length; i++) { setLines(said.slice(0, i)); await new Promise((ok) => setTimeout(ok, 300)); }
      if (said.length) await new Promise((ok) => setTimeout(ok, 300));
      const r = applied;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const titles = [...new Set(actions.filter((a) => a.op === "create" && a.title).map((a) => a.title!))];
      if (titles.length > 1) { // bulk: count, first two names, one Undo for all, no alt
        const k = titles.length - 2;
        say(t("addedN", { n: titles.length }), r, { sub: titles.slice(0, 2).join(", ") + (k > 0 ? ` +${k}` : "") });
      } else if (titles.length === 1) {
        const task = (await store.allTasks()).find((x) => x.createdAt === now && x.source === "user" && !x.deletedAt);
        say(titles[0], r, { sub: task?.start !== undefined ? when(task.start, now) : undefined, ...(await otherSlot(now)) });
      } else say(r.toast, r);
      refresh();
    } catch (e) {
      fail(t("thinkFail"), e);
    } finally {
      setState("idle");
      setLines([]);
    }
  };

  // The "other slot": a placement logged at `now` whose other policy chose a different start.
  const otherSlot = async (now: number) => {
    const ev = (await store.allEvents()).find((e) => e.at === now && e.type === "placed" && typeof e.data?.otherStart === "number");
    const task = ev && (await store.allTasks()).find((x) => x.id === ev.taskId);
    const alt = ev?.data?.otherStart as number | undefined;
    if (!task || alt === undefined || alt === task.start) return;
    return { alt: { label: when(alt, now), run: async () => { const a = await apply([{ op: "edit", target: task.id, when: new Date(alt).toISOString() }]); say(task.title, a, { sub: when(alt, now) }); refresh(); } } };
  };

  const toggle = async (x: Task) => {
    const r = await swipeDone(x.id);
    setPop((p) => new Set(p).add(x.id));
    setTimeout(() => setPop((p) => { const n = new Set(p); n.delete(x.id); return n; }), 1400);
    const left = tasks.filter((a) => live(a) && a.id !== x.id && a.start !== undefined && a.start < addDays(startOfDay(Date.now()), 1) && !tasks.some((c) => c.parentId === a.id)).length;
    say(t("doneTitle", { title: x.title }), r, { sub: t("leftToday", { n: left }) });
    refresh();
  };
  const edit = async (x: Task, a: { title?: string; when?: string }) => { const r = await apply([{ op: "edit", target: x.id, ...a }]); say(r.toast, r); refresh(); };
  const del = async (x: Task, scope: "this" | "following" | "all") => {
    const r = await removeScope(x.id, scope);
    const at = x.start ?? x.deadline;
    const sub = scope === "all" ? t("allSessions") : scope === "following" ? t("fromOn", { day: at !== undefined ? dayName(at, now) : "" }) : at !== undefined ? when(at, now) : undefined;
    say(t(scope === "all" ? "removedAll" : "removed", { title: x.title }), r, { sub });
    refresh();
  };
  // Series (campus section or repeat): long-press or swipe opens three scopes. Plain tasks: swipe deletes. Undo is the net.
  const seriesItems = (x: Task): Item[] => x.section || x.rrule
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
    onToggle: toggle, onTitle: (x: Task, title: string) => edit(x, { title }), itemsFor,
    onTime: (x: Task, at: Date) => { const d = new Date(x.start ?? Date.now()); d.setHours(at.getHours(), at.getMinutes(), 0, 0); edit(x, { when: d.toISOString() }); },
    onOpen: (x: Task) => router.push(`/task/${x.id}`),
    // Swipe right: a plain task is deleted at once; a series opens the scope dropdown under the row.
    onSwipeDelete: (x: Task, bottom?: number) => (bottom === undefined ? del(x, "this") : setMenu({ task: x, top: bottom - inset + 4 })),
  };

  const [x] = useState(() => new Animated.ValueXY());
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
    await refresh();
  };
  const [latest] = useState<{ commit?: typeof commit }>({}); // read by the long-lived PanResponder
  useEffect(() => { Object.assign(latest, { commit }); });
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12,
    onPanResponderMove: Animated.event([null, { dx: x.x, dy: x.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 110) {
        Animated.timing(x, { toValue: { x: g.dx > 0 ? 500 : -500, y: 0 }, duration: 180, useNativeDriver: false }).start(async () => {
          await latest.commit!(g.dx > 0 ? "done" : "later");
          x.setValue({ x: 0, y: 0 });
        });
        return;
      }
      Animated.spring(x, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
  }));

  const mon = mondayOf(sel);
  const today0 = startOfDay(now);
  const inView = (a: Task) => live(a) && a.start !== undefined && !tasks.some((c) => c.parentId === a.id);
  const count = (from: number, to: number, days = 0) => {
    const n = { a: 0, l: 0, e: 0 };
    for (const a of tasks) if (inView(a) && a.start! >= from && a.start! < to) { const ty = typeOf(a); n[ty === "lecture" ? "l" : ty === "exam" ? "e" : "a"]++; }
    const hs = [...hols].filter(([d]) => d >= from && d < to && days);
    return [n.a || !(n.l || n.e || hs.length) ? t("nTasks", { n: n.a }) : "", n.l ? t("nLectures", { n: n.l }) : "", n.e ? t("nExams", { n: n.e }) : "", hs.length ? t("nHols", { n: hs.length, name: hs.some(([, h]) => /tết/i.test(h)) ? "Tết" : "lễ" }) : ""].filter(Boolean).join(", ");
  };
  const sd = new Date(sel);
  const sun = addDays(mon, 6), sm = new Date(mon), em = new Date(sun);
  const head = view === "day"
    ? { hello: weekday(sel), h: longDate(sel), n: count(sel, addDays(sel, 1)) }
    : view === "week"
      ? { hello: mon === mondayOf(today0) ? t("thisWeek") : t("yearN", { y: sm.getFullYear() }), h: t("rangeTo", { a: sm.getMonth() === em.getMonth() ? sm.getDate() : dm(mon), b: dm(sun) }), n: count(mon, addDays(mon, 7), 1) }
      : view === "rhythm"
        ? { hello: t("rhythmHello"), h: t("rhythm"), n: mind?.i.golden ? t("goldenRange", { a: mind.i.golden.from, b: mind.i.golden.to }) : t("stillLearning") }
      : { hello: t("yearN", { y: sd.getFullYear() }), h: monthLabel(sel), n: count(new Date(sd.getFullYear(), sd.getMonth(), 1).getTime(), new Date(sd.getFullYear(), sd.getMonth() + 1, 1).getTime(), 1) };
  const stepWeek = (d: -1 | 1) => setSel(addDays(sel, 7 * d));
  const stepMonth = (d: -1 | 1) => setSel(new Date(sd.getFullYear(), sd.getMonth() + d, 1).getTime());
  const stepDay = (d: -1 | 1) => setSel(addDays(sel, d));
  const share = { tasks, hols, now, pop, overlaps: over, onMove: async (o: Overlap) => { const r = await moveMine(o.mine.id); say(r.toast, r); refresh(); }, onKeep: async (o: Overlap) => { await keepBoth(o); refresh(); }, trail: maps.trail, reason: maps.reason, moves, onFix: async (w: Warn, f: Warn["fixes"][number]) => { const r = await makeRoom(f.id, w.deadline); say(r.toast, r); refresh(); }, ...rowActs };
  const isToday = sel === today0;
  const running = !!card && !card.gap && card.start! <= now && now < card.end!;
  const quiet = isToday && view === "day" && !running;
  const briefOn = quiet && moves.length > 0; // the running card keeps priority
  const sunOn = quiet && !briefOn && !!wk;
  const showStory = briefOn && story;
  const closeStory = async () => { setStory(false); await seeMoves(); refresh(); };
  const busy = state !== "idle";
  const firstRun = !tasks.length && view === "day" && !busy; // views.html "Day, first launch"
  const selEmpty = !hols.has(sel) && !onDay(tasks, sel).length;
  const weekEmpty = view === "week" && Array.from({ length: 7 }, (_, i) => addDays(mon, i)).every((d) => !hols.has(d) && !onDay(tasks, d).length);
  // Rest card only where the art card would sit: day view, and no now-card above it.
  const empty = weekEmpty ? "week" : view === "day" && selEmpty && !(isToday && card) && !briefOn && !sunOn ? "rest" : "inl";
  const hero = briefOn ? (story ? "story" : "brief") : sunOn ? "sun" : card ? card.task.id : "none";

  const cardView = card && (
    <Animated.View
      {...pan.panHandlers}
      style={{ transform: [{ translateX: x.x }, { rotate: x.x.interpolate({ inputRange: [-300, 300], outputRange: ["-8deg", "8deg"] }) }] }}
    >
      <NowCard card={card} onDone={() => commit("done")} />
    </Animated.View>
  );

  const first = (hello: string, h: string, sub?: string) => (
    <View style={s.top}>
      <View>
        <Text style={{ color: th.ink, fontSize: font.md, fontFamily: ff("500") }}>{hello}</Text>
        <Text style={[s.h, { color: th.ink }]}>{h}</Text>
        {!!sub && <Text style={[s.sub, { color: th.muted }]}>{sub}</Text>}
      </View>
      <Tap onPress={() => router.push("/settings")} hitSlop={12} style={[s.o, { borderColor: th.line, backgroundColor: th.bg }]}>
        <Icon name="gear" size={20} color={th.ink} />
      </Tap>
    </View>
  );
  const header = (
      <>
        {/* Swipe the header left/right to switch day / week / month (wraps around); the grids below keep their own swipes. */}
        <Swipe stepKey={VIEWS.indexOf(view)} onStep={(d) => setView(VIEWS[(VIEWS.indexOf(view) + d + 3) % 3])}>
        {firstRun ? first(t("hello"), `${weekday(sel)}, ${dm(sel)}`, t("nothingYet")) : first(head.hello, head.h, head.n)}
        <Reanimated.View entering={fadeIn} style={s.tabs}>
          <View style={s.tabL}>
            {VIEWS.map((v) => (
              <Tap key={v} onPress={() => setView(v)} hitSlop={10} style={{ paddingVertical: 12 }}>
                <Text style={{ fontSize: 17, fontFamily: ff(view === v ? "600" : "500"), color: view === v ? th.ink : th.muted }}>{t(v === "day" ? "tabDay" : v === "week" ? "tabWeek" : "tabMonth")}</Text>
                {view === v && <Reanimated.View entering={ZoomIn.springify()} exiting={ZoomOut.duration(120)} style={[s.tabDot, { backgroundColor: th.seal }]} />}
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
    <SafeAreaView style={[s.root, { backgroundColor: th.bg }]}>
      {busy ? (
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
              {briefOn ? (story ? <Story moves={moves} now={now} onClose={closeStory} /> : <Brief moves={moves} now={now} onOpen={() => setStory(true)} />) : sunOn ? <Weekly title={wk!.title} sub={wk!.sub} onPress={() => setView("rhythm")} /> : cardView}
            </Reanimated.View>
          )}
          {view === "rhythm" && mind && <Rhythm i={mind.i} rules={mind.rules} onForget={async (x) => { const r = await removeRule(x.id); say(r.toast, r); refresh(); }} />}
          {(view === "week" || view === "month") && (
            <Reanimated.View key={view} entering={fadeIn}>
              {view === "week"
                ? <Week tasks={tasks} hols={hols} now={now} monday={mon} selected={sel} onSelect={setSel} onStep={stepWeek} />
                : <Month tasks={tasks} hols={hols} now={now} selected={sel} onSelect={setSel} onStep={stepMonth} />}
            </Reanimated.View>
          )}
          {firstRun ? <First onSchool={() => router.push("/settings")} /> : !showStory && view !== "rhythm" && (
            <Reanimated.View entering={fadeIn} exiting={fadeOut} layout={glide} style={{ marginTop: empty === "rest" ? 0 : empty === "week" ? 0 : 28 }}>
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
      <View style={s.dock} pointerEvents="box-none"><Hold state={state} onStart={() => { if (!latched.current) void start(); }} onEnd={() => { latched.current = false; void end(); }} idle={view === "rhythm" ? "holdRule" : "hold"} /></View>
      {busy && lines.length > 0 && <Steps lines={lines} />}
      {menu && <RowMenu items={seriesItems(menu.task)} top={menu.top} onClose={() => setMenu(undefined)} />}
      {toast && <Toast key={`${toast.text}|${toast.sub ?? ""}`} error={toast.error} text={toast.text} sub={toast.sub} onAction={toast.action?.run} actionLabel={toast.action?.label} onAlt={toast.alt?.run} altLabel={toast.alt?.label} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  pad: { padding: space.gutter, paddingTop: 24 },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 },
  h: { fontSize: font.h, lineHeight: 36, fontFamily: ff("600"), letterSpacing: -0.7, marginTop: 2 },
  sub: { marginTop: 6, fontFamily: ff(), fontSize: font.md },
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 2 },
  tabs: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }, // text and the Nhịp pill share a centre line
  tabL: { flexDirection: "row", gap: 28 },
  mind: { flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 99, borderWidth: 1 }, // .mind in magic.html
  tabDot: { position: "absolute", bottom: 0, left: "50%", width: 5, height: 5, marginLeft: -2.5, borderRadius: 3 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
