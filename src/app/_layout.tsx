import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Appearance, useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { kvGet } from "@/lib/store";
import * as Notifications from "expo-notifications";
import { askReminders, pushReminders } from "@/lib/reminders";
import { setupBackground } from "@/lib/sync";

setupBackground();
// Show reminders and campus notices while the app is open too.
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
// Hold the splash until the saved theme is applied, then fade it out instead of flashing a blank root.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

export default function Layout() {
  const [ready, setReady] = useState(false);
  const dark = useColorScheme() === "dark"; // follows the in-app theme override too
  useEffect(() => {
    kvGet("theme").then((m) => { if (m === "light" || m === "dark") Appearance.setColorScheme(m); }).finally(() => { setReady(true); SplashScreen.hide(); });
    askReminders().then(pushReminders).catch(() => {});
  }, []);
  // Rows, day pull and week swipe use gesture-handler, which needs this root.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={dark ? "light" : "dark"} />
      {ready ? (
        <Stack screenOptions={{ headerShown: false, statusBarStyle: dark ? "light" : "dark" }}>
          {/* Settings is a sheet you swipe down; marks and task stay pushes. */}
          <Stack.Screen name="settings" options={{ presentation: "modal" }} />
        </Stack>
      ) : null}
    </GestureHandlerRootView>
  );
}
