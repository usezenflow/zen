import { useEffect, useState } from "react";
import { AppState, Modal, Platform, StyleSheet, Text, View } from "react-native";
import { Tap } from "@/components/tap";
import { t } from "@/lib/i18n";
import { kvGet, kvSet } from "@/lib/store";
import { useTheme, ff } from "@/lib/theme";
import { checkUpdate, install, installed, notes } from "@/lib/update";
import type { Update } from "@/lib/update-version";

/** settings.html: "update" offers a newer release; "new" shows the notes of the version now installed. */
export type Dlg = { kind: "update"; update: Update } | { kind: "new"; version: string; notes: string[] };

/** A centred card over a dimmed screen (.dlg in ui.css). Modal so it also sits above the settings screen. */
export function UpdateDialog({ d, onClose }: { d: Dlg; onClose: () => void }) {
  const th = useTheme();
  const [pct, setPct] = useState<number | null>(null);
  const up = d.kind === "update";
  const go = async () => {
    if (!up) return onClose();
    if (pct !== null) return;
    setPct(0);
    await install(d.update, setPct);
    setPct(null); onClose();
  };
  const label = !up ? t("gotIt") : pct !== null ? t("downloadingPct", { n: pct }) : Platform.OS === "ios" ? t("installSideStore") : t("updateBtn");
  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={pct === null ? onClose : undefined}>
      <View style={s.scrim}>
        <View style={[s.dlg, { backgroundColor: th.bg }]} accessibilityViewIsModal>
          <Text style={[s.lab, { color: th.muted }]}>{t(up ? "newVersion" : "whatsNew")}</Text>
          <Text style={[s.h, { color: th.ink }]}>Zen {up ? d.update.version : d.version}</Text>
          {(up ? d.update.notes : d.notes).map((n, i) => (
            <View key={i} style={s.li}><Text style={[s.note, { color: th.ink }]}>•</Text><Text style={[s.note, { color: th.ink, flex: 1 }]}>{n}</Text></View>
          ))}
          <Tap onPress={go} style={[s.btn, { backgroundColor: th.ink }]} accessibilityRole="button"><Text style={[s.bt, { color: th.bg }]}>{label}</Text></Tap>
          {up && pct === null && <Tap onPress={onClose} hitSlop={8} accessibilityRole="button"><Text style={[s.ghost, { color: th.muted }]}>{t("notNow")}</Text></Tap>}
        </View>
      </View>
    </Modal>
  );
}

let offered: string | null = null; // each version is offered once a run

/** Mounted once in _layout: what's new after an update (once), then any newer release on launch and on return. */
export function UpdatePrompt() {
  const [d, setD] = useState<Dlg | null>(null);
  useEffect(() => {
    if (__DEV__) return;
    void (async () => {
      const seen = await kvGet("seenVersion");
      if (seen === installed) return;
      await kvSet("seenVersion", installed);
      if (!seen) return; // a fresh install has nothing "new"
      if (notes.length) setD((c) => c ?? { kind: "new", version: installed, notes });
    })();
    const check = () => void checkUpdate().then((u) => {
      if (!u || offered === u.version) return;
      offered = u.version;
      setD((c) => c ?? { kind: "update", update: u });
    });
    check();
    const sub = AppState.addEventListener("change", (st) => st === "active" && check());
    return () => sub.remove();
  }, []);
  return d ? <UpdateDialog d={d} onClose={() => setD(null)} /> : null;
}

const s = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "center", paddingHorizontal: 20, backgroundColor: "rgba(0,0,0,.38)" },
  dlg: { borderRadius: 28, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 18 },
  lab: { fontSize: 15, fontFamily: ff("500") },
  h: { marginTop: 4, marginBottom: 8, fontSize: 24, lineHeight: 28.8, fontFamily: ff("600"), letterSpacing: -0.6 },
  li: { flexDirection: "row", gap: 8, marginTop: 6 },
  note: { fontSize: 15, lineHeight: 21.75, fontFamily: ff("400") },
  btn: { marginTop: 22, height: 50, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  bt: { fontSize: 16, fontFamily: ff("700") },
  ghost: { marginTop: 12, textAlign: "center", fontSize: 15, fontFamily: ff("600") },
});
