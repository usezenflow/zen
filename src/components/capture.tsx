import { Image } from "expo-image";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Icon } from "@/components/art";
import { SAT, SAT_DX, SAT_DY } from "@/components/hold";
import { MenuPanel } from "@/components/rowmenu";
import { fadeIn, fadeOut } from "@/components/tap";
import { t } from "@/lib/i18n";
import { useTheme, ff, space } from "@/lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const navInset = useSafeAreaInsets().bottom, nav = Platform.OS === "android" ? navInset : 0; // follows the dock above Android's nav bar
  const items = [{ label: t("camera"), onPress: () => onPick("camera") }, { label: t("library"), onPress: () => onPick("library") }];
  return <MenuPanel items={items} onPick={(i) => i.onPress()} origin="bottom left" style={{ position: "absolute", left: "50%", bottom: nav + MIC_Y + SAT_DY + SAT / 2 + 10, marginLeft: -SAT_DX - SAT / 2 }} />;
}

/** capture.html frames 5-6: one field over the keyboard. Blur (tap outside, keyboard down) drops it. */
export function TypeBar({ onSend, onClose }: { onSend: (text: string) => void; onClose: () => void }) {
  const th = useTheme();
  const [text, setText] = useState("");
  const ok = !!text.trim();
  const send = () => { if (ok) onSend(text.trim()); };
  // The field rides 12pt above the keyboard (capture.html .ask), from the keyboard's own height: KeyboardAvoidingView mis-measured inside the safe area.
  const kb = useSharedValue(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => kb.set(withTiming(e.endCoordinates.height, { duration: e.duration || 250, easing: Easing.out(Easing.cubic) })));
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", (e) => kb.set(withTiming(0, { duration: e.duration || 250 })));
    return () => { show.remove(); hide.remove(); };
  }, [kb]);
  // Android's keyboard height leaves out the nav bar, but the app draws under it (edge-to-edge): add it back, or the field hides behind the keys and the window pans up.
  const navInset = useSafeAreaInsets().bottom, nav = Platform.OS === "android" ? navInset : 0;
  const lift = useAnimatedStyle(() => ({ bottom: kb.get() + (kb.get() > 0 ? nav : 0) + 12 }));
  // capture.html 7: swipe down to drop it. Lowering the keyboard blurs the field, and blur closes.
  // Keyboard is a class instance, which can't cross to the UI runtime, so hand over a component-scope function instead.
  const dismiss = () => Keyboard.dismiss();
  const drop = usePanGesture({ activeOffsetY: [-9999, 24], failOffsetX: [-20, 20], onDeactivate: (e) => { "worklet"; if (e.translationY > 40) scheduleOnRN(dismiss); } });
  return (
    <View style={[StyleSheet.absoluteFill, s.kav]} pointerEvents="box-none">
      <GestureDetector gesture={drop}>
      <Animated.View entering={fadeIn} style={[s.ask, lift]}>
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
      </GestureDetector>
    </View>
  );
}

/** capture.html frames 8 and 10: the picked photo, tilted, a vermilion line sweeping it while it is read. */
/** The read text, what the reader found (its mention spans) tinted vermilion: capture.html .shot mark. */
function Marked({ text, marks, style = s.paper }: { text: string; marks: { start: number; end: number }[]; style?: object }) {
  const parts: { s: string; on: boolean }[] = [];
  let at = 0;
  for (const m of [...marks].sort((a, b) => a.start - b.start)) {
    if (m.end <= at) continue; // inside one already lit
    if (m.start < at) parts.push({ s: text.slice(at, m.end), on: true }); // overlapping (a title over its date): light the rest of it
    else parts.push({ s: text.slice(at, m.start), on: false }, { s: text.slice(m.start, m.end), on: true });
    at = m.end;
  }
  parts.push({ s: text.slice(at), on: false });
  return <Text style={style}>{parts.map((p, i) => p.on ? <Text key={i} style={s.mark}>{p.s}</Text> : p.s)}</Text>;
}

/** The vermilion line sweeping a picture while it is read (capture.html .scan). */
function Scan() {
  const th = useTheme();
  const p = useSharedValue(0);
  useEffect(() => { p.set(withRepeat(withTiming(1, { duration: 1600 }), -1, true)); }, [p]);
  const sweep = useAnimatedStyle(() => ({ top: `${(8 + p.get() * 84).toFixed(2)}%` }));
  return <Animated.View style={[s.scan, { backgroundColor: th.seal }, sweep]} />;
}

/** capture.html frame 12: the PDF page flat and white, what was found lit, the rest fading out, the counter stepping through pages. A scanned page shows as its picture under the photo sweep. */
export function PdfView({ page, pages, text, marks, image }: { page: number; pages: number; text?: string; marks?: { start: number; end: number }[]; image?: string }) {
  const th = useTheme();
  const win = useWindowDimensions(), w = win.width * 0.8, h = w * 1.24; // capture.html .shot: 322 of 402, 400 tall
  const fh = h * 0.3, below = 24; // fade over the bottom 30%, running on past the sheet to swallow its shadow
  return (
    <Animated.View entering={fadeIn} exiting={fadeOut} style={s.pad}>
      <View style={s.mid}>
        <View>
          <View style={[s.shot, s.page, { width: w, height: h }]}>
            {image ? <><Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="contain" /><Scan /></> : text ? <Marked text={text} marks={marks ?? []} style={s.pdfText} /> : null}
          </View>
          {/* Long text is never scrolled here: the bottom 30% fades into the page colour, sheet and shadow alike (.shot.pdf mask). */}
          <View pointerEvents="none" style={[s.fade, { bottom: -below, height: fh + below, backgroundImage: `linear-gradient(${th.bg}00, ${th.bg} ${Math.round((fh / (fh + below)) * 100)}%)` }]} />
        </View>
        {pages > 0 && <Text style={[s.pgs, { color: th.muted }]}>{t("pdfPage", { n: page, total: pages })}</Text>}
      </View>
    </Animated.View>
  );
}

export function PhotoView({ uri, w, h, text, marks, reading }: { uri: string; w: number; h: number; text?: string; marks?: { start: number; end: number }[]; reading: boolean }) {
  // Big enough to read at arm's length: 80% of the width, the whole photo uncropped, a tall one capped so it clears the mic below.
  const win = useWindowDimensions(), k = Math.min((win.width * 0.8) / (w || 1), (win.height * 0.62) / (h || 1));
  const box = w && h ? { width: w * k, height: h * k } : { width: win.width * 0.8, aspectRatio: 0.84 };
  return (
    <Animated.View entering={fadeIn} exiting={fadeOut} style={s.pad}>
      <View style={s.mid}>
        <View style={[s.shot, box]}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
          {text && marks && (
            <Animated.View entering={fadeIn} style={[StyleSheet.absoluteFill, s.paperBox]}>
              <Marked text={text} marks={marks} />
            </Animated.View>
          )}
          {reading && <Scan />}
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  kav: { zIndex: 11 },
  ask: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  field: { flex: 1, minHeight: 52, maxHeight: 160, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, borderRadius: 26, borderWidth: 1, fontSize: 17, lineHeight: 23, fontFamily: ff("500") },
  go: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  pad: { flex: 1, paddingHorizontal: space.gutter, paddingTop: 6 },
  mid: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 90 }, // centred in the space above the mic
  shot: { borderRadius: 22, overflow: "hidden", backgroundColor: "#e9e5da", transform: [{ rotate: "-1.2deg" }], boxShadow: "0 18px 34px -20px rgba(0,0,0,0.45)" },
  paperBox: { backgroundColor: "#e9e5da", padding: 22, overflow: "hidden" },
  paper: { color: "#3b3a36", fontSize: 17, lineHeight: 28, fontFamily: ff("500") }, // big enough to read at arm's length
  mark: { backgroundColor: "rgba(217,67,43,0.18)" }, // .shot mark: inherits weight; shortcut: RN nested text takes no radius 3 / padding 0 2, fine as flat highlight
  page: { backgroundColor: "#fff", transform: [], paddingHorizontal: 20, paddingVertical: 22 },
  pdfText: { color: "#2b2a27", fontSize: 15, lineHeight: 25.5, fontFamily: ff("500") }, // capture.html .shot: 15px, line-height 1.7
  fade: { position: "absolute", left: -1, right: -1 },
  pgs: { marginTop: 12, textAlign: "center", fontSize: 13, fontFamily: ff("600") },
  scan: { position: "absolute", left: 0, right: 0, height: 2, boxShadow: "0 0 18px 6px rgba(217,67,43,0.35)" },
});
