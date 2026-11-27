import { memo, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Icon } from "@/components/art";
import { Chevron } from "@/components/day";
import { hhmm } from "@/components/cal";
import { DateChip, TimeChip } from "@/components/pick";
import { Tap } from "@/components/tap";
import { t } from "@/lib/i18n";
import { font, ff, useTheme } from "@/lib/theme";
import { day, endAt } from "@/lib/when";
import type { Task } from "@/lib/types";

const nextQuarter = () => Math.ceil(Date.now() / 900_000) * 900_000;
const sameDay = (ts: number, d: Date) => { const n = new Date(ts); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); return n.getTime(); };

/** "Các buổi" (views.html .si): a summary line "{done}/{total} buổi" with one-tap "Làm thêm" / "Xong buổi này"; tapping the line opens every sitting. Each chip drops its picker; closing it saves once. A done one keeps its place, struck. */
export const SittingList = memo(function SittingList({ sits, me, canDrop, canAdd, onTime, onDrop, onAdd, onSettle }: {
  sits: Task[]; me?: string; canDrop: boolean; canAdd: boolean;
  onTime: (id: string, s: number, m: number) => void; onDrop: (id: string) => void; onAdd: () => void; onSettle: () => void;
}) {
  const th = useTheme();
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  const narrow = width < 360; // a 320dp phone: the two pills keep their words, not their icons
  const add = canAdd ? (
    <Tap onPress={onAdd} accessibilityRole="button" accessibilityLabel={t("addSit")} style={[s.add, { borderColor: th.line }]}>
      <Icon name="plus" size={20} color={th.ink} w={2} />
      <Text style={[s.addT, { color: th.ink }]}>{t("addSit")}</Text>
    </Tap>
  ) : null;
  if (sits.length <= 1) return <View>{add}</View>; // a lone sitting is the task itself: no "Buổi 1/1" row, only the add button
  const done = sits.filter((k) => !!k.doneAt).length, left = sits.length - done;
  const lastOpen = sits.filter((k) => !k.doneAt).pop();
  const pill = { borderColor: th.line };
  return (
    <View>
      {/* line 1: the count alone; line 2: the two pills as an equal pair; "Bỏ qua phần ôn" comes below in the task screen */}
      <View style={s.sum}>
        <Tap onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={t("sitSum", { done, total: sits.length, left })} accessibilityState={{ expanded: open }} style={s.sumT}>
          <Text style={[s.sumTxt, { color: th.ink }]} numberOfLines={1}>{t("sitSum", { done, total: sits.length, left })}</Text>
          <Chevron open={open} size={16} color={th.muted} />
        </Tap>
      </View>
      {/* the instances sit right under the header; the two buttons come after them, always shown */}
      {open && (
        <View style={s.list}>
          {sits.map((k) => (
            <SittingRow key={k.id} k={k} canDrop={canDrop} onTime={onTime} onDrop={onDrop} onSettle={onSettle} />
          ))}
        </View>
      )}
      {(canAdd || (canDrop && lastOpen)) && (
        <View style={[s.pair, { marginTop: 14, marginBottom: 12 }]}>
          {canAdd && <Tap onPress={onAdd} accessibilityRole="button" accessibilityLabel={t("sitMore")} style={[s.pl, s.half, pill]}>{!narrow && <Icon name="plus" size={18} color={th.ink} />}<Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[s.plT, { color: th.ink }]}>{t("sitMore")}</Text></Tap>}
          {canDrop && lastOpen && <Tap onPress={() => onDrop(lastOpen.id)} accessibilityRole="button" accessibilityLabel={t("enoughT")} style={[s.pl, s.half, { backgroundColor: th.ink, borderWidth: 0 }]}>{!narrow && <Icon name="check" size={18} color={th.bg} />}<Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[s.plT, { color: th.bg }]}>{t("enoughT")}</Text></Tap>}
        </View>
      )}
    </View>
  );
});

const LENS = [15, 30, 45, 60, 90, 120]; // the end chip's presets, as in the detail's time line
const clock = (base: number, d: Date) => { const n = new Date(base); n.setHours(d.getHours(), d.getMinutes(), 0, 0); return n.getTime(); };

// The same chips as the detail's time line: day, start - end. Each drops its picker; closing one saves once.
const SittingRow = memo(function SittingRow({ k, canDrop, onTime, onDrop, onSettle }: {
  k: Task; canDrop: boolean;
  onTime: (id: string, s: number, m: number) => void; onDrop: (id: string) => void; onSettle: () => void;
}) {
  const th = useTheme();
  const done = !!k.doneAt;
  const placed = k.start !== undefined;
  const start = k.start ?? nextQuarter();
  const len = placed && k.end !== undefined ? Math.max(15, Math.round((k.end - k.start!) / 60_000)) : k.effort || 30;
  const end = start + len * 60_000;
  const DW = 84, TW = 64; // one grid for every row: date, start, dash, end line up whatever the label
  if (done || !placed) {
    const m = { color: th.muted, textDecorationLine: done ? "line-through" as const : "none" as const, textAlign: "center" as const };
    return (
      <View style={s.si}>
        {placed ? (
          <>
            <Text style={[s.cell, m, { width: DW }]} numberOfLines={1}>{day(start, 0)}</Text>
            <Text style={[s.cell, m, { width: TW }]}>{hhmm(start)}</Text>
            <Text style={[s.dash, { color: th.muted, width: 10, textAlign: "center" }]}>-</Text>
            <Text style={[s.cell, m, { width: TW }]}>{hhmm(end)}</Text>
          </>
        ) : <Text style={[s.cell, m, { flex: 1, textAlign: "left" }]}>{t("sitNoTime")}</Text>}
        <View style={s.p} />
        {!done && canDrop ? <Drop id={k.id} onDrop={onDrop} /> : <View style={s.x} />}
      </View>
    );
  }
  return (
    <View style={s.si}>
      <DateChip width={DW} value={start} past side="left" onChange={(d) => onTime(k.id, sameDay(start, d), len)} onClose={onSettle} />
      <TimeChip width={TW} value={start} past onChange={(d) => onTime(k.id, clock(start, d), len)} onClose={onSettle} />
      <Text style={[s.dash, { color: th.muted, width: 10, textAlign: "center" }]}>-</Text>
      <TimeChip width={TW} value={end} past onChange={(d) => onTime(k.id, start, Math.max(15, Math.round((endAt(start, end, d) - start) / 60_000)))} onClose={onSettle}
        presets={LENS.map((m) => ({ label: hhmm(start + m * 60_000), at: new Date(start + m * 60_000), on: m === len }))} />
      <View style={s.p} />
      {canDrop ? <Drop id={k.id} onDrop={onDrop} /> : <View style={s.x} />}
    </View>
  );
});

function Drop({ id, onDrop }: { id: string; onDrop: (id: string) => void }) {
  const th = useTheme();
  return (
    <Tap onPress={() => onDrop(id)} accessibilityRole="button" accessibilityLabel={t("dropSit")} style={s.x}>
      <Icon name="x" size={20} color={th.muted} w={2} />
    </Tap>
  );
}

const s = StyleSheet.create({
  sum: { gap: 8 },
  sumT: { minHeight: 28, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6 },
  list: { marginTop: 12, gap: 10 },
  pair: { flexDirection: "row", gap: 8 },
  half: { flex: 1, minWidth: 0, paddingHorizontal: 10, gap: 4 },
  sumTxt: { fontSize: font.sub, lineHeight: 22, fontFamily: ff("500"), fontVariant: ["tabular-nums"] }, // .sit .n: regular
  pl: { height: 42, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, // .qb
  plT: { fontSize: 15, lineHeight: 20, fontFamily: ff("500") },
  si: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 48 },
  cell: { fontSize: font.sub, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  dash: { fontSize: font.sub, fontFamily: ff("500") },
  p: { flex: 1, minWidth: 0, fontSize: font.sub, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  x: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  add: { marginTop: 8, height: 42, borderRadius: 99, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 16 },
  addT: { fontSize: 15, lineHeight: 20, fontFamily: ff("500") },
});
