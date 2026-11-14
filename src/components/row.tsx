import * as Haptics from "expo-haptics";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useTapOutside } from "@/components/outside";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Extrapolation, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming, ZoomIn } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, TypeArt } from "@/components/art";
import { hhmm, startOfDay } from "@/components/cal";
import { fadeIn, glide, Tap, settle, EASE } from "@/components/tap";
import { hits, type Query } from "@/lib/find";
import { t } from "@/lib/i18n";
import { reasonText } from "@/lib/reasons";
import { when } from "@/lib/when";
import { useTheme, font, space, ff, motion } from "@/lib/theme";
import type { Task } from "@/lib/types";
import { typeOf } from "@/planner";

// Lectures and exams: room. Assignments: course. Anything with a deadline: "Hạn 23:59" (when() if not the same day).
// An exam prep: "Buổi 1/4 · Mẫu thiết kế", its place among its sittings (from `all`, by time) and the subject; the due is the exam's own row.
export function subOf(task: Task, type: string, now: number, all: Task[] = []) {
  if (task.forId) {
    const sibs = all.filter((x) => x.parentId !== undefined && x.parentId === task.parentId && !x.deletedAt).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
    return [sibs.length > 1 ? reasonText({ key: "pace", w: 1, vars: { k: sibs.findIndex((x) => x.id === task.id) + 1, n: sibs.length } }) : undefined, task.course].filter(Boolean).join(" · ") || undefined;
  }
  const due = task.deadline !== undefined
    ? t("due", { time: task.start !== undefined && startOfDay(task.start) === startOfDay(task.deadline) ? hhmm(task.deadline) : when(task.deadline, now) })
    : undefined;
  if (type === "lecture" || type === "exam") return task.location;
  return [type === "assignment" ? task.course : undefined, due].filter(Boolean).join(", ") || task.location || task.note?.split("\n")[0];
}

const SWIPE = 96;

// views.html "Search": the matched words wear capture's vermilion read tint.
const marked = (title: string, q: Query) => {
  const out: React.ReactNode[] = [];
  let at = 0;
  hits(title, q).forEach(([a, b], i) => { out.push(title.slice(at, a), <Text key={i} style={s.mark}>{title.slice(a, b)}</Text>); at = b; });
  return [...out, title.slice(at)];
};

export function Row({ task, now, first, done, allDay, sub: subOver, trail, ghost, tm, hl, lifted, onHold, onDelete, onSeries, onToggle, onTitle, onTime, onOpen }: {
  task: Task; now: number; first?: boolean; done?: boolean; allDay?: boolean; sub?: string; trail?: string; ghost?: boolean; tm?: string; hl?: Query; // hl: a search query, its matches tinted
  /** Long-press: the row lifts (.lift) and the caller drops its menu under the row's bottom edge. */
  lifted?: boolean; onHold?: (bottom: number) => void;
  onDelete?: () => void; onSeries?: (bottom: number) => void; // swipe right: plain task deletes, series asks where the menu goes
  onToggle: () => void; onTitle: (title: string) => void; onTime: (at: Date) => void; onOpen: () => void;
}) {
  const th = useTheme();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
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
  // The picker is a native control whose own taps reach the row, so the row ignores taps while it is open.
  // It stays open through every turn of the wheel; a tap elsewhere puts it away and saves the last value.
  const pickBox = useRef<ComponentRef<typeof View>>(null);
  const [draft, setDraft] = useState<Date>();
  useTapOutside(pickBox, picking, () => { setDraft(undefined); setPicking(false); if (draft) onTime(draft); });
  const type = typeOf(task);
  const check = type === "plan" || type === "assignment";
  // Missed: a checkable task whose block has ended without a tick; vermilion circle and time (views.html "Day, missed").
  const late = check && !done && !allDay && (task.end ?? task.start ?? Infinity) <= now;
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
  const fly = useAnimatedStyle(() => ({ boxShadow: `0 14px 30px -12px rgba(0,0,0,${(0.3 * lift.get()).toFixed(3)})` }));
  const series = !!(task.section || task.rrule || task.parentId);
  // views.html .lift: page-colour card, r16, scale 1.02, 0 10px 30px -10px rgba(0,0,0,.3), no separator.
  const up = useSharedValue(0);
  useEffect(() => { up.set(settle(lifted ? 1 : 0, 180)); }, [lifted, up]);
  const liftSt = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.02 * up.get() }], boxShadow: `0 10px 30px -10px rgba(0,0,0,${(0.3 * up.get()).toFixed(3)})` }));
  const holdBox = useRef<ComponentRef<typeof View>>(null);
  const hold = () => {
    if (!onHold) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    holdBox.current?.measureInWindow((_x, y, _w, h) => onHold(y + h));
  };
  const ring = task.source === "dlu" && type === "lecture"; // campus lecture: glow ring (pull.html)
  const subEl = !!(trail || sub) && (
    <View style={s.sl}>
      {!!trail && <View style={[s.dot, { backgroundColor: th.seal }]} />}
      <Text numberOfLines={1} style={[s.small, s.slt, { color: th.muted }]}>{trail ?? sub}</Text>
    </View>
  );
  const body = (
    <Tap variant="row" onPress={picking ? undefined : onOpen} onLongPress={onHold && !picking ? hold : undefined} delayLongPress={350} style={[s.r, ghost && { opacity: 0.45 }]}>
      {ghost ? (
        <View style={[s.ck, { borderColor: th.line, borderStyle: "dashed" }]} />
      ) : check ? (
        <Pressable onPress={() => { if (!done) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onToggle(); } }} hitSlop={8}>
          <Animated.View style={[s.ck, { borderColor: late ? th.seal : th.line }, done && [{ borderWidth: 0 }, pop]]}>
            {done && <Animated.View entering={ZoomIn.duration(180).easing(EASE)}>
              <Icon name="check" size={16} color={th.ink} w={2.4} />
              <Animated.View style={[StyleSheet.absoluteFill, popInk]}><Icon name="check" size={16} color={th.bg} w={2.4} /></Animated.View>
            </Animated.View>}
          </Animated.View>
        </Pressable>
      ) : (
        <View style={[s.ck, s.art, { opacity: type === "busy" ? 0.55 : 1 }, ring && { borderWidth: 2.5, borderColor: th.art[type][1], shadowColor: th.art[type][1], shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, overflow: "visible" }]}>
          <View style={s.clip}><TypeArt type={type} w={34} h={34} seed={task.id.length} /></View>
        </View>
      )}
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
          <Pressable onPress={tapText} hitSlop={{ top: 6, bottom: 6 }}>
            <Text numberOfLines={1} style={[s.title, { color: done ? th.muted : th.ink }, done && { textDecorationLine: "line-through" }, ghost && { fontFamily: ff("500") }]}>{hl ? marked(task.title, hl) : task.title}</Text>
            {subEl}
          </Pressable>
        )}
      </Animated.View>
      {picking && task.start !== undefined ? (
        // Inline native compact picker; the edit lands once the wheel rests, no modal.
        <Animated.View key="pick" entering={fadeIn} ref={pickBox}>
          <DateTimePicker
            value={draft ?? new Date(task.start)} mode="time" display="compact" accentColor={th.seal} style={s.pick}
            onValueChange={(_, d) => setDraft(d)}
          />
        </Animated.View>
      ) : (
        <Animated.View key="time" entering={fadeIn}>
          <Pressable onPress={() => !allDay && task.start !== undefined && setPicking(true)} hitSlop={8}>
            <Text style={[s.tm, { color: editing ? th.ink : late ? th.seal : th.muted }]}>{allDay ? t("allDay") : tm ?? (task.start !== undefined ? hhmm(task.start) : "")}</Text>
          </Pressable>
        </Animated.View>
      )}
    </Tap>
  );
  return (
    <View ref={holdBox} collapsable={false}>
      <SwipeDelete enabled={!!onDelete && !allDay} onDelete={() => onDelete?.()} onSpring={series ? (bottom) => onSeries?.(bottom) : undefined} style={[fly, liftSt]}>
        {body}
      </SwipeDelete>
    </View>
  );
}

const s = StyleSheet.create({
  r: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: space.row },
  ck: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center", shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  art: { borderWidth: 0 },
  clip: { width: "100%", height: "100%", borderRadius: 17, overflow: "hidden" },
  tx: { flex: 1, minWidth: 0, paddingVertical: space.row + 2, marginVertical: -space.row },
  mark: { backgroundColor: "rgba(217,67,43,0.18)" }, // as capture.tsx s.mark
  title: { fontSize: font.base, lineHeight: 23.8, fontFamily: ff("600") }, // .r line-height 1.4
  small: { fontSize: font.sub, lineHeight: 21, fontFamily: ff("500") },
  bleed: { marginHorizontal: -10, borderRadius: 16 },
  clipRow: { borderRadius: 16, overflow: "hidden" },
  pad10: { paddingHorizontal: 10 },
  trash: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "#ff3b30", justifyContent: "center", alignItems: "flex-end", paddingRight: 20 },
  sl: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  slt: { flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  pick: { width: 96, height: 34 },
  tm: { fontSize: font.sub, fontFamily: ff("600"), fontVariant: ["tabular-nums"] }, // .r .tm 15/600
});

/**
 * views.html "Row, swipe to delete": right to left, a red bed (.sw: the row plus 10px each side, r16) shows behind,
 * a light tick at the threshold; past it the row slides off and collapses. With onSpring it springs back instead
 * and hands over the row's bottom edge, for the series menu.
 */
export function SwipeDelete({ enabled = true, onDelete, onSpring, style, children }: {
  enabled?: boolean; onDelete: () => void; onSpring?: (bottom: number) => void; style?: object; children: React.ReactNode;
}) {
  const th = useTheme();
  const box = useRef<ComponentRef<typeof View>>(null);
  const tx = useSharedValue(0), hgt = useSharedValue(-1), w = useSharedValue(0), h = useSharedValue(0), crossed = useSharedValue(false);
  const spring = !!onSpring;
  const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  const ask = () => box.current?.measureInWindow((_x: number, y: number, _w: number, h: number) => onSpring?.(y + h));
  const swipe = usePanGesture({
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
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }] }));
  const wrap = useAnimatedStyle(() => (hgt.get() >= 0 ? { height: hgt.get(), overflow: "hidden" as const } : {}));
  const trash = useAnimatedStyle(() => ({ opacity: interpolate(tx.get(), [0, -SWIPE * 0.6], [0, 1], Extrapolation.CLAMP) }));
  const bin = useAnimatedStyle(() => ({ transform: [{ scale: settle(tx.get() <= -SWIPE ? 1.15 : 1, 160) }] }));
  return (
    <View ref={box} onLayout={(e) => { w.set(e.nativeEvent.layout.width); h.set(e.nativeEvent.layout.height); }}>
      <Animated.View style={[wrap, s.bleed, { backgroundColor: th.bg }, style]}>
        <View style={s.clipRow}>
          <Animated.View style={[s.trash, trash]}><Animated.View style={bin}><Icon name="trash" size={20} color="#fff" /></Animated.View></Animated.View>
          <GestureDetector gesture={swipe}>
            <Animated.View style={[slide, s.pad10, { backgroundColor: th.bg }]}>{children}</Animated.View>
          </GestureDetector>
        </View>
      </Animated.View>
    </View>
  );
}
