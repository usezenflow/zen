import { useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { Veil } from "@/components/capture";
import { Steps } from "@/components/nowcard";
import { thinking } from "@/lib/apply";
import { t } from "@/lib/i18n";

/** magic.html "Thinking out loud": the page-colour veil with the line "Đang sắp xếp" while any replan runs, on every screen. */
export function Thinking() {
  const on = useSyncExternalStore(thinking.sub, thinking.get);
  return on ? <><Veil z={50} /><View style={[StyleSheet.absoluteFill, { zIndex: 51 }]} pointerEvents="none"><Steps lines={[t("thinking")]} /></View></> : null;
}
