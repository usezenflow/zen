import * as Haptics from "expo-haptics";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSequence, withTiming, ZoomIn } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, TypeArt } from "@/components/art";
import { hhmm, startOfDay } from "@/components/cal";
import { HoldMenu, type Item } from "@/components/menu";
import { fadeIn, glide, Tap, settle, EASE } from "@/components/tap";
import { t } from "@/lib/i18n";
import { when } from "@/lib/when";
import { useTheme, font, space, ff, motion } from "@/lib/theme";
import type { Task } from "@/lib/types";
import { typeOf } from "@/planner";

// Lectures and exams: room. Assignments: course. Anything with a deadline: "Hạn 23:59" (when() if not the same day).
export function subOf(task: Task, type: string, now: number) {
  const due = task.deadline !== undefined
    ? t("due", { time: task.start !== undefined && startOfDay(task.start) === startOfDay(task.deadline) ? hhmm(task.deadline) : when(task.deadline, now) })
    : undefined;
  if (type === "lecture" || type === "exam") return task.location;
  return [type === "assignment" ? task.course : undefined, due].filter(Boolean).join(" · ") || task.location || task.note?.split("\n")[0];
}

const SWIPE = 96;

export function Row({ task, now, first, done, allDay, sub: subOver, trail, ghost, tm, items, onDelete, onSeries, onToggle, onTitle, onTime, onOpen }: {
  task: Task; now: number; first?: boolean; done?: boolean; allDay?: boolean; sub?: string; trail?: string; ghost?: boolean; tm?: string; items?: Item[];
  onDelete?: () => void; onSeries?: (bottom: number) => void; // swipe right: plain task deletes, series asks where the menu goes
  onToggle: () => void; onTitle: (title: string) => void; onTime: (at: Date) => void; onOpen: () => void;
}) {
  const th = useTheme();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const lag = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(lag.current), []);
  const type = typeOf(task);
  const check = type === "plan" || type === "assignment";
  // Missed: a checkable task whose block has ended without a tick; vermilion circle and time (views.html "Day, missed").
  const late = check && !done && !allDay && (task.end ?? task.start ?? Infinity) <= now;
  const sub = subOver ?? (allDay ? t("noPlan") : subOf(task, type, now));
  const scale = useSharedValue(1);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  useEffect(() => { if (done) scale.set(withSequence(withTiming(1.12, { duration: 110 }), settle(1, 160))); }, [done, scale]);
  const ring = task.source === "dlu" && type === "lecture"; // campus lecture: glow ring (pull.html)
  const body = (
    <Tap variant="row" onPress={onOpen} style={[s.r, ghost && { opacity: 0.45 }]}>
      {ghost ? (
        <View style={[s.ck, { borderColor: th.line, borderStyle: "dashed" }]} />
      ) : check ? (
        <Pressable onPress={() => { if (!done) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onToggle(); } }} hitSlop={8}>
          <Animated.View style={[s.ck, { borderColor: late ? th.seal : th.line }, done && { borderWidth: 0, backgroundColor: th.ink, shadowColor: th.chip }, pop]}>
            {done && <Animated.View entering={ZoomIn.duration(180).easing(EASE)}><Icon name="check" size={16} color={th.bg} w={2.4} /></Animated.View>}
          </Animated.View>
        </Pressable>
      ) : (
        <View style={[s.ck, s.art, { opacity: type === "busy" ? 0.55 : 1 }, ring && { borderWidth: 2.5, borderColor: th.art[type][1], shadowColor: th.art[type][1], shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, overflow: "visible" }]}>
          <View style={s.clip}><TypeArt type={type} w={34} h={34} seed={task.id.length} /></View>
        </View>
      )}
      <Animated.View layout={glide} style={[s.tx, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.line }]}>
        {editing ? (
          <TextInput
            autoFocus defaultValue={task.title} selectionColor={th.seal} cursorColor={th.seal} returnKeyType="done"
            style={[s.title, { color: th.ink, padding: 0 }]}
            onSubmitEditing={(e) => { setEditing(false); const v = e.nativeEvent.text.trim(); if (v && v !== task.title) onTitle(v); }}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <Pressable onPress={() => setEditing(true)} hitSlop={{ top: 6, bottom: 6 }}>
            <Text numberOfLines={1} style={[s.title, { color: done ? th.muted : th.ink }, done && { textDecorationLine: "line-through" }]}>{task.title}</Text>
          </Pressable>
        )}
        {!!(trail || sub) && (
          <View style={s.sl}>
            {!!trail && <View style={[s.dot, { backgroundColor: th.seal }]} />}
            <Text numberOfLines={1} style={[s.small, s.slt, { color: th.muted }]}>{trail ?? sub}</Text>
          </View>
        )}
      </Animated.View>
      {picking && task.start !== undefined ? (
        // Inline native compact picker; the edit lands once the wheel rests, no modal.
        <Animated.View key="pick" entering={fadeIn}>
          <DateTimePicker
            value={new Date(task.start)} mode="time" display="compact" accentColor={th.seal} style={s.pick}
            onValueChange={(_, d) => { clearTimeout(lag.current); lag.current = setTimeout(() => { setPicking(false); onTime(d); }, 900); }}
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
  const box = useRef<ComponentRef<typeof View>>(null);
  const tx = useSharedValue(0), hgt = useSharedValue(-1), w = useSharedValue(0), h = useSharedValue(0), crossed = useSharedValue(false);
  const series = !!(task.section || task.rrule || task.parentId);
  const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  const ask = () => box.current?.measureInWindow((_x: number, y: number, _w: number, h: number) => onSeries?.(y + h));
  const swipe = usePanGesture({
    enabled: !!onDelete && !allDay,
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
      if (series) { tx.set(settle(0)); scheduleOnRN(ask); return; }
      tx.set(withTiming(-w.get(), { duration: 150 }, (ok) => {
        if (!ok) return;
        hgt.set(h.get()); // collapse from the measured height, so rows with a sub line don't snap first
        hgt.set(withTiming(0, { duration: motion.fast }, (d) => { if (d) scheduleOnRN(onDelete!); }));
      }));
    },
  });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }] }));
  const wrap = useAnimatedStyle(() => (hgt.get() >= 0 ? { height: hgt.get(), overflow: "hidden" as const } : {}));
  const trash = useAnimatedStyle(() => ({ opacity: interpolate(tx.get(), [0, -SWIPE * 0.6], [0, 1], Extrapolation.CLAMP) }));
  const bin = useAnimatedStyle(() => ({ transform: [{ scale: settle(tx.get() <= -SWIPE ? 1.15 : 1, 160) }] }));
  return (
    <View ref={box} onLayout={(e) => { w.set(e.nativeEvent.layout.width); h.set(e.nativeEvent.layout.height); }}><Animated.View style={wrap}>
      <Animated.View style={[s.trash, trash]}><Animated.View style={bin}><Icon name="trash" size={20} color="#fff" /></Animated.View></Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View style={[slide, { backgroundColor: th.bg }]}>{items?.length ? <HoldMenu items={items}>{body}</HoldMenu> : body}</Animated.View>
      </GestureDetector>
    </Animated.View></View>
  );
}

const s = StyleSheet.create({
  r: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: space.row },
  ck: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center", shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  art: { borderWidth: 0 },
  clip: { width: "100%", height: "100%", borderRadius: 17, overflow: "hidden" },
  tx: { flex: 1, minWidth: 0, paddingVertical: space.row + 2, marginVertical: -space.row },
  title: { fontSize: font.base, lineHeight: 24, fontFamily: ff("600") },
  small: { fontSize: font.sub, lineHeight: 20, fontFamily: ff("500") },
  trash: { position: "absolute", right: 0, top: 4, bottom: 4, width: 120, borderRadius: 16, backgroundColor: "#ff3b30", justifyContent: "center", alignItems: "flex-end", paddingRight: 20 },
  sl: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  slt: { flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  pick: { width: 96, height: 34 },
  tm: { fontSize: font.base, fontFamily: ff("700"), fontVariant: ["tabular-nums"] },
});
