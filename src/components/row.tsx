import * as Haptics from "expo-haptics";
import { TimeDial, type Anchor } from "./dial";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Extrapolation, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming, ZoomIn, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, TypeArt, artOf, seedOf } from "@/components/art";
import { hhmm, startOfDay } from "@/components/cal";
import { glide, Hit, Tap, settle, EASE } from "@/components/tap";
import { hits, type Query } from "@/lib/find";
import { t } from "@/lib/i18n";
import { reasonText } from "@/lib/reasons";
import { day, when } from "@/lib/when";
import { useTheme, font, space, ff, motion } from "@/lib/theme";
import type { Task } from "@/lib/types";
import { typeOf } from "@/planner";

// Where a part of the day opens (adapt.ts FROM; the older bounds too, for tasks made before them) -> its name.
const PART_AT: Record<number, string> = { 300: "sáng", 660: "trưa", 720: "chiều", 780: "chiều", 1020: "tối", 1080: "tối", 1320: "đêm" };

// A day's end (exactly midnight after it, or 23:59) is its day: the ms that stands for that day, else undefined.
const dayEnd = (ms: number) => { const d = new Date(ms); return ms === startOfDay(ms) ? ms - 1 : d.getHours() === 23 && d.getMinutes() === 59 ? ms : undefined; };
// "Hạn T2 23/11" at a day's end, no clock; a clock on the start's own day is hhmm; else when().
const dueOf = ({ deadline, start }: Task, now: number) => {
  if (deadline === undefined) return undefined;
  const end = dayEnd(deadline);
  return t("due", { time: end !== undefined ? day(end, now).replace(t("today"), t("today").toLowerCase()) /* "Hạn hôm nay" */ : start !== undefined && startOfDay(start) === startOfDay(deadline) ? hhmm(deadline) : when(deadline, now) });
};
// "Mỗi ngày", "5 buổi/tuần", "Mỗi tuần", then "đến 31/12" from UNTIL. Other rules (every 2 weeks, monthly) have no cadence here.
const cadence = (rrule: string) => {
  const p: Record<string, string | undefined> = Object.fromEntries(rrule.split(";").map((kv) => kv.split("=")));
  const days = p.BYDAY?.split(",").filter(Boolean).length ?? 0;
  if (!["DAILY", "WEEKLY"].includes(p.FREQ ?? "") || (Number(p.INTERVAL) || 1) !== 1) return undefined;
  const base = days ? t("repeatPerWeek", { n: days }) : p.FREQ === "DAILY" ? t("repeatEveryDay") : t("repeatEveryWeek");
  const u = /^(\d{4})(\d\d)(\d\d)/.exec(p.UNTIL ?? "");
  return u ? `${base} · ${t("untilDate", { d: `${+u[3]}/${+u[2]}` })}` : base;
};

// Lectures and exams: room. Assignments: course. Anything with a deadline: "Hạn 23:59" (when() if not the same day).
// An exam prep: "Buổi 1/4 · Mẫu thiết kế", its place among its sittings (from `all`, by time) and the subject; the due is the exam's own row.
// Any other sitting of a split task: "Buổi 2/3 · Hạn T2 23/11".
export function subOf(task: Task, type: string, now: number, all: Task[] = []) {
  const sibs = task.parentId === undefined ? [] : all.filter((x) => x.parentId === task.parentId && !x.deletedAt).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  const pace = sibs.length > 1 ? reasonText({ key: "pace", w: 1, vars: { k: sibs.findIndex((x) => x.id === task.id) + 1, n: sibs.length } }) : undefined;
  if (task.forId) return [pace, task.course].filter(Boolean).join(" · ") || undefined;
  if (pace) return [pace, dueOf(task, now)].filter(Boolean).join(" · ");
  // A repeat's occurrence ends at its day's end: that is no due. Its part of the day ("Buổi sáng") or its cadence shows. A said due ("trước 17h") still shows.
  if (task.rrule && (task.deadline === undefined || dayEnd(task.deadline) !== undefined)) {
    const part = [...new Set((task.tods ?? []).map(([a]) => PART_AT[a]).filter(Boolean))].join(" hoặc ");
    if (type === "lecture" || type === "exam") return task.location ?? (part ? t("gotPart", { p: part }) : undefined);
    if (part) return t("gotPart", { p: part });
    const cad = cadence(task.rrule);
    if (cad) return cad;
  }
  if (type === "lecture" || type === "exam") return task.location;
  return [type === "assignment" ? task.course : undefined, dueOf(task, now)].filter(Boolean).join(", ") || task.location || task.note?.split("\n")[0];
}

const SWIPE = 96;

// views.html "Search": the matched words wear capture's vermilion read tint.
const marked = (title: string, q: Query) => {
  const out: React.ReactNode[] = [];
  let at = 0;
  hits(title, q).forEach(([a, b], i) => { out.push(title.slice(at, a), <Text key={i} style={s.mark}>{title.slice(a, b)}</Text>); at = b; });
  return [...out, title.slice(at)];
};

/** Hold a row and move: it travels to another day of the week or month grid. x, y: the finger in window coordinates, set on the UI thread
 *  for the floating chip; begin, move and end run on JS (end with NaN: let go off any day, or cancelled). */
export type Drag = { x: SharedValue<number>; y: SharedValue<number>; begin: (task: Task) => void; move: (x: number, y: number) => void; end: (x: number, y: number) => void };

/** "+1" / "-1": a time on another day than the list's, small and vermilion (views.html "Day, past midnight"). */
function Over({ n }: { n: number }) {
  const th = useTheme();
  return n ? <Text style={[s.sup, { color: th.seal }]}>{n > 0 ? `+${n}` : `${n}`}</Text> : null;
}

export function Row({ task, now, first, done, allDay, sub: subOver, lead, trail, ghost, tm, hl, lifted, onHold, onDelete, onSeries, onToggle, onTitle, onTime, onEnd, onOpen, drag, on }: {
  task: Task; now: number; first?: boolean; done?: boolean; allDay?: boolean; sub?: string; trail?: string; ghost?: boolean; tm?: string; hl?: Query; // hl: a search query, its matches tinted
  /** A step number in its own column, between the box and the title (an ordered outline). */
  lead?: string;
  /** Long-press: the row lifts (.lift) and the caller drops its menu under the row, or over it when there is no room below. */
  lifted?: boolean; onHold?: (bottom: number, top: number) => void;
  onDelete?: () => void; onSeries?: (bottom: number, top: number) => void; // swipe right: plain task deletes, series asks where the menu goes
  onToggle: () => void; onTitle: (title: string) => void; onTime: (at: Date) => void; onEnd?: (at: Date) => void; onOpen: () => void; drag?: Drag; on?: number /* the list's day, for the start's -1 */;
}) {
  const th = useTheme();
  const [editing, setEditing] = useState(false);
  const [dial, setDial] = useState<"start" | "end">(); // which time's dial is open
  const picking = dial !== undefined;
  const typed = useRef<string | null>(null);
  // Return and losing focus both keep what was typed; an empty title is dropped, not saved.
  const saveTitle = () => {
    const v = (typed.current ?? task.title).trim();
    typed.current = null;
    setEditing(false);
    if (v && v !== task.title) onTitle(v);
  };
  const lastTap = useRef(0), openLater = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tapText = () => {
    const n = Date.now();
    if (n - lastTap.current < 300) { clearTimeout(openLater.current); lastTap.current = 0; setEditing(true); return; }
    lastTap.current = n;
    openLater.current = setTimeout(onOpen, 300);
  };
  useEffect(() => () => clearTimeout(openLater.current), []);
  // The time chip drops zen's dial (views.html "Row, change the time"). Each settled drum is saved at once by onTime; the screen re-plans once it rests.
  const timeBox = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor>();
  const endBox = useRef<ComponentRef<typeof View>>(null);
  // Days from the list's day (the start's own day when not given): +1 on an end past midnight, -1 on a start the day before.
  const base = on ?? (task.start !== undefined ? startOfDay(task.start) : 0);
  const off = (ts?: number) => (ts === undefined ? 0 : Math.round((startOfDay(ts) - base) / 86_400_000));
  const openDial = (which: "start" | "end" = "start") => (which === "end" ? endBox : timeBox).current?.measureInWindow((x, y, w, h) => { setAnchor({ x, y, w, h }); setDial(which); });
  const live = useRef({ task, onTitle });
  useEffect(() => { live.current.task = task; live.current.onTitle = onTitle; });
  useEffect(() => () => {
    const v = typed.current?.trim(); // a title still being typed when the row goes away is kept, as the detail screen does
    if (v && v !== live.current.task.title) live.current.onTitle(v);
  }, []);
  const type = typeOf(task), pal = artOf(task);
  // as the detail screen: campus lectures and exams keep their times (sync would reset the end), done and ghost rows too
  const canTime = task.start !== undefined && !allDay && !tm && !done && !ghost && (task.fixed ? task.fixed === "busy" && task.source !== "dlu" && !task.forId : true);
  // No time yet: nothing to tick. A faded row with the pale "void" art in place of the circle.
  const unset = task.start === undefined && !task.fixed && !allDay && !ghost && !done;
  const check = (type === "plan" || type === "assignment") && !unset;
  // Missed: a checkable task whose block has ended without a tick; vermilion circle and time (views.html "Day, missed").
  // Red only for a real deadline or a said clock (fixed lecture/exam, pinned): a flexible block Zen placed never turns red by the clock alone.
  const late = check && !done && !allDay && ((task.deadline !== undefined && task.deadline <= now) || (!!task.pinned && (task.end ?? Infinity) <= now) || (!!task.fixed && (task.end ?? task.start ?? Infinity) <= now));
  const sub = subOver ?? (allDay ? t("noPlan") : subOf(task, type, now));
  // ui.css .ck.pop then .ck.on: ink, 1.12 and a 7px chip ring for a beat, then settles to chip with an ink check.
  const popV = useSharedValue(0), was = useRef(done);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.12 * popV.get() }], backgroundColor: interpolateColor(popV.get(), [0, 1], [th.chip, th.ink]), boxShadow: `0 0 0 ${(7 * popV.get()).toFixed(2)}px ${th.chip}` }));
  const popInk = useAnimatedStyle(() => ({ opacity: popV.get() }));
  useEffect(() => {
    if (done && !was.current) popV.set(withSequence(withTiming(1, { duration: 110 }), withTiming(1, { duration: 500 }), settle(0, 260)));
    was.current = done;
  }, [done, popV]);
  const lift = useSharedValue(0), prev = useRef(task.start);
  useEffect(() => { // a mounted row whose time changed lifts and settles (.r.fly in magic.html)
    if (prev.current !== task.start && !ghost) lift.set(withSequence(withTiming(1, { duration: 140 }), settle(0, 260)));
    prev.current = task.start;
  }, [task.start, ghost, lift]);
  // .r.fly: a page-colour card bleeding 10px each side, r16, 0 14px 30px -12px rgba(0,0,0,.3); no scale.
  const series = !!(task.section || task.rrule || task.parentId);
  // views.html .lift: page-colour card, r16, scale 1.02, 0 10px 30px -10px rgba(0,0,0,.3), no separator.
  const up = useSharedValue(0);
  useEffect(() => { up.set(settle(lifted ? 1 : 0, 180)); }, [lifted, up]);
  // Raised: a card a step lighter than the page (dark: the chip colour, where a shadow alone is lost on black); at rest no card at all,
  // so the row under a lifted one does not cover its shadow with a rounded patch of page colour.
  const raised = th.dark ? th.chip : "#ffffff", shade = th.dark ? 0.75 : 0.22;
  const liftSt = useAnimatedStyle(() => {
    const u = up.get(), f = lift.get();
    const shadow = u > 0 ? `0 12px 32px -6px rgba(0,0,0,${(shade * u).toFixed(3)})` : `0 14px 30px -12px rgba(0,0,0,${(0.3 * f).toFixed(3)})`; // .r.fly when only moved
    return { transform: [{ scale: 1 + 0.03 * u }], backgroundColor: u > 0 ? interpolateColor(u, [0, 1], [th.bg, raised]) : f > 0 ? th.bg : "transparent", boxShadow: shadow };
  });
  const holdBox = useRef<ComponentRef<typeof View>>(null);
  const hold = () => {
    if (!onHold) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    holdBox.current?.measureInWindow((_x, y, _w, h) => onHold(y + h, y));
  };
  // Drag: the pan wakes after the same 350 ms hold. Let go without moving: the hold menu, as before. Moved past 8 px: a drag.
  const canDrag = !!drag && canTime && !editing && !picking;
  const live2 = useRef({ drag, hold, task });
  useEffect(() => { live2.current = { drag, hold, task }; });
  const moved = useSharedValue(false), held = useSharedValue(0);
  const dBegin = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); live2.current.drag?.begin(live2.current.task); };
  const dMove = (x: number, y: number) => live2.current.drag?.move(x, y);
  const dEnd = (x: number, y: number) => live2.current.drag?.end(x, y);
  const dHold = () => live2.current.hold();
  const dx = drag?.x, dy = drag?.y;
  const pan = usePanGesture({
    enabled: canDrag,
    activateAfterLongPress: 350,
    onActivate: () => { "worklet"; held.set(withTiming(1, { duration: 120 })); },
    onUpdate: (e) => {
      "worklet";
      if (!moved.get() && Math.hypot(e.translationX, e.translationY) > 8) { moved.set(true); scheduleOnRN(dBegin); }
      if (!moved.get()) return;
      dx?.set(e.absoluteX); dy?.set(e.absoluteY);
      scheduleOnRN(dMove, e.absoluteX, e.absoluteY);
    },
    onDeactivate: (e) => {
      "worklet";
      if (moved.get()) { moved.set(false); scheduleOnRN(dEnd, e.canceled ? NaN : e.absoluteX, e.canceled ? NaN : e.absoluteY); } else if (!e.canceled) scheduleOnRN(dHold);
    },
    onFinalize: () => {
      "worklet";
      held.set(withTiming(0, { duration: 160 }));
      if (moved.get()) { moved.set(false); scheduleOnRN(dEnd, NaN, NaN); } // cancelled mid-drag: nothing moves
    },
  });
  const heldSt = useAnimatedStyle(() => ({ opacity: 1 - 0.55 * held.get() })); // the row stays as a faint place-holder while its chip travels
  const longPress = onHold && !picking && !canDrag ? hold : undefined; // with a drag the pan owns the hold
  const ring = task.source === "dlu" && type === "lecture"; // campus lecture: glow ring
  const subEl = !!(trail || sub) && (
    <View style={s.sl}>
      {!!trail && <View style={[s.dot, { backgroundColor: th.seal }]} />}
      <Text numberOfLines={1} style={[s.small, s.slt, { color: th.muted }]}>{ghost && <Text style={{ color: th.seal }}>● </Text>}{trail ?? sub}</Text>
    </View>
  );
  const body = (
    <Tap variant="row" onPress={picking ? undefined : onOpen} onLongPress={longPress} delayLongPress={350} style={[s.r, (ghost || unset) && { opacity: unset ? 0.55 : 0.45 }]}>
      {ghost ? (
        <View style={[s.ck, { borderColor: th.line, borderStyle: "dashed" }]} />
      ) : check ? (
        <Hit onPress={() => { if (!done) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onToggle(); } }} hitSlop={8} testID="ck">
          <Animated.View style={[s.ck, { borderColor: late ? th.seal : th.line }, done && [{ borderWidth: 0 }, pop]]}>
            {done && <Animated.View entering={ZoomIn.duration(180).easing(EASE)}>
              <Icon name="check" size={18} color={th.ink} w={2} />
              <Animated.View style={[StyleSheet.absoluteFill, popInk]}><Icon name="check" size={18} color={th.bg} w={2} /></Animated.View>
            </Animated.View>}
          </Animated.View>
        </Hit>
      ) : (
        <View style={[s.ck, s.art, { opacity: type === "busy" ? 0.55 : 1 }, ring && { borderWidth: 2.5, borderColor: th.art[pal].b, shadowColor: th.art[pal].b, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, overflow: "visible" }]}>
          <View style={s.clip}><TypeArt type={unset ? "void" : pal} w={34} h={34} seed={seedOf(task.id)} /></View>
        </View>
      )}
      {lead !== undefined && <Text style={[s.lead, { color: th.muted }]}>{lead}</Text>}
      <Animated.View layout={glide} style={[s.tx, !first && { borderTopWidth: 1, borderTopColor: lifted ? "transparent" : th.line }]}>
        {editing ? (
          <>
            <TextInput
              autoFocus defaultValue={task.title} selectionColor={th.seal} cursorColor={th.seal} returnKeyType="done"
              style={[s.title, { color: th.ink, padding: 0 }]}
              onChangeText={(v) => { typed.current = v; }}
              onSubmitEditing={saveTitle}
              onBlur={saveTitle}
            />
            {subEl}
          </>
        ) : (
          // One tap on the text opens the details (after a beat, in case it is a double); two focus the title.
          // The title is its own responder, so it repeats the row's long-press or a hold on the text never reaches the row.
          <Pressable onPress={tapText} onLongPress={longPress} delayLongPress={350} hitSlop={{ top: 6, bottom: 6 }} accessibilityLabel={task.title}>
            <Text numberOfLines={1} style={[s.title, { color: done ? th.muted : th.ink }, done && { textDecorationLine: "line-through" }, ghost && { fontFamily: ff("500") }]}>{hl ? marked(task.title, hl) : task.title}</Text>
            {subEl}
          </Pressable>
        )}
      </Animated.View>
      {/* views.html .r .tm: the start, and under it the end at the same size; each its own tap, each its own dial.
          "Day, past midnight": a day over is a vermilion +1 on the end, and -1 on the next day's start. */}
      <View style={s.tmBox}>
        <View ref={timeBox} collapsable={false}>
          <Pressable onPress={canTime ? () => openDial("start") : undefined} hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }} accessibilityRole={canTime ? "button" : undefined} style={s.tmLine}>
            <Text style={[s.tm, dial === "start" && [s.chip, { backgroundColor: th.chip, borderColor: th.seal }], { color: dial === "start" ? th.ink : late ? th.seal : done ? th.muted : th.ink }]}>
              {allDay ? t("allDay") : tm ?? (task.start !== undefined ? hhmm(task.start) : "")}
            </Text>
            {!allDay && !tm && <Over n={off(task.start)} />}
          </Pressable>
        </View>
        {!allDay && !tm && task.start !== undefined && task.end !== undefined && (
          <View ref={endBox} collapsable={false}>
            <Pressable onPress={canTime ? () => openDial(onEnd ? "end" : "start") : undefined} hitSlop={{ top: 4, bottom: 8, left: 8, right: 8 }} accessibilityRole={canTime ? "button" : undefined} style={s.tmLine}>
              <Text style={[s.tm, s.tmEnd, dial === "end" && [s.chip, { backgroundColor: th.chip, borderColor: th.seal }], { color: dial === "end" ? th.ink : th.muted }]}>{hhmm(task.end)}</Text>
              <Over n={off(task.end)} />
            </Pressable>
          </View>
        )}
      </View>
      {task.start !== undefined && <TimeDial open={dial === "start"} anchor={anchor} value={new Date(task.start)} past onChange={onTime} onClose={() => setDial(undefined)} />}
      {task.start !== undefined && task.end !== undefined && onEnd && <TimeDial open={dial === "end"} anchor={anchor} value={new Date(task.end)} past onChange={onEnd} /* an end before the start rolls to the next day: +1 */ onClose={() => setDial(undefined)} />}
    </Tap>
  );
  return (
    <GestureDetector gesture={pan}>
      <Animated.View ref={holdBox} collapsable={false} style={heldSt}>
        <SwipeDelete enabled={!!onDelete && !allDay} onDelete={() => onDelete?.()} onSpring={series ? (bottom, top) => onSeries?.(bottom, top) : undefined} style={liftSt}>
          {body}
        </SwipeDelete>
      </Animated.View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  r: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: space.row },
  ck: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  lead: { width: 18, textAlign: "center", fontSize: font.sub, fontFamily: ff("400"), fontVariant: ["tabular-nums"] }, // an ordered step's number (calm.html importOrd)
  art: { borderWidth: 0 },
  clip: { width: "100%", height: "100%", borderRadius: 17, overflow: "hidden" },
  tx: { flex: 1, minWidth: 0, paddingVertical: space.row + 2, marginVertical: -space.row },
  mark: { backgroundColor: "rgba(217,67,43,0.18)" }, // as capture.tsx s.mark
  chip: { overflow: "hidden", borderWidth: 1.5, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, marginVertical: -6.5 }, // views.html .pk.on
  title: { fontSize: font.base, lineHeight: 23.8, fontFamily: ff("500") }, // .r line-height 1.4
  small: { fontSize: font.sub, lineHeight: 21, fontFamily: ff("400") }, // ui.css .r small: regular, muted
  bleed: { marginHorizontal: -10, borderRadius: 16 },
  clipRow: { borderRadius: 16, overflow: "hidden" },
  pad10: { paddingHorizontal: 10 },
  trash: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "#ff3b30", justifyContent: "center", alignItems: "flex-end", paddingRight: 20 },
  sl: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  slt: { flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  pick: { width: 96, height: 34 },
  tm: { fontSize: font.sub, fontFamily: ff("500"), fontVariant: ["tabular-nums"] }, // .r .tm 15/600
  tmBox: { alignItems: "flex-end", gap: 6 }, // apart enough to tap each
  tmLine: { flexDirection: "row", alignItems: "flex-start" },
  sup: { position: "absolute", left: "100%", top: -3, marginLeft: 1, fontSize: 10, lineHeight: 12, fontFamily: ff("600"), fontVariant: ["tabular-nums"] }, // ui.css .r .tm sup: hangs past the column, so the times stay aligned
  tmEnd: { fontFamily: ff("400") }, // the same size as the start, regular and muted: less weight, not less size
});

/**
 * views.html "Row, swipe to delete": right to left, a red bed (.sw: the row plus 10px each side, r16) shows behind,
 * a light tick at the threshold; past it the row slides off and collapses. With onSpring it springs back instead
 * and hands over the row's bottom edge, for the series menu.
 */
export function SwipeDelete({ enabled = true, onDelete, onSpring, style, children }: {
  enabled?: boolean; onDelete: () => void; onSpring?: (bottom: number, top: number) => void; style?: object; children: React.ReactNode;
}) {
  const th = useTheme();
  const box = useRef<ComponentRef<typeof View>>(null);
  const tx = useSharedValue(0), hgt = useSharedValue(-1), w = useSharedValue(0), h = useSharedValue(0), crossed = useSharedValue(false);
  const spring = !!onSpring;
  const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  const ask = () => box.current?.measureInWindow((_x: number, y: number, _w: number, h: number) => onSpring?.(y + h, y));
  const swipe = usePanGesture({
    testID: "swipe-delete", // tests drive the swipe by this id; RNGH drops it from release builds
    enabled,
    activeOffsetX: [-16, 9999], // right-to-left only
    failOffsetY: [-10, 10],
    onUpdate: (e) => {
      "worklet";
      tx.set(Math.min(0, e.translationX));
      const over = e.translationX <= -SWIPE;
      if (over !== crossed.get()) { crossed.set(over); if (over) scheduleOnRN(tick); }
    },
    onDeactivate: (e) => {
      "worklet";
      crossed.set(false);
      if (e.translationX > -SWIPE) { tx.set(settle(0)); return; }
      if (spring) { tx.set(settle(0)); scheduleOnRN(ask); return; }
      tx.set(withTiming(-w.get(), { duration: 150 }, (ok) => {
        if (!ok) return;
        hgt.set(h.get()); // collapse from the measured height, so rows with a sub line don't snap first
        hgt.set(withTiming(0, { duration: motion.fast }, (d) => { if (d) scheduleOnRN(onDelete); }));
      }));
    },
  });
  // page colour only while swiped, to hide the red under it; at rest the row is see-through (a lifted neighbour's shadow shows)
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }], backgroundColor: tx.get() < 0 ? th.bg : "transparent" }));
  const wrap = useAnimatedStyle(() => (hgt.get() >= 0 ? { height: hgt.get(), overflow: "hidden" as const } : {}));
  const trash = useAnimatedStyle(() => ({ opacity: interpolate(tx.get(), [0, -SWIPE * 0.6], [0, 1], Extrapolation.CLAMP) }));
  const bin = useAnimatedStyle(() => ({ transform: [{ scale: settle(tx.get() <= -SWIPE ? 1.15 : 1, 160) }] }));
  return (
    <View ref={box} onLayout={(e) => { w.set(e.nativeEvent.layout.width); h.set(e.nativeEvent.layout.height); }}>
      <Animated.View style={[wrap, s.bleed, style]}>
        <View style={s.clipRow}>
          <Animated.View style={[s.trash, trash]}><Animated.View style={bin}><Icon name="trash" size={20} color="#fff" /></Animated.View></Animated.View>
          <GestureDetector gesture={swipe}>
            <Animated.View style={[slide, s.pad10]}>{children}</Animated.View>
          </GestureDetector>
        </View>
      </Animated.View>
    </View>
  );
}
