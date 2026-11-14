import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { Fill } from "@/components/meter";
import { fadeIn, fadeOut, Tap, EASE } from "@/components/tap";
import { Icon, Logo, TypeArt } from "@/components/art";
import { hhmm } from "@/components/cal";
import type { HoldState } from "@/components/hold";
import { t } from "@/lib/i18n";
import { reasonText, topReason } from "@/lib/reasons";
import { useTheme, font, ff } from "@/lib/theme";
import { when } from "@/lib/when";
import type { Move, Task } from "@/lib/types";
import { typeOf } from "@/planner";

export type Card = { task: Task; start?: number; end?: number; gap?: boolean };
const BARS = [10, 18, 26, 14, 22, 8, 20, 12, 24, 16, 9, 19];

// Art card with progress meter; the circle marks it done. Swipe is handled by the caller.
export function NowCard({ card, onDone }: { card: Card; onDone: () => void }) {
  const th = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { // the meter fills continuously: a slow ticker is smooth enough for a 54px capsule
    const i = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(i);
  }, []);
  const { task, start = 0, end = 0, gap } = card;
  const going = start <= now && now < end;
  const p = going ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 0;
  const mins = Math.max(1, Math.round((going ? end - now : end - start) / 60000));
  const title = gap ? t("gap", { n: Math.round((end - start) / 60000), title: task.title }) : task.title;
  return (
    <View style={[s.art, { backgroundColor: th.chip }]}>
      <View style={StyleSheet.absoluteFill}><TypeArt type={typeOf(task)} w={264} h={220} seed={4} /></View>
      <Text style={[s.lab, { color: th.onart }]}>{t("nextUp")}</Text>
      <Text style={[s.t, { color: th.onart }]} numberOfLines={3}>{title}</Text>
      <View style={s.foot}>
        <View style={s.meter}>
          <View style={s.cap}><Fill p={p} /></View>
          <View>
            <Rise text={going ? t("nMin", { n: mins }) : hhmm(start)} style={[s.big, { color: th.onart }]} />
            <Text style={[s.small, { color: th.onart }]}>{going ? t("until", { time: hhmm(end) }) : t("nMin", { n: mins })}</Text>
          </View>
        </View>
        <Tap onPress={onDone} hitSlop={8} scale={0.88} style={s.glass}><Icon name="check" size={22} color="#0b0b0c" w={2.2} /></Tap>
      </View>
    </View>
  );
}

// Odometer: each digit is keyed by position and value, so only the digits that change rise in from below.
function Rise({ text, style }: { text: string; style: object }) {
  const parts = text.split(/(\d)/).filter(Boolean);
  return (
    <View style={s.rise} accessible accessibilityLabel={text}>
      {parts.map((c, i) => <Animated.Text key={`${i}${c}`} entering={FadeInDown.duration(220).easing(EASE).delay(i * 40)} style={style}>{c}</Animated.Text>)}
    </View>
  );
}

// One wave bar: its resting height grows with the real mic level (0..1).
function Bar({ h, level, color }: { h: number; level?: SharedValue<number>; color: string }) {
  const st = useAnimatedStyle(() => ({ height: 4 + Math.min(1, (level?.get() ?? 0.4) * 1.4) * (h - 2) }));
  return <Animated.View style={[{ width: 4, borderRadius: 4, backgroundColor: color, opacity: 0.8 }, st]} />;
}

// Listening / Thinking: live words (the last word still partial, faded) plus the wave (card.html).
export function Live({ state, words = "", level }: { state: Exclude<HoldState, "idle">; words?: string; level?: SharedValue<number> }) {
  const th = useTheme();
  const i = words.lastIndexOf(" ");
  const head = i < 0 ? "" : words.slice(0, i + 1), tail = i < 0 ? words : words.slice(i + 1);
  return (
    <View style={{ marginTop: 30 }}>
      {words ? (
        <Animated.Text key="words" entering={fadeIn} style={[s.words, { color: th.ink }]}>{head}<Text style={state === "listening" ? { opacity: 0.35 } : undefined}>{tail}</Text></Animated.Text>
      ) : (
        <Animated.Text key={state} entering={fadeIn} style={[s.words, { color: th.muted }]}>{t(state)}</Animated.Text>
      )}
      {state === "listening" && (
        <Animated.View entering={fadeIn} exiting={fadeOut} style={s.wave}>{BARS.map((h, k) => <Bar key={k} h={h} level={level} color={th.seal} />)}</Animated.View>
      )}
    </View>
  );
}

const biggest = (ms: Move[]) => ms.reduce((a, b) => (Math.abs(b.to - b.from) > Math.abs(a.to - a.from) ? b : a));

// views.html magic 1: the art slot's replacement on a day something moved. Tap opens the story in place.
export function Brief({ moves, now, onOpen }: { moves: Move[]; now: number; onOpen: () => void }) {
  const th = useTheme();
  const direct = moves.filter((x) => x.cause && x.cause !== t("causeKnock")); // the sentence names a real cause, not a knock-on
  const m = biggest(direct.length ? direct : moves), r = topReason(m.why);
  const what = t("briefMove", { title: m.title, when: when(m.to, now) });
  const sub = [m.cause ? t("briefCause", { cause: m.cause, what }) : what, r && reasonText(r, true)].filter(Boolean).join(". ") + ".";
  return (
    <Tap onPress={onOpen} scale={0.98} accessibilityRole="button" accessibilityLabel={t("briefOpen")} style={[s.brief, { backgroundColor: th.chip }]}>
      <Text style={[s.lab, { color: th.muted, opacity: 1 }]}>{t(new Date(now).getHours() < 12 ? "briefMorning" : "briefNow")}</Text>
      <View style={s.lf}><Logo size={30} mode="line" color={th.ink} /></View>
      <Text style={[s.t, { color: th.ink, marginTop: 26, paddingRight: 40 }]}>{moves.length === 1 ? t("briefOne", { title: m.title }) : t("briefN", { n: moves.length })}</Text>
      <Text style={[s.bs, { color: th.muted }]}>{sub}</Text>
    </Tap>
  );
}

// magic 2: the moves grouped by cause, old time struck, new time, one reason each.
export function Story({ moves, now, onClose }: { moves: Move[]; now: number; onClose: () => void }) {
  const th = useTheme();
  const groups = new Map<string, Move[]>();
  const rank = (c?: string) => (!c ? 2 : c === t("causeKnock") ? 1 : 0); // real causes first, then knock-ons, then plain refinements
  for (const m of [...moves].sort((a, b) => rank(a.cause) - rank(b.cause) || a.at - b.at)) groups.set(m.cause ?? "", [...(groups.get(m.cause ?? "") ?? []), m]);
  return (
    <Animated.View entering={fadeIn}>
      {[...groups].map(([cause, ms]) => (
        <View key={cause} style={{ marginTop: 6 }}>
          {!!cause && <Text style={[s.sl, { color: th.muted }]}>{cause}</Text>}
          {ms.map((m, i) => {
            const r = topReason(m.why);
            return (
              <View key={m.id + m.at} style={[s.mv, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.line }]}>
                <Text style={[s.mt, { color: th.ink }]}>{m.title}</Text>
                <View style={s.ft}>
                  <Text style={[s.fr, { color: th.muted, textDecorationLine: "line-through" }]}>{when(m.from, now)}</Text>
                  <Icon name="right" size={14} color={th.muted} w={2.2} />
                  <Text style={[s.fr, { color: th.ink, fontFamily: ff("600") }]}>{when(m.to, now)}</Text>
                </View>
                {r && <Text style={[s.rs, { color: th.muted }]}>{reasonText(r, true)}</Text>}
              </View>
            );
          })}
        </View>
      ))}
      <Tap onPress={onClose} accessibilityRole="button" accessibilityLabel={t("briefClose")} style={[s.close, { backgroundColor: th.ink }]}><Text style={[s.ct, { color: th.bg }]}>{t("briefClose")}</Text></Tap>
    </Animated.View>
  );
}

// magic 12: Sunday's art card; leads to the rhythm page.
export function Weekly({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  const th = useTheme();
  return (
    <Tap onPress={onPress} scale={0.98} accessibilityRole="button" accessibilityLabel={title} style={[s.art, { backgroundColor: th.chip }]}>
      <View style={StyleSheet.absoluteFill}><TypeArt type="lecture" w={264} h={220} seed={8} /></View>
      <Text style={[s.lab, { color: th.onart }]}>{t("sundayLab")}</Text>
      <Text style={[s.t, { color: th.onart }]} numberOfLines={3}>{title}</Text>
      <View style={s.foot}>
        <Text style={[s.small, { color: th.onart, fontFamily: ff("600") }]}>{sub}</Text>
        <View style={s.glass}><Icon name="right" size={22} color="#0b0b0c" w={2.2} /></View>
      </View>
    </Tap>
  );
}

function Spin() {
  const th = useTheme();
  const r = useSharedValue(0);
  useEffect(() => { r.set(withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1)); }, [r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return <Animated.View style={[s.spin, { borderColor: th.line, borderTopColor: th.seal }, st]} />;
}

// magic 4: real solver steps above the dock, newest last; older ones muted with a check.
export function Steps({ lines }: { lines: string[] }) {
  const th = useTheme();
  return (
    <View style={s.steps} pointerEvents="none">
      {lines.map((l, i) => {
        const now = i === lines.length - 1;
        return (
          <Animated.View key={i} entering={FadeInDown.duration(220).easing(EASE)} style={s.st}>
            {now ? <Spin /> : <Icon name="check" size={16} color={th.muted} w={2.4} />}
            <Text style={{ color: now ? th.ink : th.muted, fontSize: font.base - 1, fontFamily: ff(now ? "600" : "500") }}>{l}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  art: { marginTop: 16, height: 220, borderRadius: 28, overflow: "hidden", paddingHorizontal: 20, paddingTop: 20 },
  lab: { fontSize: font.label, fontFamily: ff("500"), opacity: 0.85 },
  t: { marginTop: 10, fontSize: 24, lineHeight: 28, fontFamily: ff("600"), letterSpacing: -0.5 },
  foot: { position: "absolute", left: 20, right: 16, bottom: 16, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  meter: { flexDirection: "row", alignItems: "center", gap: 12 },
  cap: { width: 18, height: 54, borderRadius: 10, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", justifyContent: "flex-end", padding: 2 },
  rise: { flexDirection: "row", overflow: "hidden" },
  big: { fontSize: 26, fontFamily: ff("600"), lineHeight: 26 },
  small: { fontSize: font.md, fontFamily: ff("500"), opacity: 0.9, marginTop: 3 },
  glass: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.85)" },
  words: { fontSize: 24, lineHeight: 31, fontFamily: ff("600"), letterSpacing: -0.5 },
  wave: { flexDirection: "row", gap: 4, alignItems: "center", height: 26, marginTop: 18 },
  brief: { marginTop: 16, borderRadius: 28, padding: 18, paddingHorizontal: 20 },
  lf: { position: "absolute", top: 16, right: 16 },
  bs: { marginTop: 6, fontSize: font.md, lineHeight: 21, fontFamily: ff("500") },
  sl: { fontSize: font.label, fontFamily: ff("500"), marginTop: 16 },
  mv: { paddingVertical: 14 },
  mt: { fontSize: 17, fontFamily: ff("600") },
  ft: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  fr: { fontSize: font.md, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  rs: { marginTop: 3, fontSize: font.md, lineHeight: 20, fontFamily: ff("500") },
  close: { alignSelf: "flex-start", marginTop: 14, height: 40, paddingHorizontal: 18, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  ct: { fontSize: font.sub, fontFamily: ff("700") },
  steps: { position: "absolute", left: 24, right: 24, bottom: 150, gap: 10, zIndex: 7 },
  st: { flexDirection: "row", alignItems: "center", gap: 10 },
  spin: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  rest: { alignItems: "center", gap: 16, paddingVertical: 36 },
});
