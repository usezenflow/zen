import { StyleSheet, Text, View } from "react-native";
import { useEffect, useRef } from "react";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Count } from "@/components/count";
import { TypeArt } from "@/components/art";
import { Meter } from "@/components/meter";
import { SwipeDelete } from "@/components/row";
import { fadeIn } from "@/components/tap";
import { t } from "@/lib/i18n";
import { KIND_VI, kindW } from "@/lib/reasons";
import { useTheme, font, ff, motion } from "@/lib/theme";
import type { Kind, Rule } from "@/lib/types";
import { EARLY, PROMOTE, type Insights } from "@/planner";

// magic 10 + 11 as one home view (the Nhịp tab): what Zen learned, then what you told it. Trust lives on the main screen, not in Settings.
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const ruleSub = (r: Rule) => {
  const d = r.days.length ? [...r.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => WD[x]).join(", ") : t("everyDay");
  const tm = r.to >= 1440 ? (r.from > 0 ? t("fromTime", { t: hm(r.from) }) : "") : `${hm(r.from)} - ${hm(r.to)}`;
  return tm ? `${d} · ${tm}` : d;
};
const sureWord = (v: number) => t(v >= 0.75 ? "sureHigh" : v >= 0.5 ? "sureMid" : "sureLow");
const Card = ({ title, sub, children }: { title: React.ReactNode; sub: string; children?: React.ReactNode }) => {
  const th = useTheme();
  return (
    <Animated.View entering={fadeIn} style={[s.ins, { backgroundColor: th.chip }]}>
      {typeof title === "string" ? <Text style={[s.b, { color: th.ink }]}>{title}</Text> : title}
      <Text style={[s.small, { color: th.muted, marginTop: 4 }]}>{sub}</Text>
      {children ? <View style={s.viz}>{children}</View> : null}
    </Animated.View>
  );
};
// .chipk: a 24px sand swatch, then the kind. Study reads as the lecture palette, everything else as plan (magic.html).
const Chip = ({ kind }: { kind: Kind }) => {
  const th = useTheme();
  return (
    <View style={[s.chip, { backgroundColor: th.bg }]}>
      <View style={s.sw}><TypeArt type={kind === "study" ? "lecture" : "plan"} w={24} h={24} seed={3} /></View>
      <Text style={[s.chipT, { color: th.ink }]}>{KIND_VI[kind]}</Text>
    </View>
  );
};
// Placeholder as a .set row: ink line, muted hint, never a lone grey sentence.
const Empty = ({ title, sub }: { title: string; sub: string }) => {
  const th = useTheme();
  return <View style={[s.set, { borderColor: th.line }]}><View style={s.tx}><Text style={[s.b, { color: th.ink }]}>{title}</Text><Text style={[s.small2, { color: th.muted }]}>{sub}</Text></View></View>;
};

/** The Nhịp headline as a line key and its numbers: learned golden hours, else the early guess from what you did, else how much it has seen. */
const headOf = (i: Insights): { k: "goldenRange" | "earlyRange" | "seenN" | "stillLearning"; vars: Record<string, number> } =>
  i.golden ? { k: "goldenRange", vars: { a: i.golden.from, b: i.golden.to } }
  : i.early ? { k: "earlyRange", vars: { a: i.early.from, b: i.early.to } }
  : i.seen ? { k: "seenN", vars: { n: i.seen } } : { k: "stillLearning", vars: {} };
export const rhythmHead = (i: Insights) => { const h = headOf(i); return t(h.k, h.vars); };

// One hour of the strip: grows from nothing on first paint (a little later for each hour), then eases to every new height and tint.
function Bar({ v, i, lit }: { v: number; i: number; lit: boolean }) {
  const h = useSharedValue(0), o = useSharedValue(lit ? 1 : 0.45), first = useRef(true);
  useEffect(() => {
    const go = withTiming(10 + v * 90, { duration: motion.progress, easing: Easing.out(Easing.cubic) });
    h.set(first.current ? withDelay(i * 14, go) : go);
    o.set(withTiming(lit ? 1 : 0.45, { duration: motion.progress }));
    first.current = false;
  }, [v, lit, i, h, o]);
  const st = useAnimatedStyle(() => ({ height: `${h.get()}%`, opacity: o.get() }));
  return <Animated.View style={[s.bar, st]} />;
}

export function Rhythm({ i, rules, onForget, onForgetHour }: { i: Insights; rules: Rule[]; onForget: (r: Rule) => void; onForgetHour: (hour: number) => void }) {
  const th = useTheme();
  const g = i.golden, e = i.early, pair = i.pairs[0], slip = i.slip[0], kind = i.byKind[0], un = i.unsure;
  const line = [s.set, { borderColor: th.line }];
  return (
    <Animated.View entering={fadeIn}>
      <View style={s.art}>
        <View style={StyleSheet.absoluteFill}><TypeArt type="plan" w={264} h={170} seed={5} /></View>
        <Text style={s.lab}>{t("goldenHours")}</Text>
        <Count style={s.title} k={headOf(i).k} vars={headOf(i).vars} />
        {/* Before any evidence the bars are the cold prior (linucb curve), all dim: a guess, not a golden range. */}
        <View style={s.strip} accessibilityLabel={rhythmHead(i)}>
          {i.hours.map((v, h) => { const w = g ?? e; return <Bar key={h} v={v} i={h} lit={!!w && h >= w.from && h < w.to} />; })}
        </View>
        <View style={s.hrs}>{[0, 6, 12, 18, 24].map((h) => <Text key={h} style={s.hr}>{h}</Text>)}</View>
      </View>
      {!g && (e ? <Card title={<Count k="earlyTitle" vars={{ a: e.from, b: e.to }} style={[s.b, { color: th.ink }]} />} sub={t("earlySub", { n: Math.max(1, PROMOTE - e.n) })} />
        : i.seen ? <Card title={<Count k="moreN" vars={{ n: Math.max(1, EARLY - i.seen) }} style={[s.b, { color: th.ink }]} />} sub={t("seenSub")} />
        : <Card title={t("learningT")} sub={t("learningSub")} />)}
      {pair && <Card title={t("pairTitle", { k: KIND_VI[pair.before] })} sub={t("pairSub")}><Chip kind={pair.before} /></Card>}
      {kind && <Card title={t("kindTitle", { k: kindW(kind.kind, true), a: kind.from, b: kind.to })} sub={t("kindSub")}><Chip kind={kind.kind} /><Meter v={kind.sure} /></Card>}
      {slip && <Card title={t("slipTitle", { k: kindW(slip.kind, true) })} sub={t("slipSub", { n: Math.round(slip.rate * 10) })}><Meter v={slip.rate} /></Card>}
      {un && <Card title={t("unsureTitle", { a: un.from, b: un.to })} sub={t("unsureSub")} />}

      <Text style={[s.lab2, { color: th.muted }]}>{t("saidByYou")}</Text>
      {rules.length ? rules.map((r) => (
        <SwipeDelete key={r.id} onDelete={() => onForget(r)}>
          <View style={line} accessibilityHint={t("swipeForget")}>
            <View style={s.tx}><Text style={[s.b, { color: th.ink }]}>{r.text}</Text><Text style={[s.small2, { color: th.muted }]}>{ruleSub(r)}</Text></View>
          </View>
        </SwipeDelete>
      )) : <Empty title={t("noRulesT")} sub={t("noRules")} />}
      {i.avoid.length > 0 && <Text style={[s.lab2, { color: th.muted }]}>{t("avoidLab")}</Text>}
      {i.avoid.map((x) => (
        <SwipeDelete key={x.hour} onDelete={() => onForgetHour(x.hour)}>
          <View style={line} accessibilityHint={t("swipeForget")}>
            <View style={s.tx}><Text style={[s.b, { color: th.ink }]}>{t("avoidRow", { a: x.hour, b: x.hour + 1 })}</Text><Text style={[s.small2, { color: th.muted }]}>{t("avoidSub", { n: x.n })}</Text></View>
          </View>
        </SwipeDelete>
      ))}
      <Text style={[s.lab2, { color: th.muted }]}>{t("myGuess")}</Text>
      {/* shortcut: guesses cannot be forgotten yet (no per-guess reset in the model); only rules swipe. Upgrade when the planner can zero a weight. */}
      {i.guesses.length ? i.guesses.map((x) => (
        <View key={x.text} style={line}>
          <View style={s.tx}><Text style={[s.b, { color: th.ink }]}>{x.text}</Text><Text style={[s.small2, { color: th.muted }]}>{sureWord(x.sure)}</Text></View>
        </View>
      )) : <Empty title={t("noGuessesT")} sub={t("noGuesses")} />}
      {(rules.length > 0 || i.avoid.length > 0) && <Text style={[s.small, { color: th.muted, marginTop: 16, fontSize: 14 }]}>{t("swipeForget")}</Text>}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  art: { marginTop: 16, borderRadius: 28, overflow: "hidden", paddingVertical: 18, paddingHorizontal: 20 },
  lab: { color: "#fff", opacity: 0.85, fontSize: font.label, fontFamily: ff("500") },
  lab2: { fontSize: font.label, fontFamily: ff("500"), marginTop: 22 },
  title: { color: "#fff", fontSize: 24, fontFamily: ff("600"), marginTop: 6, letterSpacing: -0.4 },
  strip: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 54, marginTop: 14 },
  bar: { flex: 1, borderRadius: 2, backgroundColor: "#fff", opacity: 0.45 },
  hrs: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  hr: { color: "#fff", opacity: 0.8, fontSize: 12, fontFamily: ff("600") },
  ins: { marginTop: 10, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 22 },
  b: { fontSize: 17, fontFamily: ff("600"), lineHeight: 22, letterSpacing: -0.17 },
  small2: { fontSize: 14, fontFamily: ff("500"), marginTop: 2 },
  small: { fontSize: font.sub, fontFamily: ff("500"), lineHeight: 20 },
  viz: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingLeft: 4, paddingRight: 12, borderRadius: 99 },
  sw: { width: 24, height: 24, borderRadius: 12, overflow: "hidden" },
  chipT: { fontSize: 14, fontFamily: ff("600") },
  set: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 17, borderBottomWidth: 1 },
  tx: { flex: 1, minWidth: 0, gap: 2 },
});
