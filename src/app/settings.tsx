import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { Alert, Appearance, Dimensions, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Icon, TypeArt } from "@/components/art";
import { Chevron } from "@/components/day";
import { fadeIn, fadeOut, glide, Tap } from "@/components/tap";
import { ConnectForm, type Res } from "@/components/settings-connect";
import { Toast } from "@/components/toast";
import * as Device from "expo-device";
import { download, engineOf, type Engine, installed as sttInstalled, pause, recommended, saveClip, startClip, TIERS, type Tier, weakFor } from "@/lib/stt";
import { getFreeDiskStorageAsync } from "expo-file-system/legacy";
import { loadCreds, owed } from "@/lib/dlu";
import { t } from "@/lib/i18n";
import * as stats from "@/lib/stats";
import { exportAll, importAll, kvGet, kvSet, resetAll } from "@/lib/store";
import { loadAreas, loadZenModes, saveAreas, saveZenModes } from "@/lib/areas-store";
import { DEFAULT_AREAS, type Area } from "@/lib/area";
import { ZEN_RULES, type ZenMode, type ZenRule } from "@/planner/zen";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
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

function Row({ label, right, onPress, flat, line = !flat, dense, color }: { color?: string; label: string; right?: React.ReactNode; onPress?: () => void; flat?: boolean; line?: boolean; dense?: boolean }) {
  const th = useTheme();
  return (
    // The press highlight bleeds 14px past the text; the hairline stays on the text column.
    <Tap variant="fade" onPress={onPress} disabled={!onPress} style={[s.row, dense && { paddingVertical: 13 }, flat && { paddingBottom: 4 }]}>
      <Text style={{ fontSize: dense ? font.meta : font.base, fontFamily: ff("600"), color: color ?? th.ink }}>{label}</Text>
      <View style={s.right}>{right}</View>
      {line && <View style={[s.hair, { backgroundColor: th.line }]} />}
    </Tap>
  );
}

const splitWords = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Mảng việc cân bằng: rename, keywords (comma separated), add a custom area, delete a custom one. Saves when a field is left. */
function Areas({ areas, onSave }: { areas: Area[]; onSave: (a: Area[]) => void }) {
  const th = useTheme();
  const [name, setName] = useState(""), [words, setWords] = useState("");
  const isCore = (id: string) => DEFAULT_AREAS.some((d) => d.id === id);
  const put = (id: string, patch: Partial<Area>) => onSave(areas.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const add = () => {
    const n = name.trim();
    if (!n) return;
    onSave([...areas, { id: `custom-${Date.now().toString(36)}`, name: n, kinds: [], words: splitWords(words) }]);
    setName(""); setWords("");
  };
  const remove = (a: Area) => Alert.alert(t("areaDelete"), a.name, [
    { text: t("cancel"), style: "cancel" },
    { text: t("areaDelete"), style: "destructive", onPress: () => onSave(areas.filter((x) => x.id !== a.id)) },
  ]);
  return (
    <View>
      {areas.map((a) => (
        <View key={a.id} style={[s.area, { borderColor: th.line }]}>
          <TextInput defaultValue={a.name} accessibilityLabel={t("areaNew")} returnKeyType="done" maxLength={40}
            onEndEditing={(e) => { const v = e.nativeEvent.text.trim(); if (v && v !== a.name) put(a.id, { name: v }); }}
            style={[s.in, { color: th.ink, borderColor: th.line }]} />
          <TextInput defaultValue={a.words.join(", ")} accessibilityLabel={t("areaWords")} placeholder={t("areaWords")} placeholderTextColor={th.muted} returnKeyType="done"
            onEndEditing={(e) => { const v = splitWords(e.nativeEvent.text); if (v.join() !== a.words.join()) put(a.id, { words: v }); }}
            style={[s.in, s.inSub, { color: th.ink, borderColor: th.line }]} />
          {!isCore(a.id) && <Tap onPress={() => remove(a)} hitSlop={8} accessibilityRole="button" style={s.del}><Text style={{ fontSize: font.sub, fontFamily: ff("600"), color: th.seal }}>{t("areaDelete")}</Text></Tap>}
        </View>
      ))}
      <View style={[s.area, { borderColor: th.line }]}>
        <TextInput value={name} onChangeText={setName} placeholder={t("areaNew")} placeholderTextColor={th.muted} accessibilityLabel={t("areaNew")} returnKeyType="next" maxLength={40}
          style={[s.in, { color: th.ink, borderColor: th.line }]} />
        <TextInput value={words} onChangeText={setWords} placeholder={t("areaWords")} placeholderTextColor={th.muted} accessibilityLabel={t("areaWords")} returnKeyType="done" onSubmitEditing={add}
          style={[s.in, s.inSub, { color: th.ink, borderColor: th.line }]} />
        <Tap onPress={add} disabled={!name.trim()} accessibilityRole="button" style={[s.addB, { borderColor: th.line, opacity: name.trim() ? 1 : 0.4 }]}>
          <Text style={{ fontSize: font.sub, fontFamily: ff("600"), color: th.ink }}>{t("areaAdd")}</Text>
        </Tap>
      </View>
    </View>
  );
}

/** Quy tắc của Zen: each rule Tắt / Tự động / Giữ chặt, as one segmented control. */
function ZenRules({ modes, onSet }: { modes: Record<ZenRule, ZenMode>; onSet: (r: ZenRule, m: ZenMode) => void }) {
  const th = useTheme();
  const label: Record<ZenRule, string> = { rest: t("zenRest"), early: t("zenEarly"), night: t("zenNight"), balance: t("zenBalance") };
  const opts: [ZenMode, string][] = [["off", t("zenOff")], ["auto", t("zenAuto")], ["strict", t("zenStrict")]];
  return (
    <View>
      {ZEN_RULES.map((r) => (
        <View key={r} style={[s.area, { borderColor: th.line }]}>
          <Text style={{ fontSize: font.base, fontFamily: ff("600"), color: th.ink }}>{label[r]}</Text>
          <View style={s.seg}>
            {opts.map(([m, text]) => {
              const on = modes[r] === m;
              return (
                <Tap key={m} variant="fade" accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${label[r]}: ${text}`} onPress={() => onSet(r, m)}
                  style={[s.segI, { borderColor: on ? th.ink : th.line, backgroundColor: on ? th.ink : "transparent" }]}>
                  <Text numberOfLines={1} style={{ fontSize: font.sub, fontFamily: ff(on ? "700" : "500"), color: on ? th.bg : th.ink }}>{text}</Text>
                </Tap>
              );
            })}
          </View>
        </View>
      ))}
    </View>
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
  const [areas, setAreas] = useState<Area[]>(DEFAULT_AREAS); // kv "areas"
  const [zen, setZen] = useState<Record<ZenRule, ZenMode>>({ rest: "auto", early: "auto", night: "auto", balance: "auto" }); // kv "zen.rules"
  const [openAreas, setOpenAreas] = useState(false), [openZen, setOpenZen] = useState(false);
  useEffect(() => { void loadAreas().then(setAreas); void loadZenModes().then(setZen); }, []);
  const saveAreasNow = (a: Area[]) => { setAreas(a); saveAreas(a).catch(() => setToast({ text: t("backupFail"), sub: "" })); };
  const setZenRule = (r: ZenRule, m: ZenMode) => { const next = { ...zen, [r]: m }; setZen(next); saveZenModes(next).catch(() => setToast({ text: t("backupFail"), sub: "" })); };
  const [open, setOpen] = useState<Src | "all" | null>(null); // "all": first connect, ID + both passwords; else one account's field
  const [toast, setToast] = useState<{ text: string; sub: string }>();
  const [now, setNow] = useState(0);
  const [up, setUp] = useState<Update | null>(null); // a newer release on GitHub
  const d = useDownload(), dl = d?.failed ? null : d; // its APK coming down in the background; failed, the row offers it again
  const [dlg, setDlg] = useState<Dlg | null>(null);
  // Speech: the setting (unset = the recommended tier), the tier on disk, and the download in progress.
  const [stt, setStt] = useState<{ setting: Engine | null; installed: Tier | null; dl?: { tier: Tier; pct?: number; paused?: boolean; err?: boolean } }>({ setting: null, installed: null });
  const [benchOn, setBenchOn] = useState(false); // hidden: long-press the speech label
  const [bench, setBench] = useState<{ rec?: { stop(): Promise<Uint8Array> }; pcm?: Uint8Array; text: string; saved?: string }>({ text: "" });
  const [freeDisk, setFreeDisk] = useState<number | null>(null);
  const spec = { totalMemory: Device.totalMemory, yearClass: Device.deviceYearClass, cpus: Device.supportedCpuArchitectures, freeDisk };
  const sttRec = recommended(spec);
  const effective = stt.setting ?? sttRec;

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
    checkUpdate().then(setUp).catch(() => {});
    kvGet("stt.engine").then((e) => setStt((x) => ({ ...x, setting: engineOf(e) })));
    sttInstalled().then((t) => setStt((x) => ({ ...x, installed: t })));
    getFreeDiskStorageAsync().then(setFreeDisk, () => {});
  }, [refresh]);
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(undefined), 4000); return () => clearTimeout(h); }, [toast]);

  // Appearance.setColorScheme makes useColorScheme (and so useTheme) follow; _layout must re-apply kv "theme" at launch.
  // Picking a tier saves it and downloads it when missing; the other tier stays until this one is ready. The download row pauses while running.
  const applyEngine = async (engine: Engine) => { setStt((x) => ({ ...x, setting: engine })); await kvSet("stt.engine", engine); if (engine !== "os" && engine !== stt.installed) void getModel(engine); };
  // A tier above what this phone handles warns first; one that cannot fit on disk is refused.
  const setEngine = async (engine: Engine) => {
    const weak = engine === "os" || engine === stt.installed ? undefined : weakFor(engine, { ...spec, freeDisk: await getFreeDiskStorageAsync().catch(() => null) });
    if (weak === "disk") return Alert.alert("Không đủ chỗ trống", `Cần khoảng ${Math.round(TIERS[engine as Tier].bytes / 1e6) + 300} MB trống để tải. Hãy xoá bớt rồi thử lại.`);
    if (!weak) return applyEngine(engine);
    Alert.alert("Máy này có thể chạy chậm", weak === "mem" ? "Máy ít bộ nhớ: Zen có thể nghe chậm, máy nóng hoặc ứng dụng bị đóng. Lỗi thì tự chuyển về nhận giọng của máy." : "Bộ xử lý của máy khá cũ: Zen có thể nghe chậm và tốn pin. Lỗi thì tự chuyển về nhận giọng của máy.", [
      { text: "Thôi", style: "cancel" },
      { text: "Vẫn tải", onPress: () => void applyEngine(engine) },
    ]);
  };
  const getModel = async (t: Tier) => {
    if (stt.dl?.tier === t && stt.dl.pct != null) return void pause();
    setStt((x) => ({ ...x, dl: { tier: t, pct: 0 } }));
    try {
      const done = await download(t, (f) => setStt((x) => ({ ...x, dl: { tier: t, pct: Math.round(f * 100) } })));
      setStt((x) => ({ ...x, installed: done ? t : x.installed, dl: done ? undefined : { tier: t, paused: true } }));
    } catch { setStt((x) => ({ ...x, dl: { tier: t, err: true } })); }
  };
  const benchTap = async () => {
    if (bench.rec) { const pcm = await bench.rec.stop(); return setBench((b) => ({ ...b, rec: undefined, pcm })); }
    setBench({ text: "", saved: undefined, pcm: undefined, rec: await startClip() });
  };
  const benchSave = async () => {
    if (!bench.pcm || !bench.text.trim()) return;
    setBench({ text: "", saved: await saveClip(bench.pcm, bench.text.trim()) });
  };

  // Backup: the share sheet offers Save to Files / iCloud Drive; import reads such a file back and replaces what is on the device.
  const doExport = async () => {
    try {
      const f = new File(Paths.cache, `zen-${new Date().toISOString().slice(0, 10)}.json`);
      f.create({ overwrite: true });
      f.write(await exportAll());
      await Sharing.shareAsync(f.uri, { mimeType: "application/json", UTI: "public.json" });
    } catch { setToast({ text: t("backupFail"), sub: "" }); }
  };
  const doImport = () => Alert.alert(t("importData"), t("importAsk"), [
    { text: t("cancel"), style: "cancel" },
    { text: t("importDo"), style: "destructive", onPress: async () => {
      try {
        const r = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
        if (r.canceled) return;
        const n = await importAll(await new File(r.assets[0].uri).text());
        setToast({ text: t("imported", { n }), sub: "" });
      } catch { setToast({ text: t("backupBad"), sub: "" }); }
    } },
  ]);

  const doReset = () => Alert.alert(t("resetData"), t("resetAsk"), [
    { text: t("cancel"), style: "cancel" },
    { text: t("backupFirst"), onPress: doExport },
    { text: t("resetData"), style: "destructive", onPress: async () => {
      try { await resetAll(); setToast({ text: t("resetDone"), sub: "" }); } catch { setToast({ text: t("backupFail"), sub: "" }); }
    } },
  ]);

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

        <Text onLongPress={() => setBenchOn((v) => !v)} style={[s.lab, { color: th.muted, marginTop: 26 }]}>Giọng nói</Text>
        {/* Radio list: tap a row to choose it; a tier not on disk downloads, and its row shows the progress. */}
        {([
          ["os", "Của máy", "Nhận giọng có sẵn trên máy"],
          ["base", "Nhẹ", "Zen nghe trên máy, nhanh"],
          ["small", "Chính xác", "Zen nghe trên máy, ít sai hơn"],
        ] as [Engine, string, string][]).map(([k, name, sub]) => {
          const on = effective === k, d = k !== "os" && stt.dl?.tier === k ? stt.dl : undefined;
          const right = k === "os" ? "" : d?.pct != null ? `Đang tải ${d.pct}%` : stt.installed === k ? "Đã tải" : `${Math.round(TIERS[k].bytes / 1e6)} MB`;
          return (
            <Tap key={k} variant="fade" accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={name} onPress={() => setEngine(k)} style={[s.row, { paddingVertical: 17 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: font.base, fontFamily: ff("600"), color: th.ink }}>{name}</Text>
                <Text style={{ fontSize: font.meta, fontFamily: ff("500"), color: th.muted, marginTop: 2 }}>{sub}</Text>
              </View>
              <Text style={{ fontSize: font.sub, fontFamily: ff("500"), color: th.muted, fontVariant: ["tabular-nums"] }}>{right}</Text>
              <View style={{ width: 22, alignItems: "center" }}>{on && <Icon name="check" size={20} color={th.ink} w={2.4} />}</View>
            </Tap>
          );
        })}
        <Text style={{ marginTop: 12, fontSize: font.meta, fontFamily: ff("400"), color: th.muted, lineHeight: 20 }}>
          {sttRec === "os" ? "Máy này ít bộ nhớ, nên dùng nhận giọng của máy." : "Nghe ngay trên máy, không gửi đi đâu. Lỗi thì tự chuyển về nhận giọng của máy."}
        </Text>
        {benchOn && <>
          <Row dense label={bench.rec ? "Đang ghi · chạm để dừng" : "Ghi mẫu thử"} onPress={benchTap} />
          {bench.pcm && <>
            <TextInput value={bench.text} onChangeText={(text) => setBench((b) => ({ ...b, text }))} placeholder="Câu nói đúng" placeholderTextColor={th.muted} style={{ fontSize: font.base, fontFamily: ff("500"), color: th.ink, paddingVertical: 10, borderBottomWidth: 1, borderColor: th.line }} />
            <Row dense label="Lưu mẫu" onPress={benchSave} />
          </>}
          {bench.saved && <Text style={{ fontSize: font.sub, fontFamily: ff("400"), color: th.muted }}>{bench.saved}</Text>}
        </>}

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
        <Row flat={openAreas} label={t("areasSec")} right={<Chevron open={openAreas} size={16} color={th.muted} />} onPress={() => setOpenAreas((v) => !v)} />
        {openAreas && <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><Areas areas={areas} onSave={saveAreasNow} /></Animated.View>}
        <Row flat={openZen} label={t("zenSec")} right={<Chevron open={openZen} size={16} color={th.muted} />} onPress={() => setOpenZen((v) => !v)} />
        {openZen && <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><ZenRules modes={zen} onSet={setZenRule} /></Animated.View>}
        <Text style={[s.lab, { color: th.muted, marginTop: 26 }]}>{t("dataSec")}</Text>
        <Row label={t("exportData")} onPress={doExport} />
        <Row label={t("importData")} onPress={doImport} />
        <Row label={t("resetData")} color={th.seal} onPress={doReset} />
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
  chevO: { width: 30, height: 30, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  off: { paddingTop: 14, paddingBottom: 17, flexDirection: "row", gap: 22 },
  area: { paddingVertical: 12, gap: 8, borderBottomWidth: 1 },
  in: { minWidth: 0, fontSize: font.base, fontFamily: ff("500"), paddingVertical: 8, borderBottomWidth: 1 },
  inSub: { fontSize: font.sub, fontFamily: ff("400") },
  del: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center" },
  addB: { alignSelf: "flex-start", minHeight: 40, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  seg: { flexDirection: "row", gap: 6 },
  segI: { flex: 1, minWidth: 0, minHeight: 40, paddingHorizontal: 6, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  glass: { position: "absolute", right: 14, bottom: 14, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.28)", borderWidth: 1, borderColor: "rgba(255,255,255,.5)" },
});
