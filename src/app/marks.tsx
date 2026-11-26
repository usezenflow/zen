import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Fill } from "@/components/meter";
import { fadeIn, EASE } from "@/components/tap";
import type { ParsedMarks } from "@/lib/dlu/parse/student";
import { TypeArt } from "@/components/art";
import { RestCard } from "@/components/day";
import { t } from "@/lib/i18n";
import { getMarks } from "@/lib/sync";
import { PartHead } from "@/components/parthead";
import { useTheme, font, space, ff, fd } from "@/lib/theme";

const num = (n: number | null | undefined, d = 2) => (n == null ? "" : n.toFixed(d).replace(".", ","));

export default function Marks() {
  const th = useTheme();
  const [m, setM] = useState<ParsedMarks | null>();
  const load = useCallback(() => void getMarks().then(setM), []);
  useEffect(() => { load(); }, [load]);
  const terms = [...(m?.terms ?? [])].reverse();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: space.gutter, paddingBottom: 60 }}>
        <PartHead part="marks" title={t("marks")} onLand={load} />
        {!m?.marks.length ? (
          m !== undefined && <Animated.View entering={fadeIn}><RestCard lab={t("cumulative")} title={t("noMarksT")} sub={t("noMarks")} h={150} /></Animated.View>
        ) : (
          <>
            <Animated.View entering={fadeIn} style={s.art}>
              <View style={StyleSheet.absoluteFill}><TypeArt type="assignment" w={264} h={150} seed={2} /></View>
              <Text style={s.lab}>{t("cumulative")}</Text>
              <View style={s.meter}>
                <View style={s.cap}><Fill p={Math.min(1, (m.gpa4 ?? 0) / 4)} /></View>
                <View>
                  <Text style={s.big}>{num(m.gpa4)}</Text>
                  <Text style={s.small}>{t("creditsGpa", { n: m.creditsEarned ?? 0 })}</Text>
                </View>
              </View>
            </Animated.View>
            {terms.map((tm, ti) => (
              <Animated.View key={`${tm.yearStudy}|${tm.termId}`} entering={FadeInDown.delay(60 + Math.min(ti, 8) * 30).duration(220).easing(EASE)}>
                <View style={[s.labRow, ti > 0 && { marginTop: 20 }]}>
                  <Text numberOfLines={1} style={[s.labT, { color: th.muted, flexShrink: 1 }]}>{t("termOf", { t: tm.termId.replace(/^HK0?/, ""), y: tm.yearStudy })}</Text>
                  <Text style={[s.labT, { color: th.muted }]}>{num(tm.gpa4)}</Text>
                </View>
                {m.marks.filter((k) => k.credits > 0 && k.yearStudy === tm.yearStudy && k.termId === tm.termId).map((k, i) => (
                  <View key={k.scheduleStudyUnitId} style={s.r}>
                    <View style={[s.tx, i > 0 && { borderTopWidth: 1, borderTopColor: th.line }]}>
                      <Text style={[s.b, { color: th.ink }]} numberOfLines={1}>{k.curriculumName}</Text>
                      <Text style={[s.small2, { color: th.muted }]}>{t("credits", { n: k.credits })}</Text>
                    </View>
                    <Text style={[s.score, { color: th.ink }]}>{num(k.score10, 1)}</Text>
                    <View style={[s.pl, { borderColor: th.line }]}><Text style={[s.plT, { color: th.ink }]}>{k.letter ?? ""}</Text></View>
                  </View>
                ))}
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  art: { marginTop: 18, height: 150, borderRadius: 34, overflow: "hidden", paddingVertical: 18, paddingHorizontal: 20 },
  lab: { color: "#fff", opacity: 0.92, fontSize: font.label, fontFamily: ff("500"), textShadowColor: "rgba(0,0,0,.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  meter: { position: "absolute", left: 20, bottom: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  cap: { width: 18, height: 54, borderRadius: 10, borderWidth: 2, borderColor: "rgba(255,255,255,.9)", justifyContent: "flex-end", padding: 2 },
  big: { color: "#fff", fontSize: 40, fontFamily: fd("500"), lineHeight: 40, textShadowColor: "rgba(0,0,0,.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  small: { color: "#fff", opacity: 0.92, fontSize: font.md, fontFamily: ff("500"), marginTop: 3, textShadowColor: "rgba(0,0,0,.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  labRow: { marginTop: 28, flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  labT: { fontSize: font.label, fontFamily: ff("500") },
  r: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: space.row },
  tx: { flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center", gap: 2, paddingVertical: space.row + 2, marginVertical: -space.row },
  b: { fontSize: font.base, lineHeight: 24, fontFamily: ff("500") },
  small2: { fontFamily: ff("500"), fontSize: font.sub, lineHeight: 21 },
  score: { fontSize: font.base, fontFamily: fd("500"), fontVariant: ["tabular-nums"] },
  pl: { width: 44, height: 40, borderRadius: 99, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  plT: { fontSize: font.sub, fontFamily: ff("500") },
});
