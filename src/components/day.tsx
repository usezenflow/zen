import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type ScrollViewInstance } from "react-native";
import { GestureDetector, ScrollView, usePanGesture } from "react-native-gesture-handler";
import Animated, { clamp, Easing, FadeInDown, FadeInUp, interpolate, Extrapolation, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, Logo } from "@/components/art";
import { addDays, keptOn, keptSpan, live, mondayOf, onDay, shown, type Hols } from "@/components/cal";
import type { Item } from "@/components/menu";
import { Row, subOf } from "@/components/row";
import { fadeIn, fadeOut, glide, Tap, settle, EASE } from "@/components/tap";
import { Stripes } from "@/components/week";
import { t } from "@/lib/i18n";
import type { Overlap } from "@/lib/overlap";
import { useTheme, font, space, ff, motion } from "@/lib/theme";
import type { Move, Rule, Task, Warn } from "@/lib/types";
import { day as dayName, when } from "@/lib/when";
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
function Peek({ label, side, pull, at, style }: { label: string; side: 1 | -1; pull: SharedValue<number>; at: number; style: object }) {
  const th = useTheme();
  const box = useAnimatedStyle(() => {
    const p = pull.get(), grow = interpolate(Math.abs(p), [4, at * 0.35], [0, 1], Extrapolation.CLAMP);
    return { opacity: Math.sign(p) === side ? grow : 0, transform: [{ scale: 0.92 + 0.08 * grow }] };
  });
  const over = () => { "worklet"; return Math.abs(pull.get()) >= at; };
  const wash = useAnimatedStyle(() => ({ opacity: withTiming(over() ? 1 : 0, { duration: 140 }) }));
  const tick = useAnimatedStyle(() => ({ opacity: over() ? 1 : 0, transform: [{ scale: settle(over() ? 1 : 0.4, 160) }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: over() ? 0 : 1 }));
  const labelStyle = useAnimatedStyle(() => ({ color: over() ? "#fff" : th.bg })); // white on vermilion (ui.css .peek.done)
  const ring = useAnimatedProps(() => ({ strokeDasharray: `${RING_C * clamp(Math.abs(pull.get()) / at, 0, 1)} ${RING_C}` }));
  return (
    <Animated.View pointerEvents="none" style={[s.peek, style, box, { backgroundColor: th.ink }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 99, backgroundColor: th.seal }, wash]} />
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
  const pull = useSharedValue(0), anchor = useSharedValue(0), fade = useSharedValue(1), crossed = useSharedValue(false);
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
    onActivate: () => { "worklet"; anchor.set(0); },
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
        <Peek label={prevLabel} side={1} pull={pull} at={at} style={{ top: insets.top + 8 }} />
        <Peek label={nextLabel} side={-1} pull={pull} at={at} style={{ bottom: 150 }} />
      </View>
    </GestureDetector>
  );
}

/** Right chevron that springs a quarter turn down when open. */
export function Chevron({ open, color, size = 14 }: { open: boolean; color: string; size?: number }) {
  const r = useSharedValue(open ? 90 : 0);
  useEffect(() => { r.set(settle(open ? 90 : 0)); }, [open, r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return <Animated.View style={st}><Icon name="right" size={size} color={color} /></Animated.View>;
}

export type RowActions = {
  onToggle: (x: Task) => void; onTitle: (x: Task, title: string) => void; onTime: (x: Task, at: Date) => void; onOpen: (x: Task) => void; itemsFor: (x: Task) => Item[]; onSwipeDelete: (x: Task, bottom?: number) => void;
};

// The list under the card / week / month: rows, overlap cards, the collapsed Done group.
const mins = (n: number) => (n >= 60 ? t("hoursN", { h: Math.round(n / 60) }) : t("minsN", { n: Math.round(n) }));

// `trail`/`reason`: sub lines by task id, built once per refresh. `moves`: unseen, for ghosts. `warns`: today only.
// "5 việc, 1 tiết học": the done day's count, as the header says it.
const doneCount = (xs: Task[]) => {
  const l = xs.filter((x) => typeOf(x) === "lecture").length, a = xs.length - l;
  return [a ? t("nTasks", { n: a }) : "", l ? t("nLectures", { n: l }) : ""].filter(Boolean).join(", ");
};
// Rows under "Sắp tới" carry their day; an assignment's due line already says it.
const soonSub = (x: Task, now: number) => {
  const ty = typeOf(x), sub = subOf(x, ty, now);
  return ty === "assignment" && x.deadline !== undefined ? sub : [dayName(x.start!, now), sub].filter(Boolean).join(", ");
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
  const row = (x: Task, i: number, d = false, g?: Move) => <Row key={x.id} task={x} now={now} first={i === 0} done={d || !live(x)} trail={g ? undefined : trail[x.id]} sub={g ? t("ghostTo", { when: when(g.to, now) }) : reason[x.id]} ghost={!!g} items={g ? undefined : act.itemsFor(x)} onDelete={g ? undefined : () => act.onSwipeDelete(x)} onSeries={(b) => act.onSwipeDelete(x, b)} onToggle={() => act.onToggle(x)} onTitle={(v) => act.onTitle(x, v)} onTime={(a) => act.onTime(x, a)} onOpen={() => act.onOpen(x)} />;
  const rowAt = ({ x, g }: (typeof rows)[number], i: number) => (
          // Wrapper outside the row's HoldMenu: inserts, moves to Done, undo and re-sorts glide instead of jumping. A moved row arrives with a lift.
          <Animated.View key={g ? `g${x.id}` : x.id} entering={trail[x.id] && !g ? FadeInUp.duration(220).easing(EASE) : fadeIn} exiting={fadeOut} layout={glide}>
            {row(x, i, false, g)}
            {overlaps.filter((o) => (o.mine.start! >= o.fixed.start! ? o.mine.id : o.fixed.id) === x.id).map((o) => (
              <Animated.View key={o.mine.id + o.fixed.id} entering={FadeInDown.duration(220).easing(EASE)} exiting={fadeOut} layout={glide} style={[s.warn, { borderColor: th.seal }]}>
                <Text style={[s.wt, { color: th.seal }]}>{t("clash")}</Text>
                <Text style={[s.wb, { color: th.muted }]}>{t("clashBody", { a: o.fixed.title, b: o.mine.title })}</Text>
                <View style={s.pills}>
                  <Tap onPress={() => onMove(o)} style={[s.pl, { backgroundColor: th.ink }]}><Text style={[s.plt, { color: th.bg, fontFamily: ff("700") }]}>{t("overlapMine")}</Text></Tap>
                  <Tap onPress={() => onKeep(o)} style={[s.pl, { borderColor: th.line, borderWidth: 1 }]}><Text style={[s.plt, { color: th.ink }]}>{t("overlapKeep")}</Text></Tap>
                </View>
              </Animated.View>
            ))}
          </Animated.View>
  );
  return (
    <View>
      {warns.map((w) => (
        <Animated.View key={w.id} entering={FadeInDown.duration(220).easing(EASE)} exiting={fadeOut} layout={glide} style={[s.warn, { borderColor: th.seal, marginTop: 14, marginBottom: 6 }]}>
          <Text style={[s.wt, { color: th.seal }]}>{t("warnTitle", { title: w.title })}</Text>
          <Text style={[s.wb, { color: th.muted }]}>{t("warnBody", { need: mins(w.need), when: when(w.deadline, now), free: mins(w.free) })}</Text>
          <View style={s.pills}>
            {w.fixes.map((f, i) => (
              <Tap key={f.id} onPress={() => onFix(w, f)} style={[s.pl, i === 0 ? { backgroundColor: th.ink } : { borderColor: th.line, borderWidth: 1 }]}>
                <Text style={[s.plt, i === 0 ? { color: th.bg, fontFamily: ff("700") } : { color: th.ink }]}>{t("warnFix", { title: f.title, day: dayName(f.start, now) })}</Text>
              </Tap>
            ))}
          </View>
        </Animated.View>
      ))}
      {!!label && !(isEmpty && empty !== "inl") && <Text style={[s.lab, { color: th.muted }]}>{label}</Text>}
      <View style={{ marginTop: 6 }}>
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
                <Row key={x.id} task={x} now={now} first={i === 0} done={false} sub={next.dated ? soonSub(x, now) : undefined} items={act.itemsFor(x)} onDelete={() => act.onSwipeDelete(x)} onSeries={(b) => act.onSwipeDelete(x, b)} onToggle={() => act.onToggle(x)} onTitle={(v) => act.onTitle(x, v)} onTime={(a) => act.onTime(x, a)} onOpen={() => act.onOpen(x)} />
              ))}</View>
            </>
          )}
        </Animated.View>
      )}
      {done.length > 0 && (
        <Animated.View entering={fadeIn} layout={glide}>
          <Tap onPress={() => setOpen(!open)} style={s.lab2} scale={0.98}>
            <Text style={[s.lab, { color: th.muted }]}>{t("doneN", { n: done.length })}</Text>
            <Chevron open={open} color={th.muted} />
          </Tap>
        </Animated.View>
      )}
      {open && done.map((x, i) => <Animated.View key={x.id} entering={fadeIn} exiting={fadeOut} layout={glide}>{row(x, i, true)}</Animated.View>)}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: space.gutter, paddingTop: 24, paddingBottom: 200 },
  peek: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, height: 36, paddingLeft: 10, paddingRight: 16, borderRadius: 99, overflow: "hidden", zIndex: 15 },
  pr: { width: 18, height: 18 },
  mid: { alignItems: "center", justifyContent: "center" },
  peekT: { fontSize: font.sub, fontFamily: ff("700") },
  lab: { fontSize: font.label, fontFamily: ff("500") },
  lab2: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 6 },
  warn: { marginTop: 20, padding: 14, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5 },
  kept: { marginTop: 8, minHeight: 56, borderRadius: 16, borderWidth: 1, overflow: "hidden", paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center", alignItems: "flex-start", gap: 2 },
  kt: { fontSize: font.md, fontFamily: ff("600"), paddingHorizontal: 4, borderRadius: 4, overflow: "hidden" },
  ks: { fontSize: font.label, fontFamily: ff("500"), paddingHorizontal: 4, borderRadius: 4, overflow: "hidden" },
  wt: { fontSize: font.meta, fontFamily: ff("700") },
  wb: { marginTop: 4, fontFamily: ff(), fontSize: font.sub, lineHeight: 21 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  pl: { height: 36, paddingHorizontal: 16, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  plt: { fontSize: font.sub, fontFamily: ff("500") },
  rest: { marginTop: 16, borderRadius: 28, padding: 20 },
  restLf: { position: "absolute", top: 18, right: 18 },
  restT: { marginTop: "auto", paddingRight: 58, fontSize: 24, lineHeight: 28, fontFamily: ff("600"), letterSpacing: -0.48 },
  restS: { marginTop: 6, fontSize: 15, lineHeight: 20, fontFamily: ff("500") },
  inl: { marginTop: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 12 },
  inlB: { fontSize: 16, fontFamily: ff("600") },
  inlS: { marginTop: 2, fontSize: 14, fontFamily: ff("500") },
  say: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, borderStyle: "dashed" },
  sayT: { flex: 1, fontSize: 15, fontFamily: ff("500") },
});
