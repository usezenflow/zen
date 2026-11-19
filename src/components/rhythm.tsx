import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Count } from "@/components/count";
import { TypeArt } from "@/components/art";
import { Meter } from "@/components/meter";
import { SwipeDelete } from "@/components/row";
import { fadeIn } from "@/components/tap";
import { t } from "@/lib/i18n";
import { KIND_VI, kindW } from "@/lib/reasons";
import { useTheme, font, ff } from "@/lib/theme";
import type { Kind, Rule } from "@/lib/types";
import { EARLY, PROMOTE, whenText, type Insights } from "@/planner";

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
const headOf = (i: Insights): { k: "goldenRange" | "earlyRange" | "whenHead" | "earlyWhen" | "seenN" | "stillLearning"; vars: Record<string, number | string> } =>
  i.when && (i.golden || i.early) ? { k: i.golden ? "whenHead" : "earlyWhen", vars: { w: whenText(i.when) } }
  : i.golden ? { k: "goldenRange", vars: { a: i.golden.from, b: i.golden.to } }
  : i.early ? { k: "earlyRange", vars: { a: i.early.from, b: i.early.to } }
  : i.seen ? { k: "seenN", vars: { n: i.seen } } : { k: "stillLearning", vars: {} };
export const rhythmHead = (i: Insights) => { const h = headOf(i); return t(h.k, h.vars); };

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // T2 first, CN last (getDay() is 0 = CN)
const PART_LAB = ["Sáng", "Trưa", "Chiều", "Tối"];
const partOfHour = (h: number) => (h < 11 ? 0 : h < 13 ? 1 : h < 18 ? 2 : 3);

/** The week at a glance: weekday by part of the day, brighter where you finish and move work, outlined where it is yours (magic.html 11). */
function Grid({ i }: { i: Insights }) {
  const w = i.when, g = i.golden ?? i.early;
  const lit = (d: number, p: number) => (w ? p === w.part && w.wds.includes(d) : !!g && p === partOfHour(g.from));
  return (
    <View accessibilityLabel={rhythmHead(i)} style={s.mx}>
      <View style={s.mxRow}><View style={s.mxLab} />{ORDER.map((d) => <Text key={d} style={s.mxDay}>{WD[d]}</Text>)}</View>
      {PART_LAB.map((lab, p) => (
        <View key={lab} style={s.mxRow}>
          <Text style={[s.mxLab, s.mxDay]}>{lab}</Text>
          {ORDER.map((d) => <View key={d} style={[s.cell, { opacity: 0.2 + 0.8 * (i.grid[d]?.[p] ?? 0) }, lit(d, p) && s.cellOn]} />)}
        </View>
      ))}
    </View>
  );
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
        {/* Before any evidence every cell is dim: a guess, not a claim. */}
        <Grid i={i} />
      </View>
      {i.when && <Card title={t("whenTitle", { w: whenText(i.when).toLocaleLowerCase("vi") })} sub={g ? t("whenSub", { a: g.from, b: g.to }) : t("whenSubBare")} />}
      {!g && !i.when && (e ? <Card title={<Count k="earlyTitle" vars={{ a: e.from, b: e.to }} style={[s.b, { color: th.ink }]} />} sub={t("earlySub", { n: Math.max(1, PROMOTE - e.n) })} />
        : i.seen ? <Card title={<Count k="moreN" vars={{ n: Math.max(1, EARLY - i.seen) }} style={[s.b, { color: th.ink }]} />} sub={t("seenSub")} />
        : <Card title={t("learningT")} sub={t("learningSub")} />)}
      {pair && <Card title={t("pairTitle", { k: KIND_VI[pair.before] })} sub={t("pairSub")}><Chip kind={pair.before} /></Card>}
      {kind && <Card title={t("kindTitle", { k: kindW(kind.kind, true), p: PART_LAB[partOfHour(kind.from + 1.5)].toLowerCase() })} sub={t("kindSub")}><Chip kind={kind.kind} /><Meter v={kind.sure} /></Card>}
      {slip && <Card title={t("slipTitle", { k: kindW(slip.kind, true) })} sub={t("slipSub", { n: Math.round(slip.rate * 10) })}><Meter v={slip.rate} /></Card>}
      {un && <Card title={t("unsureTitle", { p: PART_LAB[partOfHour(un.from + 1.5)].toLowerCase() })} sub={t("unsureSub")} />}

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
            <View style={s.tx}><Text style={[s.b, { color: th.ink }]}>{t("avoidRow", { p: PART_LAB[partOfHour(x.hour)], a: x.hour, b: x.hour + 1 })}</Text><Text style={[s.small2, { color: th.muted }]}>{t("avoidSub", { n: x.n })}</Text></View>
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
  mx: { marginTop: 14, gap: 3 },
  mxRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  mxLab: { width: 42 },
  mxDay: { flex: 1, color: "#fff", opacity: 0.8, fontSize: 12, fontFamily: ff("600"), textAlign: "center" },
  cell: { flex: 1, height: 22, borderRadius: 5, backgroundColor: "#fff" },
  cellOn: { borderWidth: 2, borderColor: "#fff", backgroundColor: "rgba(255,255,255,.35)" },
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
