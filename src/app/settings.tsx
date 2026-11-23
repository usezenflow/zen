import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { Appearance, Dimensions, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Icon, TypeArt } from "@/components/art";
import { Chevron } from "@/components/day";
import { fadeIn, fadeOut, glide, Tap } from "@/components/tap";
import { ConnectForm, type Res } from "@/components/settings-connect";
import { Toast } from "@/components/toast";
import { loadCreds, owed } from "@/lib/dlu";
import { t } from "@/lib/i18n";
import * as stats from "@/lib/stats";
import { kvGet, kvSet } from "@/lib/store";
import { ask, disconnect, getFeeRows, getMarks, kvStorage, loginError, onQueue, partStates, partTimes, syncNow, syncStatus, vnd, type Login, type Part, type PartState } from "@/lib/sync";
import { hasLms, hasPortal } from "@/lib/dlu/creds";
import { useTheme, font, space, ff } from "@/lib/theme";
import { Sweep, useSweep } from "@/components/sweep";
import { when } from "@/lib/when";
import { LogoState } from "@/components/logostate";
import { UpdateDialog, type Dlg } from "@/components/update";
import { buildHash, checkUpdate, installed, notes, useDownload } from "@/lib/update";
import type { Update } from "@/lib/update-version";

type Mode = "system" | "light" | "dark";
type Src = "portal" | "lms";

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

// The sync glyph turns while its part is being fetched.
const Spin = ({ color }: { color: string }) => {
  const r = useSharedValue(0);
  useEffect(() => { r.set(withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1)); }, [r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get().toFixed(2)}deg` }] }));
  return <Animated.View style={st}><Icon name="sync" size={14} color={color} /></Animated.View>;
};

function Row({ label, right, onPress, flat, line = !flat, dense }: { label: string; right?: React.ReactNode; onPress?: () => void; flat?: boolean; line?: boolean; dense?: boolean }) {
  const th = useTheme();
  return (
    // The press highlight bleeds 14px past the text; the hairline stays on the text column.
    <Tap variant="fade" onPress={onPress} disabled={!onPress} style={[s.row, dense && { paddingVertical: 13 }, flat && { paddingBottom: 4 }]}>
      <Text style={{ fontSize: dense ? font.meta : font.base, fontFamily: ff("600"), color: th.ink }}>{label}</Text>
      <View style={s.right}>{right}</View>
      {line && <View style={[s.hair, { backgroundColor: th.line }]} />}
    </Tap>
  );
}

export default function Settings() {
  const th = useTheme();
  const [mode, setMode] = useState<Mode>("system");
  const [first, setFirst] = useState<"load" | "err" | null>(null); // logo.html: the first school sync, or its failure
  const [id, setId] = useState("");
  const [on, setOn] = useState(false);
  const [has, setHas] = useState({ portal: false, lms: false }); // which accounts are connected
  const [bad, setBad] = useState<Login | null>(null);
  const [times, setTimes] = useState<Partial<Record<Part, number | null>>>({});
  const [states, setStates] = useState<Partial<Record<Part, PartState>>>({}); // what the queue is doing for each part
  const [fees, setFees] = useState<number | null>(null); // owed, or null before the first fee check
  const [gpa, setGpa] = useState<number | null>(null);
  const [share, setShare] = useState(true);
  const [open, setOpen] = useState<Src | "all" | null>(null); // "all": first connect, ID + both passwords; else one account's field
  const [toast, setToast] = useState<{ text: string; sub: string }>();
  const [now, setNow] = useState(0);
  const [up, setUp] = useState<Update | null>(null); // a newer release on GitHub
  const d = useDownload(), dl = d?.failed ? null : d; // its APK coming down in the background; failed, the row offers it again
  const [dlg, setDlg] = useState<Dlg | null>(null);

  const refresh = useCallback(async () => {
    const c = await loadCreds();
    setOn(!!c); setId(c?.studentId ?? ""); setHas({ portal: !!c && hasPortal(c), lms: !!c && hasLms(c) });
    setNow(Date.now()); setTimes(await partTimes()); setBad(await loginError());
    setStates(await partStates());
    const rows = await getFeeRows();
    setFees(rows ? owed(rows) : null);
    setGpa((await getMarks())?.gpa4 ?? null);
  }, []);
  // Rows follow the queue as jobs start and land; the clock catches a retry coming due.
  useEffect(() => onQueue(() => void refresh()), [refresh]);
  useEffect(() => { const h = setInterval(refresh, 30_000); return () => clearInterval(h); }, [refresh]);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    stats.isOptedOut(kvStorage).then((o) => setShare(!o));
    kvGet("theme").then((m) => { if (m === "light" || m === "dark") setMode(m); });
    checkUpdate().then(setUp);
  }, [refresh]);
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(undefined), 4000); return () => clearTimeout(h); }, [toast]);

  // Appearance.setColorScheme makes useColorScheme (and so useTheme) follow; _layout must re-apply kv "theme" at launch.
  const pickMode = async (m: Mode) => { setMode(m); Appearance.setColorScheme(m === "system" ? "unspecified" : m); await kvSet("theme", m); };

  // Closes once the account being connected is in; a wrong or slow one stays open with its note.
  const done = (r: Res) => { if (open && (open === "all" ? r.portal === "ok" || r.lms === "ok" : r[open] === "ok")) setOpen(null); refresh(); };
  const off = async (k: Src) => {
    const lone = !(k === "portal" ? has.lms : has.portal); // the last account out wipes everything
    await disconnect(k);
    setToast({ text: t(lone ? "disconnected" : k === "lms" ? "offdLms" : "offdPortal"), sub: t("pwRemoved") });
    setOpen(null); refresh();
  };
  // The circle queues the part (asking for one already queued adds nothing); marks and fees rows open their screen.
  const pull = (p: Part) => { Haptics.selectionAsync().catch(() => {}); void ask(p); };
  const part = (p: Part, label: string, o: { value?: string; tone?: "ink" | "seal"; go?: () => void; line?: boolean } = {}) => {
    const q = states[p] ?? { st: "" };
    const text = q.st === "run" ? (q.total ? t("updatingN", { n: `${q.done}/${q.total}` }) : t("updating")) : q.st === "wait" ? t("waiting")
      : q.st === "retry" ? t("retryAt", { time: when(q.at!, now) }) : o.value ?? (times[p] ? when(times[p]!, now) : t("neverSynced"));
    const color = !q.st && o.tone ? th[o.tone] : th.muted;
    return (
      <Row key={p} dense line={o.line ?? true} label={label} onPress={o.go ?? (() => pull(p))} right={<>
        <Text style={{ fontSize: font.sub, fontFamily: ff(!q.st && o.tone ? "600" : "500"), color }}>{text}</Text>
        <Tap onPress={() => pull(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("refresh")} style={[s.chevO, { borderColor: th.line, backgroundColor: th.bg }]}>
          {q.st === "run" ? <Spin color={th.ink} /> : <Icon name="sync" size={14} color={th.ink} />}
        </Tap>
      </>} />
    );
  };

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

        {/* Online (timetable, exams, marks) and LMS (assignments) are separate sections: each connects, syncs and disconnects on its own. */}
        {!on && (
          <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}>
            <Text style={[s.lab, { color: th.muted, marginTop: 26 }]}>{t("campusCard")}</Text>
            <Row flat={open === "all"} label={t("campus")} right={<Chevron open={open === "all"} size={16} color={th.muted} />} onPress={() => setOpen(open === "all" ? null : "all")} />
            {open === "all" && <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><ConnectForm initialId={id} onResult={done} onFirst={setFirst} /></Animated.View>}
          </Animated.View>
        )}
        {on && (["portal", "lms"] as const).map((k) => {
          const err = bad === k || bad === "both";
          const isOn = has[k] || err;
          return (
            <Animated.View key={k} layout={glide}>
              <Text style={[s.lab, { color: th.muted, marginTop: 26 }]}>{t(k === "portal" ? "secPortal" : "secLms")}</Text>
              {isOn && open !== k ? (
                <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}>
                  {/* Online is the green lecture art, LMS the purple assignment art; a changed password turns only that card red. */}
                  {/* The card is the account only; the rows under it refresh. */}
                  <Tap onPress={err ? () => setOpen(k) : undefined} disabled={!err} scale={0.98} style={s.art}>
                    <View style={StyleSheet.absoluteFill}><TypeArt type={err ? "exam" : k === "portal" ? "lecture" : "assignment"} seed={k === "portal" ? 5 : 2} w={264} h={104} /></View>
                    <Text style={[s.lab, s.artLab]}>{id}</Text>
                    <Text style={[s.artId, err ? { fontSize: 17 } : null]} numberOfLines={2}>{err ? t(k === "portal" ? "changedPortal" : "changedLms") : t(k === "portal" ? "srcPortal" : "srcLms")}</Text>
                    <Text style={s.artSub}>{err ? t("tapRetype") : t("connected")}</Text>
                    {err && <View style={s.glass}><Icon name="right" size={18} color="#fff" /></View>}
                  </Tap>
                  {!err && k === "lms" && part("lms", t("partLms"), { line: false })}
                  {!err && k === "portal" && <>
                    {part("tt", t("partTt"))}
                    {part("ex", t("partEx"))}
                    {part("marks", t("marks"), { value: gpa != null ? gpa.toFixed(2).replace(".", ",") : undefined, tone: "ink", go: () => router.push("/marks") })}
                    {part("fees", t("fees"), { value: fees === null ? undefined : fees > 0 ? t("feesLeft", { amount: vnd(fees) }) : t("paidAll"), tone: fees ? "seal" : undefined, go: () => router.push("/fees"), line: false })}
                  </>}
                  <View style={s.off}>
                    <Tap onPress={() => setOpen(k)} hitSlop={8} accessibilityRole="button"><Text style={{ fontSize: 14, fontFamily: ff("500"), color: th.muted }}>{t("changePw")}</Text></Tap>
                    <Tap onPress={() => off(k)} hitSlop={8} accessibilityRole="button"><Text style={{ fontSize: 14, fontFamily: ff("500"), color: th.seal }}>{t(k === "portal" ? "offPortal" : "offLms")}</Text></Tap>
                  </View>
                </Animated.View>
              ) : (
                <>
                  <Row flat={open === k} label={t(isOn ? "changePw" : k === "portal" ? "addPortal" : "addLms")} right={<Chevron open={open === k} size={16} color={th.muted} />} onPress={() => setOpen(open === k ? null : k)} />
                  {open === k && <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><ConnectForm key={k} initialId={id} hideId={on} only={k} focus={k} onResult={done} onFirst={setFirst} /></Animated.View>}
                </>
              )}
            </Animated.View>
          );
        })}
        {!on && !open && (
          <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}>
            <Row label={t("stats")} right={<Tap onPress={() => { setShare(!share); stats.setOptOut(kvStorage, share); }} accessibilityRole="switch" accessibilityState={{ checked: share }} accessibilityLabel={t("stats")} style={[s.tog, { backgroundColor: share ? th.ink : th.line, alignItems: share ? "flex-end" : "flex-start" }]}><View style={[s.knob, { backgroundColor: share ? th.bg : th.muted }]} /></Tap>} />
          </Animated.View>
        )}
        {/* settings.html Version: the last row; a newer release turns it vermilion and opens the update dialog. */}
        <Row label={t("version")}
          right={<Text style={{ fontSize: font.sub, fontFamily: ff(up ? "600" : "500"), color: up ? th.seal : th.muted }}>{dl ? t("downloadingPct", { n: dl.pct }) : up ? t("hasVersion", { version: up.version }) : `${installed} · ${buildHash}`}</Text>}
          onPress={() => (dl ? undefined : up ? setDlg({ kind: "update", update: up }) : setDlg({ kind: "new", version: installed, notes }))} />
      </ScrollView>
      </KeyboardAvoidingView>
      {toast ? <Toast key={toast.text + toast.sub} text={toast.text} sub={toast.sub} onDismiss={() => setToast(undefined)} /> : null}
      {first && <LogoState state={first} onLater={() => setFirst(null)} onRetry={async () => { setFirst("load"); await Promise.all([syncNow().catch(() => {}), new Promise((r) => setTimeout(r, 1200))]); // a failure answers in milliseconds: hold the loading leaf long enough to read as "trying"
 setFirst((await syncStatus()).last ? null : "err"); refresh(); }} />}
      {dlg && <UpdateDialog d={dlg} onClose={() => setDlg(null)} />}
    </SafeAreaView>
    </Sweep>
  );
}

const s = StyleSheet.create({
  tog: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: "center" }, // ui.css .tog
  knob: { width: 22, height: 22, borderRadius: 11 },
  root: { flex: 1 },
  body: { padding: space.gutter, paddingBottom: 40 },
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  h: { fontSize: font.h, lineHeight: 36, fontFamily: ff("600"), letterSpacing: -0.75, marginTop: 18 },
  lab: { fontSize: font.label, fontFamily: ff("500") },
  pills: { flexDirection: "row", gap: 8, marginTop: 10 },
  pill: { height: 40, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 17, paddingHorizontal: 14, marginHorizontal: -14, borderRadius: 14 },
  hair: { position: "absolute", left: 14, right: 14, bottom: 0, height: 1 },
  right: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  art: { marginTop: 10, height: 104, borderRadius: 28, overflow: "hidden", padding: 14, paddingHorizontal: 18 },
  artLab: { color: "#fff", opacity: 0.85 },
  artId: { color: "#fff", fontSize: 20, fontFamily: ff("600"), marginTop: 4, paddingRight: 50 },
  artSub: { color: "#fff", opacity: 0.9, fontFamily: ff("500"), fontSize: 14, marginTop: 3, paddingRight: 50 },
  chevO: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  off: { paddingTop: 14, paddingBottom: 17, flexDirection: "row", gap: 22 },
  glass: { position: "absolute", right: 14, bottom: 14, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.28)", borderWidth: 1, borderColor: "rgba(255,255,255,.5)" },
});
