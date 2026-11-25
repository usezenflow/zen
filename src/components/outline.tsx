// The import preview for a pasted or read list: groups as headers, leaves as checkable rows, one button to add them.
import { useState } from "react";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/art";
import { actionsOf, type Group, type Leaf } from "@/lib/nlu/reader/outline";
import { KIND_VI } from "@/lib/reasons";
import { ff, useTheme } from "@/lib/theme";
import { when } from "@/lib/when";

const dur = (m: number) => (m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} giờ ${m % 60}` : `${m / 60} giờ`) : `${m} phút`);
const leavesOf = (gs: Group[]): Leaf[] => gs.flatMap((g) => [...g.items, ...leavesOf(g.groups ?? [])]);
const KIND = KIND_VI as Record<string, string | undefined>;
// A leaf or a whole group out of the tree, wherever it sits.
const without = (gs: Group[], x: Leaf | Group): Group[] => gs.filter((g) => g !== x).map((g) => ({ ...g, items: g.items.filter((l) => l !== x), groups: g.groups && without(g.groups, x) }));
const tidy = (gs: Group[]): Group[] => gs.map((g) => ({ ...g, items: g.items.filter((l) => l.title.trim()), groups: g.groups && tidy(g.groups) }));

export function OutlinePreview({ groups, from, onSave, onClose }: { groups: Group[]; from: string; onSave: (gs: Group[]) => void; onClose: () => void }) {
  const th = useTheme(), insets = useSafeAreaInsets();
  // Edits mutate this copy; `redraw` shows them. The parent gets the copy on save.
  const [gs, setGs] = useState<Group[]>(() => JSON.parse(JSON.stringify(groups)));
  const [, redraw] = useState(0);
  const [now] = useState(() => Date.now());
  const [editing, setEditing] = useState<Leaf>();
  const remove = (x: Leaf | Group) => setGs((cur) => without(cur, x));
  const edit = (f: () => void) => { f(); redraw((n) => n + 1); };
  const all = leavesOf(gs);
  const doneN = all.filter((l) => l.done).length;
  const count = actionsOf(gs).filter((a) => a.ref?.startsWith("l")).length;
  const heading = gs.find((g) => g.title)?.title || "Danh sách";

  const row = (l: Leaf, i: number, step?: number) => {
    // under the title, like the home list: the length, what it is; on the right, when it is due
    const sub = [l.minutes !== undefined ? dur(l.minutes) : undefined, l.kind ? KIND[l.kind] : undefined].filter(Boolean).join(" · ");
    return (
      <ReanimatedSwipeable
        key={l.title + i}
        overshootRight={false}
        onSwipeableOpen={() => remove(l)}
        renderRightActions={() => (
          <View style={[s.del, { backgroundColor: th.seal }]}><Text style={[s.delT, { color: th.bg }]}>Bỏ</Text></View>
        )}>
        <View
          accessibilityActions={[{ name: "delete", label: "Bỏ việc này" }]}
          onAccessibilityAction={() => remove(l)}
          style={[s.lf, { backgroundColor: th.bg }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.line }]}>
          <Pressable
            onPress={() => edit(() => { l.done = !l.done; })}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!l.done }}
            accessibilityLabel={`Đã xong: ${l.title}`}
            hitSlop={8}
            style={[s.ck, { borderColor: th.muted }, l.done && { backgroundColor: th.muted }]}>
            {l.done && <Icon name="check" size={14} color={th.bg} w={2.4} />}
          </Pressable>
          {step !== undefined && <Text style={[s.step, { color: th.muted }]}>{step}</Text>}
          <View style={s.mid}>
            {editing === l ? (
              <TextInput
                autoFocus
                value={l.title}
                onChangeText={(v) => edit(() => { l.title = v; })}
                onBlur={() => setEditing(undefined)}
                accessibilityLabel={`Tên việc: ${l.title}`}
                style={[s.n, { color: th.ink }]}
              />
            ) : (
              <Text onPress={() => setEditing(l)} numberOfLines={1} ellipsizeMode="tail" accessibilityLabel={`Tên việc: ${l.title}`} style={[s.n, { color: l.done ? th.muted : th.ink }, l.done && s.strike]}>{l.title}</Text>
            )}
            {!!sub && <Text numberOfLines={1} style={[s.sb, { color: th.muted }]}>{sub}</Text>}
          </View>
          {l.deadline !== undefined && <Text numberOfLines={1} style={[s.m, { color: th.muted }]}>{when(l.deadline, now)}</Text>}
        </View>
      </ReanimatedSwipeable>
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
              <Text style={[s.gb, { color: th.seal }]}>Bỏ</Text>
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
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" hitSlop={12} style={s.back}>
        <Icon name="back" size={20} color={th.ink} />
      </Pressable>
      <Text style={[s.h, { color: th.ink }]} numberOfLines={1}>{heading}</Text>
      <Text style={[s.sub, { color: th.muted }]}>{`Từ ${from}, ${all.length} việc, ${doneN} đã xong`}</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}>
        {gs.map(block)}
      </ScrollView>
      <Pressable
        onPress={() => onSave(tidy(gs))}
        disabled={!count}
        accessibilityRole="button"
        accessibilityLabel={`Thêm ${count} việc`}
        style={[s.btn, { backgroundColor: th.ink, bottom: insets.bottom + 24, opacity: count ? 1 : 0.4 }]}>
        <Text style={[s.btnT, { color: th.bg }]}>{`Thêm ${count} việc`}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  back: { marginLeft: 24, width: 36, height: 36, justifyContent: "center" },
  h: { fontFamily: ff("700"), fontSize: 26, marginTop: 18, marginHorizontal: 24 },
  sub: { fontFamily: ff("400"), fontSize: 16, marginTop: 4, marginHorizontal: 24, marginBottom: 8 },
  grp: { marginTop: 20 },
  gh: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  gt: { flex: 1, fontFamily: ff("600"), fontSize: 15 },
  gb: { fontFamily: ff("500"), fontSize: 15 },
  lf: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  ck: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  step: { fontFamily: ff("500"), fontSize: 14, minWidth: 14, textAlign: "center" },
  mid: { flex: 1, minWidth: 0 },
  n: { fontFamily: ff("400"), fontSize: 16, paddingVertical: 0 },
  sb: { fontFamily: ff("400"), fontSize: 13, marginTop: 2 },
  del: { width: 88, alignItems: "center", justifyContent: "center" },
  delT: { fontFamily: ff("600"), fontSize: 15 },
  strike: { textDecorationLine: "line-through" },
  m: { fontFamily: ff("500"), fontSize: 14, maxWidth: 120, fontVariant: ["tabular-nums"] },
  btn: { position: "absolute", left: 24, right: 24, height: 56, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  btnT: { fontFamily: ff("600"), fontSize: 17 },
});
