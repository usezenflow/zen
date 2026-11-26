import { bolded } from "@/components/bold";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { fadeIn, Tap } from "@/components/tap";
import { Icon } from "@/components/art";
import { repeatText } from "@/components/detail-html";
import { EdLine, Gly, Meta, State } from "@/components/detail-meta";
import { hhmm } from "@/components/cal";
import { DateChip, TimeChip } from "@/components/pick";
import { SittingList } from "@/components/sittings";
import { useTapOutside, type Box } from "@/components/outside";
import { DropMenu } from "@/components/menu";
import { RichText } from "@/components/richtext";
import { addSitting, apply, clearRepeat, dropPrep, dropSitting, lastMore, moveMine, removeScope, reshapeSeries, splitInto, stillMore, toAction, type LiveEdit, type Result } from "@/lib/apply";
import { askMic, listenLive, type Heard } from "@/lib/ears";
import { patchOf } from "@/lib/nlu/patch";
import { Story } from "@/components/nowcard";
import { seeMoves } from "@/lib/moves";
import { keepBoth } from "@/lib/overlap";
import { t } from "@/lib/i18n";
import { leftSaved, openedOnDay, setFlash } from "@/lib/flash";
import { allTasks, loadModel } from "@/lib/store";
import { KIND_LIST, KIND_VI, reasonText, sayable } from "@/lib/reasons";
import { useTheme, font, space, ff, fd } from "@/lib/theme";
import { grounded, typeOf } from "@/planner";
import type { Placed } from "@/planner/model";
import { clause, findingsFor, mine as mineFindings, type Finding } from "@/planner/mine";
import type { Kind, Rule, Task } from "@/lib/types";
import { dayLabel, endAt, startDay, when } from "@/lib/when";

type Scope = "this" | "following" | "all";
const KINDS = KIND_LIST;
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const kindLabel = (k: Kind) => (k === "other" ? t("kindOther") : cap(KIND_VI[k])); // "Việc của bạn · Khác", not "· Việc khác"
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
  const [finds, setFinds] = useState<Finding[]>([]); // what the outcomes really show, mined fresh on each load
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
  const [quickMsg, setQuickMsg] = useState<string>(); // the quick bar's calm line: nothing understood, or a kind it cannot patch here
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
    const fs = mdl ? mineFindings(mdl, n) : [];
    if (fresh(seen.current, "finds", fs)) setFinds(fs);
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
    const was = saved.current;
    saved.current = latest.current;
    return apply([{ op: "edit", target: id, note: latest.current }]).catch((e) => { saved.current = was; throw e; }); // a failed note is tried again
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
    return sayable(grounded(plc?.why, { task, start: task.start ?? 0, rules, tasks: pool })).flatMap((r) => (r.key !== "pace" ? [r] : openN.length > 1 ? [{ ...r, vars: { k: openN.findIndex((k) => k.id === task.id) + 1, n: openN.length } }] : [])).slice(0, 4);
  }, [plc, task, rules, pool, sits]);
  // At most one finding for the slot and one for the length, each a literal clause; none for a time set by hand (that is the reason).
  const notes = useMemo(() => {
    if (!task || task.fixed || task.start === undefined || plc?.why?.some((r) => r.key === "chose")) return [];
    const fs = findingsFor(finds, task.kind, task.start, plc?.x);
    const slot = fs.find((f) => f.type !== "length"), len = task.effortGuessed ? fs.find((f) => f.type === "length") : undefined;
    return [slot, len].filter((f): f is Finding => !!f).map((f) => ({ text: clause(f), n: Math.round(f.n) }));
  }, [finds, plc, task]);
  if (!task) return <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }} />;
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
    if (v !== task.title) void apply([{ op: "edit", target: task.id, title: v }]).then(load).catch(() => {});
  };

  const mine = task.source !== "dlu" && !task.forId;
  // Only a plan or an assignment is the user's to edit; lectures, exams and busy blocks are read-only (delete stays).
  const editable = mine && (typeOf(task) === "plan" || typeOf(task) === "assignment");
  const canTime = !!tt && editable;
  const hasDue = editable && !task.fixed && !task.rrule && task.deadline !== undefined;
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
    if (v !== (task.location ?? "")) void apply([{ op: "edit", target: task.id, location: v }]).then(load).catch(() => {});
  };
  // Opens the due line on today 23:59; nothing is saved until a dropdown closes, a tap outside, or leaving.
  const defaultDue = () => { const d = new Date(now); d.setHours(23, 59, 0, 0); setDue(d.getTime()); setEd("due"); };
  const link = /^https?:\/\/\S+$/i.test(task.location ?? "") ? task.location! : undefined;
  const goBack = once(async () => router.back()); // a second tap must not pop the screen below
  const more = () => [
    ...(editable && !task.fixed && !task.rrule && task.deadline === undefined ? [{ label: t("setDue"), icon: "hourglass" as const, onPress: defaultDue }] : []),
    ...(editable && !task.location && ed !== "place" ? [{ label: t("addPlace"), icon: "place" as const, onPress: () => setEd("place") }] : []),
    ...(editable && link && ed !== "place" ? [{ label: t("editPlace"), icon: "pencil" as const, onPress: () => setEd("place") }] : []),
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
        <Text style={{ fontFamily: ff("500"), fontSize: font.sub, color: th.muted }}>{t("clearDue")}</Text>
      </Tap>
    </EdLine>
  );

  const lines: React.ReactNode[] = [];
  if (task.fixed && task.start !== undefined) {
    if (ed === "time" && canTime) lines.push(timeLine);
    else lines.push(<Meta key="t" icon="clock" onPress={canTime ? openTime : undefined} text={task.end !== undefined && task.fixed !== "exam" ? t("toEnd", { t: at(task.start), e: startDay(task.end - 1) === startDay(task.start) ? hm(task.end) : at(task.end) }) : at(task.start)} />);
  } else {
    const late = task.deadline !== undefined && task.deadline < now ? "red" : undefined; // a due time is muted; red only once missed
    if (task.deadline !== undefined && task.source === "dlu" && !task.forId) lines.push(<Meta key="d" icon="hourglass" tone={late} text={t("dueAt", { t: at(task.deadline) })} />);
    if (editable && ed === "due" && dueLine) lines.push(dueLine);
    else if (hasDue) lines.push(<Meta key="d" icon="hourglass" tone={late} text={t("dueAt", { t: at(task.deadline!) })} onPress={openDue} />);
    // The time is always shown: a split task's next open sitting (its sittings listed under "Các buổi"), else "no free slot" (views.html "Detail, no free time").
    if (ed === "time" && canTime) lines.push(timeLine);
    else if (tt?.start !== undefined) lines.push(<Meta key="t" icon="clock" text={tt.rrule ? span : t("planAt", { t: span })} onPress={canTime ? openTime : undefined} />);
    else if (tt && !task.doneAt) lines.push(<Meta key="t" icon="clock" tone="red" text={t("noSlot")} onPress={canTime ? openTime : undefined} />);
  }
  // The repeat sits right under the time (views.html "Detail, repeating"); lectures have none, the timetable is the repeat.
  if (task.rrule && !task.section) lines.push(<Meta key="r" icon="repeat" text={repeatText(task.rrule, task.start ?? task.deadline ?? now)} />);
  // a link place opens on tap; the dots menu edits it
  if (link && ed !== "place") lines.push(<Meta key="l" icon="link" tone="link" text={host(link)} onPress={() => void Linking.openURL(link).catch(() => {})} />);
  else if (editable && (task.location || ed === "place")) lines.push(
    <EdLine key="l" icon="pin">
      <Field value={loc} rev={rev} onText={typeLoc} autoFocus={ed === "place"} onEndEditing={savePlace} returnKeyType="done" submitBehavior="blurAndSubmit" placeholder={t("placeHint")} placeholderTextColor={th.muted}
        selectionColor={th.seal} cursorColor={th.seal} accessibilityLabel={t("placeHint")} style={[s.loc, { color: th.ink }]} />
    </EdLine>,
  );
  else if (task.location && !editable) lines.push(<Meta key="l" icon="pin" text={task.location} />);
  if (task.fixed === "lecture" && task.teacher) lines.push(<Meta key="g" icon="person" text={t("teacherIs", { n: task.teacher })} />);
  if (task.course && !exam) lines.push(<Meta key="c" icon="book" tone="link" text={task.course} />); // .dmeta: ink, with the chevron
  if (exam) lines.push(<Meta key="e" icon="book" tone="link" text={exam.title} onPress={() => router.push(`/task/${exam.id}`)} />);
  const before = task.after?.[0] ? pool.find((y) => y.id === task.after![0] && !y.deletedAt) : undefined; // an order: this waits for that
  if (before) lines.push(<Meta key="a" icon="clock" tone="link" text={`Sau: ${before.title}`} onPress={() => router.push(`/task/${before.id}`)} />);
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
  // A bare phrase on this task ("mai 3h chiều 90 phút", "mỗi T3 T5"): patched, applied, Undo in place like the other edits here.
  const quickSay = async (text: string) => {
    if (!task) return;
    const p = patchOf(text, task, new Date());
    setAdded(undefined);
    if (p.clearRepeat && !task.rrule) return setQuickMsg(t("quickNotRepeat"));
    if (!p.edit && !p.reshape && !p.splitCount && !p.clearRepeat) return setQuickMsg(t("quickNone"));
    setQuickMsg(undefined);
    await saveFirst();
    try {
      if (p.edit) setAdded(await apply([p.edit]));
      if (p.reshape) setAdded(await reshapeSeries(task.id, p.reshape.from, p.reshape.rrule));
      if (p.splitCount) setAdded(await splitInto(task.parentId ?? task.id, p.splitCount));
      if (p.clearRepeat) setAdded(await clearRepeat(task.id));
    } catch { setQuickMsg(t("quickNotRepeat")); }
    void load();
  };
  // "Không cần ôn" on a prep (or one of its sittings): dropped for good with its open sittings, Undo on Home like the other deletes.
  const prepId = task.forId !== undefined && (task.parentId ?? task.id).startsWith("prep:") ? (task.parentId ?? task.id) : undefined;
  const skipPrepNow = once(async () => {
    await saveFirst();
    const r: Result = await dropPrep(prepId!);
    setFlash({ text: r.toast, r });
    router.back();
  });
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
            {mine && !task.fixed ? (
              <DropMenu chevron label={t("youKind", { k: kindLabel(task.kind) })} color={th.info} size={font.sub} icon={<State tone="info" text={t("youKind", { k: kindLabel(task.kind) })} after={<Icon name="down" size={18} color={th.info} />} />}
                items={KINDS.map((k) => ({ label: kindLabel(k), icon: k, onPress: () => { setTask((x) => x && { ...x, kind: k }); void apply([{ op: "edit", target: task.id, kind: k }]).then(load).catch(() => void load()); } }))} />
            ) : (
              <State tone="info" text={task.source === "dlu" && !task.forId ? (task.fixed ? t("fromCampus") : t("fromLms")) : mine && task.fixed === "busy" ? t("youKind", { k: t("fixedTime") }) : task.source !== "dlu" && task.forId ? t("youKind", { k: kindLabel(task.kind) }) : t("fromYou")} /* a prep: its kind shows, fixed to its exam */ />
            )}
          </View>
          <Field value={title} rev={rev} editable={editable} onText={typeTitle} selectionColor={th.seal} cursorColor={th.seal} onEndEditing={submitTitle} returnKeyType="done" submitBehavior="blurAndSubmit" multiline style={[s.h, { color: th.ink }]} />
          {noTitle && <Text accessibilityLiveRegion="polite" style={[s.hint, { color: th.seal }]}>{t("noTitleHint")}</Text>}
          <QuickBar onSay={quickSay} onMsg={setQuickMsg} />
          {quickMsg && <Text accessibilityLiveRegion="polite" style={[s.hint, { color: th.muted }]}>{quickMsg}</Text>}
          {lines.length > 0 && <View style={s.meta}>{lines}</View>}
          {/* magic.html 7d/7e: what the time just set did, in place: a clash with a class asks, the moves tell their story with Undo */}
          {told && (
              <View style={{ marginTop: 6 }}>
                {told.r.clashes?.map((c) => (
                  <View key={c.fixed.id} style={[s.warn, { borderColor: th.warn }]}>
                    <Text style={[s.wht, { color: th.warnInk }]}>{t("clash")}</Text>
                    <Text style={[s.wb, { color: th.muted }]}>{t("clashHere", { a: c.fixed.title })}</Text>
                    <View style={[s.pills, { marginTop: 12 }]}>
                      <Tap onPress={() => giveBack(c.mine.id)} style={[s.pill2, { backgroundColor: th.ink }]}><Text numberOfLines={1} style={[s.plt, { color: th.bg, fontFamily: ff("600") }]}>{t("overlapMine")}</Text></Tap>
                      <Tap onPress={() => keep(c)} style={[s.pill2, { borderColor: th.line, borderWidth: 1 }]}><Text numberOfLines={1} style={[s.plt, { color: th.ink }]}>{t("overlapKeep")}</Text></Tap>
                    </View>
                  </View>
                ))}
                {told.r.lost?.map((x) => <Text key={x.id} style={[s.wb, { color: th.warnInk, marginTop: 12 }]}>{bolded(t("lostSlot", { title: x.title }))}</Text>)}
                {toldMoves.length > 0 && <Story moves={toldMoves} now={now} onClose={seeTold} onUndo={undoTold} />}
              </View>
          )}
          {/* prep.html "Các buổi": every open, non-fixed, non-repeating task can take sittings; each open one has its own day, part and length. */}
          {(canSplit || sits.length > 1) && (
            <View style={s.sit}>
              <View>
                <SittingList sits={sits} me={me} canDrop={open.length >= 2} canAdd={canSplit}
                  onTime={setTime} onDrop={dropOne} onAdd={addOne} onSettle={settle} />
              </View>
            </View>
          )}
          {((still && sits.length < 2) || prepId) && (
            <View style={s.qbs}>
              {still && sits.length < 2 && <Tap onPress={addMore} accessibilityRole="button" accessibilityLabel={t("stillMore")} style={s.qb}><Icon name="plus" size={18} color={th.ink} /><Text style={[s.qbT, { color: th.ink }]}>{t("stillMore")}</Text></Tap>}
              {prepId && <Tap onPress={skipPrepNow} accessibilityRole="button" accessibilityLabel={t("prepSkip")} style={s.qb}><Icon name="skip" size={18} color={th.ink} /><Text style={[s.qbT, { color: th.ink }]}>{t("prepSkip")}</Text></Tap>}
            </View>
          )}
          {/* the undo note: green-tinted, its Hoàn tác a readable pill (v2.css .undorow) */}
          {added && (
            <View style={[s.undo, { backgroundColor: th.okT }]}>
              <Text style={[s.undoT, { color: th.ink }]}>{added.toast}</Text>
              <Tap onPress={undoMore} accessibilityRole="button" accessibilityLabel={t("undo")} style={[s.qb, { borderWidth: 0, backgroundColor: th.bg, flex: 0 }]}><Icon name="undo" size={18} color={th.ok} /><Text style={[s.qbT, { color: th.ok }]}>{t("undo")}</Text></Tap>
            </View>
          )}
          {!!task.content?.trim() && <Lms html={task.content} />}
          {(!!why?.length || notes.length > 0) && <WhyBlock items={why ?? []} notes={notes} alt={alt} start={task.start} now={now} onMove={moveTo} />}
          <Field value={note} rev={rev} editable={editable} onText={typing} selectionColor={th.seal} cursorColor={th.seal} onBlur={() => void saveNote()} multiline scrollEnabled={false} placeholder={t("addNote")} placeholderTextColor={th.muted}
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

/** .lab with its glyph: a quiet 300-weight tracked label, the icon in front. */
function Eyebrow({ icon, text }: { icon: "target" | "clock"; text: string }) {
  const th = useTheme();
  return (
    <View style={s.eye}>
      <Icon name={icon} size={18} color={th.muted} w={2} />
      <Text style={[s.lab, { color: th.muted }]}>{text}</Text>
    </View>
  );
}

/** "Vì sao lúc này" with weight bars, and the one other good time. */
const WhyBlock = memo(function WhyBlock({ items, notes, alt, start, now, onMove }: { items: ReturnType<typeof grounded>; notes: { text: string; n: number }[]; alt?: number; start?: number; now: number; onMove: (ts: number) => void }) {
  const th = useTheme();
  return (
    <>
      <View style={[s.whyb, { borderColor: th.line }]}>
        <Eyebrow icon="target" text={t("whyNow")} />
        {items.map((x, i) => (
          <View key={i} style={s.wr}>
            <Text style={[s.wt, { color: th.ink }]}>{reasonText(x, true)}</Text>
            <View style={[s.bar2, { backgroundColor: th.line }]}><View style={{ width: `${Math.min(1, Math.abs(x.w)) * 100}%`, height: 6, borderRadius: 6, backgroundColor: x.w < 0 ? th.warn : th.ink }} /></View>
          </View>
        ))}
        {/* every finding with its basis, shown as is: nothing folded away */}
        {notes.map((x) => (
          <View key={x.text} style={s.wr}>
            <Text style={[s.wt, { color: th.ink }]}>{x.text}</Text>
          </View>
        ))}
        {start !== undefined && (
          <Tap onPress={() => router.navigate({ pathname: "/", params: { view: "rhythm", h: String(new Date(start).getHours()), at: String(Date.now()) } })} accessibilityRole="link" style={{ marginTop: 8, alignSelf: "flex-start" }}>
            <Text style={{ fontSize: font.sub, lineHeight: 22, fontFamily: ff("500"), color: th.muted }}>{t("seeRhythm")}</Text>
          </Tap>
        )}
      </View>
      {alt !== undefined && (
        <View style={s.also}>
          <Eyebrow icon="clock" text={t("alsoFits")} />
          <Tap onPress={() => onMove(alt)} accessibilityLabel={`${t("alsoFits")} ${when(alt, now).split(" ").pop()}`} style={[s.qb, { borderColor: th.line }]}>
            <Text style={[s.qbT, { color: th.ink }]}>{when(alt, now).split(" ").pop()}</Text>
          </Tap>
        </View>
      )}
    </>
  );
});

const s = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "space-between" },
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  acts: { flexDirection: "row", gap: 8 },
  loc: { flex: 1, fontFamily: ff("500"), fontSize: font.meta, lineHeight: 22, minHeight: 48, padding: 0, textAlignVertical: "center" },
  who: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }, // .dtop chips row
  h: { marginTop: 12, fontSize: font.h, lineHeight: 40, minHeight: 40, maxHeight: 120, overflow: "hidden", fontFamily: fd("700"), letterSpacing: -1.05, padding: 0 }, // .dtitle: 30 on 40, at most three lines
  hint: { marginTop: 4, fontFamily: ff("500"), fontSize: font.sub },
  meta: { marginTop: 12, gap: 4 }, // .dmeta: 28pt lines, 4 apart
  lms: { marginTop: 12, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderRadius: 16 },
  lab: { fontSize: 13, lineHeight: 18, fontFamily: ff("400"), letterSpacing: 0.9 }, // .lab: a quiet tracked eyebrow
  eye: { flexDirection: "row", alignItems: "center", gap: 6 }, // .lab with its glyph
  sit: { marginTop: 18 }, // .sit: the sittings line under the meta
  qbs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }, // .qb pills in a row
  qb: { height: 42, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, // .qb: hairline pill
  qbT: { fontSize: 15, lineHeight: 20, fontFamily: ff("500") },
  undo: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, borderRadius: 20 }, // .undorow
  undoT: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21, fontFamily: ff("500") },
  whyb: { marginTop: 20, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1 }, // .whyb: a hairline card
  also: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, // .also: label and times in one row
  quick: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }, // .qbar
  quickIn: { flex: 1, minWidth: 0, height: 46, borderRadius: 23, borderWidth: 1, paddingHorizontal: 18, fontSize: font.sub, lineHeight: 22 },
  quickMic: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  wr: { marginTop: 6 },
  wt: { fontFamily: ff(), fontSize: font.meta, lineHeight: 22.4 }, // one regular sentence
  bar2: { marginTop: 10, height: 6, borderRadius: 6, overflow: "hidden" }, // .whyb .bar: thin
  pills: { flexDirection: "row", gap: 8, marginTop: 10 },
  warn: { marginTop: 16, padding: 14, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5 }, // day.tsx .warn
  wht: { fontSize: font.meta, fontFamily: ff("600") },
  wb: { marginTop: 4, fontFamily: ff(), fontSize: font.sub, lineHeight: 22 },
  pill2: { height: 48, paddingHorizontal: 16, borderRadius: 99, alignItems: "center", justifyContent: "center", flexShrink: 1, minWidth: 0 },
  plt: { fontSize: font.sub, fontFamily: ff("500") },
  pill: { height: 48, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  clr: { marginLeft: "auto", minHeight: 44, justifyContent: "center" },
  dash: { fontSize: font.sub, fontFamily: ff("500") },
  note: { marginTop: 14, fontFamily: ff(), fontSize: font.base, lineHeight: 24, minHeight: 200, textAlignVertical: "top", paddingVertical: 16, paddingHorizontal: 18, borderRadius: 22 }, // .notebox: a gray fill, no border
});

/** The one-line "Sửa nhanh" field under the title: typed, or said (tap the mic to listen, tap again to finish). */
function QuickBar({ onSay, onMsg }: { onSay(text: string): unknown; onMsg(msg: string): void }) {
  const th = useTheme();
  const [v, setV] = useState("");
  const [on, setOn] = useState(false);
  const rec = useRef<{ stop(): Promise<Heard> } | undefined>(undefined);
  useEffect(() => () => { void rec.current?.stop().catch(() => {}); }, []);
  const submit = () => { const x = v.trim(); if (!x) return; setV(""); void onSay(x); };
  const mic = async () => {
    const live = rec.current;
    if (live) {
      rec.current = undefined;
      setOn(false);
      try {
        const h = await live.stop();
        if (!h.text) return onMsg(t("heardNothing"));
        void onSay(h.text);
      } catch { onMsg(t("micFail")); }
      return;
    }
    if (!(await askMic())) return onMsg(t("mic"));
    try { rec.current = await listenLive({ onPartial: setV }); setOn(true); } catch { onMsg(t("micFail")); }
  };
  return (
    <View style={s.quick}>
      <TextInput value={v} onChangeText={setV} onSubmitEditing={submit} returnKeyType="done" placeholder={t("quickPh")} placeholderTextColor={th.muted}
        accessibilityLabel={t("quickPh")} style={[s.quickIn, { color: th.ink, borderColor: th.line, backgroundColor: th.bg, fontFamily: ff(v ? "500" : "400") }]} />
      <Tap onPress={mic} accessibilityRole="button" accessibilityLabel={on ? t("quickMicStop") : t("quickMic")} style={[s.quickMic, { backgroundColor: on ? th.seal : th.bg, borderColor: on ? th.seal : th.line }]}>
        <Icon name="mic" size={20} color={on ? th.bg : th.ink} />
      </Tap>
    </View>
  );
}

/** A text field that owns what is typed: the screen hears the text through `onText` (a ref write) and shows `value` again only when it changes or `rev` bumps. */
const Field = memo(function Field({ value, rev, onText, ...p }: Omit<ComponentProps<typeof TextInput>, "value" | "onChangeText"> & { value: string; rev: number; onText: (v: string) => void }) {
  const [v, setV] = useState(value), [seen, setSeen] = useState({ value, rev });
  if (seen.value !== value || seen.rev !== rev) { setSeen({ value, rev }); setV(value); } // the stored text changed under us: show it
  return <TextInput {...p} value={v} onChangeText={(x) => { setV(x); onText(x); }} />;
});
