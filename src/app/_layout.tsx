import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { setLang } from "@/lib/i18n";
import { kvGet } from "@/lib/store";
import { setupBackground } from "@/lib/sync";

setupBackground();

export default function Layout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    kvGet("lang").then((l) => { if (l === "en" || l === "vi") setLang(l); }).finally(() => setReady(true));
  }, []);
  return ready ? <Stack screenOptions={{ headerShown: false }} /> : null;
}
