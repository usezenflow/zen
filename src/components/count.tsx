import { useEffect, useRef, useState } from "react";
import { Text, type TextStyle } from "react-native";
import { Easing, useAnimatedReaction, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { type Key, t } from "@/lib/i18n";
import { motion } from "@/lib/theme";

type Vars = Record<string, number | string>;

/** A translated line whose numbers roll to their new values instead of jumping (first paint rolls up from 0). */
export function Count({ k, vars, style }: { k: Key; vars: Vars; style?: TextStyle | TextStyle[] }) {
  const [shown, setShown] = useState<Vars>(() => Object.fromEntries(Object.entries(vars).map(([n, v]) => [n, typeof v === "number" ? 0 : v])));
  const p = useSharedValue(0), last = useRef<Vars>({}), now = useRef(shown);
  useEffect(() => { now.current = shown; });
  const key = JSON.stringify(vars);
  useEffect(() => {
    last.current = now.current; // roll from what is on screen
    p.set(0);
    p.set(withTiming(1, { duration: motion.progress, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, p]);
  const set = (q: number) => setShown(Object.fromEntries(Object.entries(vars).map(([n, v]) => [n, typeof v === "number" && typeof last.current[n] === "number" ? Math.round((last.current[n] as number) + (v - (last.current[n] as number)) * q) : v])));
  useAnimatedReaction(() => Math.round(p.get() * 20), (q, prev) => { if (q !== prev) scheduleOnRN(set, q / 20); });
  return <Text style={style}>{t(k, shown)}</Text>;
}
