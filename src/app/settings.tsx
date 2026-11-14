import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Appearance, Dimensions, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Icon, TypeArt } from "@/components/art";
import { Chevron } from "@/components/day";
import { DropMenu } from "@/components/menu";
import { fadeIn, fadeOut, glide, Tap } from "@/components/tap";
import { ConnectForm, type Res } from "@/components/settings-connect";
import { Toast } from "@/components/toast";
import { loadCreds } from "@/lib/dlu";
import { t } from "@/lib/i18n";
import * as stats from "@/lib/stats";
import { kvGet, kvSet } from "@/lib/store";
import { disconnect, getMarks, kvStorage, loginError, sync, syncStatus, type Login } from "@/lib/sync";
import { useTheme, font, space, ff } from "@/lib/theme";
import { Sweep, useSweep } from "@/components/sweep";
import { when } from "@/lib/when";

type Mode = "system" | "light" | "dark";

// `sweep`: the change (theme) is revealed by a circle growing from the top-right corner toward the bottom-left.
const Pill = ({ label, on, onPress, sweep }: { label: string; on: boolean; onPress: () => void; sweep?: boolean }) => {
  const th = useTheme();
  const run = useSweep();
  return (
    <Tap onPress={(e) => (sweep && !on ? run(Dimensions.get("window").width, 0, onPress) : onPress())} style={[s.pill, on ? { backgroundColor: th.ink, borderColor: th.ink } : { borderColor: th.line }]}>
      <Text style={{ fontSize: font.sub, fontFamily: ff(on ? "700" : "500"), color: on ? th.bg : th.ink }}>{label}</Text>
    </Tap>
  );
};

function Row({ label, right, onPress, flat }: { label: string; right?: React.ReactNode; onPress?: () => void; flat?: boolean }) {
  const th = useTheme();
  return (
    // The press highlight bleeds 14px past the text; the hairline stays on the text column.
    <Tap variant="row" onPress={onPress} disabled={!onPress} style={[s.row, flat && { paddingBottom: 4 }]}>
      <Text style={{ fontSize: font.base, fontFamily: ff("600"), color: th.ink }}>{label}</Text>
      <View style={s.right}>{right}</View>
      {!flat && <View style={[s.hair, { backgroundColor: th.line }]} />}
    </Tap>
  );
}

export default function Settings() {
  const th = useTheme();
  const [mode, setMode] = useState<Mode>("system");
  const [id, setId] = useState("");
  const [on, setOn] = useState(false);
  const [bad, setBad] = useState<Login | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const [gpa, setGpa] = useState<number | null>(null);
  const [share, setShare] = useState(true);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<"portal" | "lms" | undefined>();
  const [ok, setOk] = useState<Res | null>(null);
  const [toast, setToast] = useState<{ text: string; sub: string }>();
  const [now, setNow] = useState(0);

  const refresh = useCallback(async () => {
    const c = await loadCreds();
    setOn(!!c); setId(c?.studentId ?? "");
    setNow(Date.now()); setLast((await syncStatus()).last); setBad(await loginError());
    setGpa((await getMarks())?.gpa4 ?? null);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    stats.isOptedOut(kvStorage).then((o) => setShare(!o));
    kvGet("theme").then((m) => { if (m === "light" || m === "dark") setMode(m); });
  }, [refresh]);
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(undefined), 4000); return () => clearTimeout(h); }, [toast]);

  // Appearance.setColorScheme makes useColorScheme (and so useTheme) follow; _layout must re-apply kv "theme" at launch.
  const pickMode = async (m: Mode) => { setMode(m); Appearance.setColorScheme(m === "system" ? "unspecified" : m); await kvSet("theme", m); };

  // Closes once nothing needs retyping; a source left blank ("off") is a choice, not a problem.
  const fine = (c: Res["portal"]) => c === "ok" || c === "off";
  const done = (r: Res) => { setOk(r); if (fine(r.portal) && fine(r.lms) && (r.portal === "ok" || r.lms === "ok")) { setOpen(false); setOk(null); } refresh(); };
  const off = async (which: "lms" | "portal" | "both") => {
    await disconnect(which);
    setToast({ text: t("disconnected"), sub: t(which === "lms" ? "offdLms" : which === "portal" ? "offdPortal" : "pwRemoved") });
    setOk(null); refresh();
  };
  const fix = () => { setFocus(bad === "lms" ? "lms" : "portal"); setOpen(true); };

  const sub = bad ? t("tapRetype")
    : ok && (ok.portal === "ok") !== (ok.lms === "ok") ? t(ok.portal === "ok" ? "okPortal" : "okLms")
    : last ? t("syncedAt", { time: when(last, now) }) : t("neverSynced");
  const form = open || (on && !!ok);
  const title = bad ? t(bad === "portal" ? "changedPortal" : bad === "lms" ? "changedLms" : "changedBoth") : id;
  return (
    <Sweep>
    <SafeAreaView style={[s.root, { backgroundColor: th.bg }]}>
      {/* iOS: insets follow the keyboard. Android (edge-to-edge, no adjustResize): pad the view by the keyboard. */}
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "android" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <Tap onPress={() => router.back()} hitSlop={8} style={[s.o, { borderColor: th.line }]} accessibilityRole="button" accessibilityLabel={t("back")}>
          <Icon name="x" size={20} color={th.ink} />
        </Tap>
        <Text style={[s.h, { color: th.ink }]}>{t("settings")}</Text>

        <Text style={[s.lab, { color: th.muted, marginTop: 28 }]}>{t("theme")}</Text>
        <View style={s.pills}>
          {(["system", "light", "dark"] as Mode[]).map((m) => (
            <Pill key={m} sweep on={mode === m} onPress={() => pickMode(m)} label={t(m === "system" ? "themeSystem" : m === "light" ? "themeLight" : "themeDark")} />
          ))}
        </View>

        <Text style={[s.lab, { color: th.muted, marginTop: 26 }]}>{t("campusCard")}</Text>
        {/* Connect / disconnect / form open swap several blocks at once: each fades, everything below glides. */}
        {on && (
          <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}>
            <Tap onPress={() => (bad ? fix() : sync().then(refresh))} scale={0.98} style={s.art}>
              <View style={StyleSheet.absoluteFill}><TypeArt type={bad ? "exam" : "lecture"} seed={5} w={264} h={118} /></View>
              <Text style={[s.artId, bad ? { fontFamily: ff(), fontSize: 17 } : null]} numberOfLines={2}>{title}</Text>
              <Text style={s.artSub}>{sub}</Text>
              <View style={s.glass}><Icon name={bad ? "right" : "sync"} size={18} color="#fff" /></View>
            </Tap>
            {!bad && !form && (
              <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><Row flat label={t("marks")} onPress={() => router.push("/marks")}
                right={<>{gpa != null && <Animated.Text entering={fadeIn} style={{ fontFamily: ff("600"), color: th.ink }}>{gpa.toFixed(2).replace(".", ",")}</Animated.Text>}
                  <View style={[s.chevO, { borderColor: th.line }]}><Icon name="right" size={14} color={th.ink} /></View></>} /></Animated.View>
            )}
          </Animated.View>
        )}
        {!on && <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><Row flat={open} label={t("campus")} right={<Chevron open={open} size={16} color={th.muted} />} onPress={() => { setFocus(undefined); setOpen(!open); }} /></Animated.View>}
        {form && <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><ConnectForm key={String(bad)} initialId={id} hideId={on} focus={focus} onResult={done} /></Animated.View>}
        {on && (
          <Animated.View layout={glide} style={s.off}>
            <DropMenu label={t("disconnect")} color={th.muted} size={14} items={[
              { label: t("offLms"), onPress: () => off("lms") },
              { label: t("offPortal"), onPress: () => off("portal") },
              { label: t("offBoth"), destructive: true, onPress: () => off("both") },
            ]} />
          </Animated.View>
        )}
        {!on && !form && (
          <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}>
            <Row label={t("stats")} right={<Switch value={share} onValueChange={(v) => { setShare(v); stats.setOptOut(kvStorage, !v); }} trackColor={{ true: th.ink, false: th.line }} ios_backgroundColor={th.line} thumbColor={share ? th.bg : th.dark ? th.muted : "#fff"} />} />
          </Animated.View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
      {toast ? <Toast key={toast.text + toast.sub} text={toast.text} sub={toast.sub} /> : null}
    </SafeAreaView>
    </Sweep>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: space.gutter, paddingBottom: 40 },
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  h: { fontSize: font.h, lineHeight: 36, fontFamily: ff("600"), letterSpacing: -0.7, marginTop: 18 },
  lab: { fontSize: font.label, fontFamily: ff("500") },
  pills: { flexDirection: "row", gap: 8, marginTop: 10 },
  pill: { height: 36, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 17, paddingHorizontal: 14, marginHorizontal: -14, borderRadius: 14 },
  hair: { position: "absolute", left: 14, right: 14, bottom: 0, height: StyleSheet.hairlineWidth },
  right: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  art: { marginTop: 12, height: 132, borderRadius: 28, overflow: "hidden", padding: 16, paddingHorizontal: 18 },
  artId: { color: "#fff", fontSize: 20, fontFamily: ff("600") },
  artSub: { color: "#fff", opacity: 0.9, fontFamily: ff(), fontSize: font.sub, paddingRight: 50 },
  chevO: { width: 30, height: 30, marginLeft: -6, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  off: { paddingVertical: 17, alignItems: "flex-start" },
  glass: { position: "absolute", right: 14, bottom: 14, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.28)", borderWidth: 1, borderColor: "rgba(255,255,255,.5)" },
});
