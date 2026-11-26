import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/art";
import { Tap } from "@/components/tap";
import { t } from "@/lib/i18n";
import { ask, onQueue, partStates, partTimes, type Part, type PartState } from "@/lib/sync";
import { useTheme, font, ff, fd } from "@/lib/theme";
import { when } from "@/lib/when";

/** A part's queue state and last fetch, following the queue; `onLand` runs when its job finishes. */
export function usePart(p: Part, onLand?: () => void) {
  const [q, setQ] = useState<PartState>({ st: "" });
  const [at, setAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const was = useRef<PartState["st"]>("");
  const load = useCallback(async () => {
    const next = (await partStates())[p];
    if (was.current === "run" && next.st !== "run") onLand?.();
    was.current = next.st;
    setQ(next);
    setAt((await partTimes())[p]); setNow(Date.now());
  }, [p, onLand]);
  useEffect(() => { void Promise.resolve().then(load); return onQueue(() => void load()); }, [load]);
  return { q, at, now };
}

const Spin = ({ color }: { color: string }) => {
  const r = useSharedValue(0);
  useEffect(() => { r.set(withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1)); }, [r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get().toFixed(2)}deg` }] }));
  return <Animated.View style={st}><Icon name="sync" size={20} color={color} /></Animated.View>;
};

/** marks.html / fees.html top: back, a circle that queues the part, the title, and when it last came (or what the queue is doing). */
export function PartHead({ part, title, onLand }: { part: Part; title: string; onLand?: () => void }) {
  const th = useTheme();
  const { q, at, now } = usePart(part, onLand);
  const line = q.st === "run" ? t("updating") : q.st === "wait" ? t("waiting") : q.st === "retry" ? t("retryAt", { time: when(q.at!, now) }) : at ? t("updatedWhen", { time: when(at, now) }) : null;
  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Tap onPress={() => router.back()} accessibilityLabel={t("back")} style={[s.o, { borderColor: th.line, backgroundColor: th.bg }]}>
          <Icon name="back" size={20} color={th.ink} />
        </Tap>
        <Tap onPress={() => { Haptics.selectionAsync().catch(() => {}); void ask(part); }} accessibilityLabel={t("refresh")} style={[s.o, { borderColor: th.line, backgroundColor: th.bg }]}>
          {q.st === "run" ? <Spin color={th.ink} /> : <Icon name="sync" size={20} color={th.ink} />}
        </Tap>
      </View>
      <Text style={[s.h, { color: th.ink }]}>{title}</Text>
      {line && <Text style={[s.sub, { color: th.muted }]}>{line}</Text>}
    </>
  );
}

const s = StyleSheet.create({
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  h: { fontSize: font.h, lineHeight: 36, fontFamily: fd("500"), letterSpacing: -0.75, marginTop: 18 },
  sub: { marginTop: 4, fontSize: font.base, fontFamily: ff("400") },
});
