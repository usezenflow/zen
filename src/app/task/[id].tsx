import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { fadeIn, Tap } from "@/components/tap";
import { Icon, TypeArt } from "@/components/art";
import { repeatText } from "@/components/detail-html";
import { Gly, Meta } from "@/components/detail-meta";
import { DropMenu } from "@/components/menu";
import { RichText } from "@/components/richtext";
import { apply, removeScope, type Result } from "@/lib/apply";
import { t } from "@/lib/i18n";
import { setFlash } from "@/lib/flash";
import { allTasks, loadModel } from "@/lib/store";
import { reasonText } from "@/lib/reasons";
import { useTheme, type TypeName, font, space, ff } from "@/lib/theme";
import type { Placed } from "@/planner/model";
import type { Task } from "@/lib/types";
import { dayLabel, when } from "@/lib/when";

type Scope = "this" | "following" | "all";
const typeOf = (x: Task): TypeName => x.fixed ?? (x.source === "dlu" && x.deadline ? "assignment" : "plan");

export default function Detail() {
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<Task>();
  const [exam, setExam] = useState<Task>();
  const [now, setNow] = useState(0);
  const [plc, setPlc] = useState<Placed>();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const saved = useRef("");
  const latest = useRef("");

  const load = useCallback(async () => {
    const all = await allTasks();
    const x = all.find((y) => y.id === id);
    const n = Date.now();
    setPlc(id ? (await loadModel(n)).placed[id] : undefined);
    setNow(n); setTask(x); setExam(x?.forId ? all.find((y) => y.id === x.forId) : undefined);
    setTitle(x?.title ?? ""); setNote(x?.note ?? "");
    saved.current = latest.current = x?.note ?? "";
  }, [id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  // Note: save on blur, after a pause, and when leaving.
  const saveNote = useCallback(() => {
    if (latest.current === saved.current) return;
    saved.current = latest.current;
    void apply([{ op: "edit", target: id, note: latest.current }]);
  }, [id]);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { clearTimeout(noteTimer.current); saveNote(); }, [saveNote]);
  const typing = (v: string) => { setNote(v); latest.current = v; clearTimeout(noteTimer.current); noteTimer.current = setTimeout(saveNote, 800); };

  if (!task) return <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }} />;
  const type = task.forId ? "plan" : typeOf(task);
  const series = !!(task.section || task.rrule);
  const at = (ts: number) => when(ts, now);

  const del = async (scope: Scope) => {
    const r: Result = await removeScope(task.id, scope);
    const sub = scope === "all" ? t("goneAll") : scope === "following" ? t("goneFrom", { d: task.start ? dayLabel(task.start) : "" }) : task.start ? at(task.start) : undefined;
    setFlash({ text: r.toast, sub, r });
    router.back();
  };
  const submitTitle = () => {
    const v = title.trim();
    if (!v) return setTitle(task.title);
    if (v !== task.title) void apply([{ op: "edit", target: task.id, title: v }]).then(load);
  };

  const mins = task.deadline || task.forId || task.rrule ? `, ${t("minutes", { n: task.effort })}` : "";
  const hm = (ts: number) => at(ts).slice(-5);
  const lines: React.ReactNode[] = [];
  if (task.fixed && task.start !== undefined) {
    lines.push(<Meta key="t" icon="clock" text={task.end !== undefined && task.fixed === "lecture" ? t("toEnd", { t: at(task.start), e: hm(task.end) }) : at(task.start)} />);
  } else {
    if (task.deadline !== undefined && task.source === "dlu" && !task.forId) lines.push(<Meta key="d" icon="clock" tone="red" text={t("dueAt", { t: at(task.deadline) })} />);
    if (task.start !== undefined) lines.push(<Meta key="t" icon="clock" text={task.rrule ? `${hm(task.start)}${mins}` : `${t("planAt", { t: at(task.start) })}${mins}`} />);
  }
  if (task.location && task.fixed) lines.push(<Meta key="l" icon="pin" text={task.location} />);
  if (task.fixed === "lecture" && task.teacher) lines.push(<Meta key="g" icon="person" text={t("teacherIs", { n: task.teacher })} />);
  if (task.course) lines.push(<Meta key="c" icon="book" text={task.course} />);
  if (exam) lines.push(<Meta key="e" icon="book" tone="link" text={t("prepFor", { format: exam.format ? exam.format.toLowerCase() : "thi" })} onPress={() => router.push(`/task/${exam.id}`)} />);
  if (task.rrule && !task.section) lines.push(<Meta key="r" icon="repeat" text={repeatText(task.rrule, task.start ?? task.deadline ?? now)} />);
  if (task.url) lines.push(<Meta key="u" icon="link" tone="link" text={t("openLms")} onPress={() => Linking.openURL(task.url!)} />);

  const why = !task.fixed ? plc?.why?.slice(0, 4) : undefined;
  const top = Math.max(...(why ?? []).map((x) => Math.abs(x.w)), 1e-9);
  const moveTo = async (ts: number) => {
    const r: Result = await apply([{ op: "edit", target: task.id, when: new Date(ts).toISOString() }]);
    setFlash({ text: r.toast, sub: r.sub, r });
    router.back();
  };
  const circle = [s.o, { borderColor: th.line, backgroundColor: th.bg }];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
      {/* iOS insets follow the keyboard curve and drag-to-dismiss; KeyboardAvoidingView jumped instead. */}
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <Animated.View entering={fadeIn}>
          <View style={s.bar}>
            <Tap onPress={() => router.back()} accessibilityLabel={t("back")} style={circle}><Icon name="back" size={18} color={th.ink} /></Tap>
            {series ? (
              <View style={circle}>
                <DropMenu sf="trash" color={th.ink} size={18} icon={<Gly name="trash" size={18} color={th.ink} />} items={[
                  { label: t("deleteThis"), onPress: () => del("this") },
                  { label: t("deleteFollowing"), onPress: () => del("following") },
                  { label: t("deleteAll"), destructive: true, onPress: () => del("all") },
                ]} />
              </View>
            ) : (
              <Tap onPress={() => del("this")} accessibilityLabel={t("delete")} style={circle}><Gly name="trash" size={18} color={th.ink} /></Tap>
            )}
          </View>
          <View style={s.who}>
            <View style={s.sw}><TypeArt type={type} w={40} h={40} seed={7} /></View>
            <Text style={[s.sub, { color: th.muted }]}>{task.source === "dlu" && !task.forId ? (task.fixed ? t("fromCampus") : t("fromLms")) : t("fromYou")}</Text>
          </View>
          <TextInput value={title} onChangeText={setTitle} onEndEditing={submitTitle} returnKeyType="done" submitBehavior="blurAndSubmit" multiline style={[s.h, { color: th.ink }]} />
          {lines.length > 0 && <View style={s.meta}>{lines}</View>}
          {!!task.content?.trim() && (
            <View style={[s.lms, { borderColor: th.line }]}>
              <Text style={[s.lab, { color: th.muted }]}>{t("lmsContent")}</Text>
              <RichText html={task.content} color={th.ink} line={th.line} link={th.ink} />
            </View>
          )}
          {!!why?.length && (
            <View style={s.why}>
              <Text style={[s.lab, { color: th.muted }]}>{t("whyNow")}</Text>
              {why.map((x, i) => (
                <View key={i} style={s.wr}>
                  <Text style={[s.wt, { color: th.ink }]}>{reasonText(x, true)}</Text>
                  <View style={[s.bar2, { backgroundColor: th.line }]}><View style={{ width: `${(Math.abs(x.w) / top) * 100}%`, height: 4, borderRadius: 4, backgroundColor: x.w < 0 ? th.seal : th.ink }} /></View>
                </View>
              ))}
              {plc?.alt !== undefined && (
                <>
                  <Text style={[s.lab, { color: th.muted, marginTop: 14 }]}>{t("alsoFits")}</Text>
                  <View style={s.pills}>
                    <Tap onPress={() => moveTo(plc.alt!)} accessibilityLabel={`${t("alsoFits")} ${at(plc.alt)}`} style={[s.pill, { borderColor: th.line }]}>
                      <Text style={{ fontSize: font.sub, fontFamily: ff("500"), color: th.ink }}>{at(plc.alt)}</Text>
                    </Tap>
                  </View>
                </>
              )}
            </View>
          )}
          <TextInput value={note} onChangeText={typing} onBlur={saveNote} multiline scrollEnabled={false} placeholder={t("addNote")} placeholderTextColor={th.muted}
            style={[s.note, { color: th.ink }]} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "space-between" },
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  who: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22 },
  sw: { width: 34, height: 34, borderRadius: 17, overflow: "hidden" },
  sub: { fontFamily: ff(), fontSize: font.md },
  h: { marginTop: 14, fontSize: font.h, lineHeight: 36, fontFamily: ff("600"), letterSpacing: -0.7, padding: 0 },
  meta: { marginTop: 16, gap: 10 },
  lms: { marginTop: 18, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderRadius: 16 },
  lab: { fontSize: font.label, fontFamily: ff("500"), marginBottom: 6 },
  why: { marginTop: 18 },
  wr: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 7 },
  wt: { flex: 1, fontFamily: ff(), fontSize: font.md, lineHeight: 21 },
  bar2: { width: 46, height: 4, borderRadius: 4 },
  pills: { flexDirection: "row", gap: 8, marginTop: 8 },
  pill: { height: 36, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  note: { marginTop: 18, fontFamily: ff(), fontSize: font.base, lineHeight: 26, minHeight: 120, textAlignVertical: "top", padding: 0 },
});
