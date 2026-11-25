// Inside Nhịp (mockups/calm.html "Day slider", "Lá số", "What goes together"): what the outcomes show, never a habit claim.
// Bars and cells come from planner/atlas.ts; marks and clauses from planner/mine.ts, so a dot is only where a finding passes its gate.
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Tap } from "@/components/tap";
import { t } from "@/lib/i18n";
import { KIND_SHORT, KIND_VI } from "@/lib/reasons";
import { useTheme, font, ff } from "@/lib/theme";
import type { Kind } from "@/lib/types";
import { contextCorr, hourView, lasoGrid, type Cell } from "@/planner/atlas";
import { I_AFTER } from "@/planner/features";
import { KINDS } from "@/planner/linucb";
import { clause, mine as mineFindings, type Finding } from "@/planner/mine";
import type { Model } from "@/planner/model";

const PARTS = ["Sáng", "Trưa", "Chiều", "Tối"];
const SCALE = 0.5; // a reward change of 0.5 fills half the axis
const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const ctxLabel = (f: number) => f === 1 ? t("ctxWeekend") : f === 2 ? t("ctxBusy") : f === 3 ? t("ctxDue") : t("ctxAfter", { kind: KIND_VI[KINDS[f - I_AFTER]] });
const ctxShort = (f: number) => f === 1 ? "Cuối tuần" : f === 2 ? "Dày lịch" : f === 3 ? "Gần hạn" : `Sau ${KIND_SHORT[KINDS[f - I_AFTER]].toLowerCase()}`;

/** The kindPart finding that favours this kind in this part, if one passes the miner's gate. */
const favours = (fs: Finding[], k: Kind, part: number) => fs.find((f) => f.type === "kindPart" && f.feature === 4 + KINDS.indexOf(k) && ((f.armP === part && f.direction === 1) || (f.armQ === part && f.direction === -1)));

function Seg({ items, on, onPick }: { items: string[]; on: number; onPick: (i: number) => void }) {
  const th = useTheme();
  return (
    <View style={s.seg}>
      {items.map((x, i) => (
        <Tap key={x} onPress={() => onPick(i)} accessibilityRole="tab" accessibilityState={{ selected: i === on }}
          style={[s.segI, i === on ? { backgroundColor: th.ink, borderColor: th.ink } : { borderColor: th.line }]}>
          <Text style={[s.segT, { color: i === on ? th.bg : th.ink }]}>{x}</Text>
        </Tap>
      ))}
    </View>
  );
}

/** 0h to 23h: drag or tap the track. The hour is set on the JS side only when it changes. */
function Slider({ hour, onHour }: { hour: number; onHour: (h: number) => void }) {
  const th = useTheme();
  const w = useSharedValue(1), last = useSharedValue(hour);
  const pick = (x: number) => { "worklet"; const h = Math.round(Math.max(0, Math.min(1, x / w.get())) * 23); if (h !== last.get()) { last.set(h); scheduleOnRN(onHour, h); } };
  const pan = usePanGesture({ minDistance: 0, onBegin: (e) => { "worklet"; pick(e.x); }, onUpdate: (e) => { "worklet"; pick(e.x); } });
  return (
    <View style={s.sl}>
      <GestureDetector gesture={pan}>
        <View style={s.hit} onLayout={(e) => w.set(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable" accessibilityLabel={t("atlasHour", { h: hour })}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(e) => onHour(clamp(hour + (e.nativeEvent.actionName === "increment" ? 1 : -1), 0, 23))}>
          <View style={[s.track, { backgroundColor: th.line }]} />
          <View style={[s.thumb, { left: `${(hour / 23) * 100}%`, backgroundColor: th.ink }]} />
        </View>
      </GestureDetector>
      <View style={s.ticks}>{["0h", "6h", "12h", "18h", "23h"].map((x) => <Text key={x} style={[s.tick, { color: th.muted }]}>{x}</Text>)}</View>
    </View>
  );
}

/** One kind's bar from the centre: right goes well, left goes badly; the thin line is the uncertainty; dashed when too little data. */
function Bar({ label, c }: { label: string; c: Cell }) {
  const th = useTheme();
  const v = clamp(c.mu / SCALE), e = clamp(c.se / SCALE, 0, 1);
  return (
    <View style={s.kb}>
      <Text style={[s.kbL, { color: th.ink }]} numberOfLines={1}>{label}</Text>
      <View style={s.ax}>
        <View style={[s.mid, { backgroundColor: th.line }]} />
        {!c.enough ? <View style={[s.bar, s.thin, { left: "42%", width: "16%", borderColor: th.muted }]} /> : <>
          <View style={[s.bar, v < 0 ? { right: "50%", width: `${-v * 50}%`, backgroundColor: th.seal } : { left: "50%", width: `${v * 50}%`, backgroundColor: th.ink }]} />
          <View style={[s.wh, { left: `${clamp(50 + (v - e) * 50, 0, 100)}%`, width: `${Math.min(100, e * 100)}%`, backgroundColor: th.muted }]} />
        </>}
      </View>
    </View>
  );
}

function DayTab({ m, hour, onHour }: { m: Model; hour: number; onHour: (h: number) => void }) {
  const th = useTheme();
  const v = useMemo(() => hourView(m, hour), [m, hour]);
  return (
    <View>
      <Slider hour={hour} onHour={onHour} />
      <Text style={[s.hr, { color: th.ink }]}>{t("atlasHour", { h: hour })}</Text>
      <View style={s.ends}><Text style={[s.end, { color: th.muted }]}>{t("atlasDrop")}</Text><Text style={[s.end, { color: th.muted }]}>{t("atlasWell")}</Text></View>
      {v.kinds.map((c) => <Bar key={c.kind} label={KIND_SHORT[c.kind]} c={c} />)}
      {v.ctx.length > 0 && <Text style={[s.lab, { color: th.muted }]}>{t("atlasCtx")}</Text>}
      <View style={s.chips}>{v.ctx.map((c) => <View key={c.feature} style={[s.chip, { backgroundColor: th.chip }]}><Text style={[s.chipT, { color: th.ink }]}>{ctxLabel(c.feature)}</Text></View>)}</View>
    </View>
  );
}

function ChartTab({ m, fs }: { m: Model; fs: Finding[] }) {
  const th = useTheme();
  const grid = useMemo(() => lasoGrid(m), [m]);
  const [sel, setSel] = useState<{ kind: Kind; part: number }>();
  // rows: kinds with any evidence, so an empty kind does not fill the chart with blanks
  const kinds = KINDS.filter((k) => grid.some((c) => c.kind === k && c.n > 0));
  const at = (k: Kind, p: number) => grid.find((c) => c.kind === k && c.part === p)!;
  const cur = sel && at(sel.kind, sel.part), f = sel && favours(fs, sel.kind, sel.part);
  if (!kinds.length) return <Text style={[s.calm, { color: th.ink }]}>{t("atlasEmpty")}</Text>;
  return (
    <View>
      <View style={s.row}><View style={s.rk} />{PARTS.map((p) => <Text key={p} style={[s.hd, { color: th.muted }]}>{p}</Text>)}</View>
      {kinds.map((k) => (
        <View key={k} style={s.row}>
          <Text style={[s.rk, s.rkT, { color: th.ink }]} numberOfLines={2}>{KIND_SHORT[k]}</Text>
          {PARTS.map((_, p) => {
            const c = at(k, p), on = sel?.kind === k && sel.part === p;
            return (
              <Tap key={p} onPress={() => setSel(on ? undefined : { kind: k, part: p })} style={s.cellW} accessibilityLabel={`${KIND_SHORT[k]} ${PARTS[p]}`}>
                <View style={[s.cell, c.enough ? { backgroundColor: th.ink, opacity: 0.12 + 0.88 * clamp(0.5 + c.mu / (2 * SCALE), 0, 1) } : [s.un, { borderColor: th.muted }], on && { borderWidth: 2, borderColor: th.seal, borderStyle: "solid" }]} />
                {favours(fs, k, p) && <View style={[s.dot, { backgroundColor: th.seal }]} />}
              </Tap>
            );
          })}
        </View>
      ))}
      <View style={s.ends}><Text style={[s.end, { color: th.muted }]}>{t("atlasWell")}</Text><Text style={[s.end, { color: th.muted }]}>{t("atlasThin")}</Text></View>
      {cur && (
        <View style={[s.card, { borderColor: th.line }]}>
          <Text style={[s.cardT, { color: th.ink }]}>{f ? clause(f) : cur.enough ? t("atlasFlat") : t("atlasThin")}</Text>
          {cur.n >= 1 && <Text style={[s.cardS, { color: th.muted }]}>{t("atlasBasis", { n: Math.round(cur.n) })}</Text>}
        </View>
      )}
    </View>
  );
}

function TogetherTab({ m, part, onPart }: { m: Model; part: number; onPart: (p: number) => void }) {
  const th = useTheme();
  const g = useMemo(() => contextCorr(m, part), [m, part]);
  const col = (r: number | null) => r === null ? undefined : r >= 0 ? `rgba(47,90,200,${(0.1 + 0.9 * r).toFixed(2)})` : `rgba(217,67,43,${(0.1 + 0.9 * -r).toFixed(2)})`;
  return (
    <View>
      <Seg items={PARTS} on={part} onPick={onPart} />
      {!g.kinds.length || !g.ctx.length ? <Text style={[s.calm, { color: th.ink }]}>{t("atlasEmpty")}</Text> : <>
        <View style={s.row}><View style={s.rk} />{g.ctx.map((c) => <Text key={c} style={[s.cx, { color: th.muted }]} numberOfLines={2}>{ctxShort(c)}</Text>)}</View>
        {g.kinds.map((k, i) => (
          <View key={k} style={s.row}>
            <Text style={[s.rk, s.rkT, { color: th.ink }]} numberOfLines={2}>{KIND_SHORT[k]}</Text>
            {g.r[i].map((r, j) => <View key={j} style={[s.cell, s.small, r === null ? [s.un, { borderColor: th.line }] : { backgroundColor: col(r) }]} />)}
          </View>
        ))}
        <Text style={[s.end, { color: th.muted, marginTop: 10 }]}>{t("atlasTogetherR")}</Text>
      </>}
      <Text style={[s.cardS, { color: th.muted, marginTop: 10 }]}>{t("atlasNote")}</Text>
    </View>
  );
}

/** The three views, mined once per model. `hour` opens the day view at that hour (from "Vì sao giờ này"). */
export function Atlas({ m, hour: h0 }: { m: Model; hour?: number }) {
  const [tab, setTab] = useState(0);
  const [hour, setHour] = useState(h0 ?? new Date().getHours());
  const [part, setPart] = useState(0);
  const [now] = useState(() => Date.now()); // mined as of opening
  const fs = useMemo(() => mineFindings(m, now), [m, now]);
  return (
    <View style={{ marginTop: 18 }}>
      <Seg items={[t("atlasDay"), t("atlasChart"), t("atlasTogether")]} on={tab} onPick={setTab} />
      <View style={{ marginTop: 14 }}>
        {tab === 0 ? <DayTab m={m} hour={hour} onHour={setHour} /> : tab === 1 ? <ChartTab m={m} fs={fs} /> : <TogetherTab m={m} part={part} onPart={setPart} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  seg: { flexDirection: "row", gap: 6 },
  segI: { flex: 1, height: 40, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  segT: { fontSize: 15, fontFamily: ff("600") },
  sl: { marginTop: 6 },
  hit: { height: 44, justifyContent: "center" },
  track: { height: 6, borderRadius: 6, marginHorizontal: 4 },
  thumb: { position: "absolute", width: 26, height: 26, marginLeft: -13, borderRadius: 13, top: 9 },
  ticks: { flexDirection: "row", justifyContent: "space-between" },
  tick: { fontSize: 12, fontFamily: ff("500") },
  hr: { fontSize: 40, fontFamily: ff("600"), letterSpacing: -0.8, marginTop: 10 },
  ends: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  end: { fontSize: 13, fontFamily: ff("500") },
  kb: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  kbL: { width: 84, fontSize: 14, fontFamily: ff("600") },
  ax: { flex: 1, height: 18 },
  mid: { position: "absolute", left: "50%", top: -4, bottom: -4, width: 1 },
  bar: { position: "absolute", top: 3, height: 12, borderRadius: 6 },
  thin: { borderWidth: 1.5, borderStyle: "dashed" },
  wh: { position: "absolute", top: 8, height: 2, opacity: 0.6 },
  lab: { fontSize: font.label, fontFamily: ff("500"), marginTop: 22 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 99, justifyContent: "center" },
  chipT: { fontSize: 14, fontFamily: ff("500") },
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  rk: { width: 64 },
  rkT: { fontSize: 13, fontFamily: ff("600") },
  hd: { flex: 1, textAlign: "center", fontSize: 13, fontFamily: ff("600") },
  cx: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: ff("600") },
  cellW: { flex: 1, aspectRatio: 1 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 12 },
  small: { borderRadius: 5 },
  un: { borderWidth: 1.5, borderStyle: "dashed" },
  dot: { position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 4 },
  calm: { marginTop: 18, fontSize: 16, fontFamily: ff("500"), lineHeight: 22 },
  card: { marginTop: 16, borderWidth: 1, borderRadius: 22, padding: 16 },
  cardT: { fontSize: 17, fontFamily: ff("600"), lineHeight: 23 },
  cardS: { fontSize: 15, fontFamily: ff("500"), marginTop: 6, lineHeight: 21 },
});
