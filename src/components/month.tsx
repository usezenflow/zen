import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Tap } from "@/components/tap";
import type { Box } from "@/components/outside";
import { Stripes, Swipe } from "@/components/week";
import { addDays, holLines, monthGrid, onDay, short, startOfDay, type Hols } from "@/components/cal";
import { useTheme, font, ff } from "@/lib/theme";
import type { Task } from "@/lib/types";
import { typeOf } from "@/planner";

export function Month({ tasks, hols, selected, anchor = selected, now, onSelect, onStep, gridRef, hover }: {
  tasks: Task[]; hols: Hols; selected: number; now: number; onSelect: (day: number) => void; onStep: (d: -1 | 1) => void;
  /** anchor: the month shown, when a drag pages past the selected day's; gridRef: the day cells, measured for a drop; hover: the day under a dragged row */
  anchor?: number; gridRef?: React.Ref<Box>; hover?: number;
}) {
  const th = useTheme();
  const today = startOfDay(now);
  const { first, start, rows } = monthGrid(anchor);
  const month = new Date(first).getMonth();
  // The dots per cell, once per tasks and month, not 42 scans per render.
  const dots = useMemo(() => new Map(Array.from({ length: rows * 7 }, (_, i) => { const d = addDays(start, i); return [d, [...new Set(onDay(tasks, d).map(typeOf))].slice(0, 3)] as const; })), [tasks, start, rows]);
  return (
    <Swipe onStep={onStep} stepKey={first}>
      <View style={s.mo}>
        {short.map((d, i) => <Text key={i} style={[s.w, { color: th.muted }]}>{d}</Text>)}
      </View>
      <View ref={gridRef} collapsable={false} style={s.cells}>
        {Array.from({ length: rows * 7 }, (_, i) => {
          const day = addDays(start, i);
          const out = new Date(day).getMonth() !== month;
          const hol = hols.get(day);
          const types = dots.get(day) ?? [];
          const isToday = day === today, on = day === hover;
          return (
            <Tap key={day} style={s.d} scale={0.9} onPress={() => onSelect(day)}>
              <View style={[s.n, isToday && { backgroundColor: th.ink }, day === selected && !isToday && { borderWidth: 1.5, borderColor: th.ink }, on && { backgroundColor: th.seal, transform: [{ scale: 1.12 }] }]}>
                {!!hol && !isToday && !on && <Stripes color={th.line} gap={5} />}
                <Text style={{ fontSize: font.md, fontFamily: ff(isToday || on ? "600" : "500"), color: isToday || on ? th.bg : out ? th.muted : th.ink, opacity: out && !on ? 0.45 : 1 }}>{new Date(day).getDate()}</Text>
              </View>
              {hol ? <Text numberOfLines={1} style={[s.hl, { color: th.muted }]}>{holLines(hol)[0]}</Text> : (
                <View style={s.ds}>{types.map((ty) => <View key={ty} style={[s.dot, { backgroundImage: `linear-gradient(135deg, ${th.art[ty].a}, ${th.art[ty].b} 55%, ${th.art[ty].c})` }]} />)}</View>
              )}
            </Tap>
          );
        })}
      </View>
    </Swipe>
  );
}

const s = StyleSheet.create({
  mo: { flexDirection: "row", marginTop: 20, marginBottom: 6 }, // ui.css .mo: the weekday letters, then the day cells 6px under them
  cells: { flexDirection: "row", flexWrap: "wrap", rowGap: 6 },
  w: { width: "14.2857%", textAlign: "center", fontSize: 13, fontFamily: ff("500"), letterSpacing: 1.3, paddingBottom: 6 },
  d: { width: "14.2857%", alignItems: "center", gap: 4 },
  n: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  ds: { flexDirection: "row", gap: 3, height: 8 }, // 8px so the three-colour gradient reads (the mockup's 5px shows one colour)
  dot: { width: 8, height: 8, borderRadius: 4 },
  hl: { fontSize: 8, fontFamily: ff("600"), lineHeight: 11, height: 11, overflow: "visible", marginTop: -4.5, marginBottom: 1.5, maxWidth: "100%" }, // 11px line so the accent of "Lễ" is not clipped; net 8px like .ds
});
