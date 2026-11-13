import { requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Animated, Modal, PanResponder, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Hold, type HoldState } from "@/components/hold";
import { Toast } from "@/components/toast";
import { apply, pickNow, swipeDone, swipeLater, take, type Result } from "@/lib/apply";
import { readBusy } from "@/lib/calendar";
import { listen, transcribe } from "@/lib/ears";
import { getLang, t } from "@/lib/i18n";
import { think } from "@/lib/mind";
import { ensureModel, type ModelId } from "@/lib/models";
import * as store from "@/lib/store";
import { loginError, onForeground } from "@/lib/sync";
import { useTheme } from "@/lib/theme";
import { suggest } from "@/planner";
import type { Note, Task } from "@/lib/types";

const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5);
type Card = { task: Task; start?: number; end?: number; gap?: boolean };

export default function Home() {
  const th = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [card, setCard] = useState<Card | undefined>();
  const [lang, setL] = useState(getLang());
  const [login, setLogin] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [state, setState] = useState<HoldState>("idle");
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | undefined>();
  const [dl, setDl] = useState<string | undefined>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dismissed = useRef(new Set<string>());

  const say = useCallback((text: string, r?: Result) => {
    clearTimeout(timer.current);
    setToast({
      text,
      undo: r && (async () => { await r.undo(); setToast({ text: t("undone") }); refresh(); }),
    });
    timer.current = setTimeout(() => setToast(undefined), 6000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    const now = Date.now();
    const all = await store.allTasks();
    setTasks(all);
    setNotes(await store.allNotes());
    setL(getLang());
    setLogin(await loginError());
    const cur = pickNow(all, now);
    if (cur && cur.start! <= now) return setCard({ task: cur, start: cur.start, end: cur.end });
    const model = await store.loadModel(now);
    const s = suggest(all.filter((x) => !dismissed.current.has(x.id)), await readBusy(now, now + 8 * 3600_000), model, now);
    if (s) return setCard({ task: s.task, start: s.start, end: s.end, gap: true });
    setCard(cur && { task: cur, start: cur.start, end: cur.end });
  }, []);

  const downloads = useCallback(async () => {
    const ids: ModelId[] = [getLang() === "vi" ? "whisper-vi" : "whisper-en", "mind", "embed"];
    try {
      for (const id of ids) await ensureModel(id, (d, tot) => setDl(t("downloading", { p: tot ? Math.floor((d / tot) * 100) : 0 })));
    } catch {
      // offline: retried on next focus
    } finally {
      setDl(undefined);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    downloads();
    onForeground().then((r) => { if (r) { say(r.toast, r); refresh(); } }).catch(() => {});
  }, [refresh, downloads, say]));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") onForeground().then((r) => { if (r) { say(r.toast, r); } refresh(); }).catch(() => {});
    });
    return () => sub.remove();
  }, [refresh, say]);

  const stopRec = useRef<(() => Promise<ArrayBuffer>) | undefined>(undefined);
  const held = useRef(false);

  const start = async () => {
    held.current = true;
    const p = await requestRecordingPermissionsAsync();
    if (!p.granted) { held.current = false; return say(t("mic")); }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    if (!held.current) return;
    const stop = await listen();
    if (!held.current) return void stop(); // released while the mic was starting
    stopRec.current = stop;
    setState("listening");
  };

  const end = async () => {
    if (!held.current) return;
    held.current = false;
    const stop = stopRec.current;
    stopRec.current = undefined;
    if (!stop) return;
    setState("thinking");
    try {
      const pcm = await stop();
      const text = pcm.byteLength ? await transcribe(pcm, getLang()) : "";
      if (!text) return;
      const all = await store.allTasks();
      const ctx = all.filter((x) => !x.doneAt && !x.deletedAt && !x.parentId)
        .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))
        .map((x) => ({ id: x.id, title: x.title, start: x.start }));
      const actions = await think(text, { now: new Date(), lang: getLang(), tasks: ctx });
      const r = await apply(actions);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      say(r.toast, r);
      refresh();
    } catch {
      say(t("offlineModel"));
    } finally {
      setState("idle");
    }
  };

  const x = useRef(new Animated.ValueXY()).current;
  const cardRef = useRef(card);
  cardRef.current = card;
  const commit = async (dir: "done" | "later") => {
    const c = cardRef.current;
    if (!c) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    let r: Result | undefined;
    if (c.gap) {
      if (dir === "done") r = await take(c.task.id, c.start!, c.end!);
      else dismissed.current.add(c.task.id);
    } else r = await (dir === "done" ? swipeDone(c.task.id) : swipeLater(c.task.id));
    if (r) say(r.toast, r);
    await refresh();
  };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 || g.dy < -12,
    onPanResponderMove: Animated.event([null, { dx: x.x, dy: x.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      const back = () => Animated.spring(x, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      if (g.dy < -90 && Math.abs(g.dx) < 80) { back(); setSheet(true); return; }
      if (Math.abs(g.dx) > 110) {
        Animated.timing(x, { toValue: { x: g.dx > 0 ? 500 : -500, y: 0 }, duration: 180, useNativeDriver: false }).start(async () => {
          await commit(g.dx > 0 ? "done" : "later");
          x.setValue({ x: 0, y: 0 });
        });
        return;
      }
      back();
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const midnight = new Date().setHours(24, 0, 0, 0);
  const today = tasks.filter((a) => !a.doneAt && !a.deletedAt && a.start !== undefined && a.start < midnight && !tasks.some((c) => c.parentId === a.id)).sort((a, b) => a.start! - b.start!);
  const body = () => {
    if (!card) return <Text style={[s.big, { color: th.text }]}>{t(tasks.some((a) => a.doneAt) ? "allDone" : "empty")}</Text>;
    const title = card.gap ? t("gap", { n: Math.round((card.end! - card.start!) / 60000), title: card.task.title }) : card.task.title;
    return (
      <>
        <Text style={[s.kind, { color: th.sun }]}>{card.task.kind}</Text>
        <Text style={[s.title, { color: th.text }]}>{title}</Text>
        {card.end && <Text style={[s.sub, { color: th.muted }]}>{card.start! <= Date.now() ? t("until", { time: hhmm(card.end) }) : hhmm(card.start!)}</Text>}
      </>
    );
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: th.bg }]} key={lang}>
      <View style={s.top}>
        {login ? (
          <Pressable onPress={() => router.push("/settings")}><Text style={{ color: th.red, fontWeight: "700" }}>{t("loginChanged")}</Text></Pressable>
        ) : <View />}
        <Pressable onPress={() => router.push("/settings")} hitSlop={12}><Text style={{ color: th.muted, fontWeight: "700" }}>{t("settings")}</Text></Pressable>
      </View>
      {dl && <Text style={[s.dl, { color: th.muted }]}>{dl}</Text>}
      <View style={s.mid}>
        <Animated.View
          {...pan.panHandlers}
          style={[s.card, { backgroundColor: th.card, borderColor: th.line, transform: [{ translateX: x.x }, { rotate: x.x.interpolate({ inputRange: [-300, 300], outputRange: ["-8deg", "8deg"] }) }] }]}
        >
          {body()}
          <Pressable onPress={() => setSheet(true)} style={s.grab} hitSlop={16}><View style={[s.grabBar, { backgroundColor: th.line }]} /></Pressable>
        </Animated.View>
      </View>
      <Hold state={state} onStart={start} onEnd={end} />
      {toast && <Toast text={toast.text} onUndo={toast.undo} />}
      <Modal visible={sheet} animationType="slide" transparent onRequestClose={() => setSheet(false)}>
        <Pressable style={s.scrim} onPress={() => setSheet(false)} />
        <View style={[s.sheet, { backgroundColor: th.bg }]}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
            <Text style={[s.h, { color: th.muted }]}>{t("today")}</Text>
            {today.length === 0 && <Text style={{ color: th.muted }}>{t("empty2")}</Text>}
            {today.map((a) => (
              <Pressable key={a.id} onPress={async () => { const r = await swipeDone(a.id); say(r.toast, r); refresh(); }} style={[s.pill, { backgroundColor: th.card, borderColor: th.line }]}>
                <Text style={[s.pillText, { color: th.text }]} numberOfLines={1}>{a.title}</Text>
                <Text style={{ color: th.muted, fontWeight: "700" }}>{hhmm(a.start!)}</Text>
              </Pressable>
            ))}
            <Text style={[s.h, { color: th.muted, marginTop: 16 }]}>{t("notes")}</Text>
            {notes.length === 0 && <Text style={{ color: th.muted }}>{t("empty2")}</Text>}
            {notes.map((n) => (
              <View key={n.id} style={[s.pill, { backgroundColor: th.card, borderColor: th.line }]}><Text style={[s.pillText, { color: th.text }]}>{n.text}</Text></View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: "row", justifyContent: "space-between", padding: 20 },
  dl: { textAlign: "center", fontSize: 13 },
  mid: { flex: 1, justifyContent: "center", padding: 20 },
  card: { minHeight: 280, borderRadius: 36, borderWidth: 1, padding: 28, justifyContent: "center", gap: 10 },
  kind: { fontSize: 13, fontWeight: "800" },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  sub: { fontSize: 17, fontWeight: "600" },
  big: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  grab: { position: "absolute", bottom: 8, left: 0, right: 0, alignItems: "center" },
  grabBar: { width: 40, height: 5, borderRadius: 3 },
  scrim: { flex: 1 },
  sheet: { maxHeight: "65%", borderTopLeftRadius: 32, borderTopRightRadius: 32, minHeight: 260 },
  h: { fontSize: 13, fontWeight: "800" },
  pill: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 52, borderRadius: 26, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 10 },
  pillText: { flex: 1, fontSize: 16, fontWeight: "600" },
});
