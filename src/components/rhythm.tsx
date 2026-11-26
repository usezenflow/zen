import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Icon, Logo, TypeArt } from "@/components/art";
import type { IconName } from "@/components/icons";
import { Meter } from "@/components/meter";
import { SwipeDelete } from "@/components/row";
import { fadeIn } from "@/components/tap";
import { t } from "@/lib/i18n";
import { useTheme, font, ff, fd } from "@/lib/theme";
import type { Rule } from "@/lib/types";
import type { Insights } from "@/planner";
import type { Model } from "@/planner/model";
import { candidates, clause } from "@/planner/mine";
import { Atlas } from "@/components/atlas";

/** The Nhịp head's count: how many rules Zen follows. Empty when none, the calm line below says the rest. */
export const rhythmHead = (i: Insights, rules: Rule[]) => { const n = rules.length + i.learned.length; return n ? t("learnedN", { n }) : ""; };

const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
/** "T6 18:00 - 22:00": the days and hours a said rule covers. */
const ruleSub = (r: Rule) => {
  const d = r.days.length ? [...r.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => WD[x]).join(", ") : t("repeatEveryDay");
  const tm = r.to >= 1440 ? (r.from > 0 ? t("fromTime", { t: hm(r.from) }) : "") : `${hm(r.from)} - ${hm(r.to)}`;
  return tm ? `${d} ${tm}` : d;
};
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // T2 first, CN last (getDay() is 0 = CN)
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"], PART = ["Sáng", "Trưa", "Chiều", "Tối"];
/** "Sáng ngày thường", "Tối T3, T5": where the week is yours (magic.html 11). */
const whenLine = (w: NonNullable<Insights["when"]>) => {
  const wds = [...w.wds].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)), k = wds.join();
  return `${PART[w.part]} ${k === "1,2,3,4,5" ? "ngày thường" : k === "6,0" ? "cuối tuần" : wds.map((d) => WD[d]).join(", ")}`;
};

/** The week at a glance: weekday by part of the day, brighter where you finish and move work, fully white where it is yours (magic.html 11). */
function Grid({ i }: { i: Insights }) {
  const w = i.when;
  return (
    <View style={s.mx}>
      <View style={s.mxRow}><View style={s.mxLab} />{ORDER.map((d) => <Text key={d} style={s.mxDay}>{WD[d]}</Text>)}</View>
      {PART.map((lab, p) => (
        <View key={lab} style={s.mxRow}>
          <Text style={[s.mxLab, s.mxDay, { textAlign: "left" }]}>{lab}</Text>
          {ORDER.map((d) => <View key={d} style={[s.cell, { opacity: w && p === w.part && w.wds.includes(d) ? 1 : 0.2 + 0.8 * (i.grid[d]?.[p] ?? 0) }]} />)}
        </View>
      ))}
    </View>
  );
}

/** magic.html 11-12: "Zen đã học được gì". The rules the planner applies now, what you said first, then what Zen learned, one row each; a swipe forgets one. */
export function Rhythm({ i, rules, m, hour, onForget, onForgetWhen }: { i: Insights; rules: Rule[]; m?: Model; hour?: number; onForget: (r: Rule) => void; onForgetWhen: (when: { hour: number } | { part: number }) => void }) {
  const th = useTheme();
  const rows = [
    ...i.learned.map((x) => ({ id: x.text, text: x.text, kind: x.kind, v: x.v, guess: x.guess, icon: (x.kind && x.icon !== "undo" ? x.kind : x.icon ?? "clock") as IconName, forget: x.part !== undefined ? () => onForgetWhen({ part: x.part! }) : x.hour !== undefined ? () => onForgetWhen({ hour: x.hour! }) : undefined })),
  ];
  const seen = i.grid.some((r) => r.some((v) => v > 0));
  // What the outcomes show now, up to five: the same rows as the rules below, each sure as far as its gate says.
  const found = useMemo(() => (m ? candidates(m).slice(0, 5) : []), [m]);
  const saidList = (
    <>
      {rules.map((r) => (
        <SwipeDelete key={r.id} onDelete={() => onForget(r)}>
          <View style={[s.set, { borderColor: th.line }]}>
            <View style={[s.sw, { backgroundColor: th.chip }]}><Icon name="mic" size={18} color={th.ink} w={2} /></View>
            <View style={s.tx}>
              <Text style={[s.b, { color: th.ink }]} numberOfLines={2}>{r.text}</Text>
              <Text style={[s.sub, { color: th.muted }]}>{ruleSub(r)}</Text>
            </View>
          </View>
        </SwipeDelete>
      ))}
    </>
  );
  const followList = (
    <>
      {rows.map((x) => (
        // every row sits in the same frame, so a plain one lines up with a swipeable one; the bar is how sure (dashed: still a guess)
        <SwipeDelete key={x.id} enabled={!!x.forget} onDelete={x.forget ?? (() => {})}>
          <View style={[s.set, { borderColor: th.line }]}>
            <View style={[s.sw, { backgroundColor: th.chip }]}><Icon name={x.icon} size={18} color={th.ink} w={2} /></View>
            <Text style={[s.b, s.tx, { color: th.ink }]} numberOfLines={2}>{x.text}</Text>
            {x.v !== undefined && <Meter v={x.v} guess={x.guess} width={44} />}
          </View>
        </SwipeDelete>
      ))}
    </>
  );
  return (
    <Animated.View entering={fadeIn}>
      {found.length > 0 && <Text style={[s.lab, s.labTop, { color: th.muted }]}>{t("insSection")}</Text>}
      {found.map((f, k) => (
        <View key={k} style={[s.find, { borderColor: th.line }]}>
          <Text style={[s.findT, { color: th.ink }]} numberOfLines={3}>{clause(f)}</Text>
          {f.sure !== undefined && <Meter v={f.sure} width={44} />}
        </View>
      ))}
      {/* before anything is seen the same card holds the grid dim: a guess, not a claim, with the logo in its corner */}
      <View style={s.art}>
        <View style={StyleSheet.absoluteFill}><TypeArt type="plan" w={264} h={170} seed={5} /></View>
        {!seen && <View style={s.leaf}><Logo size={34} mode="line" color="#fff" /></View>}
        <Text style={s.artLab}>{t("thisWeek")}</Text>
        {seen && i.when ? <Text style={s.artT}>{whenLine(i.when)}</Text> : !seen && <Text style={s.artT}>{t("learnedLearning")}</Text>}
        <Grid i={seen ? i : { ...i, grid: Array.from({ length: 7 }, () => [0.1, 0.1, 0.1, 0.1]), when: undefined }} />
      </View>
      {!rows.length && !rules.length && <Text style={[s.calm, { color: th.ink }]}>{t("learnedCold")}</Text>}
      {/* what you said, what Zen picked up, and the charts: three tabs under the week card (no model yet: the lists alone) */}
      {m ? <Atlas key={hour ?? -1} m={m} hour={hour} lead={[
        ...(rules.length ? [{ label: t("learnedSaid"), node: saidList }] : []),
        ...(rows.length ? [{ label: t("learnedFollow"), node: followList }] : []),
      ]} /> : <>{saidList}{followList}</>}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  lab: { fontSize: font.label, fontFamily: ff("300"), marginTop: 22 }, // eyebrow: light
  labTop: { marginTop: 0, marginBottom: 6 },
  calm: { marginTop: 22, fontSize: 16, fontFamily: ff("400"), lineHeight: 23 },
  set: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1 },
  b: { fontSize: 16, fontFamily: ff("500"), lineHeight: 21, letterSpacing: -0.16 },
  tx: { flex: 1, minWidth: 0 },
  sub: { fontSize: font.sub, fontFamily: ff("400"), marginTop: 2 },
  sw: { width: 34, height: 34, borderRadius: 17, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  art: { marginTop: 16, borderRadius: 28, overflow: "hidden", paddingVertical: 18, paddingHorizontal: 20 },
  leaf: { position: "absolute", top: 16, right: 18 },
  find: { marginTop: 12, borderWidth: 1, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 18, gap: 10 }, // calm.html .find: a bordered card per finding
  findT: { fontSize: 17, lineHeight: 23, fontFamily: ff("500") },
  artLab: { color: "#fff", opacity: 0.92, fontSize: 13, lineHeight: 18, fontFamily: ff("300"), letterSpacing: 1.1, textTransform: "uppercase", textShadowColor: "rgba(0,0,0,.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  artT: { color: "#fff", fontSize: 32, lineHeight: 35, fontFamily: fd("800"), marginTop: 4, letterSpacing: -1.1, textShadowColor: "rgba(0,0,0,.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  mx: { marginTop: 14, gap: 3 },
  mxRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  mxLab: { width: 42 },
  mxDay: { flex: 1, color: "#fff", opacity: 0.8, fontSize: 12, fontFamily: ff("500"), textAlign: "center" },
  cell: { flex: 1, height: 22, borderRadius: 5, backgroundColor: "#fff" },
  bo: { minWidth: 44, minHeight: 44, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  boT: { fontSize: 15, fontFamily: ff("500") },
});
