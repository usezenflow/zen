// The import preview for a pasted or read list: groups as headers, leaves as checkable rows, one button to add them.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/art";
import { actionsOf, type Group, type Leaf } from "@/lib/nlu/reader/outline";
import { startOfDay } from "@/components/cal";
import { Row } from "@/components/row";
import { previewCreates } from "@/lib/apply";
import type { Kind, Task } from "@/lib/types";
import { ff, fd, useTheme } from "@/lib/theme";
import { day, hm } from "@/lib/when";

const dur = (m: number) => (m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} giờ ${m % 60}` : `${m / 60} giờ`) : `${m}p`);
const leavesOf = (gs: Group[]): Leaf[] => gs.flatMap((g) => [...g.items, ...leavesOf(g.groups ?? [])]);
// A leaf or a whole group out of the tree, wherever it sits.
const without = (gs: Group[], x: Leaf | Group): Group[] => gs.filter((g) => g !== x).map((g) => ({ ...g, items: g.items.filter((l) => l !== x), groups: g.groups && without(g.groups, x) }));
const tidy = (gs: Group[]): Group[] => gs.map((g) => ({ ...g, items: g.items.filter((l) => l.title.trim()), groups: g.groups && tidy(g.groups) }));

export function OutlinePreview({ groups, from, onSave, onClose }: { groups: Group[]; from: string; onSave: (gs: Group[]) => void; onClose: () => void }) {
  const th = useTheme(), insets = useSafeAreaInsets();
  // Edits mutate this copy; `redraw` shows them. The parent gets the copy on save.
  const [gs, setGs] = useState<Group[]>(() => JSON.parse(JSON.stringify(groups)));
  const [, redraw] = useState(0);
  const [now] = useState(() => Date.now());
  const [plan, setPlan] = useState<Map<string, Task>>(new Map());
  const remove = (x: Leaf | Group) => setGs((cur) => without(cur, x));
  const edit = (f: () => void) => { f(); redraw((n) => n + 1); };
  const all = leavesOf(gs);
  const open = all.filter((l) => !l.done); // actionsOf names the open leaves l1, l2 … in this order
  const acts = actionsOf(gs), key = JSON.stringify(acts);
  // every edit plans again, dry: nothing is written until Thêm
  useEffect(() => {
    let live = true;
    previewCreates(JSON.parse(key), now).then((m) => live && setPlan(m)).catch(() => {});
    return () => { live = false; };
  }, [key, now]);
  const doneN = all.filter((l) => l.done).length;
  const count = acts.filter((a) => a.ref?.startsWith("l")).length;
  const heading = gs.find((g) => g.title)?.title || "Danh sách";

  // The home list's own Row, each leaf as the task the planner would make of it: its start and end on the right, what else is known below.
  const fmt = (ms: number) => { const d = new Date(ms); return (d.getHours() === 23 && d.getMinutes() === 59) || ms === startOfDay(ms) ? day(ms, now) : `${day(ms, now)} ${hm(ms)}`; };
  const windowOf = (l: Leaf) => l.notBefore !== undefined && l.deadline !== undefined ? `Từ ${fmt(l.notBefore)} đến ${fmt(l.deadline)}` : l.notBefore !== undefined ? `Sau ${fmt(l.notBefore)}` : l.deadline !== undefined ? `Hạn ${fmt(l.deadline)}` : undefined;
  const row = (l: Leaf, i: number, step?: number) => {
    const planned = plan.get(`l${open.indexOf(l) + 1}`);
    const task: Task = planned ?? { id: `o${i}`, title: l.title, kind: (l.kind ?? "other") as Kind, source: "user", createdAt: now, effort: l.minutes ?? 30, ...(l.done ? { doneAt: now } : {}) };
    return (
      <Row
        key={l.title + i}
        task={{ ...task, title: l.title }}
        now={now}
        done={l.done}
        first={i === 0}
        lead={step !== undefined ? String(step) : undefined}
        sub={windowOf(l)}
        onToggle={() => edit(() => { l.done = !l.done; })}
        onTitle={(v) => edit(() => { l.title = v; })}
        onTime={(at) => edit(() => { l.start = at.getTime(); l.minutes ??= task.effort; })}
        onEnd={(at) => edit(() => { const st = l.start ?? task.start; if (st !== undefined && at.getTime() > st) { l.start = st; l.minutes = Math.round((at.getTime() - st) / 60_000); l.sized = "said"; } })}
        onDelete={() => remove(l)}
        onOpen={() => {}}
      />
    );
  };

  const block = (g: Group, gi: number): React.ReactNode => {
    let step = 0;
    const budget = g.budgetMin ?? g.items.reduce((x, l) => x + (l.done ? 0 : l.minutes ?? 0), 0);
    return (
      <View key={gi} style={s.grp}>
        {g.title !== "" && (
          <View style={s.gh}>
            <Text style={[s.gt, { color: th.ink }]} numberOfLines={1}>{g.title}</Text>
            {budget > 0 && <Text style={[s.gb, { color: th.muted }]}>{dur(budget)}</Text>}
            <Pressable onPress={() => remove(g)} accessibilityRole="button" accessibilityLabel={`Bỏ cả nhóm ${g.title}`} hitSlop={10}>
              <Text style={[s.gb, { color: th.muted }]}>Bỏ</Text>
            </Pressable>
          </View>
        )}
        {g.items.map((l, i) => row(l, i, g.ordered && !l.done ? ++step : undefined))}
        {g.groups?.map((x, j) => block(x, gi * 100 + j + 1))}
      </View>
    );
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: th.bg, zIndex: 10, paddingTop: insets.top + 12 }]}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" hitSlop={12} style={[s.back, { borderColor: th.line }]}>
        <Icon name="back" size={20} color={th.ink} />
      </Pressable>
      <Text style={[s.h, { color: th.ink }]} numberOfLines={1}>{heading}</Text>
      <Text style={[s.sub, { color: th.muted }]}>{`${all.length} việc, ${doneN} đã xong. Vuốt trái để bỏ việc bạn không cần.`}</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}>
        {gs.map(block)}
      </ScrollView>
      <Pressable
        onPress={() => onSave(tidy(gs))}
        disabled={!count}
        accessibilityRole="button"
        accessibilityLabel={`Thêm ${count} việc`}
        style={[s.btn, { backgroundColor: th.ink, bottom: insets.bottom + 24, opacity: count ? 1 : 0.4 }]}>
        <Icon name="plus" size={18} color={th.bg} w={2} />
        <Text style={[s.btnT, { color: th.bg }]}>{`Thêm ${count} việc`}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  back: { marginLeft: 24, width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  h: { fontFamily: fd("500"), fontSize: 30, marginTop: 18, marginHorizontal: 24 }, // ui.css .h: display 500, 30px
  sub: { fontFamily: ff("400"), fontSize: 17, marginTop: 6, marginHorizontal: 24, marginBottom: 8 },
  grp: { marginTop: 20 },
  gh: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  gt: { flex: 1, fontFamily: ff("500"), fontSize: 15 },
  gb: { fontFamily: ff("500"), fontSize: 15 },
  btn: { position: "absolute", left: 24, right: 24, height: 56, borderRadius: 99, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  btnT: { fontFamily: ff("600"), fontSize: 17 },
});
