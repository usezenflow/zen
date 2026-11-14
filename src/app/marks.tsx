import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Fill } from "@/components/meter";
import { fadeIn, Tap, EASE } from "@/components/tap";
import type { ParsedMarks } from "@/lib/dlu/parse/student";
import { Icon, TypeArt } from "@/components/art";
import { t } from "@/lib/i18n";
import { getMarks } from "@/lib/sync";
import { useTheme, font, space, ff } from "@/lib/theme";

const num = (n: number | null | undefined, d = 2) => (n == null ? "" : n.toFixed(d).replace(".", ","));

export default function Marks() {
  const th = useTheme();
  const [m, setM] = useState<ParsedMarks | null>();
  useEffect(() => { getMarks().then(setM); }, []);
  const terms = [...(m?.terms ?? [])].reverse();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingBottom: 60 }}>
        <Tap onPress={() => router.back()} accessibilityLabel={t("back")} style={[s.o, { borderColor: th.line, backgroundColor: th.bg }]}>
          <Icon name="back" size={20} color={th.ink} />
        </Tap>
        <Text style={[s.h, { color: th.ink, marginTop: 18 }]}>{t("marks")}</Text>
        {!m?.marks.length ? (
          m !== undefined && <Animated.Text entering={fadeIn} style={[s.sub, { color: th.muted, marginTop: 18 }]}>{t("noMarks")}</Animated.Text>
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
                  <Text style={[s.labT, { color: th.muted }]}>{t("termOf", { t: tm.termId, y: tm.yearStudy })}</Text>
                  <Text style={[s.labT, { color: th.muted }]}>{num(tm.gpa4)}</Text>
                </View>
                {m.marks.filter((k) => k.yearStudy === tm.yearStudy && k.termId === tm.termId).map((k, i) => (
                  <View key={k.scheduleStudyUnitId} style={s.r}>
                    <View style={[s.tx, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.line }]}>
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
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  h: { fontSize: font.h, lineHeight: 36, fontFamily: ff("600"), letterSpacing: -0.7 },
  sub: { fontFamily: ff(), fontSize: font.md },
  art: { marginTop: 18, height: 150, borderRadius: 28, overflow: "hidden", paddingVertical: 18, paddingHorizontal: 20 },
  lab: { color: "#fff", opacity: 0.85, fontSize: font.label, fontFamily: ff("500") },
  meter: { position: "absolute", left: 20, bottom: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  cap: { width: 18, height: 54, borderRadius: 10, borderWidth: 2, borderColor: "rgba(255,255,255,.9)", justifyContent: "flex-end", padding: 2 },
  big: { color: "#fff", fontSize: 40, fontFamily: ff("600"), lineHeight: 42 },
  small: { color: "#fff", opacity: 0.9, fontSize: font.md, fontFamily: ff("500"), marginTop: 3 },
  labRow: { marginTop: 28, flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  labT: { fontSize: font.label, fontFamily: ff("500") },
  r: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: space.row },
  tx: { flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center", gap: 2 },
  b: { fontSize: font.base, fontFamily: ff("600") },
  small2: { fontFamily: ff(), fontSize: font.sub },
  score: { fontSize: font.base, fontFamily: ff("600"), fontVariant: ["tabular-nums"] },
  pl: { width: 44, height: 36, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  plT: { fontSize: font.sub, fontFamily: ff("500") },
});
