import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { DateChip, TimeChip } from "@/components/pick";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { fadeIn, Tap } from "@/components/tap";
import { Icon, TypeArt } from "@/components/art";
import { repeatText } from "@/components/detail-html";
import { EdLine, Gly, Meta } from "@/components/detail-meta";
import { useTapOutside, type Box } from "@/components/outside";
import { DropMenu } from "@/components/menu";
import { RichText } from "@/components/richtext";
import { apply, liveEdit, retime, moveMine, removeScope, type Result } from "@/lib/apply";
import { t } from "@/lib/i18n";
import { leftSaved, setFlash } from "@/lib/flash";
import { allTasks, loadModel } from "@/lib/store";
import { KIND_VI, reasonText } from "@/lib/reasons";
import { useTheme, type TypeName, font, space, ff } from "@/lib/theme";
import { typeOf } from "@/planner";
import type { Placed } from "@/planner/model";
import type { Kind, Task } from "@/lib/types";
import { day, dayLabel, endAt, startDay, when } from "@/lib/when";

type Scope = "this" | "following" | "all";
const KINDS = Object.keys(KIND_VI) as Kind[];
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").split(/[/?#]/)[0];

export default function Detail() {
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<Task>();
  const [exam, setExam] = useState<Task>();
  const [sits, setSits] = useState<Task[]>([]); // the sittings this one belongs to (a sitting: it and its siblings; a split task: its own), in time order
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
  // Delete, move and replan each close the screen: a second tap must not run them twice or pop the screen below.
  const [leaving] = useState(() => ({ on: false })); // a plain box, read only in handlers
  const once = <A extends unknown[]>(fn: (...a: A) => Promise<void>) => async (...a: A) => {
    if (leaving.on) return;
    leaving.on = true;
    try { await fn(...a); } catch { leaving.on = false; }
  };

  const load = useCallback(async () => {
    const all = await allTasks();
    const x = all.find((y) => y.id === id);
    const n = Date.now();
    setPlc(id ? (await loadModel(n)).placed[id] : undefined);
    if (!x || x.deletedAt) { if (router.canGoBack()) router.back(); else router.replace("/"); return; } // opened from a stale widget or notification, or synced away
    setNow(n); setTask(x); setExam(x?.forId ? all.find((y) => y.id === x.forId) : undefined);
    setSits(all.filter((y) => y.parentId === (x.parentId ?? x.id) && !y.deletedAt).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity)));
    // A reload after a save must not wipe what is still being typed in another field: only untouched fields take the stored value.
    const p = pend.current, first = !p.task;
    if (first || p.title === p.task?.title) setTitle(x?.title ?? "");
    if (first || latest.current === saved.current) { setNote(x?.note ?? ""); saved.current = latest.current = x?.note ?? ""; }
    if (first || p.loc === (p.task?.location ?? "")) setLoc(x?.location ?? "");
  }, [id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  // The open time or due line: every value is saved as it settles (liveEdit), so a tap outside only closes the line.
  const edBox = useRef<Box>(null);
  useTapOutside(edBox, ed === "time" || ed === "due", () => { setEd(undefined); void load(); }); // a dropdown open over it takes its own taps

  // Note: save on blur, after a pause, and when leaving.
  const saveNote = useCallback(() => {
    if (latest.current === saved.current) return;
    saved.current = latest.current;
    return apply([{ op: "edit", target: id, note: latest.current }]);
  }, [id]);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { clearTimeout(noteTimer.current); leftSaved(saveNote()); }, [saveNote]);
  const typing = (v: string) => { setNote(v); latest.current = v; clearTimeout(noteTimer.current); noteTimer.current = setTimeout(saveNote, 500); };
  // Title and place are saved half a second after typing pauses too, not only on Return: a force quit mid-word keeps them.
  useEffect(() => {
    const v = title.trim();
    if (!task || !v || v === task.title) return;
    const k = setTimeout(() => void apply([{ op: "edit", target: task.id, title: v }]).then(load), 500);
    return () => clearTimeout(k);
  }, [title, task, load]);
  useEffect(() => {
    const v = loc.trim();
    if (!task || ed !== "place" || v === (task.location ?? "")) return;
    const k = setTimeout(() => void apply([{ op: "edit", target: task.id, location: v }]).then(load), 500);
    return () => clearTimeout(k);
  }, [loc, task, ed, load]);

  // Leaving with the keyboard still up keeps the title and place typed so far, as the note does.
  useEffect(() => () => {
    const { title: ti, loc: lo, task: tk } = pend.current;
    if (!tk) return;
    const v = ti.trim();
    if (v && v !== tk.title) leftSaved(apply([{ op: "edit", target: tk.id, title: v }]));
    if (lo.trim() && lo.trim() !== (tk.location ?? "")) leftSaved(apply([{ op: "edit", target: tk.id, location: lo.trim() }]));
  }, []);

  if (!task) return <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }} />;
  const type: TypeName = typeOf(task);
  const series = !!(task.section || task.rrule || task.parentId);
  const at = (ts: number) => when(ts, now);

  const del = once(async (scope: Scope) => {
    const r: Result = await removeScope(task.id, scope);
    const sub = scope === "all" ? t("goneAll") : scope === "following" ? t("goneFrom", { d: task.start ? dayLabel(task.start) : "" }) : task.start ? at(task.start) : undefined;
    setFlash({ text: r.toast, sub, r });
    router.back();
  });
  const submitTitle = () => {
    const v = title.trim();
    if (!v) return setTitle(task.title);
    if (v !== task.title) void apply([{ op: "edit", target: task.id, title: v }]).then(load);
  };

  const mine = task.source !== "dlu" && !task.forId;
  // A split task's time line is its next open sitting's, and edits that sitting; a task with no time yet (no free slot) can be given one by hand.
  const split = !task.parentId && sits.length > 0;
  const tt = split ? sits.find((k) => !k.doneAt) : task;
  const canTime = !!tt && (task.fixed ? task.fixed === "busy" && mine && task.start !== undefined : true);
  const hasDue = mine && !task.fixed && !task.rrule && task.deadline !== undefined;
  // Each settled value is saved at once; the re-plan runs half a second after the last one (lib/apply liveEdit), then the screen reloads.
  // leftSaved: the list reloads once it lands, even when the user has already gone back.
  const live = (p: Promise<Result | undefined>) => { leftSaved(p); p.then((r) => { if (r) void load(); }, () => void load()); };
  const setTime = (s: number, m: number) => {
    if (!tt) return;
    setDr({ s, m });
    const moved = (x: Task) => ({ ...x, start: s, end: s + m * 60_000, effort: m });
    if (tt.id === task.id) setTask((x) => x && moved(x)); else setSits((xs) => xs.map((x) => (x.id === tt.id ? moved(x) : x)));
    live(retime(tt.id, s, m));
  };
  const setDue = (d: number) => { setDv(d); setTask((x) => x && { ...x, deadline: d }); live(liveEdit(task.id, { deadline: d })); };
  const setEnd = (end: number) => setTime(dr.s, Math.max(15, Math.round((end - dr.s) / 60_000))); // never before the start
  const clock = (base: number, d: Date) => { const n = new Date(base); n.setHours(d.getHours(), d.getMinutes(), 0, 0); return n.getTime(); };
  const dayOf = (base: number, d: Date) => { const n = new Date(base); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); return n.getTime(); };
  const openTime = canTime && tt ? () => {
    const s0 = tt.start ?? Math.ceil(Date.now() / 900_000) * 900_000; // untimed: from the next quarter hour
    setDr({ s: s0, m: tt.start !== undefined && tt.end !== undefined ? Math.max(15, Math.round((tt.end - tt.start) / 60000)) : tt.effort || 30 });
    setEd("time");
  } : undefined;
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
    // A fixed block is the user's own time: zen never offers to plan it, nor says why it is there.
    ...(mine && !task.fixed && task.userEdited?.includes("start") ? [{ label: t("zenReplan"), onPress: once(async () => {
      const r: Result = await moveMine(task.id);
      setFlash({ text: r.toast, sub: r.sub, r });
      router.back();
    }) }] : []),
  ];
  const mins = task.deadline || task.forId || task.rrule ? `, ${t("minutes", { n: task.effort })}` : "";
  const hm = (ts: number) => at(ts).slice(-5);
  const lines: React.ReactNode[] = [];
  if (task.fixed && task.start !== undefined) {
    lines.push(<Meta key="t" icon="clock" text={task.end !== undefined && task.fixed !== "exam" ? t("toEnd", { t: at(task.start), e: startDay(task.end - 1) === startDay(task.start) ? hm(task.end) : at(task.end) }) : at(task.start)} onPress={openTime} />);
  } else {
    if (task.deadline !== undefined && task.source === "dlu" && !task.forId) lines.push(<Meta key="d" icon="hourglass" tone="red" text={t("dueAt", { t: at(task.deadline) })} />);
    if (hasDue || (mine && ed === "due")) lines.push(ed === "due" ? (
      <EdLine key="d" ref={edBox} icon="hourglass" tone="red">
        <DateChip value={dv} onChange={(d) => setDue(dayOf(dv, d))} />
        <TimeChip value={dv} due onChange={(d) => setDue(clock(dv, d))} />
        <Tap onPress={() => { setEd(undefined); if (task.deadline !== undefined) live(liveEdit(task.id, { deadline: "" })); }} accessibilityLabel={t("clearDue")} style={s.clr}>
          <Text style={{ fontFamily: ff("600"), fontSize: font.sub, color: th.muted }}>{t("clearDue")}</Text>
        </Tap>
      </EdLine>
    ) : <Meta key="d" icon="hourglass" tone="red" text={t("dueAt", { t: at(task.deadline!) })} onPress={openDue} />);
    // The time is always shown: a split task's next open sitting (its sittings listed under "Các buổi"), else "no free slot" (views.html "Detail, no free time").
    if (tt?.start !== undefined) lines.push(<Meta key="t" icon="clock" text={tt.rrule ? `${hm(tt.start)}${mins}` : `${t("planAt", { t: at(tt.start) })}${split ? `, ${t("minutes", { n: tt.effort })}` : mins}`} onPress={openTime} />);
    else if (tt && !task.doneAt) lines.push(<Meta key="t" icon="clock" tone="red" text={t("noSlot")} onPress={openTime} />);
  }
  // The repeat sits right under the time (views.html "Detail, repeating"); lectures have none, the timetable is the repeat.
  if (task.rrule && !task.section) lines.push(<Meta key="r" icon="repeat" text={repeatText(task.rrule, task.start ?? task.deadline ?? now)} />);
  if (ed === "time" && canTime) {
    const i = lines.findIndex((x) => (x as { key: string }).key === "t"), e = new Date(dr.s + dr.m * 60000);
    const row = (
      <EdLine key="t" ref={edBox} icon="clock">
        <DateChip value={dr.s} onChange={(d) => setTime(dayOf(dr.s, d), dr.m)} />
        <TimeChip value={dr.s} onChange={(d) => setTime(clock(dr.s, d), dr.m)} />
        <Text style={{ fontFamily: ff("500"), fontSize: font.meta, color: th.muted }}>{t("toWord")}</Text>
        {/* views.html "Detail, over several days": the end day; days before the start are greyed out */}
        <DateChip value={e.getTime()} min={startDay(dr.s)} side="right" onChange={(d) => setEnd(dayOf(e.getTime(), d))} />
        <TimeChip value={e.getTime()} onChange={(d) => setEnd(endAt(dr.s, dr.s + dr.m * 60_000, d))} />
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

  // "Buổi k/n" counts the sittings still open; a lone one says nothing (as the day list).
  const open = sits.filter((k) => !k.doneAt);
  const why = !task.fixed ? plc?.why?.flatMap((r) => (r.key !== "pace" ? [r] : open.length > 1 ? [{ ...r, vars: { k: open.findIndex((k) => k.id === task.id) + 1, n: open.length } }] : [])).slice(0, 4) : undefined;
  const me = split ? tt?.id : task.id;
  const moveTo = once(async (ts: number) => {
    const r: Result = await apply([{ op: "edit", target: task.id, when: new Date(ts).toISOString() }]);
    setFlash({ text: r.toast, sub: r.sub, r });
    router.back();
  });
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
          {/* prep.html "Các buổi": every sitting with its day, step and length; done ones struck, this one bold. Only for two or more. */}
          {sits.length > 1 && (
            <View style={s.why}>
              <Text style={[s.lab, { color: th.muted }]}>{t("sittings")}</Text>
              <View style={{ marginTop: 6 }}>
                {sits.map((k) => {
                  const done = !!k.doneAt, on = k.id === me, dim = { color: th.muted, textDecorationLine: done ? "line-through" : "none" } as const;
                  return (
                    <View key={k.id} style={s.si}>
                      <Text style={[s.sd, dim, on && !done && { color: th.ink, fontFamily: ff("600") }]}>{k.start !== undefined ? day(k.start, now) : "—"}</Text>
                      <Text style={[s.sp, { color: th.ink }, done && dim, on && !done && { fontFamily: ff("700") }]} numberOfLines={1}>{k.title}</Text>
                      <Text style={[s.sm, { color: th.muted }]}>{t("minutes", { n: k.effort })}</Text>
                    </View>
                  );
                })}
              </View>
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
  si: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 7 }, // prep.html .si
  sd: { width: 92, fontSize: font.sub, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  sp: { flex: 1, fontSize: font.sub, fontFamily: ff("500") },
  sm: { fontSize: font.sub, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  wr: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  wt: { flex: 1, fontFamily: ff("500"), fontSize: font.meta, lineHeight: 21.6 },
  bar2: { width: 46, height: 4, borderRadius: 4, overflow: "hidden" },
  pills: { flexDirection: "row", gap: 8, marginTop: 10 },
  pill: { height: 36, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  note: { marginTop: 18, fontFamily: ff(), fontSize: font.base, lineHeight: 25.5, minHeight: 120, textAlignVertical: "top", padding: 0 },
});


