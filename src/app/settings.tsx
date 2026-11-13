import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { clearCreds, loadCreds, saveCreds } from "@/lib/dlu";
import { getLang, setLang, t, type Lang } from "@/lib/i18n";
import * as stats from "@/lib/stats";
import { kvSet } from "@/lib/store";
import { kvStorage, sync } from "@/lib/sync";
import { useTheme } from "@/lib/theme";

const BUG_MAIL = process.env.EXPO_PUBLIC_BUG_EMAIL ?? "";
const API_KEY = process.env.EXPO_PUBLIC_DLU_API_KEY ?? "";

export default function Settings() {
  const th = useTheme();
  const [lang, setL] = useState<Lang>(getLang());
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [on, setOn] = useState(false);
  const [share, setShare] = useState(true);

  useEffect(() => {
    loadCreds().then((c) => { if (c) { setId(c.studentId); setOn(true); } });
    stats.isOptedOut(kvStorage).then((o) => setShare(!o));
  }, []);

  const pick = async (l: Lang) => { setLang(l); setL(l); await kvSet("lang", l); };
  const connect = async () => {
    if (!id || !pw) return;
    await saveCreds({ studentId: id, password: pw, portalApiKey: API_KEY });
    setPw(""); setOn(true);
    sync();
  };
  const off = async () => { await clearCreds(); setOn(false); setId(""); };
  const input = [s.input, { backgroundColor: th.card, borderColor: th.line, color: th.text }];

  return (
    <SafeAreaView style={[s.root, { backgroundColor: th.bg }]}>
      <View style={s.body}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={{ color: th.sun, fontWeight: "800", fontSize: 16 }}>{t("back")}</Text></Pressable>
        <Text style={[s.h, { color: th.muted }]}>{t("language")}</Text>
        <View style={s.row}>
          {(["vi", "en"] as Lang[]).map((l) => (
            <Pressable key={l} onPress={() => pick(l)} style={[s.chip, { backgroundColor: lang === l ? th.sun : th.card, borderColor: th.line }]}>
              <Text style={{ fontWeight: "800", color: lang === l ? "#2a1a00" : th.text }}>{l === "vi" ? "Tiếng Việt" : "English"}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[s.h, { color: th.muted }]}>{t("campus")}</Text>
        {on ? (
          <View style={s.row}>
            <Text style={{ color: th.text, fontWeight: "700", flex: 1 }}>{t("connected")}: {id}</Text>
            <Pressable onPress={off}><Text style={{ color: th.red, fontWeight: "800" }}>{t("disconnect")}</Text></Pressable>
          </View>
        ) : (
          <>
            <TextInput style={input} placeholder={t("studentId")} placeholderTextColor={th.muted} value={id} onChangeText={setId} autoCapitalize="none" />
            <TextInput style={input} placeholder={t("password")} placeholderTextColor={th.muted} value={pw} onChangeText={setPw} secureTextEntry />
            <Pressable onPress={connect} style={[s.chip, { backgroundColor: th.sun, alignSelf: "flex-start" }]}><Text style={{ fontWeight: "800", color: "#2a1a00" }}>{t("save")}</Text></Pressable>
          </>
        )}
        <View style={[s.row, { marginTop: 12 }]}>
          <Text style={{ color: th.text, fontWeight: "700", flex: 1 }}>{t("stats")}</Text>
          <Switch value={share} onValueChange={(v) => { setShare(v); stats.setOptOut(kvStorage, !v); }} trackColor={{ true: th.sun }} />
        </View>
        <Pressable onPress={() => BUG_MAIL && Linking.openURL(`mailto:${BUG_MAIL}?subject=Zen`)} style={[s.chip, { backgroundColor: th.card, borderColor: th.line, alignSelf: "flex-start", marginTop: 12 }]}>
          <Text style={{ color: th.text, fontWeight: "800" }}>{t("bug")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 20, gap: 12 },
  h: { fontSize: 13, fontWeight: "800", marginTop: 12 },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  chip: { minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 48, borderRadius: 24, borderWidth: 1, paddingHorizontal: 20, fontSize: 16 },
});
