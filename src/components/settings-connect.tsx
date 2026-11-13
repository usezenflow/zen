import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { fadeIn, fadeOut, glide, Tap } from "@/components/tap";
import { t } from "@/lib/i18n";
import { connect, sync } from "@/lib/sync";
import { useTheme, font, ff, motion } from "@/lib/theme";

const RED = "#ff2f52";
const API_KEY = process.env.EXPO_PUBLIC_DLU_API_KEY ?? "";
type Check = "ok" | "wrong" | "slow";
export type Res = { portal: Check; lms: Check };

function Field({ label, note, bad, ph, ...p }: { label: string; note?: string; bad?: boolean; ph?: string } & React.ComponentProps<typeof TextInput>) {
  const th = useTheme();
  const x = useSharedValue(0);
  // A wrong password shakes its field, like the iOS passcode screen.
  useEffect(() => {
    if (!bad) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    x.set(withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 70 }), withTiming(-5, { duration: 60 }), withSpring(0, motion.bouncy)));
  }, [bad, x]);
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <>
      <Animated.View layout={glide} style={[s.field, { borderColor: bad ? RED : th.line }, shake]}>
        <Text style={[s.lab, { color: th.muted }]}>{label}</Text>
        <TextInput {...p} style={[s.input, { color: th.ink }]} placeholder={ph ?? t("fieldPh")} placeholderTextColor={th.muted} autoCapitalize="none" autoCorrect={false} />
      </Animated.View>
      {note ? <Animated.Text key={note} entering={fadeIn} exiting={fadeOut} layout={glide} style={[s.note, { color: bad ? RED : th.muted, fontFamily: ff(bad ? "600" : "500") }]}>{note}</Animated.Text> : null}
    </>
  );
}

/** Inline connect fields. Each account reports on its own: wrong = red on that field, slow = neutral note under it. onResult runs after connect + sync. */
export function ConnectForm({ initialId, focus, hideId, onResult }: { initialId: string; hideId?: boolean; focus?: "portal" | "lms"; onResult: (r: Res) => void }) {
  const th = useTheme();
  const [id, setId] = useState(initialId);
  const [pw, setPw] = useState("");
  const [lms, setLms] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!id.trim() || !pw || busy) return;
    setBusy(true);
    const r = await connect({ studentId: id.trim(), password: pw, lmsPassword: lms || undefined, portalApiKey: API_KEY });
    setRes(r);
    if (r.portal !== "wrong" || r.lms !== "wrong") await sync();
    setBusy(false);
    onResult(r);
  };
  const note = (c: Check | undefined, wrong: string, slow: string) => (c === "wrong" ? wrong : c === "slow" ? slow : undefined);
  const retry = !!res && (res.portal !== "ok" || res.lms !== "ok");
  return (
    <View>
      {!hideId && <Field label={t("studentId")} value={id} onChangeText={setId} keyboardType="number-pad" />}
      <Field label={t("portalPwLab")} value={pw} onChangeText={setPw} secureTextEntry autoFocus={focus === "portal"}
        bad={res?.portal === "wrong"} note={note(res?.portal, t("wrongPortal"), t("slowPortal"))} />
      <Field label={t("lmsPwLab")} ph={t("lmsPwPh")} value={lms} onChangeText={setLms} secureTextEntry autoFocus={focus === "lms"}
        bad={res?.lms === "wrong"} note={note(res?.lms, t("wrongLms"), t("slowLms"))} />
      <Animated.View layout={glide}>
        <Tap onPress={go} disabled={busy} style={[s.btn, { backgroundColor: th.ink }]}>
          {busy
            ? <Animated.View key="busy" entering={fadeIn}><ActivityIndicator color={th.bg} /></Animated.View>
            : <Animated.Text key={retry ? "retry" : "go"} entering={fadeIn} style={{ fontSize: 16, fontFamily: ff("700"), color: th.bg }}>{retry ? t("retry") : t("connect")}</Animated.Text>}
        </Tap>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  field: { height: 60, marginTop: 8, paddingHorizontal: 22, borderRadius: 99, borderWidth: 1, justifyContent: "center", gap: 1 },
  lab: { fontSize: font.label, fontFamily: ff("500") },
  input: { fontSize: font.base, fontFamily: ff("500"), padding: 0 },
  note: { marginTop: 8, marginLeft: 22, fontFamily: ff(), fontSize: font.md },
  btn: { marginTop: 18, height: 50, borderRadius: 99, alignItems: "center", justifyContent: "center" },
});
