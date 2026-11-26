import { useEffect, useState } from "react";
import Svg, { Circle } from "react-native-svg";
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/art";
import { Tap } from "@/components/tap";
import { Toast } from "@/components/toast";
import { t } from "@/lib/i18n";
import { kvGet, kvSet } from "@/lib/store";
import { useTheme, ff } from "@/lib/theme";
import { checkUpdate, install, installed, notes, useDownload } from "@/lib/update";
import type { Update } from "@/lib/update-version";

/** settings.html: "update" offers a newer release; "new" shows the notes of the version now installed. */
export type Dlg = { kind: "update"; update: Update } | { kind: "new"; version: string; notes: string[] };

/** A centred card over a dimmed screen (.dlg in ui.css). Modal so it also sits above the settings screen. */
export function UpdateDialog({ d, onClose }: { d: Dlg; onClose: () => void }) {
  const th = useTheme(), ins = useSafeAreaInsets();
  const up = d.kind === "update";
  // the download runs behind: the dialog closes at once and the top toast shows the ring (DownloadToast)
  const go = (via?: "altstore") => { if (up) void install(d.update, via); onClose(); };
  const label = !up ? t("gotIt") : Platform.OS === "ios" ? t("installSideStore") : t("updateBtn");
  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* A long changelog scrolls inside the card; the button always stays on screen, and a tap outside closes */}
      <View style={[s.scrim, { paddingTop: ins.top + 24, paddingBottom: ins.bottom + 24 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t("close")} />
        <View style={[s.dlg, { backgroundColor: th.bg }]} accessibilityViewIsModal>
          <View style={s.labRow}><Icon name={up ? "download" : "target"} size={16} color={th.muted} w={2} /><Text style={[s.lab, { color: th.muted }]}>{t(up ? "newVersion" : "whatsNew")}</Text></View>
          <Text style={[s.h, { color: th.ink }]}>zen {up ? d.update.version : d.version}</Text>
          <ScrollView style={s.list} contentContainerStyle={s.listIn} showsVerticalScrollIndicator>
            {(up ? d.update.notes : d.notes).map((n, i) => (
              <View key={i} style={s.li}><Text style={[s.note, { color: th.ink }]}>•</Text><Text style={[s.note, { color: th.ink, flex: 1 }]}>{n}</Text></View>
            ))}
          </ScrollView>
          <Tap onPress={() => go()} style={[s.btn, { backgroundColor: th.accent }]} accessibilityRole="button">
            <Icon name={!up ? "checkCircle" : "download"} size={18} color={th.onAccent} w={2} /><Text style={[s.bt, { color: th.onAccent }]}>{label}</Text>
          </Tap>
          {up && Platform.OS === "ios" && <Tap onPress={() => go("altstore")} style={[s.sec, { borderColor: th.line }]} accessibilityRole="button"><Text style={[s.st, { color: th.ink }]}>{t("installAltStore")}</Text></Tap>}
          {up && <Tap onPress={onClose} hitSlop={8} accessibilityRole="button"><Text style={[s.ghost, { color: th.muted }]}>{t("notNow")}</Text></Tap>}
        </View>
      </View>
    </Modal>
  );
}

/** ui.css .ring: the download's share as an arc, track faint, from twelve o'clock. */
export function Ring({ pct, color, size = 30, w = 3 }: { pct: number; color: string; size?: number; w?: number }) {
  const r = (size - w) / 2, c = 2 * Math.PI * r;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(127,127,127,0.35)" strokeWidth={w} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={w} fill="none" strokeLinecap="round"
        strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </Svg>
    </View>
  );
}

/** settings.html "Downloading" and "Download failed": the top toast while the APK comes down, over any screen; the installer opens when it is done. */
export function DownloadToast() {
  const th = useTheme(), dl = useDownload();
  if (!dl) return null;
  if (dl.failed) return <Toast error text={t("updFailed", { version: dl.version })} sub={t("updFailedSub")} lead={<Ring pct={dl.pct} color={th.seal} />} />;
  return <Toast text={t("updDownloading", { version: dl.version })} sub={t("updDownloadingSub", { n: dl.pct })} lead={<Ring pct={dl.pct} color={th.ink} />} />;
}

let offered: string | null = null; // each version is offered once a run
let checkedAt = 0; // settings.html: launch always checks GitHub; a return at most every 15 minutes

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
    const check = (launch = false) => { if (!launch && Date.now() - checkedAt < 15 * 60_000) return; checkedAt = Date.now(); void checkUpdate().then((u) => {
      if (!u || offered === u.version) return;
      offered = u.version;
      setD((c) => c ?? { kind: "update", update: u });
    }); };
    check(true);
    const sub = AppState.addEventListener("change", (st) => st === "active" && check());
    return () => sub.remove();
  }, []);
  return <>{d && <UpdateDialog d={d} onClose={() => setD(null)} />}<DownloadToast /></>;
}

const s = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "center", paddingHorizontal: 20, backgroundColor: "rgba(0,0,0,.38)" },
  dlg: { maxHeight: "100%", borderRadius: 28, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 18, boxShadow: "0 24px 48px -20px rgba(0,0,0,0.5)" }, // ui.css .dlg
  list: { flexGrow: 0, flexShrink: 1, marginHorizontal: -22 }, // out to the dialog's edge: the scrollbar sits there, not 22 in
  listIn: { paddingHorizontal: 22 },
  labRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  lab: { fontSize: 12.5, lineHeight: 16, fontFamily: ff("400"), letterSpacing: 1.1, textTransform: "uppercase" }, // the eyebrow, as ui.css .lab
  h: { marginTop: 4, marginBottom: 14, fontSize: 24, lineHeight: 32, fontFamily: ff("500"), letterSpacing: -0.6 },
  li: { flexDirection: "row", gap: 8, marginTop: 6 },
  note: { fontSize: 15, lineHeight: 21.75, fontFamily: ff("400") },
  btn: { marginTop: 22, height: 50, borderRadius: 99, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, // .dlg .btn.sm
  bt: { fontSize: 16, fontFamily: ff("600") },
  sec: { marginTop: 10, height: 50, borderRadius: 99, borderWidth: 1.5, alignItems: "center", justifyContent: "center" }, // ui.css .btn.sm.ol: not the ghost's plain text
  st: { fontSize: 16, fontFamily: ff("600") },
  ghost: { marginTop: 12, textAlign: "center", fontSize: 15, fontFamily: ff("500") },
});
