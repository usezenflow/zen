import { MICRO_MIN } from "../planner/policy";
import { bolded } from "@/components/bold";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeInDown, interpolate, Keyframe, useAnimatedStyle, useFrameCallback, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { Fill } from "@/components/meter";
import { fadeIn, settle, Tap, EASE } from "@/components/tap";
import { Icon, TypeArt, artOf, seedOf } from "@/components/art";
import { hhmm } from "@/components/cal";
import type { HoldState } from "@/components/hold";
import { t } from "@/lib/i18n";
import { kvGet, kvSet } from "@/lib/store";
import { KIND_LIST, KIND_VI, reasonText, topReason } from "@/lib/reasons";
import { useTheme, font, ff, fd } from "@/lib/theme";
import { when } from "@/lib/when";
import type { Move, Kind, Task } from "@/lib/types";
import type { Item } from "@/components/menu";

// gap: magic.html 17, a later task offered for the free time now (its label, e.g. "30p"); the circle takes it now.
export type Card = { task: Task; start?: number; end?: number; gap?: string };

// Art card with progress meter; the circle marks it done. Swipe is handled by the caller.
// Thử 15p: a short ramp on a block of 45 minutes or more, or one put off before; kv "now.micro" keeps it across restarts.
type Micro = { id: string; startedAt: number; endsAt: number };
const MICRO_KEY = "now.micro";
const parseMicro = (v: string | null): Micro | null => { try { return v ? JSON.parse(v) : null; } catch { return null; } };

// views.html "Day, next up": a flexible block not started yet also offers Làm luôn (onStart: that sitting moves to now).
// calm.html "Hết giờ": a block whose end passed unticked; Thêm 15 phút and Chuyển việc replace the usual buttons.
// onKind: the kind chip's tap, with the chip's window top and bottom so the caller can open the kind menu beside it.
export type KindPick = (task: Task, top: number, bottom: number) => void;
export function NowCard({ card, onDone, onStart, onLater, onMicroRest, onKind, onExtend, over, still }: { still?: boolean; card: Card; onDone: () => void; onStart?: () => void; onLater?: () => void; onMicroRest?: (minutes: number) => void; onKind?: KindPick; onExtend?: () => void; over?: { next?: Task } }) {
  const th = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const [micro, setMicro] = useState<Micro | null>(null);
  useEffect(() => { // the meter fills continuously: a slow ticker is smooth enough for a 54px capsule
    const i = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => { let live = true; kvGet(MICRO_KEY).then((v) => { if (live) setMicro(parseMicro(v)); }).catch(() => {}); return () => { live = false; }; }, []);
  const saveMicro = (m: Micro | null) => { setMicro(m); kvSet(MICRO_KEY, JSON.stringify(m)).catch(() => {}); };
  const { task, start = 0, end = 0 } = card;
  const going = !card.gap && start <= now && now < end;
  const mic = micro?.id === task.id ? micro : null; // a try on another task is not this card's
  const micDone = !!mic && now >= mic.endsAt;
  const p = mic ? Math.max(0, Math.min(1, (now - mic.startedAt) / (mic.endsAt - mic.startedAt))) : going ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 0;
  const mins = Math.max(1, Math.round((going ? end - now : end - start) / 60000));
  const left = Math.max(1, Math.ceil(((mic?.endsAt ?? 0) - now) / 60000));
  const moving = !going && !task.fixed && !card.gap && !!onLater;
  const microOk = !going && !task.fixed && !card.gap && (end - start >= 45 * 60000 || (task.misses ?? 0) > 0);
  // Three pills do not fit a phone with labels: the Dời one goes icon-only, as a 54px round glass.
  const trio = moving && microOk && !mic && !!onStart;
  const big = mic ? (micDone ? t("microFull", { n: MICRO_MIN }) : t("nMin", { n: left })) : going ? t("nMin", { n: mins }) : hhmm(start);
  const small = mic ? (micDone ? t("microSub") : t("until", { time: hhmm(mic.endsAt) })) : going ? t("until", { time: hhmm(end) }) : t("nMin", { n: mins });
  return (<>
    <View style={[s.art, { backgroundColor: th.chip }]}>
      <View style={StyleSheet.absoluteFill}><TypeArt type={artOf(task)} w={264} h={220} seed={seedOf(task.id)} drift={!still} /></View>
      <View style={s.head}>
        <Text numberOfLines={1} style={[s.lab, { color: th.onart, flexShrink: 1 }]}>{over ? t("overLab", { time: hhmm(end) }) : t(going || mic ? "doingNow" : "nextUp")}</Text>
        {onKind && !card.gap && <KindChip task={task} onKind={onKind} />}
      </View>
      <Text style={[s.t, { color: th.onart }]} numberOfLines={2}>{card.gap ? bolded(t("gapT", { free: card.gap, title: task.title })) : task.title}</Text>
      <View style={s.foot}>
        {over ? <View style={s.overActs}>
          <Tap onPress={onExtend} scale={0.94} accessibilityRole="button" accessibilityLabel={t("overExtend")} style={[s.glass, s.start, s.overBtn, s.soft]}><Glass /><Icon name="plus" size={18} color="#fff" /><Text style={s.startT} numberOfLines={1}>{t("overExtend")}</Text></Tap>
          <Tap onPress={onLater} scale={0.94} accessibilityRole="button" accessibilityLabel={t("overMove")} style={[s.glass, s.start, s.overBtn, s.primary]}><Glass /><Icon name="right" size={22} color={th.bg} /><Text style={[s.startT, s.primaryT, { color: th.bg }]} numberOfLines={1}>{t("overMove")}</Text></Tap>
        </View> : <>
        <View style={s.row1}>
        <View style={s.meter}>
          <View style={s.cap}><Fill p={p} inner={56} /></View>
          <View>
            <Rise text={big} style={[s.big, { color: th.onart }]} />
            <Text numberOfLines={1} style={[s.small, { color: th.onart }]}>{small}</Text>
          </View>
        </View>
        {!moving && !micDone && <Tap onPress={onDone} hitSlop={8} scale={0.88} testID="nowDone" accessibilityRole="button" accessibilityLabel={t("markDone")} style={[s.glass, s.solid]}><Icon name="check" size={22} color="#0b0b0c" w={2} /></Tap>}
        </View>
        <View style={s.acts2}>
          {mic && micDone ? <>
            <Tap onPress={() => { saveMicro(null); onMicroRest?.(MICRO_MIN); }} scale={0.94} accessibilityRole="button" accessibilityLabel={t("microRest")} style={[s.glass, s.start, s.soft]}><Glass /><Icon name="clock" size={22} color="#fff" /><Text style={s.startT} numberOfLines={1}>{t("microRest")}</Text></Tap>
            {onStart && <Tap onPress={() => { saveMicro(null); onStart(); }} scale={0.94} accessibilityRole="button" accessibilityLabel={t("microGo")} style={[s.glass, s.start, s.primary, { backgroundColor: th.ink }]}><Glass /><Icon name="play" size={22} color={th.bg} /><Text style={[s.startT, s.primaryT, { color: th.bg }]} numberOfLines={1}>{t("microGo")}</Text></Tap>}
          </> : <>
            {moving && <Tap onPress={onLater} scale={0.94} accessibilityRole="button" accessibilityLabel={t("laterBtn")} style={[s.glass, s.start, s.soft, trio && s.iconOnly]}><Glass /><Icon name="clock" size={22} color="#fff" />{!trio && <Text style={s.startT} numberOfLines={1}>{t("laterBtn")}</Text>}</Tap>}
            {moving && onStart && <Tap onPress={onStart} scale={0.94} accessibilityRole="button" accessibilityLabel={t("startLab")} style={[s.solid2, s.start, { backgroundColor: th.ink }]}>{!trio && <Icon name="play" size={22} color={th.bg} />}<Text style={[s.startT, s.primaryT, { color: th.bg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t("startLab")}</Text></Tap>}
            {microOk && !mic && <Tap onPress={() => { const at0 = Date.now(); saveMicro({ id: task.id, startedAt: at0, endsAt: at0 + MICRO_MIN * 60000 }); }} scale={0.94} accessibilityRole="button" accessibilityLabel={t("microBtn", { n: MICRO_MIN })} style={[s.glass, s.start]}><Glass />{!trio && <Icon name="play" size={22} color="#fff" />}<Text style={s.startT} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t("microBtn", { n: MICRO_MIN })}</Text></Tap>}
          </>}
        </View>
        </>}
      </View>
    </View>
    {over && <Text style={[s.note, { color: th.muted }]}>{over.next ? t("overNext", { next: over.next.title, title: task.title }) : t("overStay", { title: task.title })}</Text>}
  </>);
}

// calm.html .kc: the kind as a pill beside the label; the caller opens the kind menu from its window position.
const cap1 = (x: string) => x[0].toUpperCase() + x.slice(1);
export const kindName = (k: Kind) => (k === "other" ? t("kindOther") : cap1(KIND_VI[k]));
// The kind menu the detail screen shows (same names, same order); pick gets the chosen kind.
export const kindItems = (pick: (k: Kind) => void): Item[] => KIND_LIST.map((k) => ({ label: kindName(k), icon: k, onPress: () => pick(k) }));
function KindChip({ task, onKind }: { task: Task; onKind: KindPick }) {
  const th = useTheme();
  const at = useRef<ComponentRef<typeof View>>(null);
  return (
    <View ref={at} style={s.kcWrap}>
      <Tap onPress={() => at.current?.measureInWindow((_x, y, _w, h) => onKind(task, y, y + h))} scale={0.94} hitSlop={7} accessibilityRole="button" accessibilityLabel={t("kindChange")} style={s.kc}>
        <Icon name={task.kind} size={15} color={th.onart} w={2} />
        <Text numberOfLines={1} style={[s.kcT, { color: th.onart }]}>{kindName(task.kind)}</Text>
        <Icon name="down" size={13} color={th.onart} w={2} />
      </Tap>
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

// The move the sentence names: a real cause over a knock-on, then the biggest shift.
const headMove = (ms: Move[]) => { const direct = ms.filter((x) => x.cause && x.cause !== t("causeKnock")); return biggest(direct.length ? direct : ms); };

// magic 1b: swiped sideways past 110 it flicks off as the now-card does, and `onDismiss` retires it; short of that it springs back.
function useFlick(onDismiss?: () => void) {
  const x = useSharedValue(0);
  const pan = usePanGesture({
    testID: "brief",
    enabled: !!onDismiss,
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onUpdate: (e) => { "worklet"; x.set(e.translationX); },
    onDeactivate: (e) => {
      "worklet";
      if (Math.abs(e.translationX) <= 110) { x.set(settle(0)); return; }
      x.set(withTiming(Math.sign(e.translationX) * 500, { duration: 180 }, (ok) => { if (ok && onDismiss) scheduleOnRN(onDismiss); }));
    },
  });
  const flick = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { rotate: `${interpolate(x.get(), [-300, 300], [-8, 8]).toFixed(2)}deg` }] }));
  return { pan, flick };
}

// views.html .mvp: moves not yet briefed, slim, under the now card or above the week grid. Tap opens the story; a swipe or screen-reader action dismisses.
// head/sub: another proposal's words in the same pill (a rebalance offer), in place of the moves' own.
export function MovesPill({ moves, now, onOpen, onDismiss, head, sub }: { moves: Move[]; now: number; onOpen: () => void; onDismiss?: () => void; head?: string; sub?: string }) {
  const th = useTheme();
  const { pan, flick } = useFlick(onDismiss);
  if (!moves.length) return null;
  const m = headMove(moves);
  return (
    <GestureDetector gesture={pan}>
    <Animated.View style={flick}>
    <Tap onPress={onOpen} scale={0.98} accessibilityRole="button" accessibilityLabel={t("briefOpen")}
      accessibilityActions={onDismiss ? [{ name: "dismiss", label: t("briefHide") }] : undefined} onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === "dismiss") onDismiss?.(); }}
      style={[s.mvp, { backgroundColor: th.chip }]}>
      <View style={[s.mvDot, { backgroundColor: th.seal }]} />
      {/* two lines: how many, then the biggest move with its title in bold (never " · " run on) */}
      <View style={s.mvTx}>
        <Text numberOfLines={1} style={[s.mvT, { color: th.ink }]}>{head ?? t("briefN", { n: moves.length })}</Text>
        <Text numberOfLines={1} style={[s.mvS, { color: th.muted }]}>{sub ?? bolded(t("briefMove", { title: m.title, when: when(m.to, now) }), { color: th.ink })}</Text>
      </View>
      <View style={[s.mvX, { backgroundColor: th.ink }]}><Text style={[s.mvXT, { color: th.bg }]}>{t("briefSee")}</Text></View>
    </Tap>
    </Animated.View>
    </GestureDetector>
  );
}

// magic 2: the moves grouped by cause, old time struck, new time, one reason each.
// `onUndo`: where the user made the change (the detail screen), the story can take it back.
// onApply (a rebalance proposal): the two actions are Để nguyên (onKeep) and Áp dụng; nothing moved until Áp dụng.
export function Story({ moves, now, onClose, onUndo, onKeep, onApply }: { moves: Move[]; now: number; onClose: () => void; onUndo?: () => void; onKeep?: () => void; onApply?: () => void }) {
  const th = useTheme();
  const groups = new Map<string, Move[]>();
  const rank = (c?: string) => (!c ? 2 : c === t("causeKnock") ? 1 : 0); // real causes first, then knock-ons, then plain refinements
  for (const m of [...moves].sort((a, b) => rank(a.cause) - rank(b.cause) || a.at - b.at)) groups.set(m.cause ?? "", [...(groups.get(m.cause ?? "") ?? []), m]);
  return (
    <Animated.View entering={fadeIn}>
      {[...groups].map(([cause, ms]) => (
        <View key={cause} style={{ marginTop: 6 }}>
          {!!cause && <Text style={[s.sl, { color: th.muted }]}>{bolded(cause, { color: th.ink })}</Text>}
          <View style={{ marginTop: 2 }} />
          {ms.map((m, i) => {
            const r = topReason(m.why?.filter((x) => x.key !== "guess"));
            return (
              <View key={m.id + m.at} style={[s.mv, i > 0 && { borderTopWidth: 1, borderTopColor: th.line }]}>
                <Text style={[s.mt, { color: th.ink }]}>{m.title}</Text>
                <View style={s.ft}>
                  <Text style={[s.fr, { color: th.muted, textDecorationLine: "line-through" }]}>{when(m.from, now)}</Text>
                  <Icon name="right" size={18} color={th.ink} w={2} />
                  <Text style={[s.fr, { color: th.ink, fontFamily: ff("500") }]}>{when(m.to, now)}</Text>
                </View>
                {r && <Text style={[s.rs, { color: th.muted }]}>{bolded(reasonText(r, true), { color: th.ink })}</Text>}
              </View>
            );
          })}
        </View>
      ))}
      <View style={s.acts}>
        {onApply ? <>
          <Tap onPress={onKeep} accessibilityRole="button" accessibilityLabel={t("rebalKeep")} style={[s.shut, { backgroundColor: th.chip }]}><Icon name="x" size={18} color={th.ink} w={2} /><Text numberOfLines={1} style={[s.ct, { color: th.ink }]}>{t("rebalKeep")}</Text></Tap>
          <Tap onPress={onApply} accessibilityRole="button" accessibilityLabel={t("rebalApply")} style={[s.shut, { backgroundColor: th.ink }]}><Icon name="check" size={18} color={th.bg} w={2.4} /><Text numberOfLines={1} style={[s.ct, { color: th.bg }]}>{t("rebalApply")}</Text></Tap>
        </> : <>
        <Tap onPress={onClose} accessibilityRole="button" accessibilityLabel={t("briefClose")} style={[s.close, { backgroundColor: th.ink }]}><Text style={[s.ct, { color: th.bg }]}>{t("briefClose")}</Text></Tap></>}
        {onUndo && <Tap onPress={onUndo} accessibilityRole="button" accessibilityLabel={t("undo")} style={[s.undo, { borderColor: th.line }]}><Icon name="undo" size={16} color={th.ink} w={2} /><Text numberOfLines={1} style={[s.undoT, { color: th.ink }]}>{t("undo")}</Text></Tap>}
      </View>
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
        <Text style={[s.small, { color: th.onart, fontFamily: ff("500") }]}>{sub}</Text>
        <View style={s.glass}><Glass /><Icon name="right" size={22} color="#fff" w={2} /></View>
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
// calm.html "Weekly, noticed": the same task done on one weekday three weeks running; yes makes it a weekly repeat.
export function SeriesAsk({ title, sub, yes, onYes, onNo }: { title: string; sub: string; yes: string; onYes: () => void; onNo: () => void }) {
  const th = useTheme();
  // calm.html .find: a hairline card, the question, then two pills; the yes is the ink-filled one
  return (
    <View style={[s.find, { borderColor: th.line }]}>
      <Text style={[s.findC, { color: th.ink }]}>{title}</Text>
      <Text style={[s.findC2, { color: th.muted }]}>{sub}</Text>
      <View style={s.findActs}>
        <Tap onPress={onNo} scale={0.96} accessibilityRole="button" accessibilityLabel={t("seriesNo")} style={[s.findA, { borderColor: th.line }]}><Icon name="x" size={16} color={th.ink} w={2} /><Text style={[s.findAT, { color: th.ink }]} numberOfLines={1}>{t("seriesNo")}</Text></Tap>
        <Tap onPress={onYes} scale={0.96} accessibilityRole="button" accessibilityLabel={yes} style={[s.findA, { backgroundColor: th.ink, borderColor: th.ink }]}><Icon name="refresh" size={16} color={th.bg} w={2} /><Text style={[s.findAT, { color: th.bg, fontFamily: ff("600") }]} numberOfLines={1}>{yes}</Text></Tap>
      </View>
    </View>
  );
}

export function Steps({ lines }: { lines: string[] }) {
  const th = useTheme();
  return (
    <View style={s.steps} pointerEvents="none">
      {lines.map((l, i) => {
        const now = i === lines.length - 1;
        return (
          <Animated.View key={i} entering={FadeInDown.duration(220).easing(EASE)} style={s.st}>
            {now ? <Spin /> : <Icon name="check" size={18} color={th.muted} w={2} />}
            {/* a long title wraps inside the 24 px gutters, as in magic.html: an RN Text in a row does not shrink by itself */}
            <Text style={{ flexShrink: 1, color: now ? th.ink : th.muted, fontSize: font.md, fontFamily: ff(now ? "500" : "500") }}>{l}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

// White text over art: a soft shadow (reference text-shadow 0 1px 6px .22), never an outline.
const SHADOW = { textShadowColor: "rgba(0,0,0,.22)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 } as const;
const s = StyleSheet.create({
  art: { marginTop: 16, height: 236, borderRadius: 34, overflow: "hidden", paddingHorizontal: 20, paddingTop: 20 }, // calm.html .art: 236 high, 34px radius
  lab: { fontSize: 13, lineHeight: 18, fontFamily: ff("400"), letterSpacing: 1.1, textTransform: "uppercase", opacity: 0.9, ...SHADOW }, // v2 .lab: 12.5px, light, caps; label and title one group
  t: { marginTop: 2, fontSize: 32, lineHeight: 41, fontFamily: fd("800"), letterSpacing: -1.1, ...SHADOW }, // v2 .art .t: display 800, 32px, -.035em, 1.1
  find: { borderRadius: 22, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 18, marginTop: 16 }, // calm.html .find
  findC: { fontSize: 17, lineHeight: 23, fontFamily: ff("500") },
  findC2: { marginTop: 6, fontSize: 15, lineHeight: 21, fontFamily: ff("400") },
  findActs: { flexDirection: "row", gap: 8, marginTop: 14 },
  findA: { height: 40, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  findAT: { fontSize: 15, fontFamily: ff("500") },
  foot: { position: "absolute", left: 20, right: 20, bottom: 18, gap: 12 }, // two rows: the meter, then the pair of buttons full width
  row1: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  meter: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 0 },
  cap: { width: 20, height: 64, borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", justifyContent: "flex-end", padding: 2 }, // v2 .art .cap2: 20 x 64 vertical pill
  rise: { flexDirection: "row", overflow: "hidden", marginVertical: -5 }, // pulls the taller line back to the old footprint
  big: { fontSize: 30, fontFamily: fd("700"), lineHeight: 34, letterSpacing: -0.9, ...SHADOW }, // v2 .art .big: display 700, 30px
  small: { fontSize: 17, fontFamily: ff("500"), opacity: 0.94, marginTop: 3, ...SHADOW },
  glass: { width: 56, height: 56, borderRadius: 28, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.22)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.45)" }, // v2.css .glass 56px
  solid2: { borderRadius: 28, overflow: "hidden" }, // ui.css .gbtn.solid: the accent fill, no blur, no border
  solid: { backgroundColor: "rgba(255,255,255,0.94)", borderColor: "transparent" }, // crisp: a blur under a near-white fill only turns it grey
  acts2: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0 },
  start: { flex: 1, flexShrink: 1, minWidth: 0, height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14 }, // ui.css .nowbtns .gbtn: 54 high, 14px side padding, 15px label
  iconOnly: { flex: 0, flexGrow: 0, width: 54, paddingHorizontal: 0 }, // trio: only the clock
  startT: { color: "#fff", fontSize: 15, lineHeight: 20, fontFamily: ff("600"), flexShrink: 1, minWidth: 0 }, // on the glass: no shadow, the pill is near-solid
  primary: { borderColor: "transparent" }, // calm.html .gbtn.solid: ink CTA, no shadow (the colour comes from the theme at the call site)
  primaryT: { textShadowColor: "transparent" },
  soft: { opacity: 0.72 }, // Dời: one tap, Zen picks the day and hour; lighter than Bắt đầu
  words: { fontSize: 24, lineHeight: LINE, fontFamily: ff("500"), letterSpacing: -0.48 }, // .words: 24/600, 1.3, -.02em
  wordsBox: { maxHeight: MAX, overflow: "hidden", justifyContent: "flex-end" },
  wordsRow: { flexDirection: "row", flexWrap: "wrap" },
  wordsFade: { position: "absolute", left: 0, right: 0, top: 0, height: 32 },
  viz: { flexDirection: "row", gap: 6, alignItems: "center", height: TALL, marginTop: 24 },
  bar: { width: DOT, borderRadius: DOT / 2 },
  mvp: { marginTop: 14, minHeight: 60, paddingVertical: 10, paddingLeft: 16, paddingRight: 10, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 10 }, // .mvp: two lines
  mvDot: { width: 8, height: 8, borderRadius: 99 },
  mvTx: { flex: 1, minWidth: 0 },
  mvT: { fontSize: font.md, fontFamily: ff("500") },
  mvS: { marginTop: 2, fontSize: font.label, fontFamily: ff("500") },
  mvX: { height: 36, paddingHorizontal: 12, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  mvXT: { fontSize: font.sub, fontFamily: ff("500") },
  sl: { fontSize: font.label, fontFamily: ff("300"), marginTop: 16 }, // eyebrow: light
  mv: { paddingVertical: 14 },
  mt: { fontSize: 17, fontFamily: ff("500") },
  ft: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  fr: { fontSize: font.md, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  rs: { marginTop: 3, fontSize: 15, lineHeight: 21, fontFamily: ff("400") }, // calm.html .chg .t2: 15px regular, muted
  acts: { flexDirection: "row", gap: 8, marginTop: 20 },
  close: { alignSelf: "flex-start", height: 40, paddingHorizontal: 16, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  ct: { fontSize: font.sub, fontFamily: ff("600") },
  shut: { flex: 1, height: 52, borderRadius: 99, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, // calm.html .gbtn in the rebalance pair
  undo: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, marginTop: 8 }, // calm.html .undo: 36 high, 14px
  undoT: { fontSize: 14, fontFamily: ff("500") },
  steps: { position: "absolute", left: 24, right: 24, bottom: 150, gap: 10, zIndex: 7 },
  st: { flexDirection: "row", alignItems: "center", gap: 10 },
  spin: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  rest: { alignItems: "center", gap: 16, paddingVertical: 36 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  kcWrap: { flexShrink: 0 },
  kc: { flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.22)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)" }, // v2 .kc: 32 high, 14px, hairline glass
  kcT: { maxWidth: 150, fontSize: 14, lineHeight: 20, fontFamily: ff("500"), ...SHADOW },
  overActs: { flexDirection: "row", gap: 8 },
  overBtn: { flex: 1 },
  note: { marginTop: 12, fontSize: font.md, lineHeight: 23, fontFamily: ff("500") }, // calm.html: the caption under the card
});
