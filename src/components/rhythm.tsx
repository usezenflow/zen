import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Tap, fadeIn } from "@/components/tap";
import { t } from "@/lib/i18n";
import { useTheme, font, ff } from "@/lib/theme";
import type { Rule } from "@/lib/types";
import type { Insights } from "@/planner";

/** The Nhịp head's count: how many rules Zen follows. Empty when none, the calm line below says the rest. */
export const rhythmHead = (i: Insights, rules: Rule[]) => { const n = rules.length + i.learned.length; return n ? t("learnedN", { n }) : ""; };

/** magic.html 11-12: "Zen đã học được gì". The rules the planner applies now, one row each in plain words; Bỏ (44px) forgets one. */
export function Rhythm({ i, rules, onForget, onForgetHour }: { i: Insights; rules: Rule[]; onForget: (r: Rule) => void; onForgetHour: (hour: number) => void }) {
  const th = useTheme();
  const rows = [
    ...rules.map((r) => ({ id: r.id, text: r.text, forget: () => onForget(r) })),
    ...i.learned.map((x) => ({ id: x.text, text: x.text, forget: x.hour === undefined ? undefined : () => onForgetHour(x.hour!) })),
  ];
  if (!rows.length) return <Animated.View entering={fadeIn}><Text style={[s.calm, { color: th.ink }]}>{t("learnedCold")}</Text></Animated.View>;
  return (
    <Animated.View entering={fadeIn}>
      <Text style={[s.lab, { color: th.muted }]}>{t("learnedLab")}</Text>
      {rows.map((x) => (
        <View key={x.id} style={[s.set, { borderColor: th.line }]}>
          <Text style={[s.b, s.tx, { color: th.ink }]}>{x.text}</Text>
          {x.forget && (
            <Tap onPress={x.forget} accessibilityRole="button" accessibilityLabel={`${t("learnedForget")} ${x.text}`} style={[s.bo, { borderColor: th.line }]}>
              <Text style={[s.boT, { color: th.ink }]}>{t("learnedForget")}</Text>
            </Tap>
          )}
        </View>
      ))}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  lab: { fontSize: font.label, fontFamily: ff("500"), marginTop: 22 },
  calm: { marginTop: 22, fontSize: 16, fontFamily: ff("500"), lineHeight: 22 },
  set: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10, borderBottomWidth: 1 },
  b: { fontSize: 17, fontFamily: ff("600"), lineHeight: 22, letterSpacing: -0.17 },
  tx: { flex: 1, minWidth: 0 },
  bo: { minWidth: 44, minHeight: 44, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  boT: { fontSize: 15, fontFamily: ff("600") },
});
