import { BlurView } from "expo-blur";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { BackHandler, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { Extrapolation, FadeInDown, interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, type IconName } from "@/components/art";
import { Found, gotLine, TYPE_KEY, type RowActions } from "@/components/day";
import { EASE, Tap } from "@/components/tap";
import { found, parse, remember, SAMPLES, suggest } from "@/lib/find";
import { t } from "@/lib/i18n";
import * as store from "@/lib/store";
import { useTheme, font, space, ff } from "@/lib/theme";
import type { Task } from "@/lib/types";
import { typeOf } from "@/planner";

export type Origin = { x: number; y: number }; // the search circle's top-left, in window coordinates
const C = 44; // the circle, and the field's height

const loadRecent = async () => { try { const v = JSON.parse((await store.kvGet("searches")) ?? "[]"); return Array.isArray(v) ? (v as string[]) : []; } catch { return []; } };

/**
 * views.html "Search, opening": like Spotlight, the search circle grows leftward into the field while the view behind blurs.
 * Tap outside (or back) shrinks it home and closes; the cross in the field only clears it.
 */
export function Search({ origin, tasks, now, acts, onClose }: { origin: Origin; tasks: Task[]; now: number; acts: RowActions; onClose: () => void }) {
  const th = useTheme();
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [box, setBox] = useState<{ x: number; y: number; w: number }>();
  const root = useRef<ComponentRef<typeof View>>(null), input = useRef<ComponentRef<typeof TextInput>>(null);
  const p = useSharedValue(0);
  const closing = useRef(false);

  useEffect(() => { void loadRecent().then(setRecent); }, []);
  const save = (v: string) => { const next = remember(recent, v); setRecent(next); void store.kvSet("searches", JSON.stringify(next)); };

  // Grow once the overlay knows where it sits, so the field starts exactly on the circle; the keyboard rises when it is full.
  const focus = () => input.current?.focus();
  useEffect(() => {
    if (box) p.set(withTiming(1, { duration: 280, easing: EASE }, (done) => { if (done) scheduleOnRN(focus); }));
  }, [box, p]);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    input.current?.blur();
    p.set(withTiming(0, { duration: 220, easing: EASE }, (done) => { if (done) scheduleOnRN(onClose); }));
  };
  useEffect(() => { const sub = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; }); return () => sub.remove(); });

  const x0 = origin.x - (box?.x ?? 0), top = origin.y - (box?.y ?? 0), full = (box?.w ?? 0) - space.gutter * 2;
  const field = useAnimatedStyle(() => ({ left: interpolate(p.get(), [0, 1], [x0, space.gutter]), width: interpolate(p.get(), [0, 1], [C, full]) }));
  const late = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.6, 1], [0, 1], Extrapolation.CLAMP) }));
  const veil = useAnimatedStyle(() => ({ opacity: p.get() }));
  // The blur shows only mid-way; open, the paper is solid so rows over a colourful card stay legible.
  const paper = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.3, 1], [0.4, 1], Extrapolation.CLAMP) }));

  const mine = useMemo(() => suggest(tasks, now), [tasks, now]);
  // The line under a suggestion: what it gathers and how many ("Lịch học, Bài thi · 5 việc"), or the filters Zen read in it;
  // for a sample with nothing to find yet, what it would read.
  const subOf = (v: string) => {
    const pq = parse(v, now), xs = found(tasks, pq, now).flatMap((g) => g.xs), got = gotLine(pq, now);
    if (!xs.length) return got || t("sampleAbbr");
    const name = mine.find((c) => c.q === v)?.name; // initials say which course they stand for
    if (name) return `${name} · ${t("nTasks", { n: xs.length })}`;
    const mix = [...new Set(xs.map((x) => (x.forId ? "exam" : typeOf(x))))].map((ty) => t(TYPE_KEY[ty])).join(", ");
    return `${got || mix} · ${t("nTasks", { n: xs.length })}`;
  };
  const sections: { lab: string; icon: IconName; xs: string[]; sub: boolean; clear?: boolean }[] = q.trim() ? [] : [
    { lab: t("recent"), icon: "clock" as const, xs: recent.slice(0, 3), sub: false, clear: true },
    mine.length ? { lab: t("suggested"), icon: "search" as const, xs: mine.map((c) => c.q), sub: true } : { lab: t("trySearch"), icon: "search" as const, xs: SAMPLES, sub: true },
  ].filter((g) => g.xs.length);
  let k = 0; // stagger across sections

  const open = { ...acts, onOpen: (x: Task) => { save(q); acts.onOpen(x); } };
  return (
    <View ref={root} style={StyleSheet.absoluteFill} onLayout={() => root.current?.measureInWindow((x, y, w) => setBox({ x, y, w }))}>
      <Animated.View style={[StyleSheet.absoluteFill, veil]}>
        <BlurView intensity={40} tint={th.dark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: th.bg }, paper]} />
      </Animated.View>
      {box && (
        <>
          <Animated.ScrollView style={[StyleSheet.absoluteFill, { top: top + C }, late]} contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            {/* Empty space in the list closes too; rows take their own taps first. */}
            <Pressable onPress={close} accessible={false} style={s.body}>
              {sections.map((g) => (
                <View key={g.lab}>
                  <View style={s.labRow}>
                    <Text style={[s.lab, { color: th.muted }]}>{g.lab}</Text>
                    {g.clear && <Tap onPress={() => { setRecent([]); void store.kvSet("searches", "[]"); }} hitSlop={10} accessibilityRole="button"><Text style={[s.lab, { color: th.ink, fontFamily: ff("600") }]}>{t("searchClear")}</Text></Tap>}
                  </View>
                  {g.xs.map((v, i) => (
                    <Animated.View key={v} entering={FadeInDown.delay(80 + 30 * k++).duration(220).easing(EASE)}>
                      <Tap variant="row" onPress={() => setQ(v)} accessibilityRole="button" style={s.sg}>
                        <Icon name={g.icon} size={18} w={2} color={th.muted} />
                        <View style={[s.st, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.line }]}>
                          <Text numberOfLines={1} style={[s.sgB, { color: th.ink }]}>{v}</Text>
                          {g.sub && <Text numberOfLines={1} style={[s.sgS, { color: th.muted }]}>{subOf(v)}</Text>}
                        </View>
                      </Tap>
                    </Animated.View>
                  ))}
                </View>
              ))}
              <Found tasks={tasks} q={q} now={now} {...open} />
            </Pressable>
          </Animated.ScrollView>
          <Animated.View style={[s.fld, { top, borderColor: th.line, backgroundColor: th.bg }, field]}>
            <Icon name="search" size={20} color={th.ink} />
            <Animated.View style={[s.row, late]}>
              <TextInput
                ref={input} value={q} onChangeText={setQ} placeholder={t("search")} placeholderTextColor={th.muted}
                cursorColor={th.seal} selectionColor={th.seal} returnKeyType="search" autoCorrect={false} accessibilityLabel={t("search")}
                onSubmitEditing={() => { if (found(tasks, parse(q, now), now).length) save(q); }}
                style={[s.fldT, { color: th.ink }]}
              />
              {!!q && (
                <Tap onPress={() => { setQ(""); focus(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("searchClearText")}>
                  <Icon name="x" size={18} w={2} color={th.muted} />
                </Tap>
              )}
            </Animated.View>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  body: { flexGrow: 1, paddingHorizontal: space.gutter, paddingBottom: 200 },
  // Left padding puts the magnifier where it sat in the circle, so the pill grows around it.
  fld: { position: "absolute", height: C, borderRadius: C / 2, borderWidth: 1, paddingLeft: (C - 20) / 2 - 1, paddingRight: 14, flexDirection: "row", alignItems: "center", gap: 10, overflow: "hidden" },
  row: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  fldT: { flex: 1, fontSize: 17, lineHeight: 22, height: 22, fontFamily: ff("500"), padding: 0 }, // as settings-connect .input: equal lineHeight and height keep the cursor level with the placeholder
  labRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28 },
  lab: { fontSize: font.label, fontFamily: ff("500") },
  sg: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 },
  st: { flex: 1, paddingVertical: 13, justifyContent: "center" },
  sgB: { fontSize: font.base, fontFamily: ff("600") },
  sgS: { marginTop: 2, fontSize: 14, fontFamily: ff("500") },
});
