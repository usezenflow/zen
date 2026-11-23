import { bolded } from "@/components/bold";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { fadeIn, Tap } from "@/components/tap";
import { Icon, TypeArt } from "@/components/art";
import { repeatText } from "@/components/detail-html";
import { EdLine, Gly, Meta } from "@/components/detail-meta";
import { hhmm } from "@/components/cal";
import { DateChip, TimeChip } from "@/components/pick";
import { SittingList } from "@/components/sittings";
import { useTapOutside, type Box } from "@/components/outside";
import { DropMenu } from "@/components/menu";
import { RichText } from "@/components/richtext";
import { addSitting, apply, dropSitting, lastMore, moveMine, removeScope, stillMore, toAction, type LiveEdit, type Result } from "@/lib/apply";
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
import { dayLabel, endAt, startDay, when } from "@/lib/when";

type Scope = "this" | "following" | "all";
const KINDS = Object.keys(KIND_VI) as Kind[];
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const kindLabel = (k: Kind) => (k === "other" ? "Khác" : cap(KIND_VI[k])); // "Việc của bạn · Khác", not "· Việc khác"
const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").split(/[/?#]/)[0];
const QUARTER = 900_000, LENS = [15, 30, 45, 60, 90, 120]; // the end chip offers these lengths from the start
const clock = (base: number, d: Date) => { const n = new Date(base); n.setHours(d.getHours(), d.getMinutes(), 0, 0); return n.getTime(); };
const dayOf = (base: number, d: Date) => { const n = new Date(base); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); return n.getTime(); };
/** true when `v` differs from the last value stored under `k` (JSON, vec left out); remembers it. */
const fresh = (seen: Record<string, string>, k: string, v: unknown) => {
  const j = JSON.stringify(v, (key, x) => (key === "vec" ? undefined : x)) ?? "";
  if (seen[k] === j) return false;
  seen[k] = j;
  return true;
};

export default function Detail() {
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<Task>();
  const [exam, setExam] = useState<Task>();
  const [sits, setSits] = useState<Task[]>([]); // the sittings this one belongs to (a sitting: it and its siblings; a split task: its own), in time order
  const [now, setNow] = useState(0);
  const [plc, setPlc] = useState<Placed>();
  const [rules, setRules] = useState<Rule[]>([]);
  const [pool, setPool] = useState<Task[]>([]); // every task: a batch reason's neighbour and an exam reason's exam
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [loc, setLoc] = useState("");
  const [ed, setEd] = useState<"time" | "due" | "place">(); // which inline line is open
  const [noTitle, setNoTitle] = useState(false); // an emptied title: a hint, the stored one stays
  // Every time, day, length and due change waits here until its dropdown closes, a tap outside, or leaving: one apply, one replan.
  const [draft] = useState(() => new Map<string, LiveEdit>()); // a plain box, written in handlers only
  const [told, setTold] = useState<{ r: Result; ids: string[] }>(); // what the saved value did, shown in place (magic.html 7d)
  const [added, setAdded] = useState<Result>(); // what "Còn nữa" or a sitting change just did: its toast and Undo, in place
  const saved = useRef("");
  const latest = useRef("");
  const seen = useRef<Record<string, string>>({}); // last loaded values, so a reload that changes nothing sets no state
  const nav = useNavigation();
  // What is typed lives in refs and in each Field, never in this screen's state: a key press must not re-render the whole detail.
  const typed = useRef({ title: "", loc: "" });
  const pend = useRef({ task });
  const [rev] = useState(0); // the fields show the stored value again when this bumps (none does now: a save never reverts a field)
  useEffect(() => { pend.current = { task }; });
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
    const pl = id ? mdl?.placed[id] : undefined, rl = mdl?.rules ?? [];
    if (fresh(seen.current, "plc", pl)) setPlc(pl);
    if (fresh(seen.current, "rules", rl)) setRules(rl);
    if (!x || x.deletedAt) { // opened from a stale widget or notification, or synced away
      // only while on top: a screen under another popping itself took the top one (or nothing) with it
      if (nav.isFocused()) { if (router.canGoBack()) router.back(); else router.replace("/"); }
      return;
    }
    const on = x.start ?? x.deadline;
    if (on !== undefined) openedOnDay(on);
    if (fresh(seen.current, "now", Math.floor(n / 60_000))) setNow(n);
    if (fresh(seen.current, "task", x)) setTask(x);
    if (fresh(seen.current, "pool", all)) setPool(all);
    const ex = x.forId ? all.find((y) => y.id === x.forId) : undefined;
    if (fresh(seen.current, "exam", ex)) setExam(ex);
    const ss = all.filter((y) => y.parentId === (x.parentId ?? x.id) && !y.deletedAt).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
    if (fresh(seen.current, "sits", ss)) setSits(ss);
    // A reload after a save must not wipe what is still being typed in another field: only untouched fields take the stored value.
    const p = pend.current, first = !p.task;
    if (first || typed.current.title === p.task?.title) { typed.current.title = x.title ?? ""; setTitle(x.title ?? ""); }
    if (first || latest.current === saved.current) { setNote(x.note ?? ""); saved.current = latest.current = x.note ?? ""; }
    if (first || typed.current.loc === (p.task?.location ?? "")) { typed.current.loc = x.location ?? ""; setLoc(x.location ?? ""); }
  }, [id, nav]);
  // on every focus, not only the first: back from a sitting deleted on its own screen drops it from "Các buổi" here
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // The one save: every pending change in one apply. Nothing is planned while the user is still editing.
  const put = useCallback((sid: string, e: LiveEdit) => { draft.set(sid, { ...draft.get(sid), ...e }); }, [draft]);
  const flush = useCallback(() => {
    const ids = [...draft.keys()], acts = ids.map((i) => toAction(i, draft.get(i)!));
    draft.clear();
    if (!ids.length) return undefined;
    return apply(acts).then((r) => ({ r, ids }));
  }, [draft]);
  const settle = () => {
    const p = flush();
    if (!p) return void load();
    leftSaved(p);
    p.then(({ r, ids }) => { if (r.moves?.some((m) => !ids.includes(m.id)) || r.clashes?.length || r.lost?.length) setTold({ r, ids }); void load(); }, () => void load());
  };
  const close = () => { setEd(undefined); settle(); };
  const saveFirst = async () => { const p = flush(); if (p) await p.catch(() => {}); };
  const edBox = useRef<Box>(null);
  useTapOutside(edBox, ed === "time" || ed === "due", close); // a dropdown open over it takes its own taps

  // Note: saved on blur and when leaving, not on every pause, so typing plans nothing.
  const saveNote = useCallback(() => {
    if (latest.current === saved.current) return;
    saved.current = latest.current;
    return apply([{ op: "edit", target: id, note: latest.current }]);
  }, [id]);
  const typing = (v: string) => { latest.current = v; };
  const typeTitle = (v: string) => { typed.current.title = v; if (noTitle && v.trim()) setNoTitle(false); };
  const typeLoc = (v: string) => { typed.current.loc = v; };

  // Leaving saves what is pending: the open time or due line, the note, the title and the place typed so far.
  useEffect(() => () => {
    leftSaved(flush());
    leftSaved(saveNote());
    const { title: ti, loc: lo } = typed.current, { task: tk } = pend.current;
    if (!tk) return;
    const v = ti.trim();
    if (v && v !== tk.title) leftSaved(apply([{ op: "edit", target: tk.id, title: v }]));
    if (lo.trim() && lo.trim() !== (tk.location ?? "")) leftSaved(apply([{ op: "edit", target: tk.id, location: lo.trim() }]));
  }, [flush, saveNote]);

  // A time, day or part change for one task (the screen's own or one of its sittings): local at once, saved with the rest.
  const setTime = useCallback((sid: string, s: number, m: number) => {
    setTold(undefined);
    const moved = (x: Task) => ({ ...x, start: s, end: s + m * 60_000, effort: m });
    setTask((x) => (x && x.id === sid ? moved(x) : x));
    setSits((xs) => xs.map((x) => (x.id === sid ? moved(x) : x)));
    put(sid, { when: s, effortMinutes: m });
  }, [put]);

  // Why this time: computed once per change of the plan or the task, not on every render (hooks stay above the early return).
  const why = useMemo(() => {
    if (!task || task.fixed) return undefined;
    const openN = sits.filter((k) => !k.doneAt);
    return grounded(plc?.why, { task, start: task.start ?? 0, rules, tasks: pool }).flatMap((r) => (r.key !== "pace" ? [r] : openN.length > 1 ? [{ ...r, vars: { k: openN.findIndex((k) => k.id === task.id) + 1, n: openN.length } }] : [])).slice(0, 4);
  }, [plc, task, rules, pool, sits]);
  if (!task) return <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }} />;
  const type: TypeName = typeOf(task);
  // A split task's time line is its next open sitting's, and edits that sitting; a task with no time yet (no free slot) can be given one by hand.
  const split = !task.parentId && sits.length > 0;
  const tt = split ? sits.find((k) => !k.doneAt) : task;
  const series = !!(task.section || task.rrule || task.parentId || split);
  const at = (ts: number) => when(ts, now);
  const hm = (ts: number) => at(ts).split(" ").pop()!;

  // A split task deletes from its next open sitting, as its time line edits it: "this" is that sitting, "all" every one.
  const del = once(async (scope: Scope) => {
    const x = (split && tt) || task;
    const r: Result = await removeScope(x.id, scope);
    const sub = scope === "all" ? t("goneAll") : scope === "following" ? t("goneFrom", { d: x.start ? dayLabel(x.start) : "" }) : x.start ? at(x.start) : undefined;
    setFlash({ text: r.toast, sub, r });
    router.back();
  });
  const submitTitle = () => {
    const v = typed.current.title.trim();
    if (!v) return setNoTitle(true); // the stored title stays; the hint asks for one
    setNoTitle(false);
    if (v !== task.title) void apply([{ op: "edit", target: task.id, title: v }]).then(load);
  };

  const mine = task.source !== "dlu" && !task.forId;
  const canTime = !!tt && (task.fixed ? task.fixed === "busy" && mine && task.start !== undefined : true);
  const hasDue = mine && !task.fixed && !task.rrule && task.deadline !== undefined;
  // The open time line (a placed one, or an untimed one once its "no free slot" line is tapped). Start and length come from the task's own values.
  const tid = tt?.id ?? task.id;
  const sNow = tt?.start ?? Math.ceil(now / QUARTER) * QUARTER; // untimed: from the next quarter hour (now is set by the load)
  const mNow = tt && tt.start !== undefined && tt.end !== undefined ? Math.max(15, Math.round((tt.end - tt.start) / 60_000)) : tt?.effort || 30;
  const eNow = sNow + mNow * 60_000;
  const openTime = () => { if (tt) setEd("time"); };
  const setEnd = (end: number) => setTime(tid, sNow, Math.max(15, Math.round((end - sNow) / 60_000))); // never before the start
  const dl = task.deadline;
  const setDue = (ts: number) => { setTask((x) => x && { ...x, deadline: ts }); put(task.id, { deadline: ts }); };
  const openDue = () => setEd("due");
  const clearDue = () => { setTask((x) => x && { ...x, deadline: undefined }); put(task.id, { deadline: "" }); close(); };
  const e = eNow; // the end; its day chip shows only when it is another day
  const savePlace = () => {
    const v = typed.current.loc.trim();
    if (!v) setEd(undefined);
    if (v !== (task.location ?? "")) void apply([{ op: "edit", target: task.id, location: v }]).then(load);
  };
  // Opens the due line on today 23:59; nothing is saved until a dropdown closes, a tap outside, or leaving.
  const defaultDue = () => { const d = new Date(now); d.setHours(23, 59, 0, 0); setDue(d.getTime()); setEd("due"); };
  const link = /^https?:\/\/\S+$/i.test(task.location ?? "") ? task.location! : undefined;
  const goBack = once(async () => router.back()); // a second tap must not pop the screen below
  const more = () => [
    ...(mine && !task.fixed && !task.rrule && task.deadline === undefined ? [{ label: t("setDue"), icon: "hourglass" as const, onPress: defaultDue }] : []),
    ...(mine && !task.location && ed !== "place" ? [{ label: t("addPlace"), icon: "place" as const, onPress: () => setEd("place") }] : []),
    ...(mine && link && ed !== "place" ? [{ label: t("editPlace"), icon: "pencil" as const, onPress: () => setEd("place") }] : []),
    // A fixed block is the user's own time: zen never offers to plan it, nor says why it is there.
    ...(mine && !task.fixed && task.userEdited?.includes("start") ? [{ label: t("zenReplan"), icon: "sync" as const, onPress: once(async () => {
      await saveFirst();
      const r: Result = await moveMine(task.id);
      setFlash({ text: r.toast, sub: r.sub, r });
      router.back();
    }) }] : []),
  ];
  const span = tt?.start !== undefined ? t("toEnd", { t: tt.rrule ? hm(tt.start) : at(tt.start), e: hm(tt.end ?? tt.start + tt.effort * 60_000) }) : "";

  // views.html "Detail, change the time": one line of chips, start - end; each chip drops its picker, and closing one saves once.
  const timeLine = (
    <EdLine key="t" ref={edBox} icon="clock">
      <DateChip value={sNow} past onChange={(d) => setTime(tid, dayOf(sNow, d), mNow)} onClose={settle} />
      <TimeChip value={sNow} past onChange={(d) => setTime(tid, clock(sNow, d), mNow)} onClose={settle} />
      <Text style={[s.dash, { color: th.muted }]}>-</Text>
      {startDay(e) !== startDay(sNow) && <DateChip value={e} min={startDay(sNow)} past onChange={(d) => setEnd(dayOf(e, d))} onClose={settle} />}
      {/* an end before the start runs into the next day (endAt); its day chip then shows. Its presets are end times, a length after the start. */}
      <TimeChip value={e} past onChange={(d) => setEnd(endAt(sNow, e, d))} onClose={settle}
        presets={LENS.map((m) => ({ label: hhmm(sNow + m * 60_000), at: new Date(sNow + m * 60_000), on: m === mNow }))} />
    </EdLine>
  );
  const dueLine = dl !== undefined && (
    <EdLine key="d" ref={edBox} icon="hourglass" tone="red">
      <DateChip value={dl} onChange={(d) => setDue(dayOf(dl, d))} onClose={settle} />
      <TimeChip value={dl} due onChange={(d) => setDue(clock(dl, d))} onClose={settle} />
      <Tap onPress={clearDue} accessibilityLabel={t("clearDue")} style={s.clr}>
        <Text style={{ fontFamily: ff("600"), fontSize: font.sub, color: th.muted }}>{t("clearDue")}</Text>
      </Tap>
    </EdLine>
  );

  const lines: React.ReactNode[] = [];
  if (task.fixed && task.start !== undefined) {
    if (ed === "time" && canTime) lines.push(timeLine);
    else lines.push(<Meta key="t" icon="clock" onPress={canTime ? openTime : undefined} text={task.end !== undefined && task.fixed !== "exam" ? t("toEnd", { t: at(task.start), e: startDay(task.end - 1) === startDay(task.start) ? hm(task.end) : at(task.end) }) : at(task.start)} />);
  } else {
    if (task.deadline !== undefined && task.source === "dlu" && !task.forId) lines.push(<Meta key="d" icon="hourglass" tone="red" text={t("dueAt", { t: at(task.deadline) })} />);
    if (mine && ed === "due" && dueLine) lines.push(dueLine);
    else if (hasDue) lines.push(<Meta key="d" icon="hourglass" tone="red" text={t("dueAt", { t: at(task.deadline!) })} onPress={openDue} />);
    // The time is always shown: a split task's next open sitting (its sittings listed under "Các buổi"), else "no free slot" (views.html "Detail, no free time").
    if (ed === "time" && canTime) lines.push(timeLine);
    else if (tt?.start !== undefined) lines.push(<Meta key="t" icon="clock" text={tt.rrule ? span : t("planAt", { t: span })} onPress={canTime ? openTime : undefined} />);
    else if (tt && !task.doneAt) lines.push(<Meta key="t" icon="clock" tone="red" text={t("noSlot")} onPress={canTime ? openTime : undefined} />);
  }
  // The repeat sits right under the time (views.html "Detail, repeating"); lectures have none, the timetable is the repeat.
  if (task.rrule && !task.section) lines.push(<Meta key="r" icon="repeat" text={repeatText(task.rrule, task.start ?? task.deadline ?? now)} />);
  // a link place opens on tap; the dots menu edits it
  if (link && ed !== "place") lines.push(<Meta key="l" icon="link" tone="link" text={host(link)} onPress={() => void Linking.openURL(link).catch(() => {})} />);
  else if (mine && (task.location || ed === "place")) lines.push(
    <EdLine key="l" icon="pin">
      <Field value={loc} rev={rev} onText={typeLoc} autoFocus={ed === "place"} onEndEditing={savePlace} returnKeyType="done" submitBehavior="blurAndSubmit" placeholder={t("placeHint")} placeholderTextColor={th.muted}
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
  const addMore = async () => { if (!still) return; await saveFirst(); setAdded(await stillMore(still)); void load(); };
  // Sittings: "Thêm buổi" on every open, non-fixed, non-repeating task; "Bỏ buổi" only with two or more open (the split keeps one).
  const canSplit = !task.fixed && !task.rrule && !task.doneAt;
  const dropOne = async (sid: string) => { await saveFirst(); setAdded(await dropSitting(task.parentId ?? task.id, undefined, sid)); void load(); };
  const addOne = async () => { await saveFirst(); setAdded(await addSitting(task.parentId ?? task.id)); void load(); };
  const undoMore = async () => { const r = added; setAdded(undefined); await r?.undo(); void load(); };
  const me = split ? tt?.id : task.id;
  // "Cũng hợp" only for a real other time: one the planner found, not the current one, not already gone
  const alt = plc?.alt !== undefined && plc.alt !== task.start && plc.alt > now ? plc.alt : undefined;
  const moveTo = once(async (ts: number) => {
    const r: Result = await apply([{ op: "edit", target: task.id, when: new Date(ts).toISOString() }]);
    setFlash({ text: r.toast, sub: r.sub, r });
    router.back();
  });
  const toldMoves = told ? (told.r.moves ?? []).filter((x) => !told.ids.includes(x.id)) : [];
  const giveBack = async (sid: string) => { setTold(undefined); await saveFirst(); const r = await moveMine(sid); setFlash({ text: r.toast, sub: r.sub, r }); void load(); };
  const keep = async (c: NonNullable<Result["clashes"]>[number]) => { await keepBoth(c); setTold((x) => x && { ...x, r: { ...x.r, clashes: x.r.clashes?.filter((y) => y !== c) } }); };
  const seeTold = () => { setTold(undefined); void seeMoves(toldMoves.map((x) => x.id)); };
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
          <Field value={title} rev={rev} onText={typeTitle} selectionColor={th.seal} cursorColor={th.seal} onEndEditing={submitTitle} returnKeyType="done" submitBehavior="blurAndSubmit" multiline style={[s.h, { color: th.ink }]} />
          {noTitle && <Text accessibilityLiveRegion="polite" style={[s.hint, { color: th.seal }]}>Gõ tên việc để lưu</Text>}
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
                {toldMoves.length > 0 && <Story moves={toldMoves} now={now} onClose={seeTold} onUndo={undoTold} />}
              </View>
          )}
          {/* prep.html "Các buổi": every open, non-fixed, non-repeating task can take sittings; each open one has its own day, part and length. */}
          {(canSplit || sits.length > 1) && (
            <View style={s.why}>
              {sits.length > 1 && <Text style={[s.lab, { color: th.muted }]}>{t("sittings")}</Text>}
              <View style={{ marginTop: sits.length > 1 ? 6 : 0 }}>
                <SittingList sits={sits} me={me} canDrop={open.length >= 2} canAdd={canSplit}
                  onTime={setTime} onDrop={dropOne} onAdd={addOne} onSettle={settle} />
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
          {!!task.content?.trim() && <Lms html={task.content} />}
          {!!why?.length && <WhyBlock items={why} alt={alt} now={now} onMove={moveTo} />}
          <Field value={note} rev={rev} onText={typing} selectionColor={th.seal} cursorColor={th.seal} onBlur={() => void saveNote()} multiline scrollEnabled={false} placeholder={t("addNote")} placeholderTextColor={th.muted}
            style={[s.note, { color: th.ink, backgroundColor: th.chip }]} />
        </Animated.View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** views.html .lms: the LMS content, memo'd so typing in the note does not re-render it. */
const Lms = memo(function Lms({ html }: { html: string }) {
  const th = useTheme();
  return (
    <View style={[s.lms, { borderColor: th.line }]}>
      <Text style={[s.lab, { color: th.muted, marginBottom: 6 }]}>{t("lmsContent")}</Text>
      <RichText html={html} color={th.ink} line={th.line} link={th.ink} />
    </View>
  );
});

/** "Vì sao lúc này" with weight bars, and the one other good time. */
const WhyBlock = memo(function WhyBlock({ items, alt, now, onMove }: { items: ReturnType<typeof grounded>; alt?: number; now: number; onMove: (ts: number) => void }) {
  const th = useTheme();
  return (
    <View style={s.why}>
      <Text style={[s.lab, { color: th.muted }]}>{t("whyNow")}</Text>
      {items.map((x, i) => (
        <View key={i} style={s.wr}>
          <Text style={[s.wt, { color: th.ink }]}>{reasonText(x, true)}</Text>
          <View style={[s.bar2, { backgroundColor: th.line }]}><View style={{ width: `${Math.min(1, Math.abs(x.w)) * 100}%`, height: 4, borderRadius: 4, backgroundColor: x.w < 0 ? th.seal : th.ink }} /></View>
        </View>
      ))}
      {alt !== undefined && (
        <>
          <Text style={[s.lab, { color: th.muted, marginTop: 14 }]}>{t("alsoFits")}</Text>
          <View style={s.pills}>
            <Tap onPress={() => onMove(alt)} accessibilityLabel={`${t("alsoFits")} ${when(alt, now).split(" ").pop()}`} style={[s.pill, { borderColor: th.line }]}>
              <Text style={{ fontSize: font.sub, fontFamily: ff("500"), color: th.ink }}>{when(alt, now).split(" ").pop()}</Text>
            </Tap>
          </View>
        </>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "space-between" },
  o: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  acts: { flexDirection: "row", gap: 8 },
  loc: { flex: 1, fontFamily: ff("500"), fontSize: font.meta, lineHeight: 22, minHeight: 48, padding: 0, textAlignVertical: "center" },
  who: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  sw: { width: 34, height: 34, borderRadius: 17, overflow: "hidden" },
  sub: { fontFamily: ff(), fontSize: font.md },
  h: { marginTop: 8, fontSize: font.h, lineHeight: 36, minHeight: 48, fontFamily: ff("600"), letterSpacing: -0.75, padding: 0 },
  hint: { marginTop: 4, fontFamily: ff("600"), fontSize: font.sub },
  meta: { marginTop: 10, gap: 2 },
  kd: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  lms: { marginTop: 12, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderRadius: 16 },
  lab: { fontSize: font.label, fontFamily: ff("500") },
  why: { marginTop: 14 },
  add: { marginTop: 6, height: 44, borderRadius: 24, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  more: { alignSelf: "flex-start", minHeight: 48, justifyContent: "center", paddingHorizontal: 4 }, // magic.html .tbtn: an in-place text button, 48 tall
  moreT: { fontSize: font.sub, fontFamily: ff("600"), textDecorationLine: "underline" },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  sp: { flex: 1, fontSize: font.sub, fontFamily: ff("500") },
  wr: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  wt: { flex: 1, fontFamily: ff("500"), fontSize: font.meta, lineHeight: 21.6 },
  bar2: { width: 46, height: 4, borderRadius: 4, overflow: "hidden" },
  pills: { flexDirection: "row", gap: 8, marginTop: 10 },
  warn: { marginTop: 16, padding: 14, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5 }, // day.tsx .warn
  wht: { fontSize: font.meta, fontFamily: ff("700") },
  wb: { marginTop: 4, fontFamily: ff(), fontSize: font.sub, lineHeight: 22 },
  pill2: { height: 48, paddingHorizontal: 16, borderRadius: 99, alignItems: "center", justifyContent: "center", flexShrink: 1, minWidth: 0 },
  plt: { fontSize: font.sub, fontFamily: ff("500") },
  pill: { height: 48, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  clr: { marginLeft: "auto", minHeight: 44, justifyContent: "center" },
  dash: { fontSize: font.sub, fontFamily: ff("500") },
  note: { marginTop: 12, fontFamily: ff(), fontSize: font.base, lineHeight: 25.5, minHeight: 120, textAlignVertical: "top", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18 },
});

/** A text field that owns what is typed: the screen hears the text through `onText` (a ref write) and shows `value` again only when it changes or `rev` bumps. */
const Field = memo(function Field({ value, rev, onText, ...p }: Omit<ComponentProps<typeof TextInput>, "value" | "onChangeText"> & { value: string; rev: number; onText: (v: string) => void }) {
  const [v, setV] = useState(value), [seen, setSeen] = useState({ value, rev });
  if (seen.value !== value || seen.rev !== rev) { setSeen({ value, rev }); setV(value); } // the stored text changed under us: show it
  return <TextInput {...p} value={v} onChangeText={(x) => { setV(x); onText(x); }} />;
});
