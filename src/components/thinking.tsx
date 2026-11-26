import { useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { Veil } from "@/components/capture";
import { Steps } from "@/components/nowcard";
import { narration, thinking } from "@/lib/apply";
import { t } from "@/lib/i18n";

/** magic.html "Thinking out loud": the page-colour veil while any replan runs, on every screen; the steps line by line, or "Đang sắp xếp" before the first. */
export function Thinking() {
  const on = useSyncExternalStore(thinking.sub, thinking.get);
  const lines = useSyncExternalStore(narration.sub, narration.get);
  return on ? <><Veil z={50} /><View style={[StyleSheet.absoluteFill, { zIndex: 51 }]} pointerEvents="none"><Steps lines={lines.length ? lines : [t("thinking")]} /></View></> : null;
}
