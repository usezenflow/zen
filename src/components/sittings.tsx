import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/art";
import { weekday } from "@/components/cal";
import { DateChip, LenChip } from "@/components/pick";
import { Tap } from "@/components/tap";
import { PARTS, PART_HOUR, partOf } from "@/components/when";
import { font, ff, useTheme } from "@/lib/theme";
import type { Task } from "@/lib/types";

const nextQuarter = () => Math.ceil(Date.now() / 900_000) * 900_000;
const withHour = (ts: number, h: number) => { const d = new Date(ts); d.setHours(h, 0, 0, 0); return d.getTime(); };
const sameDay = (ts: number, d: Date) => { const n = new Date(ts); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); return n.getTime(); };

/** "Các buổi" (views.html .si): "Buổi 2/3", a day-and-part chip, a length chip, x. Each chip drops its picker; closing it saves once. A done one keeps its place, struck. */
export const SittingList = memo(function SittingList({ sits, me, canDrop, canAdd, onTime, onDrop, onAdd, onSettle }: {
  sits: Task[]; me?: string; canDrop: boolean; canAdd: boolean;
  onTime: (id: string, s: number, m: number) => void; onDrop: (id: string) => void; onAdd: () => void; onSettle: () => void;
}) {
  const th = useTheme();
  return (
    <View>
      {sits.map((k, i) => (
        <SittingRow key={k.id} k={k} i={i} n={sits.length} on={k.id === me} canDrop={canDrop} onTime={onTime} onDrop={onDrop} onSettle={onSettle} />
      ))}
      {canAdd && (
        <Tap onPress={onAdd} accessibilityRole="button" accessibilityLabel="Thêm buổi" style={[s.add, { borderColor: th.line }]}>
          <Icon name="plus" size={20} color={th.ink} w={2.2} />
          <Text style={[s.addT, { color: th.ink }]}>Thêm buổi</Text>
        </Tap>
      )}
    </View>
  );
});

const SittingRow = memo(function SittingRow({ k, i, n, on, canDrop, onTime, onDrop, onSettle }: {
  k: Task; i: number; n: number; on: boolean; canDrop: boolean;
  onTime: (id: string, s: number, m: number) => void; onDrop: (id: string) => void; onSettle: () => void;
}) {
  const th = useTheme();
  const done = !!k.doneAt;
  const placed = k.start !== undefined;
  const start = k.start ?? nextQuarter();
  const len = placed && k.end !== undefined ? Math.max(15, Math.round((k.end - k.start!) / 60_000)) : k.effort || 30;
  const part = PARTS[partOf(start)].toLowerCase();
  const no = <Text style={[s.d, { color: on && !done ? th.ink : th.muted, fontFamily: ff(on && !done ? "600" : "500") }]}>{`Buổi ${i + 1}/${n}`}</Text>;
  if (done || !placed) {
    return (
      <View style={s.si}>
        {no}
        <Text style={[s.p, { color: th.muted, textDecorationLine: done ? "line-through" : "none" }]} numberOfLines={1}>{placed ? `${weekday(start)} ${part} · ${len}p` : "chưa có giờ"}</Text>
        {!done && canDrop && <Drop id={k.id} onDrop={onDrop} />}
        {(done || !canDrop) && <View style={s.x} />}
      </View>
    );
  }
  return (
    <View style={s.si}>
      {no}
      <DateChip value={start} label={`${weekday(start)} ${part}`} side="left" onChange={(d) => onTime(k.id, sameDay(start, d), len)} onClose={onSettle}
        parts={{ on: partOf(start), onPick: (p) => onTime(k.id, withHour(start, PART_HOUR[p]), len) }} />
      <LenChip value={len} onChange={(m) => onTime(k.id, start, m)} onClose={onSettle} />
      <View style={s.p} />
      {canDrop ? <Drop id={k.id} onDrop={onDrop} /> : <View style={s.x} />}
    </View>
  );
});

function Drop({ id, onDrop }: { id: string; onDrop: (id: string) => void }) {
  const th = useTheme();
  return (
    <Tap onPress={() => onDrop(id)} accessibilityRole="button" accessibilityLabel="Bỏ buổi này" style={s.x}>
      <Icon name="x" size={20} color={th.muted} w={2} />
    </Tap>
  );
}

const s = StyleSheet.create({
  si: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56 },
  d: { width: 66, fontSize: font.sub, fontVariant: ["tabular-nums"] },
  p: { flex: 1, minWidth: 0, fontSize: font.sub, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  x: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  add: { marginTop: 10, height: 48, borderRadius: 99, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  addT: { fontSize: font.sub, fontFamily: ff("600") },
});
