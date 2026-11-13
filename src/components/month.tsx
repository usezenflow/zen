import { StyleSheet, Text, View } from "react-native";
import { Tap } from "@/components/tap";
import { Stripes, Swipe } from "@/components/week";
import { addDays, holLines, mondayOf, onDay, short, startOfDay, type Hols } from "@/components/cal";
import { useTheme, font, ff } from "@/lib/theme";
import type { Task } from "@/lib/types";
import { typeOf } from "@/planner";

export function Month({ tasks, hols, selected, now, onSelect, onStep }: { tasks: Task[]; hols: Hols; selected: number; now: number; onSelect: (day: number) => void; onStep: (d: -1 | 1) => void }) {
  const th = useTheme();
  const today = startOfDay(now);
  const first = new Date(selected); first.setDate(1);
  const start = mondayOf(first.getTime());
  const month = first.getMonth();
  const rows = Math.ceil(((first.getDay() + 6) % 7 + new Date(first.getFullYear(), month + 1, 0).getDate()) / 7);
  return (
    <Swipe onStep={onStep} stepKey={first.getTime()}>
      <View style={s.mo}>
        {short.map((d, i) => <Text key={i} style={[s.w, { color: th.muted }]}>{d}</Text>)}
        {Array.from({ length: rows * 7 }, (_, i) => {
          const day = addDays(start, i);
          const out = new Date(day).getMonth() !== month;
          const hol = hols.get(day);
          const types = [...new Set(onDay(tasks, day).map(typeOf))].slice(0, 3);
          const isToday = day === today;
          return (
            <Tap key={day} style={s.d} scale={0.9} onPress={() => onSelect(day)}>
              <View style={[s.n, isToday && { backgroundColor: th.ink }, day === selected && !isToday && { borderWidth: 1.5, borderColor: th.ink }]}>
                {!!hol && !isToday && <Stripes color={th.line} gap={5} />}
                <Text style={{ fontSize: 18, fontFamily: ff(isToday ? "800" : "600"), color: isToday ? th.bg : th.ink, opacity: out ? 0.45 : 1 }}>{new Date(day).getDate()}</Text>
              </View>
              {hol ? <Text numberOfLines={1} style={[s.hl, { color: th.muted }]}>{holLines(hol)[0]}</Text> : (
                <View style={s.ds}>{(out ? [] : types).map((ty) => <View key={ty} style={[s.dot, { backgroundColor: th.dot[ty] }]} />)}</View>
              )}
            </Tap>
          );
        })}
      </View>
    </Swipe>
  );
}

const s = StyleSheet.create({
  mo: { flexDirection: "row", flexWrap: "wrap", rowGap: 6, marginTop: 24 },
  w: { width: "14.2857%", textAlign: "center", fontSize: 13, fontFamily: ff("600"), letterSpacing: 1, paddingBottom: 6 },
  d: { width: "14.2857%", alignItems: "center", gap: 4 },
  n: { width: 40, height: 40, borderRadius: 20, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  ds: { flexDirection: "row", gap: 2, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  hl: { fontSize: 10, fontFamily: ff("700"), lineHeight: 11, maxWidth: "100%" },
});
