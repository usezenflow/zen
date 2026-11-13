import * as Haptics from "expo-haptics";
import { Animated, Pressable, StyleSheet, Text } from "react-native";
import { useEffect, useRef } from "react";
import { t } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export type HoldState = "idle" | "listening" | "thinking";

export function Hold({ state, onStart, onEnd }: { state: HoldState; onStart: () => void; onEnd: () => void }) {
  const th = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: state === "listening" ? 1.15 : 1, useNativeDriver: true }).start();
  }, [state, scale]);
  return (
    <Pressable
      disabled={state === "thinking"}
      onPressIn={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onStart(); }}
      onPressOut={onEnd}
      style={s.wrap}
    >
      <Animated.View style={[s.btn, { backgroundColor: th.sun, transform: [{ scale }], opacity: state === "thinking" ? 0.6 : 1 }]}>
        <Text style={s.label}>{t(state === "idle" ? "hold" : state)}</Text>
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", paddingBottom: 36 },
  btn: { width: 132, height: 132, borderRadius: 66, alignItems: "center", justifyContent: "center", shadowColor: "#f59e0b", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  label: { color: "#2a1a00", fontSize: 16, fontWeight: "800", textAlign: "center", paddingHorizontal: 12 },
});
