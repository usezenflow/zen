import { useRef, useState, type ComponentRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Tap } from "@/components/tap";
import { day } from "@/lib/when";
import { font, ff, useTheme } from "@/lib/theme";
import { hhmm } from "./cal";
import { DateDrop, LenDrop, lenText, TimeDial, type Anchor, type Parts, type Preset } from "./dial";

/** A chip (views.html .pk) that drops its picker under itself; ringed while open. Same on iOS and Android: zen draws both pickers. */
function useChip(onClose?: () => void) {
  const box = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor>();
  const open = () => box.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  return { box, anchor, open, close: () => { setAnchor(undefined); onClose?.(); } }; // closing is the blur: the owner saves once
}

function Chip({ label, on, onPress, box }: { label: string; on: boolean; onPress: () => void; box: React.RefObject<ComponentRef<typeof View> | null> }) {
  const th = useTheme();
  return (
    <View ref={box} collapsable={false} style={s.fit}>
      <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[s.chip, { backgroundColor: th.chip, borderColor: on ? th.seal : "transparent" }]}>
        <Text style={[s.t, { color: th.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
      </Tap>
    </View>
  );
}

/** "17:00": drops zen's time dial, its right edge on the chip's. `due`: 23 also offers :59. `min`: nothing earlier on that day (an end: its start + 15). `past`: a manual edit, any time. */
export function TimeChip({ value, due, min, past, presets, onChange, onClose }: { value: number; due?: boolean; min?: number; past?: boolean; presets?: Preset[]; onChange: (d: Date) => void; onClose?: () => void }) {
  const c = useChip(onClose);
  return (
    <>
      <Chip label={hhmm(value)} on={!!c.anchor} onPress={c.open} box={c.box} />
      <TimeDial open={!!c.anchor} anchor={c.anchor} value={new Date(value)} due={due} min={min === undefined ? undefined : new Date(min)} past={past} presets={presets} onChange={onChange} onClose={c.close} />
    </>
  );
}

/** "T4 18/11": drops zen's calendar from the chip's left (a start) or right (an end) edge. `min`: days before it greyed out. `past`: days gone too. */
export function DateChip({ value, label, min, past, parts, side = "left", onChange, onClose }: { value: number; label?: string; min?: number; past?: boolean; parts?: Parts; side?: "left" | "right"; onChange: (d: Date) => void; onClose?: () => void }) {
  const c = useChip(onClose);
  return (
    <>
      <Chip label={label ?? day(value, 0)} on={!!c.anchor} onPress={c.open} box={c.box} />
      <DateDrop open={!!c.anchor} anchor={c.anchor} value={new Date(value)} min={min !== undefined ? new Date(min) : undefined} past={past} parts={parts && { on: parts.on, onPick: (i) => { parts.onPick(i); c.close(); } }} side={side} onChange={onChange} onClose={c.close} />
    </>
  );
}

/** "45p": a sitting's length, a drum of minutes under the chip. */
export function LenChip({ value, onChange, onClose }: { value: number; onChange: (m: number) => void; onClose?: () => void }) {
  const c = useChip(onClose);
  return (
    <>
      <Chip label={lenText(value)} on={!!c.anchor} onPress={c.open} box={c.box} />
      <LenDrop open={!!c.anchor} anchor={c.anchor} value={value} onChange={onChange} onClose={c.close} />
    </>
  );
}

const s = StyleSheet.create({
  fit: { flexShrink: 1, minWidth: 0 },
  chip: { height: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  t: { fontFamily: ff("600"), fontSize: font.sub, fontVariant: ["tabular-nums"] },
});
