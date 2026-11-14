import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Icon } from "@/components/art";
import { SAT, SAT_DX, SAT_DY } from "@/components/hold";
import { fadeIn, fadeOut, Tap } from "@/components/tap";
import { t } from "@/lib/i18n";
import { useTheme, ff, space } from "@/lib/theme";

// Mic centre above the screen bottom: Hold's 26 padding + 20 label + 2 gap + half the 90 halo (capture.html: 93).
const MIC_Y = 93;

/** capture.html .veil: a glow of the page colour rising from the mic, so the day steps back while you choose. */
export function Veil({ onPress, z }: { onPress?: () => void; z?: number }) {
  const { bg } = useTheme();
  // shortcut: no 3px backdrop blur (RN has no backdrop-filter), add expo-blur if the gradient alone reads too busy.
  const style = [StyleSheet.absoluteFill, { zIndex: z, backgroundImage: `radial-gradient(130% 75% at 50% 100%, ${bg} 30%, ${bg}c7 60%, ${bg}6b 100%)` }];
  return (
    <Animated.View entering={fadeIn} exiting={fadeOut} style={style} pointerEvents={onPress ? "auto" : "none"}>
      {onPress && <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessibilityRole="button" accessibilityLabel={t("close")} />}
    </Animated.View>
  );
}

/** capture.html frame 7: the house dropdown (.menu) above the lit Ảnh satellite. */
export function PhotoMenu({ onPick }: { onPick: (src: "camera" | "library") => void }) {
  const th = useTheme();
  const items = [["camera", t("camera")], ["library", t("library")]] as const;
  return (
    <Animated.View entering={fadeIn} exiting={fadeOut} style={[s.menu, { bottom: MIC_Y + SAT_DY + SAT / 2 + 10, marginLeft: -SAT_DX - SAT / 2, backgroundColor: th.dark ? "rgba(44,44,46,0.78)" : "rgba(250,250,248,0.8)" }]}>
      {items.map(([k, label], n) => (
        <Pressable key={k} onPress={() => onPick(k)} accessibilityRole="menuitem" style={[s.mi, n > 0 && s.sep]}>
          <Text style={[s.miText, { color: th.ink }]}>{label}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

/** capture.html frames 5-6: one field over the keyboard. Blur (tap outside, keyboard down) drops it. */
export function TypeBar({ onSend, onClose }: { onSend: (text: string) => void; onClose: () => void }) {
  const th = useTheme();
  const [text, setText] = useState("");
  const ok = !!text.trim();
  const send = () => { if (ok) onSend(text.trim()); };
  return (
    <KeyboardAvoidingView behavior="padding" style={[StyleSheet.absoluteFill, s.kav]} pointerEvents="box-none">
      <Animated.View entering={fadeIn} style={s.ask}>
        <TextInput
          autoFocus multiline value={text} onChangeText={setText}
          placeholder={t("typeHint")} placeholderTextColor={th.muted}
          cursorColor={th.seal} selectionColor={th.seal}
          submitBehavior="submit" returnKeyType="send" onSubmitEditing={send} onBlur={onClose}
          style={[s.field, { backgroundColor: th.bg, borderColor: th.line, color: th.ink }]}
        />
        <Pressable onPress={send} disabled={!ok} accessibilityRole="button" accessibilityLabel={t("send")}
          style={[s.go, ok ? { backgroundColor: th.ink } : { backgroundColor: th.chip, borderWidth: 1, borderColor: th.line }]}>
          <Icon name="send" size={22} w={2.2} color={ok ? th.bg : th.muted} />
        </Pressable>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

/** capture.html frames 8 and 10: the picked photo, tilted, a vermilion line sweeping it while it is read. */
export function PhotoView({ uri, w, h, reading, onClose }: { uri: string; w: number; h: number; reading: boolean; onClose: () => void }) {
  const th = useTheme();
  const p = useSharedValue(0);
  useEffect(() => { p.set(reading ? withRepeat(withTiming(1, { duration: 1600 }), -1, true) : 0); }, [reading, p]);
  const sweep = useAnimatedStyle(() => ({ top: `${8 + p.get() * 84}%` }));
  return (
    <Animated.View entering={fadeIn} exiting={fadeOut} style={s.pad}>
      <Tap onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("close")} style={[s.o, { borderColor: th.line, backgroundColor: th.bg }]}>
        <Icon name="x" size={20} color={th.ink} />
      </Tap>
      {/* The photo's own shape, never taller than the mockup's 252x300 card would make it. */}
      <View style={[s.shot, { aspectRatio: Math.max(w / h || 0.84, 0.84) }]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        {reading && <Animated.View style={[s.scan, { backgroundColor: th.seal }, sweep]} />}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  menu: { position: "absolute", left: "50%", zIndex: 25, minWidth: 200, borderRadius: 16, overflow: "hidden", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), 0 18px 40px -8px rgba(0,0,0,0.28)" },
  mi: { height: 50, paddingHorizontal: 20, justifyContent: "center" },
  sep: { borderTopWidth: 0.5, borderTopColor: "rgba(127,127,127,0.28)" },
  miText: { fontSize: 17, fontFamily: ff("500") },
  kav: { zIndex: 11, justifyContent: "flex-end", paddingHorizontal: 12 },
  ask: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 12 },
  field: { flex: 1, minHeight: 52, maxHeight: 160, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, borderRadius: 26, borderWidth: 1, fontSize: 17, lineHeight: 23, fontFamily: ff("500") },
  go: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  pad: { flex: 1, paddingHorizontal: space.gutter, paddingTop: 6 },
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  shot: { marginTop: 22, borderRadius: 22, overflow: "hidden", backgroundColor: "#e9e5da", transform: [{ rotate: "-1.2deg" }], boxShadow: "0 18px 34px -20px rgba(0,0,0,0.45)" },
  scan: { position: "absolute", left: 0, right: 0, height: 2, boxShadow: "0 0 18px 6px rgba(217,67,43,0.35)" },
});
