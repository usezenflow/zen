import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { fadeIn, Tap } from "@/components/tap";
import { Icon, TypeArt } from "@/components/art";
import { repeatText } from "@/components/detail-html";
import { EdLine, Gly, Meta } from "@/components/detail-meta";
import { useTapOutside, type Box } from "@/components/outside";
import { DropMenu } from "@/components/menu";
import { RichText } from "@/components/richtext";
import { apply, moveMine, removeScope, type Result } from "@/lib/apply";
import { t } from "@/lib/i18n";
import { setFlash } from "@/lib/flash";
import { allTasks, loadModel } from "@/lib/store";
import { KIND_VI, reasonText } from "@/lib/reasons";
import { useTheme, type TypeName, font, space, ff } from "@/lib/theme";
import { typeOf } from "@/planner";
import type { Placed } from "@/planner/model";
import type { Kind, Task } from "@/lib/types";
import { dayLabel, when } from "@/lib/when";

type Scope = "this" | "following" | "all";
const KINDS = Object.keys(KIND_VI) as Kind[];
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").split(/[/?#]/)[0];

export default function Detail() {
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<Task>();
  const [exam, setExam] = useState<Task>();
  const [now, setNow] = useState(0);
  const [plc, setPlc] = useState<Placed>();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [ed, setEd] = useState<"time" | "due" | "place">();
  const [dr, setDr] = useState({ s: 0, m: 30 }); // time draft: start and length in minutes
  const [dv, setDv] = useState(0); // due draft
  const [loc, setLoc] = useState("");
  const saved = useRef("");
  const latest = useRef("");
  const pend = useRef({ title: "", loc: "", task });
  useEffect(() => { pend.current = { title, loc, task }; });

  const load = useCallback(async () => {
    const all = await allTasks();
    const x = all.find((y) => y.id === id);
    const n = Date.now();
    setPlc(id ? (await loadModel(n)).placed[id] : undefined);
    setNow(n); setTask(x); setExam(x?.forId ? all.find((y) => y.id === x.forId) : undefined);
    // A reload after a save must not wipe what is still being typed in another field: only untouched fields take the stored value.
    const p = pend.current, first = !p.task;
    if (first || p.title === p.task?.title) setTitle(x?.title ?? "");
    if (first || latest.current === saved.current) { setNote(x?.note ?? ""); saved.current = latest.current = x?.note ?? ""; }
    if (first || p.loc === (p.task?.location ?? "")) setLoc(x?.location ?? "");
  }, [id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  // The open time or due line keeps every turn of its pickers as a draft; a tap outside the line (or leaving) saves it and closes it.
  const draft = useRef<(() => Promise<unknown>) | undefined>(undefined);
  const edBox = useRef<Box>(null);
  const restT = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(restT.current), []);
  const shut = () => { const fn = draft.current; draft.current = undefined; setEd(undefined); if (fn) void fn().then(load); };
  useTapOutside(edBox, ed === "time" || ed === "due", shut);
  useEffect(() => () => { void draft.current?.(); }, []);

  // Note: save on blur, after a pause, and when leaving.
  const saveNote = useCallback(() => {
    if (latest.current === saved.current) return;
    saved.current = latest.current;
    void apply([{ op: "edit", target: id, note: latest.current }]);
  }, [id]);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { clearTimeout(noteTimer.current); saveNote(); }, [saveNote]);
  const typing = (v: string) => { setNote(v); latest.current = v; clearTimeout(noteTimer.current); noteTimer.current = setTimeout(saveNote, 800); };

  // Leaving with the keyboard still up keeps the title and place typed so far, as the note does.
  useEffect(() => () => {
    const { title: ti, loc: lo, task: tk } = pend.current;
    if (!tk) return;
    const v = ti.trim();
    if (v && v !== tk.title) void apply([{ op: "edit", target: tk.id, title: v }]);
    if (lo.trim() && lo.trim() !== (tk.location ?? "")) void apply([{ op: "edit", target: tk.id, location: lo.trim() }]);
  }, []);

  if (!task) return <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }} />;
  const type: TypeName = typeOf(task);
  const series = !!(task.section || task.rrule || task.parentId);
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

  const mine = task.source !== "dlu" && !task.forId;
  const canTime = task.start !== undefined && (task.fixed ? task.fixed === "busy" && mine : true);
  const hasDue = mine && !task.fixed && !task.rrule && task.deadline !== undefined;
  // Edits land once the wheel rests (as in row.tsx), then the screen closes the line and reloads.
  // Also saved ~0.35 s after the wheel rests, since blur alone is not reliable (iOS eats the tap that closes a compact picker's popover).
  const rest = (fn: () => Promise<unknown>) => {
    draft.current = fn;
    clearTimeout(restT.current);
    restT.current = setTimeout(() => { const f = draft.current; draft.current = undefined; if (f) void f().then(load); }, 350);
  };
  const setTime = (s: number, m: number) => { setDr({ s, m }); setTask((x) => x && { ...x, start: s, end: s + m * 60_000, effort: m }); rest(() => apply([{ op: "edit", target: task.id, when: new Date(s).toISOString(), effortMinutes: m }])); };
  const setDue = (d: number) => { setDv(d); setTask((x) => x && { ...x, deadline: d }); rest(() => apply([{ op: "edit", target: task.id, deadline: new Date(d).toISOString() }])); };
  const clock = (base: number, d: Date) => { const n = new Date(base); n.setHours(d.getHours(), d.getMinutes(), 0, 0); return n.getTime(); };
  const dayOf = (base: number, d: Date) => { const n = new Date(base); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); return n.getTime(); };
  const openTime = canTime ? () => { setDr({ s: task.start!, m: task.end !== undefined ? Math.max(5, Math.round((task.end - task.start!) / 60000)) : task.effort }); setEd("time"); } : undefined;
  const openDue = () => { setDv(task.deadline!); setEd("due"); };
  const savePlace = () => {
    const v = loc.trim();
    if (!v) setEd(undefined);
    if (v !== (task.location ?? "")) void apply([{ op: "edit", target: task.id, location: v }]).then(load);
  };
  // Opens the pickers on today 23:59; nothing is saved (and nothing re-planned) until the user picks.
  const defaultDue = () => { const d = new Date(now); d.setHours(23, 59, 0, 0); setDv(d.getTime()); setEd("due"); };
  const link = /^https?:\/\/\S+$/i.test(task.location ?? "") ? task.location! : undefined;
  const more = () => [
    ...(mine && !task.fixed && !task.rrule && task.deadline === undefined ? [{ label: t("setDue"), onPress: defaultDue }] : []),
    ...(mine && !task.location && ed !== "place" ? [{ label: t("addPlace"), onPress: () => setEd("place") }] : []),
    ...(mine && link && ed !== "place" ? [{ label: t("editPlace"), onPress: () => setEd("place") }] : []),
    ...(mine && (task.userEdited?.includes("start") || task.fixed === "busy") ? [{ label: t("zenReplan"), onPress: async () => {
      const r: Result = await moveMine(task.id);
      setFlash({ text: r.toast, sub: r.sub, r });
      router.back();
    } }] : []),
  ];
  const mins = task.deadline || task.forId || task.rrule ? `, ${t("minutes", { n: task.effort })}` : "";
  const hm = (ts: number) => at(ts).slice(-5);
  const lines: React.ReactNode[] = [];
  if (task.fixed && task.start !== undefined) {
    lines.push(<Meta key="t" icon="clock" text={task.end !== undefined && task.fixed !== "exam" ? t("toEnd", { t: at(task.start), e: hm(task.end) }) : at(task.start)} onPress={openTime} />);
  } else {
    if (task.deadline !== undefined && task.source === "dlu" && !task.forId) lines.push(<Meta key="d" icon="hourglass" tone="red" text={t("dueAt", { t: at(task.deadline) })} />);
    if (hasDue || (mine && ed === "due")) lines.push(ed === "due" ? (
      <EdLine key="d" ref={edBox} icon="hourglass" tone="red">
        <DateTimePicker value={new Date(dv)} mode="date" display="compact" accentColor={th.seal} style={s.pd} onValueChange={(_, d) => setDue(dayOf(dv, d))} />
        <DateTimePicker value={new Date(dv)} mode="time" display="compact" accentColor={th.seal} style={s.pt} onValueChange={(_, d) => setDue(clock(dv, d))} />
        <Tap onPress={() => { draft.current = undefined; setEd(undefined); if (task.deadline !== undefined) void apply([{ op: "edit", target: task.id, deadline: "" }]).then(load); }} accessibilityLabel={t("clearDue")} style={s.clr}>
          <Text style={{ fontFamily: ff("600"), fontSize: font.sub, color: th.muted }}>{t("clearDue")}</Text>
        </Tap>
      </EdLine>
    ) : <Meta key="d" icon="hourglass" tone="red" text={t("dueAt", { t: at(task.deadline!) })} onPress={openDue} />);
    if (task.start !== undefined) lines.push(<Meta key="t" icon="clock" text={task.rrule ? `${hm(task.start)}${mins}` : `${t("planAt", { t: at(task.start) })}${mins}`} onPress={openTime} />);
  }
  // The repeat sits right under the time (views.html "Detail, repeating"); lectures have none, the timetable is the repeat.
  if (task.rrule && !task.section) lines.push(<Meta key="r" icon="repeat" text={repeatText(task.rrule, task.start ?? task.deadline ?? now)} />);
  if (ed === "time" && canTime) {
    const i = lines.findIndex((x) => (x as { key: string }).key === "t"), e = new Date(dr.s + dr.m * 60000);
    const row = (
      <EdLine key="t" ref={edBox} icon="clock">
        <DateTimePicker value={new Date(dr.s)} mode="date" display="compact" accentColor={th.seal} style={s.pd} onValueChange={(_, d) => setTime(dayOf(dr.s, d), dr.m)} />
        <DateTimePicker value={new Date(dr.s)} mode="time" display="compact" accentColor={th.seal} style={s.pt} onValueChange={(_, d) => setTime(clock(dr.s, d), dr.m)} />
        <Text style={{ fontFamily: ff("500"), fontSize: font.meta, color: th.muted }}>{t("toWord")}</Text>
        <DateTimePicker value={e} mode="time" display="compact" accentColor={th.seal} style={s.pt}
          onValueChange={(_, d) => { const st = new Date(dr.s); setTime(dr.s, Math.max(5, d.getHours() * 60 + d.getMinutes() - (st.getHours() * 60 + st.getMinutes()))); }} />
      </EdLine>
    );
    if (i >= 0) lines[i] = row; else lines.push(row);
  }
  // a link place opens on tap; the dots menu edits it
  if (link && ed !== "place") lines.push(<Meta key="l" icon="link" tone="link" text={host(link)} onPress={() => void Linking.openURL(link).catch(() => {})} />);
  else if (mine && (task.location || ed === "place")) lines.push(
    <EdLine key="l" icon="pin">
      <TextInput value={loc} onChangeText={setLoc} autoFocus={ed === "place"} onEndEditing={savePlace} returnKeyType="done" submitBehavior="blurAndSubmit" placeholder={t("placeHint")} placeholderTextColor={th.muted}
        selectionColor={th.seal} cursorColor={th.seal} accessibilityLabel={t("placeHint")} style={[s.loc, { color: th.ink }]} />
    </EdLine>,
  );
  else if (task.location && task.fixed && !mine) lines.push(<Meta key="l" icon="pin" text={task.location} />);
  if (task.fixed === "lecture" && task.teacher) lines.push(<Meta key="g" icon="person" text={t("teacherIs", { n: task.teacher })} />);
  if (task.course && !exam) lines.push(<Meta key="c" icon="book" text={task.course} />);
  if (exam) lines.push(<Meta key="e" icon="book" tone="link" text={exam.title} onPress={() => router.push(`/task/${exam.id}`)} />);
  if (task.url) lines.push(<Meta key="u" icon="link" tone="link" text={t("openLms")} onPress={() => Linking.openURL(task.url!)} />);

  const why = !task.fixed ? plc?.why?.slice(0, 4) : undefined;
  const moveTo = async (ts: number) => {
    const r: Result = await apply([{ op: "edit", target: task.id, when: new Date(ts).toISOString() }]);
    setFlash({ text: r.toast, sub: r.sub, r });
    router.back();
  };
  const circle = [s.o, { borderColor: th.line, backgroundColor: th.bg }];
  const danger = [s.o, { borderColor: th.seal, backgroundColor: th.bg }]; // red: not mistaken for the dots next to it
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
      {/* iOS insets follow the keyboard curve and drag-to-dismiss; KeyboardAvoidingView jumped instead. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "android" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <Animated.View entering={fadeIn}>
          <View style={s.bar}>
            <Tap onPress={() => router.back()} accessibilityLabel={t("back")} style={circle}><Icon name="back" size={20} color={th.ink} /></Tap>
            <View style={s.acts}>
            {!!more().length && <View style={circle}><DropMenu sf="ellipsis" color={th.ink} size={20} icon={<Gly name="dots" size={20} color={th.ink} />} items={more()} /></View>}
            {series ? (
              <View style={danger}>
                <DropMenu sf="trash" color={th.seal} size={20} icon={<Gly name="trash" size={20} color={th.seal} />} items={[
                  { label: t("deleteThis"), onPress: () => del("this") },
                  { label: t("deleteFollowing"), onPress: () => del("following") },
                  { label: t("deleteAll"), destructive: true, onPress: () => del("all") },
                ]} />
              </View>
            ) : (
              <Tap onPress={() => del("this")} accessibilityLabel={t("delete")} style={danger}><Gly name="trash" size={20} color={th.seal} /></Tap>
            )}
            </View>
          </View>
          <View style={s.who}>
            <View style={s.sw}><TypeArt type={type} w={40} h={40} seed={7} /></View>
            {mine && !task.fixed ? (
              <DropMenu chevron label={t("youKind", { k: cap(KIND_VI[task.kind]) })} color={th.muted} size={font.md} icon={<View style={s.kd}><Text style={[s.sub, { color: th.muted }]}>{t("youKind", { k: cap(KIND_VI[task.kind]) })}</Text><Icon name="down" size={14} color={th.muted} /></View>}
                items={KINDS.map((k) => ({ label: cap(KIND_VI[k]), onPress: () => void apply([{ op: "edit", target: task.id, kind: k }]).then(load) }))} />
            ) : (
              <Text style={[s.sub, { color: th.muted }]}>{task.source === "dlu" && !task.forId ? (task.fixed ? t("fromCampus") : t("fromLms")) : mine && task.fixed === "busy" ? t("youKind", { k: t("fixedTime") }) : t("fromYou")}</Text>
            )}
          </View>
          <TextInput value={title} onChangeText={setTitle} selectionColor={th.seal} cursorColor={th.seal} onEndEditing={submitTitle} returnKeyType="done" submitBehavior="blurAndSubmit" multiline style={[s.h, { color: th.ink }]} />
          {lines.length > 0 && <View style={s.meta}>{lines}</View>}
          {!!task.content?.trim() && (
            <View style={[s.lms, { borderColor: th.line }]}>
              <Text style={[s.lab, { color: th.muted, marginBottom: 6 }]}>{t("lmsContent")}</Text>
              <RichText html={task.content} color={th.ink} line={th.line} link={th.ink} />
            </View>
          )}
          {!!why?.length && (
            <View style={s.why}>
              <Text style={[s.lab, { color: th.muted }]}>{t("whyNow")}</Text>
              {why.map((x, i) => (
                <View key={i} style={s.wr}>
                  <Text style={[s.wt, { color: th.ink }]}>{reasonText(x, true)}</Text>
                  <View style={[s.bar2, { backgroundColor: th.line }]}><View style={{ width: `${Math.min(1, Math.abs(x.w)) * 100}%`, height: 4, borderRadius: 4, backgroundColor: x.w < 0 ? th.seal : th.ink }} /></View>
                </View>
              ))}
              {plc?.alt !== undefined && (
                <>
                  <Text style={[s.lab, { color: th.muted, marginTop: 20 }]}>{t("alsoFits")}</Text>
                  <View style={s.pills}>
                    <Tap onPress={() => moveTo(plc.alt!)} accessibilityLabel={`${t("alsoFits")} ${at(plc.alt)}`} style={[s.pill, { borderColor: th.line }]}>
                      <Text style={{ fontSize: font.sub, fontFamily: ff("500"), color: th.ink }}>{at(plc.alt)}</Text>
                    </Tap>
                  </View>
                </>
              )}
            </View>
          )}
          <TextInput value={note} onChangeText={typing} selectionColor={th.seal} cursorColor={th.seal} onBlur={saveNote} multiline scrollEnabled={false} placeholder={t("addNote")} placeholderTextColor={th.muted}
            style={[s.note, { color: th.ink }]} />
        </Animated.View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "space-between" },
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  acts: { flexDirection: "row", gap: 8 },
  pd: { width: 120, height: 34 },
  pt: { width: 96, height: 34 },
  clr: { marginLeft: "auto", paddingVertical: 6 },
  loc: { flex: 1, fontFamily: ff("500"), fontSize: font.meta, lineHeight: 22, padding: 0 },
  who: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22 },
  sw: { width: 34, height: 34, borderRadius: 17, overflow: "hidden" },
  sub: { fontFamily: ff(), fontSize: font.md },
  h: { marginTop: 14, fontSize: font.h, lineHeight: 36, fontFamily: ff("600"), letterSpacing: -0.75, padding: 0 },
  meta: { marginTop: 16, gap: 10 },
  kd: { flexDirection: "row", alignItems: "center", gap: 4 },
  lms: { marginTop: 18, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderRadius: 16 },
  lab: { fontSize: font.label, fontFamily: ff("500") },
  why: { marginTop: 22 },
  wr: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  wt: { flex: 1, fontFamily: ff("500"), fontSize: font.meta, lineHeight: 21.6 },
  bar2: { width: 46, height: 4, borderRadius: 4, overflow: "hidden" },
  pills: { flexDirection: "row", gap: 8, marginTop: 10 },
  pill: { height: 36, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  note: { marginTop: 18, fontFamily: ff(), fontSize: font.base, lineHeight: 25.5, minHeight: 120, textAlignVertical: "top", padding: 0 },
});
