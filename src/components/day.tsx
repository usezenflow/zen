import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type ScrollViewInstance } from "react-native";
import { GestureDetector, ScrollView, usePanGesture } from "react-native-gesture-handler";
import Animated, { clamp, Easing, FadeInDown, FadeInUp, interpolate, Extrapolation, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, Logo } from "@/components/art";
import { addDays, carried, hhmm, keptOn, keptSpan, live, mondayOf, onDay, shown, startOfDay, type Hols } from "@/components/cal";
import type { Item } from "@/components/menu";
import { Row, subOf } from "@/components/row";
import { repeatText } from "@/components/detail-html";
import { found, parse, PART_VI, type Query } from "@/lib/find";
import { fadeIn, fadeOut, glide, Tap, settle, EASE } from "@/components/tap";
import { Stripes } from "@/components/week";
import { t } from "@/lib/i18n";
import type { Overlap } from "@/lib/overlap";
import { useTheme, font, space, ff, motion } from "@/lib/theme";
import type { Move, Rule, Task, Warn } from "@/lib/types";
import { dayLabel, day as dayName, when } from "@/lib/when";
import { typeOf } from "@/planner";

// COMMIT is far enough that the ring visibly fills before the check (~170px of finger travel).
const PULL_MAX = 140, COMMIT = 56, RING_C = 2 * Math.PI * 7;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Finger drag to content pull: near linear at first, asymptote at PULL_MAX (day-pull.tsx in zenflow). */
function rubberBand(x: number) {
  "worklet";
  return Math.sign(x) * PULL_MAX * (1 - 1 / ((Math.abs(x) * 0.55) / PULL_MAX + 1));
}
/** -1 previous (pulled down), 1 next (pulled up), 0 snap back. A quick flick commits past a small pull. */
function pullStep(pull: number, vy: number, at: number): -1 | 0 | 1 {
  "worklet";
  const a = Math.abs(pull);
  return a >= at || (Math.abs(vy) > 900 && a > at * 0.6) ? (pull > 0 ? -1 : 1) : 0;
}

// Peek pill (views.html .peek): ink pill with a progress ring, vermilion check once past the threshold.
function Peek({ label, side, pull, live, at, style }: { label: string; side: 1 | -1; pull: SharedValue<number>; live: SharedValue<number>; at: number; style: object }) {
  const th = useTheme();
  const box = useAnimatedStyle(() => {
    const p = pull.get(), grow = interpolate(Math.abs(p), [4, at * 0.35], [0, 1], Extrapolation.CLAMP);
    // `live` off once a step commits: the parked content (pull ±0.3 view) must not light the far pill red
    return { opacity: Math.sign(p) === side ? grow * live.get() : 0, transform: [{ scale: 0.92 + 0.08 * grow }] };
  });
  // Each style reads `pull` itself: Reanimated only subscribes to shared values in the worklet's own closure, not a helper's.
  const wash = useAnimatedStyle(() => ({ opacity: withTiming(Math.abs(pull.get()) >= at ? 1 : 0, { duration: 140 }) }));
  const tick = useAnimatedStyle(() => { const o = Math.abs(pull.get()) >= at; return { opacity: o ? 1 : 0, transform: [{ scale: settle(o ? 1 : 0.4, 160) }] }; });
  const ringStyle = useAnimatedStyle(() => ({ opacity: Math.abs(pull.get()) >= at ? 0 : 1 }));
  const labelStyle = useAnimatedStyle(() => ({ color: Math.abs(pull.get()) >= at ? "#fff" : th.bg })); // white on teal (ui.css .peek.done)
  const ring = useAnimatedProps(() => ({ strokeDasharray: `${(RING_C * clamp(Math.abs(pull.get()) / at, 0, 1)).toFixed(2)} ${RING_C}` }));
  return (
    <Animated.View pointerEvents="none" style={[s.peek, style, box, { backgroundColor: th.ink }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 99, backgroundColor: th.art.lecture[1] }, wash]} />
      <View style={s.pr}>
        <Animated.View style={ringStyle}>
          <Svg width={18} height={18} viewBox="0 0 18 18">
            <Circle cx={9} cy={9} r={7} fill="none" stroke={th.bg} strokeOpacity={0.3} strokeWidth={2} />
            <AnimatedCircle cx={9} cy={9} r={7} fill="none" stroke={th.bg} strokeWidth={2} strokeLinecap="round" transform="rotate(-90 9 9)" animatedProps={ring} />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, s.mid, tick]}><Icon name="check" size={18} color="#fff" w={2.4} /></Animated.View>
      </View>
      <Animated.Text style={[s.peekT, labelStyle]}>{label}</Animated.Text>
    </Animated.View>
  );
}

/**
 * Vertical pull at the list edges steps to the previous / next day (zenflow day-pull.tsx, compact).
 * The pan runs beside the native scroll; content rubber-bands, then slides out and the new day slides in.
 */
export function DayPull({ dayKey, onStep, prevLabel, nextLabel, enabled, children }: {
  dayKey: number; onStep: (d: -1 | 1) => void; prevLabel: string; nextLabel: string; enabled: boolean; children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const at = COMMIT;
  const list = useRef<ScrollViewInstance>(null);
  const stepRef = useRef(onStep);
  useEffect(() => { stepRef.current = onStep; });
  const scrollY = useSharedValue(0), contentH = useSharedValue(0), viewH = useSharedValue(0);
  const pull = useSharedValue(0), anchor = useSharedValue(0), fade = useSharedValue(1), crossed = useSharedValue(false), live = useSharedValue(1);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideIn = useCallback(() => {
    if (!pending.current) return;
    clearTimeout(pending.current);
    pending.current = null;
    pull.set(settle(0));
    fade.set(withTiming(1, { duration: motion.fast, easing: Easing.out(Easing.cubic) }));
  }, [pull, fade]);
  // The timeout shows the list again if the parent ignored the step.
  const commit = useCallback((d: -1 | 1) => {
    clearTimeout(pending.current ?? undefined);
    pending.current = setTimeout(slideIn, 600);
    list.current?.scrollTo({ y: 0, animated: false });
    stepRef.current(d);
  }, [slideIn]);
  useEffect(() => slideIn(), [dayKey, slideIn]);
  useEffect(() => () => clearTimeout(pending.current ?? undefined), []);
  const tick = useCallback(() => void Haptics.selectionAsync().catch(() => {}), []);

  const pan = usePanGesture({
    enabled,
    activeOffsetY: [-8, 8],
    failOffsetX: [-12, 12],
    onActivate: () => { "worklet"; anchor.set(0); live.set(1); },
    onUpdate: (e) => {
      "worklet";
      const top = scrollY.get() <= 0, end = scrollY.get() >= contentH.get() - viewH.get() - 1;
      if (!top && !end) anchor.set(e.translationY); // mid-list drags keep the anchor on the finger
      const x = e.translationY - anchor.get();
      pull.set((top && x > 0) || (end && x < 0) ? rubberBand(x) : 0);
      const over = Math.abs(pull.get()) >= at;
      if (over !== crossed.get()) { crossed.set(over); if (over) scheduleOnRN(tick); }
    },
    onDeactivate: (e) => {
      "worklet";
      const step = pullStep(pull.get(), e.velocityY, at);
      if (step === 0) { pull.set(settle(0)); return; }
      live.set(withTiming(0, { duration: 120 }));
      const out = -step * 0.3 * viewH.get();
      fade.set(withTiming(0, { duration: motion.fast, easing: Easing.in(Easing.cubic) }));
      pull.set(withTiming(out, { duration: motion.fast, easing: Easing.in(Easing.cubic) }, (done) => {
        if (!done) return;
        pull.set(-out); // hidden on the far side until the new day renders
        scheduleOnRN(commit, step);
      }));
    },
  });
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: pull.get() }], opacity: fade.get() }));
  return (
    <GestureDetector gesture={pan}>
      <View style={s.fill}>
        <ScrollView
          ref={list} simultaneousWith={pan} bounces={false} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          onScroll={(e) => scrollY.set(e.nativeEvent.contentOffset.y)}
          onLayout={(e) => viewH.set(e.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => contentH.set(h)}
          accessibilityActions={[{ name: "increment", label: nextLabel }, { name: "decrement", label: prevLabel }]}
          onAccessibilityAction={(e) => stepRef.current(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        >
          <Animated.View style={[s.pad, body]}>{children}</Animated.View>
        </ScrollView>
        <Peek label={prevLabel} side={1} pull={pull} live={live} at={at} style={{ top: insets.top + 2 }} />
        <Peek label={nextLabel} side={-1} pull={pull} live={live} at={at} style={{ bottom: 150 }} />
      </View>
    </GestureDetector>
  );
}

/** Right chevron that springs a quarter turn down when open; `down` starts pointing down and flips up (the Done group, views.html). */
export function Chevron({ open, color, size = 14, down }: { open: boolean; color: string; size?: number; down?: boolean }) {
  const turn = down ? 180 : 90;
  const r = useSharedValue(open ? turn : 0);
  useEffect(() => { r.set(settle(open ? turn : 0)); }, [open, r, turn]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get().toFixed(2)}deg` }] }));
  return <Animated.View style={st}><Icon name={down ? "down" : "right"} size={size} color={color} /></Animated.View>;
}

export type RowActions = {
  onToggle: (x: Task) => void; onTitle: (x: Task, title: string) => void; onTime: (x: Task, at: Date) => void; onOpen: (x: Task) => void; itemsFor: (x: Task) => Item[]; onHold: (x: Task, bottom: number, top: number) => void; lifted?: string; onSwipeDelete: (x: Task, bottom?: number, top?: number) => void;
};

// The list under the card / week / month: rows, overlap cards, the collapsed Done group.
// 90 -> "1h30p", 100 -> "1h45p": quarter hours.
const mins = (n: number) => {
  const q = Math.round(n / 15) * 15, h = Math.floor(q / 60), m = q % 60;
  return h === 0 ? t("minsN", { n: Math.max(15, q) }) : m === 0 ? t("hoursN", { h }) : m === 30 ? t("hoursHalf", { h }) : t("hoursMins", { h, n: m });
};

// `trail`/`reason`: sub lines by task id, built once per refresh. `moves`: unseen, for ghosts. `warns`: today only.
// "5 việc, 1 tiết học": the done day's count, as the header says it.
const doneCount = (xs: Task[]) => {
  const l = xs.filter((x) => typeOf(x) === "lecture").length, a = xs.length - l;
  return [a ? t("nTasks", { n: a }) : "", l ? t("nLectures", { n: l }) : ""].filter(Boolean).join(", ");
};
// Rows under "Sắp tới" carry their day; an assignment's due line already says it.
const soonSub = (x: Task, now: number, all: Task[]) => {
  const ty = typeOf(x), sub = subOf(x, ty, now, all);
  // Every row says which day it is on (the list spans days): "T2, Hạn 23:00", and a deadline on another day carries its own date.
  return [x.start !== undefined ? dayName(x.start, now) : undefined, sub].filter(Boolean).join(", ");
};

/** .rest in views.html: takes the art card's slot so the layout never collapses. */
export function RestCard({ lab, title, sub, leaf = "line", h = 220 }: { lab?: string; title: string; sub: string; leaf?: "line" | "color"; h?: number }) {
  const th = useTheme();
  return (
    <View style={[s.rest, { height: h, backgroundColor: th.chip }]}>
      {!!lab && <Text style={[s.lab, { color: th.muted }]}>{lab}</Text>}
      <View style={s.restLf}><Logo size={52} mode={leaf} color={th.ink} /></View>
      <Text style={[s.restT, { color: th.ink }]}>{title}</Text>
      <Text style={[s.restS, { color: th.muted }]}>{sub}</Text>
    </View>
  );
}

/** .inl in views.html: a small note in place of rows. */
function Inl({ title, sub }: { title: string; sub?: string }) {
  const th = useTheme();
  return (
    <View style={[s.inl, { backgroundColor: th.chip }]}>
      <Logo size={34} mode="line" color={th.ink} />
      <View style={{ flex: 1 }}>
        <Text style={[s.inlB, { color: th.ink }]}>{title}</Text>
        {!!sub && <Text style={[s.inlS, { color: th.muted }]}>{sub}</Text>}
      </View>
    </View>
  );
}

/** First launch (views.html "Day, first launch"): the space teaches, three lines you could say and the school link. */
export function First({ onSchool }: { onSchool: () => void }) {
  const th = useTheme();
  return (
    <Animated.View entering={fadeIn}>
      <RestCard lab={t("startLab")} title={t("startT")} sub={t("startSub")} h={168} />
      <Text style={[s.lab, { color: th.muted, marginTop: 22 }]}>{t("trySay")}</Text>
      <View style={{ marginTop: 10, gap: 8 }}>
        {(["try1", "try2", "try3"] as const).map((k) => (
          <View key={k} style={[s.say, { borderColor: th.line }]}>
            <Icon name="mic" size={18} color={th.ink} w={2} />
            <Text style={[s.sayT, { color: th.muted }]}>“<Text style={{ color: th.ink, fontFamily: ff("600") }}>{t(k)}</Text>”</Text>
          </View>
        ))}
      </View>
      <Tap onPress={onSchool} style={[s.lab2, { marginTop: 22 }]} scale={0.98} accessibilityRole="link">
        <Text style={[s.lab, { color: th.muted }]}>{t("fromSchool")}</Text>
        <Icon name="right" size={14} color={th.muted} />
      </Tap>
    </Animated.View>
  );
}

export const TYPE_KEY = { exam: "gotExam", lecture: "gotLecture", assignment: "gotAssignment", busy: "gotBusy", plan: "gotPlan" } as const;
const STATUS_KEY = { live: "gotLive", done: "gotDone", late: "gotLate" } as const;
/** views.html "Search, understood": the filters Zen read, as one muted line ("Bài thi · 23 đến 29/11"). Words alone say nothing. */
export function gotLine(q: Query, now: number) {
  const today = startOfDay(now), dm = (ms: number) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };
  const dayText = ([a, b]: [number, number]) => {
    if (b === addDays(a, 1)) return a === today ? t("today") : a === addDays(today, 1) ? t("tomorrow") : a === addDays(today, -1) ? t("yesterday") : dayName(a, now);
    const z = addDays(b, -1);
    return t("rangeTo", { a: new Date(a).getMonth() === new Date(z).getMonth() ? new Date(a).getDate() : dm(a), b: dm(z) });
  };
  return [
    ...[...new Set(q.types.map((c) => c.type))].map((ty) => t(TYPE_KEY[ty])),
    ...q.days.map((r) => (q.due ? t("gotDue", { d: dayText(r) }) : dayText(r))),
    q.due && !q.days.length ? t("gotDueAny") : "",
    q.part ? t("gotPart", { p: PART_VI[q.part.key] ?? q.part.key }) : "",
    q.at !== undefined ? t("gotAt", { t: hhmm(new Date(2000, 0, 1, 0, q.at).getTime()) }) : "",
    q.status ? t(STATUS_KEY[q.status]) : "",
    q.repeat ? t("gotRepeat") : "",
  ].filter(Boolean).join(" · ");
}

/** views.html "Search": the query read like a spoken line; matching rows by day, one per series, matched words tinted. */
export function Found({ tasks, q: raw, now, ...act }: RowActions & { tasks: Task[]; q: string; now: number }) {
  const th = useTheme();
  if (!raw.trim()) return null;
  const q = parse(raw, now), today = startOfDay(now), groups = found(tasks, q, now), got = gotLine(q, now);
  // A said repeat names its cadence (its detail's repeat line); a prep its sitting; the rest keep the day view's sub.
  const subFor = (x: Task) => x.rrule && !x.section ? repeatText(x.rrule, x.start!) : x.forId ? subOf(x, "plan", now, tasks) : undefined;
  return (
    <>
      {!!got && <Text style={[s.got, { color: th.muted }]}>{got}</Text>}
      {!groups.length && <Inl title={t("noFound")} sub={t("noFoundSub")} />}
      {groups.map((g, k) => (
        <View key={g.day}>
          <Text style={[s.lab, { color: th.muted, marginTop: k ? 24 : got ? 22 : 28 }]}>{g.day === today ? t("today") : dayLabel(g.day)}</Text>
          <View style={{ marginTop: 6 }}>{g.xs.map((x, i) => (
            <Row key={x.id} task={x} now={now} first={i === 0 || g.xs[i - 1].id === act.lifted} done={!live(x)} hl={q} sub={subFor(x)} lifted={act.lifted === x.id} onHold={act.itemsFor(x).length ? (b, t) => act.onHold(x, b, t) : undefined} onDelete={() => act.onSwipeDelete(x)} onSeries={(b, t) => act.onSwipeDelete(x, b, t)} onToggle={() => act.onToggle(x)} onTitle={(v) => act.onTitle(x, v)} onTime={(a) => act.onTime(x, a)} onOpen={() => act.onOpen(x)} />
          ))}</View>
        </View>
      ))}
    </>
  );
}

// `empty`: what an empty day shows (views.html). rest: the art slot's card plus what's next; week: the whole week is empty; inl: a small note in place of rows.
export function Day({ tasks, hols, day, now, pop, overlaps, label, empty = "inl", onMove, onKeep, trail, reason, moves, warns, onFix, rules = [], ...act }: RowActions & {
  tasks: Task[]; hols: Hols; day: number; now: number; pop: Set<string>; overlaps: Overlap[]; label?: string; empty?: "rest" | "inl" | "week"; onMove: (o: Overlap) => void; onKeep: (o: Overlap) => void; rules?: Rule[];
  trail: Record<string, string>; reason: Record<string, string>; moves: Move[]; warns: Warn[]; onFix: (w: Warn, f: Warn["fixes"][number]) => void;
}) {
  const th = useTheme();
  const [open, setOpen] = useState(false);
  const end = day + 86400_000;
  const live_ = onDay(tasks, day);
  const real = [...live_, ...tasks.filter((x) => pop.has(x.id) && x.start! >= day && x.start! < end && !live_.includes(x))];
  // Ghost: moved off this day, left at its old time saying where it went.
  const ghosts = moves.filter((m) => m.from >= day && m.from < end && (m.to < day || m.to >= end) && !real.some((x) => x.id === m.id)).flatMap((m) => {
    const x = tasks.find((a) => a.id === m.id);
    return x && !x.deletedAt && !x.doneAt ? [{ x: { ...x, start: m.from }, g: m }] : [];
  });
  const rows = [...real.map((x) => ({ x, g: undefined as Move | undefined })), ...ghosts].sort((a, b) => a.x.start! - b.x.start!);
  // A spoken "để trống" window, striped in time order among the rows (magic.html 9: the kept evening shows as stripes).
  const kept = hols.has(day) ? [] : keptOn(rules, day);
  const keptBefore = (i: number) => kept.filter((r) => day + r.from * 60_000 <= (rows[i]?.x.start ?? Infinity) && (i === 0 || day + r.from * 60_000 > rows[i - 1].x.start!));
  const done = tasks.filter((x) => x.doneAt && !x.deletedAt && !pop.has(x.id) && x.start !== undefined && x.start >= day && x.start < end && !tasks.some((c) => c.parentId === x.id));
  const title = hols.get(day);
  const hol: Task | undefined = title === undefined ? undefined : { id: `hol${day}`, title, kind: "other", source: "user", fixed: "busy", effort: 0, start: day, end: day + 86400_000, createdAt: 0 };
  const isEmpty = !rows.length && !hol;
  const after = (from: number, to = Infinity) => shown(tasks).filter((x) => x.start! >= from && x.start! < to).sort((a, b) => a.start! - b.start!).slice(0, 3);
  const near = isEmpty && empty === "inl" ? after(Math.max(end, now))[0] : undefined;
  const next = !isEmpty || empty === "inl" ? undefined : (() => {
    if (empty === "rest" && done.length) { const xs = onDay(tasks, end).slice(0, 3); if (xs.length) return { lab: t("tomorrow"), xs, dated: false }; }
    if (empty === "week") {
      const cur = addDays(mondayOf(now), 7); // a later week: what's left of this one first
      if (day >= cur) { const xs = after(now, cur); if (xs.length) return { lab: t("weekLeft"), xs, dated: true }; }
      return { lab: t("soon"), xs: after(Math.max(now, addDays(mondayOf(day), 7))), dated: true };
    }
    return { lab: t("soon"), xs: after(Math.max(end, now)), dated: true };
  })();
  // views.html "Day, assignment sittings": a split assignment's next sitting after this day, under its own day label.
  const later = [...new Set(real.map((x) => x.parentId).filter(Boolean))]
    .flatMap((p) => tasks.filter((x) => x.parentId === p && live(x) && x.start !== undefined && x.start >= end).sort((a, b) => a.start! - b.start!).slice(0, 1));
  const sitDay = later.length ? startOfDay(Math.min(...later.map((x) => x.start!))) : undefined;
  const sits = sitDay === undefined ? [] : later.filter((x) => startOfDay(x.start!) === sitDay).sort((a, b) => a.start! - b.start!);
  // a row under the lifted one drops its separator: the line would cut across the raised card
  const row = (x: Task, i: number, d = false, g?: Move, prev?: Task) => <Row key={x.id} task={x} now={now} tm={carried(x, day, t("allDay"), t("toWord"))} first={i === 0 || prev?.id === act.lifted} done={d || !live(x)} trail={g ? undefined : trail[x.id]} sub={g ? t("ghostTo", { when: when(g.to, now) }) : x.forId ? subOf(x, "plan", now, tasks) : reason[x.id]} ghost={!!g} lifted={act.lifted === x.id} onHold={g || !act.itemsFor(x).length ? undefined : (b, t) => act.onHold(x, b, t)} onDelete={g ? undefined : () => act.onSwipeDelete(x)} onSeries={(b, t) => act.onSwipeDelete(x, b, t)} onToggle={() => act.onToggle(x)} onTitle={(v) => act.onTitle(x, v)} onTime={(a) => act.onTime(x, a)} onOpen={() => act.onOpen(x)} />;
  const rowAt = ({ x, g }: (typeof rows)[number], i: number) => (
          // Wrapper outside the row's HoldMenu: inserts, moves to Done, undo and re-sorts glide instead of jumping. A moved row arrives with a lift.
          <Animated.View key={g ? `g${x.id}` : x.id} entering={trail[x.id] && !g ? FadeInUp.duration(220).easing(EASE) : fadeIn} exiting={fadeOut} layout={glide}>
            {row(x, i, false, g, rows[i - 1]?.x)}
            {overlaps.filter((o) => (o.mine.start! >= o.fixed.start! ? o.mine.id : o.fixed.id) === x.id).map((o) => (
              <Animated.View key={o.mine.id + o.fixed.id} entering={FadeInDown.duration(220).easing(EASE)} exiting={fadeOut} layout={glide} style={[s.warn, { borderColor: th.seal }]}>
                <Text style={[s.wt, { color: th.seal }]}>{t("clash")}</Text>
                <Text style={[s.wb, { color: th.muted }]}>{t("clashBody", { a: o.fixed.title, b: o.mine.title })}</Text>
                <View style={s.pills}>
                  <Tap onPress={() => onMove(o)} style={[s.pl, { backgroundColor: th.ink }]}><Text numberOfLines={1} style={[s.plt, { color: th.bg, fontFamily: ff("700") }]}>{t("overlapMine")}</Text></Tap>
                  <Tap onPress={() => onKeep(o)} style={[s.pl, { borderColor: th.line, borderWidth: 1 }]}><Text numberOfLines={1} style={[s.plt, { color: th.ink }]}>{t("overlapKeep")}</Text></Tap>
                </View>
              </Animated.View>
            ))}
          </Animated.View>
  );
  return (
    <View>
      {warns.map((w, k) => {
        const late = w.deadline <= now, own = tasks.find((x) => x.id === w.id), vars = { title: w.title, need: mins(w.need), when: when(w.deadline, now), free: mins(w.free) };
        // Past due: pushing others can't help, so the one tap is "done" (often it was handed in already).
        const pills = late ? (own ? [{ key: "done", label: t("warnDone"), go: () => act.onToggle(own) }] : [])
          : w.fixes.map((f) => ({ key: f.id, label: t("warnFix", { title: f.title, day: dayName(f.start, now) }), go: () => onFix(w, f) }));
        return (
          <Animated.View key={w.id} entering={FadeInDown.duration(220).easing(EASE)} exiting={fadeOut} layout={glide} style={[s.warn, { borderColor: th.seal, marginTop: k ? 10 : 0 }]}>
            {/* The words open the task, so it can be found, done or deleted from the card. */}
            <Tap onPress={own ? () => act.onOpen(own) : undefined} disabled={!own} scale={0.98} accessibilityRole="button">
              <Text style={[s.wt, { color: th.seal }]}>{t(late ? "warnLate" : "warnTitle", vars)}</Text>
              <Text style={[s.wb, { color: th.muted }]}>{t(late ? "warnLateBody" : w.free < 15 ? "warnFull" : "warnBody", vars)}</Text>
            </Tap>
            {pills.length > 0 && (
              <View style={[s.pills, s.blk]}>
                {pills.map((p, i) => (
                  <Tap key={p.key} onPress={p.go} style={[s.pl, s.plBlk, i === 0 ? { backgroundColor: th.ink } : { borderColor: th.line, borderWidth: 1 }]}>
                    <Text numberOfLines={1} style={[s.plt, i === 0 ? { color: th.bg, fontFamily: ff("700") } : { color: th.ink }]}>{p.label}</Text>
                  </Tap>
                ))}
              </View>
            )}
          </Animated.View>
        );
      })}
      {!!label && !(isEmpty && empty !== "inl") && <Text style={[s.lab, { color: th.muted }, warns.length > 0 && { marginTop: 26 }]}>{label}</Text>}
      <View style={{ marginTop: hol || rows.length ? 6 : 0 }}>
        {hol && <Row task={hol} now={now} first allDay done={false} onToggle={() => {}} onTitle={() => {}} onTime={() => {}} onOpen={() => {}} />}
        {[...rows, undefined].map((r, i) => keptBefore(i).map((k) => (
          <Animated.View key={`k${k.id}`} entering={fadeIn} exiting={fadeOut} layout={glide} style={[s.kept, { borderColor: th.line }]} accessibilityLabel={`${k.text}, ${keptSpan(k)}`}>
            <Stripes color={th.line} />
            <Text style={[s.kt, { color: th.ink, backgroundColor: th.bg }]}>{k.text}</Text>
            <Text style={[s.ks, { color: th.muted, backgroundColor: th.bg }]}>{keptSpan(k)}</Text>
          </Animated.View>
        )).concat(r ? [rowAt(r, i)] : []))}
      </View>
      {isEmpty && (
        <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}>
          {empty === "rest" && <RestCard lab={label} title={t(done.length ? "allDoneT" : "freeDay")} sub={done.length ? t("allDoneSub", { n: doneCount(done) }) : t("freeSub")} leaf={done.length ? "color" : "line"} />}
          {empty === "week" && <Inl title={t("weekFree")} sub={t("weekFreeSub")} />}
          {empty === "inl" && <Inl title={t("noTasks")} sub={near ? t("nearest", { when: when(near.start!, now), title: near.title }) : undefined} />}
          {next && next.xs.length > 0 && (
            <>
              <Text style={[s.lab, { color: th.muted, marginTop: empty === "week" ? 24 : 28 }]}>{next.lab}</Text>
              <View style={{ marginTop: 6 }}>{next.xs.map((x, i) => (
                <Row key={x.id} task={x} now={now} first={i === 0 || next.xs[i - 1].id === act.lifted} done={false} sub={next.dated ? soonSub(x, now, tasks) : x.forId ? subOf(x, "plan", now, tasks) : undefined} lifted={act.lifted === x.id} onHold={act.itemsFor(x).length ? (b, t) => act.onHold(x, b, t) : undefined} onDelete={() => act.onSwipeDelete(x)} onSeries={(b, t) => act.onSwipeDelete(x, b, t)} onToggle={() => act.onToggle(x)} onTitle={(v) => act.onTitle(x, v)} onTime={(a) => act.onTime(x, a)} onOpen={() => act.onOpen(x)} />
              ))}</View>
            </>
          )}
        </Animated.View>
      )}
      {sits.length > 0 && (
        <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}>
          <Text style={[s.lab, { color: th.muted, marginTop: 28 }]}>{dayName(sits[0].start!, now)}</Text>
          <View style={{ marginTop: 6 }}>{sits.map((x, i) => row(x, i, false, undefined, sits[i - 1]))}</View>
        </Animated.View>
      )}
      {done.length > 0 && (
        <Animated.View entering={fadeIn} layout={glide}>
          <Tap onPress={() => setOpen(!open)} style={s.lab2} scale={0.98}>
            <Text style={[s.lab, { color: th.muted }]}>{t("doneN", { n: done.length })}</Text>
            <Chevron down open={open} color={th.muted} />
          </Tap>
        </Animated.View>
      )}
      {open && done.map((x, i) => <Animated.View key={x.id} entering={fadeIn} exiting={fadeOut} layout={glide}>{row(x, i, true, undefined, done[i - 1])}</Animated.View>)}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: space.gutter, paddingTop: 0, paddingBottom: 200 }, // .scr: the safe area stands in for its 54px top
  peek: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, height: 36, paddingLeft: 10, paddingRight: 16, borderRadius: 99, overflow: "hidden", zIndex: 15 },
  pr: { width: 18, height: 18 },
  mid: { alignItems: "center", justifyContent: "center" },
  peekT: { fontSize: font.sub, fontFamily: ff("700") },
  lab: { fontSize: font.label, fontFamily: ff("500") },
  lab2: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 6 },
  warn: { marginTop: 20, padding: 14, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5 },
  kept: { marginTop: 8, minHeight: 56, borderRadius: 16, borderWidth: 1, overflow: "hidden", paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center", alignItems: "flex-start", gap: 2 },
  kt: { fontSize: font.md, fontFamily: ff("600"), paddingHorizontal: 4, borderRadius: 4, overflow: "hidden" },
  ks: { fontSize: 14, fontFamily: ff("500"), paddingHorizontal: 4, borderRadius: 4, overflow: "hidden" },
  wt: { fontSize: font.meta, fontFamily: ff("700") },
  wb: { marginTop: 4, fontFamily: ff(), fontSize: font.sub, lineHeight: 21 },
  pills: { flexDirection: "row", gap: 8, marginTop: 12 }, // one row: a long label shrinks its pill to an ellipsis
  blk: { flexDirection: "column" }, // heads up (magic.html 9): pills name tasks, so each is a full-width block
  plBlk: { alignSelf: "stretch", height: 44, paddingHorizontal: 18 },
  pl: { height: 36, paddingHorizontal: 16, borderRadius: 99, alignItems: "center", justifyContent: "center", flexShrink: 1, minWidth: 0 },
  plt: { fontSize: font.sub, fontFamily: ff("500") },
  rest: { marginTop: 16, borderRadius: 28, padding: 20 },
  restLf: { position: "absolute", top: 18, right: 18 },
  restT: { marginTop: "auto", paddingRight: 58, fontSize: 24, lineHeight: 32, fontFamily: ff("600"), letterSpacing: -0.48 },
  restS: { marginTop: 6, fontSize: 15, lineHeight: 20, fontFamily: ff("500") },
  inl: { marginTop: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 12 },
  inlB: { fontSize: 16, fontFamily: ff("600") },
  inlS: { marginTop: 2, fontSize: 14, fontFamily: ff("500") },
  got: { marginTop: 10, paddingLeft: 16, fontSize: 14, fontFamily: ff("600") }, // views.html .got
  say: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, borderStyle: "dashed" },
  sayT: { flex: 1, fontSize: 15, fontFamily: ff("500") },
});
