import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { fadeIn, fadeOut, glide, Tap, settle } from "@/components/tap";
import { t } from "@/lib/i18n";
import { connect, syncNow, syncStatus } from "@/lib/sync";
import { useTheme, font, ff } from "@/lib/theme";

const RED = "#ff2f52";
const API_KEY = process.env.EXPO_PUBLIC_DLU_API_KEY ?? "";
// unset falls back to the campus defaults in dlu/client.ts
const PORTAL_URL = process.env.EXPO_PUBLIC_DLU_PORTAL_URL || undefined;
const LMS_URL = process.env.EXPO_PUBLIC_DLU_LMS_URL || undefined;
type Check = "ok" | "wrong" | "slow" | "off";
export type Res = { portal: Check; lms: Check };

function Field({ label, note, bad, ...p }: { label: string; note?: string; bad?: boolean } & React.ComponentProps<typeof TextInput>) {
  const th = useTheme();
  const x = useSharedValue(0);
  // A wrong password shakes its field, like the iOS passcode screen.
  useEffect(() => {
    if (!bad) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    x.set(withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 70 }), withTiming(-5, { duration: 60 }), settle(0, 160)));
  }, [bad, x]);
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <>
      <Animated.View layout={glide} style={[s.field, { borderColor: bad ? RED : th.line }, shake]}>
        <Text style={[s.lab, { color: th.muted }]}>{label}</Text>
        <TextInput {...p} accessibilityLabel={label} style={[s.input, { color: th.ink }]} placeholder={t("fieldPh")} placeholderTextColor={th.muted} selectionColor={th.seal} cursorColor={th.seal} autoCapitalize="none" autoCorrect={false} />
      </Animated.View>
      {note ? <Animated.Text key={note} entering={fadeIn} exiting={fadeOut} layout={glide} style={[s.note, { color: bad ? RED : th.muted, fontFamily: ff(bad ? "500" : "500") }]}>{note}</Animated.Text> : null}
    </>
  );
}

/** Inline connect fields. Each account reports on its own: wrong = red on that field, slow = neutral note under it. onResult runs after connect + sync. */
/** `onFirst`: the first sync ever runs behind logo.html's loading state, and a failed one shows its error state. */
export function ConnectForm({ initialId, focus, hideId, only, onResult, onFirst }: { initialId: string; hideId?: boolean; only?: "portal" | "lms"; focus?: "portal" | "lms"; onResult: (r: Res) => void; onFirst?: (s: "load" | "err" | null) => void }) {
  const th = useTheme();
  const [id, setId] = useState(initialId);
  const [pw, setPw] = useState("");
  const [lms, setLms] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!id.trim() || (!pw && !lms) || busy) return; // a blank password skips that source; one is needed
    setBusy(true);
    let loading = false;
    try {
      const r = await connect({ studentId: id.trim(), password: pw, lmsPassword: lms || undefined, portalApiKey: API_KEY, portalUrl: PORTAL_URL, lmsUrl: LMS_URL });
      setRes(r);
      if ([r.portal, r.lms].some((c) => c === "ok" || c === "slow")) {
        const first = !(await syncStatus()).last;
        if (first) { onFirst?.("load"); loading = true; }
        await syncNow(only); // one field open: just that account's jobs
        if (first) onFirst?.((await syncStatus()).last ? null : "err");
        loading = false;
      }
      onResult(r);
    } catch {
      if (loading) onFirst?.("err"); // never leave the first-run loading screen up
      else setRes({ portal: only === "lms" ? "off" : "slow", lms: only === "portal" ? "off" : "slow" }); // a throw reads as "couldn't reach", not silence
    } finally {
      setBusy(false); // a throw (store, keychain) must not leave the button spinning; the user can tap again
    }
  };
  const note = (c: Check | undefined, wrong: string, slow: string) => (c === "wrong" ? wrong : c === "slow" ? slow : undefined);
  const retry = !!res && (res.portal === "wrong" || res.portal === "slow" || res.lms === "wrong" || res.lms === "slow");
  return (
    <View>
      {!hideId && <Field label={t("studentId")} value={id} onChangeText={setId} keyboardType="number-pad" />}
      {only !== "lms" && <Field label={t("portalPwLab")} value={pw} onChangeText={setPw} secureTextEntry autoFocus={focus === "portal"}
        bad={res?.portal === "wrong"} note={note(res?.portal, t("wrongPortal"), t("slowPortal"))} />}
      {only !== "portal" && <Field label={t("lmsPwLab")} value={lms} onChangeText={setLms} secureTextEntry autoFocus={focus === "lms"}
        bad={res?.lms === "wrong"} note={note(res?.lms, t("wrongLms"), t("slowLms"))} />}
      <Animated.View layout={glide}>
        <Tap onPress={() => void go().catch(() => {})} disabled={busy} style={[s.btn, { backgroundColor: th.ink }]}>
          {busy
            ? <Animated.View key="busy" entering={fadeIn}><ActivityIndicator color={th.bg} /></Animated.View>
            : <Animated.Text key={retry ? "retry" : "go"} entering={fadeIn} style={{ fontSize: 16, fontFamily: ff("600"), color: th.bg }}>{retry ? t("retry") : t("connect")}</Animated.Text>}
        </Tap>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  field: { height: 60, marginTop: 8, paddingHorizontal: 22, borderRadius: 99, borderWidth: 1, justifyContent: "center", gap: 1 },
  lab: { fontSize: 13, fontFamily: ff("500") },
  input: { fontSize: font.base, lineHeight: Math.round(font.base * 1.3), height: Math.round(font.base * 1.3), fontFamily: ff("500"), padding: 0 },
  note: { marginTop: 8, marginLeft: 22, fontFamily: ff("500"), fontSize: 17 }, // ui.css .errt: 17px, weight 500
  btn: { marginTop: 18, height: 50, borderRadius: 99, alignItems: "center", justifyContent: "center" },
});
