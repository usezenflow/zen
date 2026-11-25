import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { TypeArt } from "@/components/art";
import { RestCard } from "@/components/day";
import { PartHead } from "@/components/parthead";
import { fadeIn, Tap, EASE } from "@/components/tap";
import { loadCreds, owed, payUrl, type PortalFeeRow } from "@/lib/dlu";
import { nextFeeMonth } from "@/lib/dlu/season";
import { t } from "@/lib/i18n";
import { ask, getFeeRows, vnd } from "@/lib/sync";
import { useTheme, font, space, ff } from "@/lib/theme";

const left = (r: PortalFeeRow) => Math.max(0, r.ConNo ?? 0, r.PaidLeft ?? 0);
// "Mẫu thiết kế [3.0 tc] " → the name, and 3 credits for the small line
const split = (name = "") => { const m = /\s*\[(\d+(?:[.,]\d+)?)\s*tc\]\s*$/i.exec(name.trim()); return { name: m ? name.trim().slice(0, m.index) : name.trim(), tc: m ? Number(m[1].replace(",", ".")) : 0 }; };

/** fees.html: what is owed up top with one button to pay on e-bills, then every fee line term by term, newest first. Read only. */
export default function Fees() {
  const { top } = useSafeAreaInsets(); // a full screen: the safe area stands in for the mockup's 54px; in the settings sheet it is 0
  const th = useTheme();
  const [rows, setRows] = useState<PortalFeeRow[] | null>();
  const [nextMonth] = useState(() => nextFeeMonth(Date.now())); // read once: render stays pure
  const [id, setId] = useState("");
  const load = useCallback(() => { void getFeeRows().then((r) => setRows(r && r.filter((x) => (x.DebtAmount ?? 0) > 0))); void loadCreds().then((c) => setId(c?.studentId ?? "")); }, []);
  useEffect(() => { load(); }, [load]);
  const paying = useRef(false); // back from the pay page: ask again once
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => { if (st === "active" && paying.current) { paying.current = false; void ask("fees"); } });
    return () => sub.remove();
  }, []);

  const terms = [...new Set((rows ?? []).map((r) => `${r.YearStudy}|${r.TermID}`))].sort().reverse();
  const due = (rows ?? []).filter((r) => left(r) > 0);
  const total = owed(rows ?? []);
  const term = (k: string) => { const [y, tm] = k.split("|"); return t("termOf", { t: tm.replace(/^HK0?/, ""), y }); }; // the portal says "HK01"
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: top ? 0 : space.gutter, paddingBottom: 60 }}>
        <PartHead part="fees" title={t("fees")} onLand={load} />
        {rows === undefined ? null : !rows ? (
          <Animated.View entering={fadeIn}><RestCard lab={t("fees")} title={t("noFeesT")} sub={t("noFees")} h={150} /></Animated.View>
        ) : total > 0 ? (
          <Animated.View entering={fadeIn} style={s.art}>
            <View style={StyleSheet.absoluteFill}><TypeArt type="exam" w={264} h={150} seed={3} /></View>
            <Text style={s.lab}>{t("owedT")}</Text>
            <View style={s.bottom}>
              <View style={{ flex: 1 }}>
                <Text style={s.big} numberOfLines={1} adjustsFontSizeToFit>{vnd(total)}</Text>
                <Text style={s.small} numberOfLines={2}>{t("owedLines", { n: due.length, term: term(`${due[0].YearStudy}|${due[0].TermID}`) })}</Text>
              </View>
              <Tap onPress={() => { paying.current = true; Linking.openURL(payUrl(id)).catch(() => {}); }} accessibilityRole="link" style={s.pay}>
                <Text style={s.payT}>{t("pay")}</Text>
              </Tap>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={fadeIn}><RestCard lab={t("fees")} title={t("paidAll")} sub={t("paidSub", { m: nextMonth })} leaf="color" h={150} /></Animated.View>
        )}
        {terms.map((k, ti) => {
          const mine = (rows ?? []).filter((r) => `${r.YearStudy}|${r.TermID}` === k);
          return (
            <Animated.View key={k} entering={FadeInDown.delay(60 + Math.min(ti, 8) * 30).duration(220).easing(EASE)}>
              <View style={[s.labRow, ti > 0 && { marginTop: 22 }]}>
                <Text numberOfLines={1} style={[s.labT, { color: th.muted, flexShrink: 1 }]}>{term(k)}</Text>
                <Text style={[s.labT, { color: th.muted }]}>{vnd(mine.reduce((a, r) => a + (r.DebtAmount ?? 0), 0))}</Text>
              </View>
              {mine.map((r, i) => {
                const { name, tc } = split(r.FeeName ?? "");
                const rest = left(r);
                const note = [tc ? t("creditsShort", { n: tc }) : "", rest ? t("feesLeft", { amount: vnd(rest) }) : r.PaidDate ? t("paidOn", { d: /^\d{4}-/.test(r.PaidDate) ? `${r.PaidDate.slice(8, 10)}/${r.PaidDate.slice(5, 7)}` : r.PaidDate.slice(0, 5) }) : ""].filter(Boolean).join(" · ");
                return (
                  <View key={`${k}|${i}`} style={s.r}>
                    <View style={[s.tx, i > 0 && { borderTopWidth: 1, borderTopColor: th.line }]}>
                      <Text style={[s.b, { color: th.ink }]} numberOfLines={1}>{name}</Text>
                      {!!note && <Text style={[s.small2, { color: rest ? th.seal : th.muted }]}>{note}</Text>}
                    </View>
                    <Text style={[s.amt, { color: th.ink }]}>{vnd(r.DebtAmount ?? 0)}</Text>
                  </View>
                );
              })}
            </Animated.View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  art: { marginTop: 18, height: 150, borderRadius: 28, overflow: "hidden", paddingVertical: 18, paddingHorizontal: 20 },
  lab: { color: "#fff", opacity: 0.85, fontSize: font.label, fontFamily: ff("500") },
  bottom: { position: "absolute", left: 20, right: 16, bottom: 18, flexDirection: "row", alignItems: "flex-end", gap: 12 },
  big: { color: "#fff", fontSize: 34, fontFamily: ff("600"), lineHeight: 38 },
  small: { color: "#fff", opacity: 0.9, fontSize: font.md, fontFamily: ff("500"), marginTop: 3 },
  pay: { height: 40, paddingHorizontal: 16, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  payT: { color: "#0b0b0c", fontSize: font.sub, fontFamily: ff("700") },
  labRow: { marginTop: 28, flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  labT: { fontSize: font.label, fontFamily: ff("500") },
  r: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: space.row },
  tx: { flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center", gap: 2, paddingVertical: space.row + 2, marginVertical: -space.row },
  b: { fontSize: font.base, lineHeight: 24, fontFamily: ff("600") },
  small2: { fontFamily: ff("500"), fontSize: font.sub, lineHeight: 21 },
  amt: { fontSize: font.meta, fontFamily: ff("600"), fontVariant: ["tabular-nums"] }, // fees.html .tm: 16px
});
