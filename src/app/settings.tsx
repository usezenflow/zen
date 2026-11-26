import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { Alert, Appearance, Dimensions, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Icon, TypeArt, type IconName } from "@/components/art";
import { Chevron } from "@/components/day";
import { fadeIn, fadeOut, glide, Tap } from "@/components/tap";
import { ConnectForm, type Res } from "@/components/settings-connect";
import { Toast } from "@/components/toast";
import { loadCreds, owed } from "@/lib/dlu";
import { t } from "@/lib/i18n";
import * as stats from "@/lib/stats";
import { allTasks, exportAll, importAll, kvGet, kvSet, resetAll } from "@/lib/store";
import { loadAreas, loadZenModes, saveAreas, saveZenModes } from "@/lib/areas-store";
import { DEFAULT_AREAS, WORDS_MAX, addWord, areaShare, ownerOf, weekCount, type Area } from "@/lib/area";
import type { Task } from "@/lib/types";
import { ZEN_RULES, type ZenMode, type ZenRule } from "@/planner/zen";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ask, disconnect, getFeeRows, getMarks, kvStorage, loginError, onQueue, partStates, partTimes, syncNow, syncStatus, vnd, type Login, type Part, type PartState } from "@/lib/sync";
import { hasLms, hasPortal } from "@/lib/dlu/creds";
import { useTheme, font, space, ff, fd } from "@/lib/theme";
import { Sweep, useSweep } from "@/components/sweep";
import { when } from "@/lib/when";
import { LogoState } from "@/components/logostate";
import { UpdateDialog, type Dlg } from "@/components/update";
import { buildHash, checkUpdate, installed, notes, useDownload } from "@/lib/update";
import type { Update } from "@/lib/update-version";

type Mode = "system" | "light" | "dark";
type Src = "portal" | "lms";

// `sweep`: the change (theme) is revealed by a circle growing from the top-right corner toward the bottom-left.
const Pill = ({ label, on, onPress, sweep, icon }: { label: string; on: boolean; onPress: () => void; sweep?: boolean; icon: IconName }) => {
  const th = useTheme();
  const run = useSweep();
  const c = on ? th.onAccent : th.ink;
  return (
    <Tap onPress={(e) => (sweep && !on ? run(Dimensions.get("window").width, 0, onPress) : onPress())} style={[s.pill, on ? { backgroundColor: th.accent, borderColor: th.accent } : { borderColor: th.line }]}>
      <Icon name={icon} size={16} color={c} w={1.8} />
      <Text style={{ fontSize: font.sub, fontFamily: ff(on ? "600" : "500"), color: c }}>{label}</Text>
    </Tap>
  );
};

// The sync glyph turns while its part is being fetched.
const Spin = ({ color }: { color: string }) => {
  const r = useSharedValue(0);
  useEffect(() => { r.set(withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1)); }, [r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get().toFixed(2)}deg` }] }));
  return <Animated.View style={st}><Icon name="refresh" size={14} color={color} /></Animated.View>;
};

function Row({ label, right, onPress, flat, line = !flat, dense, color, icon, danger }: { color?: string; label: string; right?: React.ReactNode; onPress?: () => void; flat?: boolean; line?: boolean; dense?: boolean; icon?: IconName; danger?: boolean }) {
  const th = useTheme();
  return (
    // The press highlight bleeds 14px past the text; the hairline stays on the text column.
    <Tap variant="fade" onPress={onPress} disabled={!onPress} style={[s.row, dense && { paddingVertical: 13 }, flat && { paddingBottom: 4 }]}>
      {icon && <View style={[s.tile, { backgroundColor: th.chip }]}><Icon name={icon} size={18} color={danger ? th.seal : th.ink} w={2} /></View>}
      <Text style={{ fontSize: dense ? font.meta : font.base, fontFamily: ff("500"), color: color ?? th.ink }}>{label}</Text>
      <View style={s.right}>{right}</View>
      {line && <View style={[s.hair, { backgroundColor: th.line }]} />}
    </Tap>
  );
}

// Area dots, by list position: the core six keep the same colour while nothing before them is deleted.
const DOTS = ["#c21f86", "#0f8f6a", "#ff4f2a", "#8a5cc4", "#c98a12", "#5f7d95"]; // settings.html AREAS first three; no blue dot

/** −/+ target stepper: 0..100 in steps of 5. */
function Step({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const th = useTheme();
  const btn = (sym: string, to: number, label: string) => (
    <Tap onPress={() => onChange(to)} disabled={to === value} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={s.stepB}>
      <Text style={{ fontSize: 18, lineHeight: 22, fontFamily: ff("500"), color: to === value ? th.line : th.muted }}>{sym}</Text>
    </Tap>
  );
  return (
    <View style={[s.step, { borderColor: th.line }]}>
      {btn("−", Math.max(0, value - 5), "−5%")}
      <Text style={[s.stepV, { color: th.ink }]}>{value}%</Text>
      {btn("+", Math.min(100, value + 5), "+5%")}
    </View>
  );
}

/** Keyword chips: a comma, Enter or leaving the field commits the typed word; ✕ removes a chip. A word another area owns is amber. */
function Keywords({ area, areas, onChange }: { area: Area; areas: Area[]; onChange: (w: string[]) => void }) {
  const th = useTheme();
  const [draft, setDraft] = useState("");
  const commit = (raw: string) => {
    let words = area.words;
    for (const part of raw.split(",")) words = addWord(words, part) ?? words;
    if (words !== area.words) onChange(words);
    setDraft("");
  };
  // A comma commits the words before it; the text after it stays in the field.
  const onText = (v: string) => {
    const i = v.lastIndexOf(",");
    if (i < 0) return setDraft(v);
    commit(v.slice(0, i));
    setDraft(v.slice(i + 1));
  };
  return (
    <View style={s.kw}>
      {area.words.map((w, i) => {
        const owner = ownerOf(w, areas, area.id);
        return (
          <View key={`${i}-${w}`} style={[s.chip, { borderColor: th.line, backgroundColor: owner ? th.warnT : "transparent" }]}>
            <Text style={{ fontSize: font.sub, lineHeight: 22, fontFamily: ff("500"), color: owner ? th.warnInk : th.ink }}>{w}</Text>
            <Tap onPress={() => onChange(area.words.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("areaRemoveWord", { w })}>
              <View style={{ opacity: 0.55 }}><Icon name="x" size={14} color={th.ink} w={2} /></View>
            </Tap>
          </View>
        );
      })}
      {area.words.length < WORDS_MAX && (
        <View style={[s.chip, s.chipAdd, { borderColor: th.line }]}>
          <Icon name="plus" size={14} color={th.muted} w={2} />
          <Text style={[s.chipIn, { opacity: 0 }]} numberOfLines={1} importantForAccessibility="no-hide-descendants">{draft || t("areaAddWord")}</Text>
          <TextInput value={draft} onChangeText={onText} onSubmitEditing={() => commit(draft)} onBlur={() => commit(draft)} blurOnSubmit={false}
            placeholder={t("areaAddWord")} placeholderTextColor={th.muted} accessibilityLabel={t("areaAddWord")} returnKeyType="done"
            style={[s.chipIn, StyleSheet.absoluteFill, { color: th.ink, left: 14, right: 14 }]} />
        </View>
      )}
    </View>
  );
}

/** Mảng việc cân bằng: each area is a card with a name, a target stepper, this week's share against the target, keyword chips and a hint. Saves on every change. */
function Areas({ areas, tasks, now, onSave }: { areas: Area[]; tasks: Task[]; now: number; onSave: (a: Area[]) => void }) {
  const th = useTheme();
  const [name, setName] = useState("");
  const isCore = (id: string) => DEFAULT_AREAS.some((d) => d.id === id);
  const put = (id: string, patch: Partial<Area>) => onSave(areas.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const share = areaShare(tasks, areas, now), count = weekCount(tasks, areas, now);
  const add = () => {
    const n = name.trim();
    if (!n) return;
    onSave([...areas, { id: `custom-${Date.now().toString(36)}`, name: n, kinds: [], words: [] }]);
    setName("");
  };
  const remove = (a: Area) => Alert.alert(t("areaDelete"), a.name, [
    { text: t("cancel"), style: "cancel" },
    { text: t("areaDelete"), style: "destructive", onPress: () => onSave(areas.filter((x) => x.id !== a.id)) },
  ]);
  return (
    <View>
      <Text style={[s.exp, { color: th.muted }]}>{t("areaExp")}</Text>
      {areas.map((a, i) => {
        const target = a.targetPct ?? 0, sh = share[a.id] ?? 0, dot = DOTS[i % DOTS.length];
        const over = sh > 0 && sh * 100 > target;
        // A word another area owns is the one thing to say; else over target, else the matches (or none) this week.
        const taken = a.words.find((w) => ownerOf(w, areas, a.id));
        const owner = taken ? ownerOf(taken, areas, a.id) : undefined;
        // The status is a tinted pill: warn (alert) for a clash or over target, ok (check) for matches, info (info) for none.
        const [hint, ink, tint, icon] = owner ? [t("areaHintOwned", { w: taken!, a: owner.name }), th.warnInk, th.warnT, "alert" as const]
          : over ? [t("areaHintOver"), th.warnInk, th.warnT, "alert" as const]
          : count[a.id] ? [t("areaHintOk", { n: count[a.id] }), th.ok, th.okT, "checkCircle" as const]
          : [t("areaHintNone"), th.info, th.infoT, "info" as const];
        return (
          <View key={a.id} style={[s.area, { borderColor: th.line }]}>
            <View style={s.top}>
              <View style={[s.dot, { backgroundColor: dot }]} />
              <TextInput defaultValue={a.name} accessibilityLabel={t("areaNew")} returnKeyType="done" maxLength={40}
                onEndEditing={(e) => { const v = e.nativeEvent.text.trim(); if (v && v !== a.name) put(a.id, { name: v }); }}
                style={[s.name, { color: th.ink }]} />
              <Step value={target} onChange={(v) => put(a.id, { targetPct: v })} />
            </View>
            {/* The bar is full at 50% of the week, so a 25% target sits mid-bar; the tick marks the target. */}
            <View style={s.share}>
              <View style={[s.track, { backgroundColor: th.line }]}>
                <View style={[s.fill, { width: `${Math.min(100, sh * 200)}%`, backgroundColor: over ? th.warn : dot }]} />
                <View style={[s.tick, { left: `${Math.min(100, target * 2)}%`, backgroundColor: th.ink }]} />
              </View>
              <Text style={[s.shareV, { color: th.muted }]}>{Math.round(sh * 100)}%</Text>
            </View>
            <Keywords area={a} areas={areas} onChange={(words) => put(a.id, { words })} />
            <View style={[s.hint, { backgroundColor: tint }]} accessibilityRole="text">
              <View style={{ marginTop: 2 }}><Icon name={icon} size={18} color={ink} w={2} /></View>
              <Text style={{ flexShrink: 1, fontSize: font.sub, lineHeight: 22, color: ink, fontFamily: ff(owner || over ? "500" : "500") }}>{hint}</Text>
            </View>
            {!isCore(a.id) && <Tap onPress={() => remove(a)} hitSlop={8} accessibilityRole="button" style={s.del}><Text style={{ fontSize: font.sub, lineHeight: 22, fontFamily: ff("500"), color: th.seal }}>{t("areaDelete")}</Text></Tap>}
          </View>
        );
      })}
      <View style={[s.area, { borderColor: th.line }]}>
        <TextInput value={name} onChangeText={setName} placeholder={t("areaNew")} placeholderTextColor={th.muted} accessibilityLabel={t("areaNew")} returnKeyType="done" onSubmitEditing={add} maxLength={40}
          style={[s.field, { color: th.ink, borderColor: th.line }]} />
        <Tap onPress={add} disabled={!name.trim()} accessibilityRole="button" style={[s.addB, { borderColor: th.line, opacity: name.trim() ? 1 : 0.4 }]}>
          <Text style={{ fontSize: font.sub, lineHeight: 22, fontFamily: ff("500"), color: th.ink }}>{t("areaAdd")}</Text>
        </Tap>
      </View>
    </View>
  );
}

const RULE_ICON: Record<ZenRule, IconName> = { rest: "leaf", early: "sun", night: "moon", balance: "target" };

/** Quy tắc của Zen: four cards, each with its name, one line on what it does, and a Tắt / Tự động / Giữ chặt segmented control. */
function ZenRules({ modes, onSet }: { modes: Record<ZenRule, ZenMode>; onSet: (r: ZenRule, m: ZenMode) => void }) {
  const th = useTheme();
  const label: Record<ZenRule, string> = { rest: t("zenRest"), early: t("zenEarly"), night: t("zenNight"), balance: t("zenBalance") };
  const desc: Record<ZenRule, string> = { rest: t("zenRestD"), early: t("zenEarlyD"), night: t("zenNightD"), balance: t("zenBalanceD") };
  const opts: [ZenMode, string][] = [["off", t("zenOff")], ["auto", t("zenAuto")], ["strict", t("zenStrict")]];
  // Selected: Tắt is an outlined ink pill; Tự động and Giữ chặt take the brand fill.
  const look = (m: ZenMode, on: boolean) => {
    if (!on) return { bg: "transparent", border: th.line, text: th.muted };
    if (m === "off") return { bg: "transparent", border: th.ink, text: th.ink };
    return { bg: th.accent, border: th.accent, text: th.onAccent };
  };
  return (
    <View>
      <Text style={[s.exp, { color: th.muted }]}>{t("zenExp")}</Text>
      {ZEN_RULES.map((r) => (
        <View key={r} style={[s.rc, { borderColor: th.line }]}>
          <View style={s.qRow}><View style={[s.tile, { backgroundColor: th.chip }]}><Icon name={RULE_ICON[r]} size={18} color={th.ink} w={2} /></View><Text style={[s.q, { color: th.ink }]}>{label[r]}</Text></View>
          <Text style={[s.d, { color: th.muted }]}>{desc[r]}</Text>
          <View style={s.sg}>
            {opts.map(([m, text]) => {
              const on = modes[r] === m, c = look(m, on);
              return (
                <Tap key={m} variant="fade" accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${label[r]}: ${text}`} onPress={() => onSet(r, m)}
                  style={[s.segI, { borderColor: c.border, backgroundColor: c.bg }]}>
                  <Text numberOfLines={1} style={{ fontSize: font.sub, lineHeight: 22, fontFamily: ff(on ? "600" : "500"), color: c.text }}>{text}</Text>
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
  const [tasks, setTasks] = useState<Task[]>([]); // the week's shares and matches for the areas
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
  const refresh = useCallback(async () => {
    const c = await loadCreds();
    setOn(!!c); setId(c?.studentId ?? ""); setHas({ portal: !!c && hasPortal(c), lms: !!c && hasLms(c) });
    setNow(Date.now()); setTimes(await partTimes()); setBad(await loginError());
    setStates(await partStates());
    setTasks(await allTasks());
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
  }, [refresh]);
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(undefined), 4000); return () => clearTimeout(h); }, [toast]);

  // Appearance.setColorScheme makes useColorScheme (and so useTheme) follow; _layout must re-apply kv "theme" at launch.

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
  const part = (p: Part, label: string, o: { value?: string; tone?: "ink" | "seal"; go?: () => void; line?: boolean; icon: IconName }) => {
    const q = states[p] ?? { st: "" };
    const text = q.st === "run" ? (q.total ? t("updatingN", { n: `${q.done}/${q.total}` }) : t("updating")) : q.st === "wait" ? t("waiting")
      : q.st === "retry" ? t("retryAt", { time: when(q.at!, now) }) : o.value ?? (times[p] ? when(times[p]!, now) : t("neverSynced"));
    const color = !q.st && o.tone ? th[o.tone] : th.muted;
    return (
      <Row key={p} dense line={o.line ?? true} label={label} icon={o.icon} onPress={o.go ?? (() => pull(p))} right={<>
        <Text style={{ fontSize: font.sub, fontFamily: ff(!q.st && o.tone ? "500" : "500"), color }}>{text}</Text>
        <Tap onPress={() => pull(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("refresh")} style={[s.chevO, { borderColor: th.line, backgroundColor: th.bg }]}>
          {q.st === "run" ? <Spin color={th.ink} /> : <Icon name="refresh" size={14} color={th.ink} />}
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

        <View style={[s.labRow, { marginTop: 28 }]}><Icon name="sun" size={16} color={th.muted} w={2} /><Text style={[s.lab, { color: th.muted }]}>{t("theme")}</Text></View>
        <View style={s.pills}>
          {(["system", "light", "dark"] as Mode[]).map((m) => (
            <Pill key={m} sweep on={mode === m} icon={m === "system" ? "gear" : m === "light" ? "sun" : "moon"} onPress={() => pickMode(m)} label={t(m === "system" ? "themeSystem" : m === "light" ? "themeLight" : "themeDark")} />
          ))}
        </View>

        {/* Online (timetable, exams, marks) and LMS (assignments) are separate sections: each connects, syncs and disconnects on its own. */}
        {!on && (
          <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}>
            <Text style={[s.lab, { color: th.muted, marginTop: 26 }]}>{t("campusCard")}</Text>
            <Row flat={open === "all"} icon="school" label={t("campus")} right={<Chevron open={open === "all"} size={16} color={th.muted} />} onPress={() => setOpen(open === "all" ? null : "all")} />
            {open === "all" && <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><ConnectForm initialId={id} onResult={done} onFirst={setFirst} /></Animated.View>}
          </Animated.View>
        )}
        {on && (["portal", "lms"] as const).map((k) => {
          const err = bad === k || bad === "both";
          const isOn = has[k] || err;
          return (
            <Animated.View key={k} layout={glide}>
              <View style={[s.labRow, { marginTop: 26 }]}><Icon name={k === "portal" ? "school" : "book"} size={16} color={th.muted} w={2} /><Text style={[s.lab, { color: th.muted }]}>{t(k === "portal" ? "secPortal" : "secLms")}</Text></View>
              {isOn && open !== k ? (
                <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}>
                  {/* Online is the green lecture art, LMS the purple assignment art; a changed password turns only that card red. */}
                  {/* The card is the account only; the rows under it refresh. */}
                  <Tap onPress={err ? () => setOpen(k) : undefined} disabled={!err} scale={0.98} style={s.art}>
                    <View style={StyleSheet.absoluteFill}><TypeArt type={err ? "exam" : k === "portal" ? "lecture" : "assignment"} seed={k === "portal" ? 5 : 2} w={264} h={104} drift /></View>
                    <Text style={[s.lab, s.artLab]}>{id}</Text>
                    <Text style={[s.artId, err ? { fontSize: 17 } : null]} numberOfLines={2}>{err ? t(k === "portal" ? "changedPortal" : "changedLms") : t(k === "portal" ? "srcPortal" : "srcLms")}</Text>
                    <Text style={s.artSub}>{err ? t("tapRetype") : t("connected")}</Text>
                    {err && <View style={s.glass}><Icon name="alert" size={18} color="#fff" /></View>}
                  </Tap>
                  {!err && k === "lms" && part("lms", t("partLms"), { line: false, icon: "book" })}
                  {!err && k === "portal" && <>
                    {part("tt", t("partTt"), { icon: "calendar" })}
                    {part("ex", t("partEx"), { icon: "examCheck" })}
                    {part("marks", t("marks"), { icon: "chart", value: gpa != null ? gpa.toFixed(2).replace(".", ",") : undefined, tone: "ink", go: () => router.push("/marks") })}
                    {part("fees", t("fees"), { icon: "finance", value: fees === null ? undefined : fees > 0 ? t("feesLeft", { amount: vnd(fees) }) : t("paidAll"), tone: fees ? "seal" : undefined, go: () => router.push("/fees"), line: false })}
                  </>}
                  <View style={s.off}>
                    <Tap onPress={() => setOpen(k)} hitSlop={8} accessibilityRole="button"><Text style={{ fontSize: 14, fontFamily: ff("500"), color: th.muted }}>{t("changePw")}</Text></Tap>
                    <Tap onPress={() => off(k)} hitSlop={8} accessibilityRole="button"><Text style={{ fontSize: 14, fontFamily: ff("500"), color: th.seal }}>{t(k === "portal" ? "offPortal" : "offLms")}</Text></Tap>
                  </View>
                </Animated.View>
              ) : (
                <>
                  <Row flat={open === k} icon={isOn ? "shield" : "upload"} label={t(isOn ? "changePw" : k === "portal" ? "addPortal" : "addLms")} right={<Chevron open={open === k} size={16} color={th.muted} />} onPress={() => setOpen(open === k ? null : k)} />
                  {open === k && <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><ConnectForm key={k} initialId={id} hideId={on} only={k} focus={k} onResult={done} onFirst={setFirst} /></Animated.View>}
                </>
              )}
            </Animated.View>
          );
        })}
        {!on && !open && (
          <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}>
            <Row icon="shield" label={t("stats")} right={<Tap onPress={() => { setShare(!share); stats.setOptOut(kvStorage, share); }} accessibilityRole="switch" accessibilityState={{ checked: share }} accessibilityLabel={t("stats")} style={[s.tog, { backgroundColor: share ? th.accent : th.line, alignItems: share ? "flex-end" : "flex-start" }]}><View style={[s.knob, { backgroundColor: share ? th.bg : th.muted }]} /></Tap>} />
          </Animated.View>
        )}
        <Row flat={openAreas} icon="target" label={t("areasSec")} right={<Chevron open={openAreas} size={16} color={th.muted} />} onPress={() => setOpenAreas((v) => !v)} />
        {openAreas && <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><Areas areas={areas} tasks={tasks} now={now} onSave={saveAreasNow} /></Animated.View>}
        <Row flat={openZen} icon="shield" label={t("zenSec")} right={<Chevron open={openZen} size={16} color={th.muted} />} onPress={() => setOpenZen((v) => !v)} />
        {openZen && <Animated.View entering={fadeIn} exiting={fadeOut} layout={glide}><ZenRules modes={zen} onSet={setZenRule} /></Animated.View>}
        <Text style={[s.lab, { color: th.muted, marginTop: 26 }]}>{t("dataSec")}</Text>
        <Row icon="upload" label={t("exportData")} onPress={doExport} />
        <Row icon="download" label={t("importData")} onPress={doImport} />
        <Row icon="trash" danger label={t("resetData")} color={th.seal} onPress={doReset} />
        {/* settings.html Version: the last row; a newer release turns it vermilion and opens the update dialog. */}
        <Row icon="info" label={t("version")}
          right={<Text style={{ fontSize: font.sub, fontFamily: ff(up ? "500" : "500"), color: up ? th.seal : th.muted }}>{dl ? t("downloadingPct", { n: dl.pct }) : up ? t("hasVersion", { version: up.version }) : `${installed} · ${buildHash}`}</Text>}
          onPress={() => (dl ? undefined : up ? setDlg({ kind: "update", update: up }) : setDlg({ kind: "new", version: installed, notes }))} />
      </ScrollView>
      </KeyboardAvoidingView>
      {toast ? <Toast key={toast.text + toast.sub} text={toast.text} sub={toast.sub} ms={4000} onDismiss={() => setToast(undefined)} /> : null}
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
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  h: { fontSize: font.h, lineHeight: 40, fontFamily: fd("700"), letterSpacing: -1.05, marginTop: 18 },
  // ui.css/v2.css .lab: an eyebrow, 12.5px light capitals with a little tracking
  lab: { fontSize: 12.5, lineHeight: 16, fontFamily: ff("400"), letterSpacing: 1.1, textTransform: "uppercase" },
  labRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  pills: { flexDirection: "row", gap: 8, marginTop: 10 },
  pill: { height: 40, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }, // ui.css .pill: icon beside the label
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 17, paddingHorizontal: 14, marginHorizontal: -14, borderRadius: 14 },
  hair: { position: "absolute", left: 14, right: 14, bottom: 0, height: 1 },
  right: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  art: { marginTop: 10, height: 104, borderRadius: 34, overflow: "hidden", padding: 14, paddingHorizontal: 18 },
  artLab: { color: "#fff", opacity: 0.85, fontFamily: ff("500"), textShadowColor: "rgba(0,0,0,.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  artId: { color: "#fff", fontSize: 20, fontFamily: ff("500"), marginTop: 4, paddingRight: 50, textShadowColor: "rgba(0,0,0,.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  artSub: { color: "#fff", opacity: 0.92, fontFamily: ff("500"), fontSize: 14, marginTop: 3, paddingRight: 50, textShadowColor: "rgba(0,0,0,.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  chevO: { width: 30, height: 30, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  off: { paddingTop: 14, paddingBottom: 17, flexDirection: "row", gap: 22 },
  exp: { marginTop: 10, fontSize: 15, lineHeight: 22, fontFamily: ff("400") },
  area: { marginTop: 10, padding: 16, paddingBottom: 14, borderRadius: 26, borderWidth: 1 }, // one hairline card per area or rule set
  top: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, minWidth: 0, fontSize: 18, lineHeight: 24, fontFamily: ff("600"), paddingVertical: 0 },
  step: { flexDirection: "row", alignItems: "center", height: 38, borderRadius: 99, borderWidth: 1 },
  stepB: { width: 34, height: 38, alignItems: "center", justifyContent: "center" },
  stepV: { minWidth: 38, textAlign: "center", fontSize: 15, lineHeight: 20, fontFamily: ff("600") },
  share: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  track: { flex: 1, height: 8, borderRadius: 8 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 8 },
  tick: { position: "absolute", top: -3, bottom: -3, width: 2, borderRadius: 2 },
  shareV: { minWidth: 40, textAlign: "right", fontSize: 14, lineHeight: 20, fontFamily: ff("500") },
  kw: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { height: 34, paddingLeft: 13, paddingRight: 8, borderRadius: 99, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  chipAdd: { paddingHorizontal: 14, borderStyle: "dashed" },
  chipIn: { fontSize: 15, lineHeight: 22, fontFamily: ff("500"), paddingVertical: 0 },
  hint: { marginTop: 10, alignSelf: "flex-start", maxWidth: "100%", flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8, paddingLeft: 10, paddingRight: 14, borderRadius: 18 },
  tile: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }, // ui.css .ti
  field: { height: 42, borderRadius: 99, borderWidth: 1, paddingHorizontal: 14, fontSize: font.sub, lineHeight: 22, fontFamily: ff("500") },
  del: { alignSelf: "flex-start", marginTop: 8, minHeight: 36, justifyContent: "center" },
  addB: { alignSelf: "flex-start", marginTop: 10, minHeight: 40, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rc: { marginTop: 8, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1 },
  qRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  q: { fontSize: 17, lineHeight: 24, fontFamily: ff("500"), letterSpacing: -0.2 },
  d: { marginTop: 3, fontSize: 14, lineHeight: 20, fontFamily: ff("400") },
  sg: { marginTop: 12, flexDirection: "row", gap: 6 },
  segI: { flex: 1, minWidth: 0, minHeight: 40, paddingHorizontal: 6, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  glass: { position: "absolute", right: 14, bottom: 14, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.28)", borderWidth: 1, borderColor: "rgba(255,255,255,.5)" },
});
