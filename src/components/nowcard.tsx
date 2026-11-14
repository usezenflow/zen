import { BlurView } from "expo-blur";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeInDown, Keyframe, useAnimatedStyle, useFrameCallback, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { Fill } from "@/components/meter";
import { fadeIn, Tap, EASE } from "@/components/tap";
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
        <Tap onPress={onDone} hitSlop={8} scale={0.88} style={[s.glass, s.solid]}><Glass /><Icon name="check" size={22} color="#0b0b0c" w={2.2} /></Tap>
      </View>
    </View>
  );
}

// ui.css .glass: backdrop-filter blur(8px) behind the translucent circle.
const Glass = () => <BlurView intensity={20} tint="default" style={StyleSheet.absoluteFill} />;

// Odometer: each digit is keyed by position and value, so only the digits that change rise in from below.
function Rise({ text, style }: { text: string; style: object }) {
  const parts = text.split(/(\d)/).filter(Boolean);
  return (
    <View style={s.rise} accessible accessibilityLabel={text}>
      {parts.map((c, i) => <Animated.Text key={`${i}${c}`} entering={FadeInDown.duration(220).easing(EASE).delay(i * 40)} style={style}>{c}</Animated.Text>)}
    </View>
  );
}

// views.html .viz, after LiveKit's bar visualizer: five pill bars that rest as dots.
// Listening: heights follow the mic level (middle tallest); a pause settles to dots with the middle one breathing.
// Thinking: all dots, one lit sweeping side to side.
const ENV = [0.55, 0.8, 1, 0.8, 0.55], DOT = 8, TALL = 48, QUIET = 0.08;
function VizBar({ i, clock, level, thinking, color }: { i: number; clock: SharedValue<number>; level?: SharedValue<number>; thinking: boolean; color: string }) {
  const st = useAnimatedStyle(() => {
    const sec = clock.get();
    if (thinking) {
      const p = Math.floor(sec / 0.15) % 8; // 0..4..1 ping-pong
      return { height: DOT, opacity: (p < 5 ? p : 8 - p) === i ? 1 : 0.25 };
    }
    const lv = Math.min(1, (level?.get() ?? 0) * 1.4);
    const k = Math.min(1, lv / QUIET); // 0 = a pause, 1 = speaking
    const breath = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(sec * Math.PI * 1.25));
    const rest = i === 2 ? breath : 0.25;
    const wob = 0.75 + 0.25 * Math.sin(sec * 9 + i * 1.7);
    return { height: Math.max(DOT, DOT + (TALL - DOT) * ENV[i] * lv * wob), opacity: rest + (1 - rest) * k };
  });
  return <Animated.View style={[s.bar, { backgroundColor: color }, st]} />;
}
function Viz({ thinking, level }: { thinking: boolean; level?: SharedValue<number> }) {
  const th = useTheme();
  const clock = useSharedValue(0);
  useFrameCallback((f) => { clock.set(f.timeSinceFirstFrame / 1000); });
  return <View style={s.viz}>{ENV.map((_, i) => <VizBar key={i} i={i} clock={clock} level={level} thinking={thinking} color={th.seal} />)}</View>;
}

// Each new word fades in rising 4px (views.html "Day, listening").
const wordIn = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 4 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE } }).duration(180);
const LINE = 31.2, MAX = LINE * 4; // .words: 24px, line-height 1.3; past four lines the oldest fades out at the top

// Listening / Thinking: live words (settled in ink, the word still being heard faded) over the bars.
export function Live({ state, words = "", level }: { state: Exclude<HoldState, "idle">; words?: string; level?: SharedValue<number> }) {
  const th = useTheme();
  const [tall, setTall] = useState(false);
  const list = words.trim().split(/\s+/).filter(Boolean);
  return (
    <View style={{ marginTop: 30 }}>
      <View style={s.wordsBox}>
        <View style={s.wordsRow} onLayout={(e) => setTall(e.nativeEvent.layout.height > MAX + 1)} accessible accessibilityLiveRegion="polite" accessibilityLabel={words}>
          {list.map((w, k) => (
            <Animated.Text key={`${k}:${w}`} entering={wordIn} style={[s.words, { color: th.ink }, state === "listening" && k === list.length - 1 && { opacity: 0.35 }]}>{w}{k < list.length - 1 ? " " : ""}</Animated.Text>
          ))}
        </View>
        {tall && <View pointerEvents="none" style={[s.wordsFade, { backgroundImage: `linear-gradient(${th.bg}, ${th.bg}00)` }]} />}
      </View>
      <Viz thinking={state === "thinking"} level={level} />
    </View>
  );
}

const biggest = (ms: Move[]) => ms.reduce((a, b) => (Math.abs(b.to - b.from) > Math.abs(a.to - a.from) ? b : a));

// views.html magic 1: the art slot's replacement on a day something moved. Tap opens the story in place.
export function Brief({ moves, now, onOpen }: { moves: Move[]; now: number; onOpen: () => void }) {
  const th = useTheme();
  const direct = moves.filter((x) => x.cause && x.cause !== t("causeKnock")); // the sentence names a real cause, not a knock-on
  const m = biggest(direct.length ? direct : moves), r = topReason(m.why?.filter((x) => x.key !== "guess"));
  const to = when(m.to, now), what = t("briefMove", { title: m.title, when: to });
  const sub = [m.cause ? t("briefCause", { cause: m.cause, what }) : what, r && reasonText(r, true)].filter(Boolean).join(". ") + ".";
  const at = sub.indexOf(what), toAt = at + what.length - to.length; // `what` opens with the title and ends with the time
  return (
    <Tap onPress={onOpen} scale={0.98} accessibilityRole="button" accessibilityLabel={t("briefOpen")} style={[s.brief, { backgroundColor: th.chip }]}>
      <Text style={[s.lab, { color: th.muted, opacity: 1 }]}>{t(new Date(now).getHours() < 12 ? "briefMorning" : "briefNow")}</Text>
      <View style={s.lf}><Logo size={30} mode="line" color={th.ink} /></View>
      <Text style={[s.t, { color: th.ink, marginTop: 26, paddingRight: 40 }]}>{moves.length === 1 ? t("briefOne", { title: m.title }) : t("briefN", { n: moves.length })}</Text>
      {/* The moved task and its new time in ink 600 (.brief .s b), so which task and when stand out from the sentence. */}
      <Text style={[s.bs, { color: th.muted }]}>
        {sub.slice(0, at)}<Text style={{ color: th.ink, fontFamily: ff("600") }}>{m.title}</Text>
        {sub.slice(at + m.title.length, toAt)}<Text style={{ color: th.ink, fontFamily: ff("600"), fontVariant: ["tabular-nums"] }}>{to}</Text>
        {sub.slice(toAt + to.length)}
      </Text>
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
          <View style={{ marginTop: 2 }} />
          {ms.map((m, i) => {
            const r = topReason(m.why?.filter((x) => x.key !== "guess"));
            return (
              <View key={m.id + m.at} style={[s.mv, i > 0 && { borderTopWidth: 1, borderTopColor: th.line }]}>
                <Text style={[s.mt, { color: th.ink }]}>{m.title}</Text>
                <View style={s.ft}>
                  <Text style={[s.fr, { color: th.muted, textDecorationLine: "line-through" }]}>{when(m.from, now)}</Text>
                  <Icon name="right" size={14} color={th.ink} w={2.2} />
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
        <View style={s.glass}><Glass /><Icon name="right" size={22} color="#fff" w={2.2} /></View>
      </View>
    </Tap>
  );
}

function Spin() {
  const th = useTheme();
  const r = useSharedValue(0);
  useEffect(() => { r.set(withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1)); }, [r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get().toFixed(2)}deg` }] }));
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
            {/* a long title wraps inside the 24 px gutters, as in magic.html: an RN Text in a row does not shrink by itself */}
            <Text style={{ flexShrink: 1, color: now ? th.ink : th.muted, fontSize: font.md, fontFamily: ff(now ? "600" : "500") }}>{l}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  art: { marginTop: 16, height: 220, borderRadius: 28, overflow: "hidden", paddingHorizontal: 20, paddingTop: 20 },
  lab: { fontSize: font.label, fontFamily: ff("500"), opacity: 0.85 },
  t: { marginTop: 8, fontSize: 24, lineHeight: 32, fontFamily: ff("600"), letterSpacing: -0.48 }, // .art .t: 24/600, line 32 so stacked Vietnamese marks (Ế, Ữ) are not clipped
  foot: { position: "absolute", left: 20, right: 16, bottom: 16, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  meter: { flexDirection: "row", alignItems: "center", gap: 12 },
  cap: { width: 18, height: 54, borderRadius: 10, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", justifyContent: "flex-end", padding: 2 },
  rise: { flexDirection: "row", overflow: "hidden", marginVertical: -5 }, // pulls the taller line back to the old 26px footprint
  big: { fontSize: 26, fontFamily: ff("600"), lineHeight: 36 }, // headroom so the clip keeps vi tone marks (phút)
  small: { fontSize: font.md, fontFamily: ff("500"), opacity: 0.9, marginTop: 3 },
  glass: { width: 52, height: 52, borderRadius: 26, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.28)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
  solid: { backgroundColor: "rgba(255,255,255,0.85)" },
  words: { fontSize: 24, lineHeight: LINE, fontFamily: ff("600"), letterSpacing: -0.48 }, // .words: 24/600, 1.3, -.02em
  wordsBox: { maxHeight: MAX, overflow: "hidden", justifyContent: "flex-end" },
  wordsRow: { flexDirection: "row", flexWrap: "wrap" },
  wordsFade: { position: "absolute", left: 0, right: 0, top: 0, height: 32 },
  viz: { flexDirection: "row", gap: 6, alignItems: "center", height: TALL, marginTop: 24 },
  bar: { width: DOT, borderRadius: DOT / 2 },
  brief: { marginTop: 16, borderRadius: 28, padding: 18, paddingHorizontal: 20 },
  lf: { position: "absolute", top: 16, right: 16 },
  bs: { marginTop: 6, fontSize: font.md, lineHeight: 20.25, fontFamily: ff("500") }, // .brief .s: 1.35
  sl: { fontSize: font.label, fontFamily: ff("500"), marginTop: 16 },
  mv: { paddingVertical: 14 },
  mt: { fontSize: 17, fontFamily: ff("600") },
  ft: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  fr: { fontSize: font.md, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  rs: { marginTop: 3, fontSize: font.md, lineHeight: 20.25, fontFamily: ff("500") },
  close: { alignSelf: "flex-start", marginTop: 14, height: 36, paddingHorizontal: 16, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  ct: { fontSize: font.sub, fontFamily: ff("700") },
  steps: { position: "absolute", left: 24, right: 24, bottom: 150, gap: 10, zIndex: 7 },
  st: { flexDirection: "row", alignItems: "center", gap: 10 },
  spin: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  rest: { alignItems: "center", gap: 16, paddingVertical: 36 },
});
