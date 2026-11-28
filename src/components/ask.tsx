import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons";
import { useTheme, ff, fd } from "@/lib/theme";
import { t } from "@/lib/i18n";

export type AskOpt = { label: string; detail?: string; on?: boolean; run: () => void };
export type AskQ = { ask?: string; sub?: string; row?: boolean; options: AskOpt[] };

/**
 * "Which one": a sheet on the bottom edge over the veil, so the thumb reaches it and the page stays in view.
 * One question answers at a tap. Several step with back/next arrows; the answers run together on the last tap.
 */
export function AskSheet({ qs, onClose }: { qs: AskQ[]; onClose: () => void }) {
  const th = useTheme(), { bottom } = useSafeAreaInsets();
  const [i, setI] = useState(0), [picks, setPicks] = useState<number[]>([]);
  const q = qs[i], many = qs.length > 1, last = i === qs.length - 1;
  const pick = (k: number) => {
    const next = [...picks]; next[i] = k; setPicks(next);
    if (!last) return setI(i + 1);
    onClose();
    qs.forEach((x, j) => x.options[next[j] ?? 0]?.run());
  };
  const arrow = (d: -1 | 1, ok: boolean) => (
    <Pressable disabled={!ok} onPress={() => setI(i + d)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t(d < 0 ? "back" : "next")} style={[s.arrow, { opacity: ok ? 1 : 0.25 }]}>
      <Icon name={d < 0 ? "back" : "right"} size={28} color={th.ink} w={2.4} />
    </Pressable>
  );
  return (
    <Reanimated.View entering={SlideInDown.duration(240)} exiting={SlideOutDown.duration(160)} accessibilityViewIsModal style={[s.sheet, { backgroundColor: th.bg, borderColor: th.line, paddingBottom: bottom + 16 }]}>
      {many && (
        <View style={s.nav}>
          {arrow(-1, i > 0)}
          <Text style={[s.step, { color: th.muted }]}>{i + 1} / {qs.length}</Text>
          {arrow(1, picks[i] !== undefined && !last)}
        </View>
      )}
      {q.ask && <Text style={[s.ask, { color: th.ink }]}>{q.ask}</Text>}
      {q.sub && <Text style={[s.sub, { color: th.muted }]}>{q.sub}</Text>}
      <View style={q.row ? s.row : s.col}>
        {q.options.map((o, k) => {
          const on = picks[i] !== undefined ? picks[i] === k : !!o.on;
          return (
            <Pressable key={o.label + k} onPress={() => pick(k)} accessibilityRole="button" style={[q.row ? s.pill : s.opt, { borderColor: on ? th.ink : th.line, backgroundColor: on ? th.ink : th.chip }]}>
              {!q.row && <View style={[s.n, { backgroundColor: th.bg }]}><Text style={[s.nT, { color: th.ink }]}>{k + 1}</Text></View>}
              <View style={s.tx}>
                <Text style={[s.t, { color: on ? th.bg : th.ink, fontFamily: ff(on ? "600" : "500") }]} numberOfLines={q.row ? 1 : 3}>{o.label}</Text>
                {o.detail && <Text style={[s.d, { color: on ? th.bg : th.muted }]} numberOfLines={1}>{o.detail}</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 31, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, paddingTop: 16, paddingHorizontal: 20, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: -10 }, elevation: 12 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  arrow: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  step: { fontSize: 14, lineHeight: 20, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  ask: { fontSize: 18, lineHeight: 25, fontFamily: ff("500") },
  sub: { marginTop: 6, fontSize: 15, lineHeight: 21, fontFamily: ff("400") },
  col: { marginTop: 14, gap: 8 },
  row: { marginTop: 14, flexDirection: "row", gap: 8 },
  // Column rows hold their text at its natural height (no flex:1 on a vertical axis: it squeezed titles to a clipped line).
  opt: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1 },
  pill: { height: 44, flexShrink: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderRadius: 99, borderWidth: 1 },
  tx: { flexShrink: 1, gap: 2 },
  n: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  nT: { fontSize: 13, lineHeight: 18, fontFamily: fd("700"), fontVariant: ["tabular-nums"] },
  t: { fontSize: 16, lineHeight: 22 },
  d: { fontSize: 14, lineHeight: 20, opacity: 0.7, fontFamily: fd("500"), fontVariant: ["tabular-nums"] },
});
