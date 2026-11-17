import { bolded } from "@/components/bold";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
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
import { addSitting, apply, dropSitting, lastMore, moveMine, preview, removeScope, stillMore, toAction, type LiveEdit, type Result } from "@/lib/apply";
import { Story } from "@/components/nowcard";
import { seeMoves } from "@/lib/moves";
import { keepBoth } from "@/lib/overlap";
import { t } from "@/lib/i18n";
import { leftSaved, openedOnDay, setFlash } from "@/lib/flash";
import { allTasks, loadModel } from "@/lib/store";
import { KIND_VI, reasonText } from "@/lib/reasons";
import { useTheme, type TypeName, font, space, ff } from "@/lib/theme";
import { grounded, typeOf } from "@/planner";
import type { Placed } from "@/planner/model";
import type { Kind, Rule, Task } from "@/lib/types";
import { day, dayLabel, endAt, startDay, when } from "@/lib/when";

type Scope = "this" | "following" | "all";
const KINDS = Object.keys(KIND_VI) as Kind[];
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const kindLabel = (k: Kind) => (k === "other" ? "Khác" : cap(KIND_VI[k])); // "Việc của bạn · Khác", not "· Việc khác"
const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").split(/[/?#]/)[0];

export default function Detail() {
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<Task>();
  const [exam, setExam] = useState<Task>();
  const [sits, setSits] = useState<Task[]>([]); // the sittings this one belongs to (a sitting: it and its siblings; a split task: its own), in time order
  const [now, setNow] = useState(0);
  const [plc, setPlc] = useState<Placed>();
  const [rules, setRules] = useState<Rule[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [ed, setEd] = useState<"time" | "due" | "place">();
  const [dr, setDr] = useState({ s: 0, m: 30 }); // time draft: start and length in minutes
  const [dv, setDv] = useState(0); // due draft
  const [loc, setLoc] = useState("");
  // The open time or due line's value: nothing is saved or planned until the line closes (magic.html 7c), then once.
  const draft = useRef<{ id: string; e: LiveEdit }>(undefined);
  const [pv, setPv] = useState<Result>(); // what the draft would do: a dry run, shown as one line under the chips
  const [told, setTold] = useState<{ r: Result; id: string }>(); // what the saved value did, shown in place (magic.html 7d)
  const [added, setAdded] = useState<Result>(); // what "Còn nữa" just added: its toast and Undo, in place
  const pvGen = useRef(0);
  const pvT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saved = useRef("");
  const latest = useRef("");
  const nav = useNavigation();
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
    const mdl = id ? await loadModel(n) : undefined;
    setPlc(id ? mdl?.placed[id] : undefined);
    setRules(mdl?.rules ?? []);
    if (!x || x.deletedAt) { // opened from a stale widget or notification, or synced away
      // only while on top: a screen under another popping itself took the top one (or nothing) with it
      if (nav.isFocused()) { if (router.canGoBack()) router.back(); else router.replace("/"); }
      return;
    }
    const on = x.start ?? x.deadline;
    if (on !== undefined) openedOnDay(on);
    setNow(n); setTask(x); setExam(x?.forId ? all.find((y) => y.id === x.forId) : undefined);
    setSits(all.filter((y) => y.parentId === (x.parentId ?? x.id) && !y.deletedAt).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity)));
    // A reload after a save must not wipe what is still being typed in another field: only untouched fields take the stored value.
    const p = pend.current, first = !p.task;
    if (first || p.title === p.task?.title) setTitle(x?.title ?? "");
    if (first || latest.current === saved.current) { setNote(x?.note ?? ""); saved.current = latest.current = x?.note ?? ""; }
    if (first || p.loc === (p.task?.location ?? "")) setLoc(x?.location ?? "");
  }, [id, nav]);
  // on every focus, not only the first: back from a sitting deleted on its own screen drops it from "Các buổi" here
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // Saves the open line's value: one edit, one plan, one undo.
  const commit = useCallback(() => {
    const d = draft.current;
    draft.current = undefined; pvGen.current++; clearTimeout(pvT.current); setPv(undefined);
    return d && apply([toAction(d.id, d.e)]).then((r) => ({ r, id: d.id }));
  }, []);
  useEffect(() => () => leftSaved(commit()), [commit]); // leaving with the line open keeps the value; the list reloads once it lands
  const close = () => {
    setEd(undefined);
    const p = commit();
    if (!p) return void load();
    leftSaved(p);
    p.then(({ r, id }) => { if (r.moves?.some((m) => m.id !== id) || r.clashes?.length || r.lost?.length) setTold({ r, id }); void load(); }, () => void load());
  };
  const edBox = useRef<Box>(null);
  useTapOutside(edBox, ed === "time" || ed === "due", close); // a dropdown open over it takes its own taps

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
  // A split task's time line is its next open sitting's, and edits that sitting; a task with no time yet (no free slot) can be given one by hand.
  const split = !task.parentId && sits.length > 0;
  const tt = split ? sits.find((k) => !k.doneAt) : task;
  const series = !!(task.section || task.rrule || task.parentId || split);
  const at = (ts: number) => when(ts, now);

  // A split task deletes from its next open sitting, as its time line edits it: "this" is that sitting, "all" every one.
  const del = once(async (scope: Scope) => {
    const x = (split && tt) || task;
    const r: Result = await removeScope(x.id, scope);
    const sub = scope === "all" ? t("goneAll") : scope === "following" ? t("goneFrom", { d: x.start ? dayLabel(x.start) : "" }) : x.start ? at(x.start) : undefined;
    setFlash({ text: r.toast, sub, r });
    router.back();
  });
  const submitTitle = () => {
    const v = title.trim();
    if (!v) return setTitle(task.title);
    if (v !== task.title) void apply([{ op: "edit", target: task.id, title: v }]).then(load);
  };

  const mine = task.source !== "dlu" && !task.forId;
  const canTime = !!tt && (task.fixed ? task.fixed === "busy" && mine && task.start !== undefined : true);
  const hasDue = mine && !task.fixed && !task.rrule && task.deadline !== undefined;
  // A dry run of the draft, once the wheel rests a moment; a later turn drops an earlier answer.
  const ask = () => {
    clearTimeout(pvT.current);
    const g = ++pvGen.current;
    pvT.current = setTimeout(() => { const d = draft.current; if (d) void preview(d.id, d.e).then((r) => { if (g === pvGen.current) setPv(r); }, () => {}); }, 120);
  };
  const setTime = (s: number, m: number) => {
    if (!tt) return;
    setDr({ s, m });
    setTold(undefined);
    const moved = (x: Task) => ({ ...x, start: s, end: s + m * 60_000, effort: m });
    if (tt.id === task.id) setTask((x) => x && moved(x)); else setSits((xs) => xs.map((x) => (x.id === tt.id ? moved(x) : x)));
    draft.current = { id: tt.id, e: { when: s, effortMinutes: m } };
    ask();
  };
  const setDue = (d: number) => { setDv(d); setTold(undefined); setTask((x) => x && { ...x, deadline: d }); draft.current = { id: task.id, e: { deadline: d } }; };
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
  const goBack = once(async () => router.back()); // a second tap must not pop the screen below
  const more = () => [
    ...(mine && !task.fixed && !task.rrule && task.deadline === undefined ? [{ label: t("setDue"), icon: "hourglass" as const, onPress: defaultDue }] : []),
    ...(mine && !task.location && ed !== "place" ? [{ label: t("addPlace"), icon: "place" as const, onPress: () => setEd("place") }] : []),
    ...(mine && link && ed !== "place" ? [{ label: t("editPlace"), icon: "pencil" as const, onPress: () => setEd("place") }] : []),
    // A fixed block is the user's own time: zen never offers to plan it, nor says why it is there.
    ...(mine && !task.fixed && task.userEdited?.includes("start") ? [{ label: t("zenReplan"), icon: "sync" as const, onPress: once(async () => {
      const r: Result = await moveMine(task.id);
      setFlash({ text: r.toast, sub: r.sub, r });
      router.back();
    }) }] : []),
  ];
  const hm = (ts: number) => at(ts).split(" ").pop()!;
  const lines: React.ReactNode[] = [];
  if (task.fixed && task.start !== undefined) {
    lines.push(<Meta key="t" icon="clock" text={task.end !== undefined && task.fixed !== "exam" ? t("toEnd", { t: at(task.start), e: startDay(task.end - 1) === startDay(task.start) ? hm(task.end) : at(task.end) }) : at(task.start)} onPress={openTime} />);
  } else {
    if (task.deadline !== undefined && task.source === "dlu" && !task.forId) lines.push(<Meta key="d" icon="hourglass" tone="red" text={t("dueAt", { t: at(task.deadline) })} />);
    if (hasDue || (mine && ed === "due")) lines.push(ed === "due" ? (
      <EdLine key="d" ref={edBox} icon="hourglass" tone="red">
        <DateChip value={dv} onChange={(d) => setDue(dayOf(dv, d))} />
        <TimeChip value={dv} due onChange={(d) => setDue(clock(dv, d))} />
        <Tap onPress={() => { if (task.deadline !== undefined) draft.current = { id: task.id, e: { deadline: "" } }; close(); }} accessibilityLabel={t("clearDue")} style={s.clr}>
          <Text style={{ fontFamily: ff("600"), fontSize: font.sub, color: th.muted }}>{t("clearDue")}</Text>
        </Tap>
      </EdLine>
    ) : <Meta key="d" icon="hourglass" tone="red" text={t("dueAt", { t: at(task.deadline!) })} onPress={openDue} />);
    // The time is always shown: a split task's next open sitting (its sittings listed under "Các buổi"), else "no free slot" (views.html "Detail, no free time").
    // start - end, not start and a length: "Làm lúc T2 9:00 - 10:00"; a repeat drops the day (its repeat line says which days)
    if (tt?.start !== undefined) { const span = t("toEnd", { t: tt.rrule ? hm(tt.start) : at(tt.start), e: hm(tt.end ?? tt.start + tt.effort * 60_000) }); lines.push(<Meta key="t" icon="clock" text={tt.rrule ? span : t("planAt", { t: span })} onPress={openTime} />); }
    else if (tt && !task.doneAt) lines.push(<Meta key="t" icon="clock" tone="red" text={t("noSlot")} onPress={openTime} />);
  }
  // The repeat sits right under the time (views.html "Detail, repeating"); lectures have none, the timetable is the repeat.
  if (task.rrule && !task.section) lines.push(<Meta key="r" icon="repeat" text={repeatText(task.rrule, task.start ?? task.deadline ?? now)} />);
  if (ed === "time" && canTime) {
    const i = lines.findIndex((x) => (x as { key: string }).key === "t"), e = new Date(dr.s + dr.m * 60000);
    const row = (
      // views.html "Detail, set time": one line, start - end; the end's day shows only when it is another day. One box for tap-outside
      <EdLine key="t" ref={edBox} icon="clock">
        <DateChip value={dr.s} past onChange={(d) => setTime(dayOf(dr.s, d), dr.m)} />
        <TimeChip value={dr.s} past onChange={(d) => setTime(clock(dr.s, d), dr.m)} />
        <Text style={[s.dash, { color: th.muted }]}>-</Text>
        {/* views.html "Detail, over several days": the end day; days before the start are greyed out */}
        {startDay(e.getTime()) !== startDay(dr.s) && <DateChip value={e.getTime()} min={startDay(dr.s)} past onChange={(d) => setEnd(dayOf(e.getTime(), d))} />}
        {/* an end is at least 15 minutes after its start (setEnd); one turned before the start runs into the next day */}
        <TimeChip value={e.getTime()} past onChange={(d) => setEnd(endAt(dr.s, dr.s + dr.m * 60_000, d))} /* an end turned before the start moves to the next day (endAt); its day chip then shows */ />
      </EdLine>
    );
    if (i >= 0) lines[i] = row; else lines.push(row);
    // magic.html 7c: what the time being turned to would do; nothing when it touches nothing
    const c = pv?.clashes?.[0], ms = (pv?.moves ?? []).filter((x) => x.id !== tt?.id);
    const say = c ? t("previewClash", { title: c.fixed.title }) : ms.length > 1 ? t("previewMoves", { n: ms.length }) : ms[0] && t("previewMove", { title: ms[0].title, when: at(ms[0].to) });
    if (say) lines.splice((i >= 0 ? i : lines.length - 1) + 1, 0, <Text key="pv" accessibilityLiveRegion="polite" style={[s.pv, { color: th.muted }]}>{bolded(say, { color: th.ink })}</Text>);
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
  // "Còn nữa": under the sittings once the last one is done or under way (lastMore); no sheet, the result stays here with its Undo.
  const still = lastMore(sits.length ? sits : task.rrule ? [] : [task], now); // an unsplit task is its own last sitting
  const addMore = async () => { if (!still) return; setAdded(await stillMore(still)); void load(); };
  // "−" and "+ Thêm buổi" in the list: the result stays here with its Undo, as "Còn nữa". "−" only with two or more open: the last open one
  // going would leave no open sitting, and the planner would split the task again.
  const dropOne = async (id: string) => { setAdded(await dropSitting(task.parentId ?? task.id, undefined, id)); void load(); };
  const addOne = async () => { setAdded(await addSitting(task.parentId ?? task.id)); void load(); };
  const undoMore = async () => { const r = added; setAdded(undefined); await r?.undo(); void load(); };
  const why =!task.fixed ? grounded(plc?.why, { task, start: task.start ?? 0, rules }).flatMap((r) => (r.key !== "pace" ? [r] : open.length > 1 ? [{ ...r, vars: { k: open.findIndex((k) => k.id === task.id) + 1, n: open.length } }] : [])).slice(0, 4) : undefined;
  const me = split ? tt?.id : task.id;
  // "Cũng hợp" only for a real other time: one the planner found, not the current one, not already gone
  const alt = plc?.alt !== undefined && plc.alt !== task.start && plc.alt > now ? plc.alt : undefined;
  const moveTo = once(async (ts: number) => {
    const r: Result = await apply([{ op: "edit", target: task.id, when: new Date(ts).toISOString() }]);
    setFlash({ text: r.toast, sub: r.sub, r });
    router.back();
  });
  const toldMoves = told ? (told.r.moves ?? []).filter((x) => x.id !== told.id) : [];
  const giveBack = async (id: string) => { setTold(undefined); const r = await moveMine(id); setFlash({ text: r.toast, sub: r.sub, r }); void load(); };
  const keep = async (c: NonNullable<Result["clashes"]>[number]) => { await keepBoth(c); setTold((x) => x && { ...x, r: { ...x.r, clashes: x.r.clashes?.filter((y) => y !== c) } }); };
  const seen = () => { setTold(undefined); void seeMoves(toldMoves.map((x) => x.id)); };
  const undoTold = async () => { const r = told?.r; setTold(undefined); await r?.undo(); void load(); };
  const circle = [s.o, { borderColor: th.line, backgroundColor: th.bg }];
  const danger = [s.o, { borderColor: th.seal, backgroundColor: th.bg }]; // red: not mistaken for the dots next to it
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
      {/* iOS insets follow the keyboard curve and drag-to-dismiss; KeyboardAvoidingView jumped instead. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "android" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: 0, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <Animated.View entering={fadeIn}>
          <View style={s.bar}>
            <Tap onPress={goBack} accessibilityLabel={t("back")} style={circle}><Icon name="back" size={20} color={th.ink} /></Tap>
            <View style={s.acts}>
            {!!more().length && <View style={circle}><DropMenu color={th.ink} size={20} icon={<Gly name="dots" size={20} color={th.ink} />} items={more()} /></View>}
            {series ? (
              <View style={danger}>
                <DropMenu color={th.seal} size={20} icon={<Gly name="trash" size={20} color={th.seal} />} items={[
                  { label: t("deleteThis"), icon: "minus", onPress: () => del("this") },
                  { label: t("deleteFollowing"), icon: "toEnd", onPress: () => del("following") },
                  { label: t("deleteAll"), icon: "trash", destructive: true, onPress: () => del("all") },
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
              <DropMenu chevron label={t("youKind", { k: kindLabel(task.kind) })} color={th.muted} size={font.md} icon={<View style={s.kd}><Text style={[s.sub, { color: th.muted }]}>{t("youKind", { k: kindLabel(task.kind) })}</Text><Icon name="down" size={14} color={th.muted} /></View>}
                items={KINDS.map((k) => ({ label: kindLabel(k), icon: k, onPress: () => void apply([{ op: "edit", target: task.id, kind: k }]).then(load) }))} />
            ) : (
              <Text style={[s.sub, { color: th.muted }]}>{task.source === "dlu" && !task.forId ? (task.fixed ? t("fromCampus") : t("fromLms")) : mine && task.fixed === "busy" ? t("youKind", { k: t("fixedTime") }) : t("fromYou")}</Text>
            )}
          </View>
          <TextInput value={title} onChangeText={setTitle} selectionColor={th.seal} cursorColor={th.seal} onEndEditing={submitTitle} returnKeyType="done" submitBehavior="blurAndSubmit" multiline style={[s.h, { color: th.ink }]} />
          {lines.length > 0 && <View style={s.meta}>{lines}</View>}
          {/* magic.html 7d/7e: what the time just set did, in place: a clash with a class asks, the moves tell their story with Undo */}
          {told && (
              <View style={{ marginTop: 6 }}>
                {told.r.clashes?.map((c) => (
                  <View key={c.fixed.id} style={[s.warn, { borderColor: th.seal }]}>
                    <Text style={[s.wht, { color: th.seal }]}>{t("clash")}</Text>
                    <Text style={[s.wb, { color: th.muted }]}>{t("clashHere", { a: c.fixed.title })}</Text>
                    <View style={[s.pills, { marginTop: 12 }]}>
                      <Tap onPress={() => giveBack(c.mine.id)} style={[s.pill2, { backgroundColor: th.ink }]}><Text numberOfLines={1} style={[s.plt, { color: th.bg, fontFamily: ff("700") }]}>{t("overlapMine")}</Text></Tap>
                      <Tap onPress={() => keep(c)} style={[s.pill2, { borderColor: th.line, borderWidth: 1 }]}><Text numberOfLines={1} style={[s.plt, { color: th.ink }]}>{t("overlapKeep")}</Text></Tap>
                    </View>
                  </View>
                ))}
                {told.r.lost?.map((x) => <Text key={x.id} style={[s.wb, { color: th.seal, marginTop: 12 }]}>{bolded(t("lostSlot", { title: x.title }))}</Text>)}
                {toldMoves.length > 0 && <Story moves={toldMoves} now={now} onClose={seen} onUndo={undoTold} />}
              </View>
          )}
          {/* prep.html "Các buổi": every sitting with its day, step and length; done ones struck, this one bold. Only for two or more; above the LMS content, each row opens its sitting. */}
          {sits.length > 1 && (
            <View style={s.why}>
              <Text style={[s.lab, { color: th.muted }]}>{t("sittings")}</Text>
              <View style={{ marginTop: 6 }}>
                {sits.map((k) => {
                  const done = !!k.doneAt, on = k.id === me, dim = { color: th.muted, textDecorationLine: done ? "line-through" : "none" } as const;
                  return (
                    <View key={k.id} style={s.sirow}>
                      {/* push, not replace: back returns to this one */}
                      <Tap variant="row" disabled={k.id === task.id} onPress={() => router.push(`/task/${k.id}`)} accessibilityRole="button" style={[s.si, { flex: 1 }]}>
                        <Text style={[s.sd, dim, on && !done && { color: th.ink, fontFamily: ff("600") }]}>{k.start !== undefined ? day(k.start, now) : "—"}</Text>
                        <Text style={[s.sp, { color: th.ink }, done && dim, on && !done && { fontFamily: ff("700") }]} numberOfLines={1}>{k.title}</Text>
                        <Text style={[s.sm, { color: th.muted }]}>{t("minutes", { n: k.effort })}</Text>
                      </Tap>
                      {done || open.length < 2 ? <View style={s.xGap} /> : (
                        <Tap onPress={() => dropOne(k.id)} accessibilityRole="button" accessibilityLabel={t("dropSit")} style={s.x}>
                          <Icon name="x" size={20} color={th.muted} w={2} />
                        </Tap>
                      )}
                    </View>
                  );
                })}
                {/* a whole-width button, not a "+" glyph: easy to hit with a thumb */}
                <Tap onPress={addOne} accessibilityRole="button" accessibilityLabel={t("addSit")} style={[s.add, { borderColor: th.line }]}>
                  <Icon name="plus" size={20} color={th.ink} w={2.2} />
                  <Text style={[s.addT, { color: th.ink }]}>{t("addSit")}</Text>
                </Tap>
              </View>
            </View>
          )}
          {still && sits.length < 2 && <Tap onPress={addMore} accessibilityRole="button" accessibilityLabel={t("stillMore")} style={s.more}><Text style={[s.moreT, { color: th.ink }]}>{t("stillMore")}</Text></Tap>}
          {added && (
            <View style={s.addRow}>
              <Text style={[s.sp, { color: th.muted }]}>{added.toast}</Text>
              <Tap onPress={undoMore} accessibilityRole="button" accessibilityLabel={t("undo")} style={s.more}><Text style={[s.moreT, { color: th.ink }]}>{t("undo")}</Text></Tap>
            </View>
          )}
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
              {alt !== undefined && (
                <>
                  <Text style={[s.lab, { color: th.muted, marginTop: 20 }]}>{t("alsoFits")}</Text>
                  <View style={s.pills}>
                    <Tap onPress={() => moveTo(alt)} accessibilityLabel={`${t("alsoFits")} ${at(alt)}`} style={[s.pill, { borderColor: th.line }]}>
                      <Text style={{ fontSize: font.sub, fontFamily: ff("500"), color: th.ink }}>{at(alt)}</Text>
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
  clr: { marginLeft: "auto", paddingVertical: 6 },
  loc: { flex: 1, fontFamily: ff("500"), fontSize: font.meta, lineHeight: 22, padding: 0 },
  who: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22 },
  sw: { width: 34, height: 34, borderRadius: 17, overflow: "hidden" },
  sub: { fontFamily: ff(), fontSize: font.md },
  h: { marginTop: 14, fontSize: font.h, lineHeight: 36, fontFamily: ff("600"), letterSpacing: -0.75, padding: 0 },
  meta: { marginTop: 16, gap: 10 },
  dash: { fontSize: font.sub, fontFamily: ff("500") },
  kd: { flexDirection: "row", alignItems: "center", gap: 4 },
  lms: { marginTop: 18, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderRadius: 16 },
  lab: { fontSize: font.label, fontFamily: ff("500") },
  why: { marginTop: 22 },
  si: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48 }, // prep.html .si: a whole row to tap, at least 48
  sirow: { flexDirection: "row", alignItems: "center" },
  x: { width: 40, height: 48, alignItems: "center", justifyContent: "center" }, // views.html .si .x: a plain x, centred on the row, 48 tall to hit
  xGap: { width: 40 }, // a done or lone row keeps the remove space empty
  add: { marginTop: 10, height: 48, borderRadius: 24, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, // views.html .si.add
  addT: { fontSize: font.sub, fontFamily: ff("600") },
  more: { alignSelf: "flex-start", marginTop: 10, paddingVertical: 6 }, // magic.html .tbtn: an in-place text button
  moreT: { fontSize: 14, fontFamily: ff("600"), textDecorationLine: "underline" },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  sd: { width: 74, fontSize: font.sub, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  sp: { flex: 1, fontSize: font.sub, fontFamily: ff("500") },
  sm: { fontSize: font.sub, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  wr: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  wt: { flex: 1, fontFamily: ff("500"), fontSize: font.meta, lineHeight: 21.6 },
  bar2: { width: 46, height: 4, borderRadius: 4, overflow: "hidden" },
  pills: { flexDirection: "row", gap: 8, marginTop: 10 },
  pv: { marginLeft: 30, marginTop: -4, fontFamily: ff("500"), fontSize: font.sub, lineHeight: 20 },
  warn: { marginTop: 16, padding: 14, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5 }, // day.tsx .warn
  wht: { fontSize: font.meta, fontFamily: ff("700") },
  wb: { marginTop: 4, fontFamily: ff(), fontSize: font.sub, lineHeight: 21 },
  pill2: { height: 36, paddingHorizontal: 16, borderRadius: 99, alignItems: "center", justifyContent: "center", flexShrink: 1, minWidth: 0 },
  plt: { fontSize: font.sub, fontFamily: ff("500") },
  pill: { height: 40, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  note: { marginTop: 18, fontFamily: ff(), fontSize: font.base, lineHeight: 25.5, minHeight: 120, textAlignVertical: "top", padding: 0 },
});


