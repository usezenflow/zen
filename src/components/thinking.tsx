import { useSyncExternalStore } from "react";
import { Veil } from "@/components/capture";
import { Steps } from "@/components/nowcard";
import { thinking } from "@/lib/apply";
import { t } from "@/lib/i18n";

/** magic.html "Thinking out loud": the page-colour veil with the line "Đang sắp xếp" while any replan runs, on every screen. */
export function Thinking() {
  const on = useSyncExternalStore(thinking.sub, thinking.get);
  return on ? <><Veil z={50} /><Steps lines={[t("thinking")]} /></> : null;
}
