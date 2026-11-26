import "@/lib/matchall"; // first: Hermes matchAll loses named groups, fixed before any reader code runs
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Appearance, Linking, useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { kvGet } from "@/lib/store";
import * as Notifications from "expo-notifications";
import { askReminders, pushReminders } from "@/lib/reminders";
import { nudgeAction } from "@/lib/nudges";
import { proposeRebalance } from "@/lib/apply";
import { setupBackground } from "@/lib/sync";
import { feedTaps } from "@/components/outside";
import { UpdatePrompt } from "@/components/update";
import { Boot } from "@/components/logostate";

setupBackground();
// Show reminders and campus notices while the app is open too.
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
// Hold the splash until the saved theme is applied, then fade it out instead of flashing a blank root.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

// A widget or link opening a task cold still has Home under it, so back has somewhere to go.
export const unstable_settings = { initialRouteName: "index" };

let lastTap: string | undefined; // the notification tap already acted on (survives a re-render, not a restart)

export default function Layout() {
  const [ready, setReady] = useState(false);
  const [held, setHeld] = useState(true); // the koi turns for a moment even when the app is ready at once
  const dark = useColorScheme() === "dark"; // follows the in-app theme override too
  useEffect(() => {
    kvGet("theme").then((m) => { if (m === "light" || m === "dark") Appearance.setColorScheme(m); }).finally(() => setReady(true));
    SplashScreen.hide(); // Boot is already drawn on the same background
    askReminders().then(pushReminders).catch(() => {});
    const hold = setTimeout(() => setHeld(false), 1400);
    return () => clearTimeout(hold);
  }, []);
  // A tapped notice opens what it names: a web page (fees: the pay page) or a screen.
  const tapped = Notifications.useLastNotificationResponse();
  useEffect(() => {
    // The overrun and start nudges' buttons: Xong ticks the task, Để sau moves it on; neither opens the app.
    const id = tapped?.notification.request.content.data?.id, act = tapped?.actionIdentifier;
    // useLastNotificationResponse replays the last tap on every cold start: a tap acts once.
    const tapKey = tapped ? `${tapped.notification.request.identifier}:${act}:${tapped.notification.date}` : undefined;
    if (!tapKey || tapKey === lastTap) return;
    if (ready) lastTap = tapKey;
    if (ready && typeof id === "string" && (act === "done" || act === "later")) nudgeAction(id, act).then(pushReminders).catch(() => {});
    // The night-before note: "Xếp nhẹ lại" stores a lighter-week proposal (the Rebalance pill shows it on the next look at Home); "Xem ngày mai" opens the app, which is Home.
    if (ready && act === "light") void proposeRebalance(Date.now(), true).catch(() => {});
    if (ready && act === "see") { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); router.navigate({ pathname: "/", params: { day: String(d.getTime()) } }); }
    const route = tapped?.notification.request.content.data?.route;
    if (!ready || typeof route !== "string") return;
    if (route.startsWith("https://")) Linking.openURL(route).catch(() => {});
    else if (route.startsWith("/")) router.push(route as "/marks");
  }, [tapped, ready]);
  // Rows, day pull and week swipe use gesture-handler, which needs this root.
  return (
    <GestureHandlerRootView style={{ flex: 1 }} {...feedTaps}>
      <StatusBar style={dark ? "light" : "dark"} />
      {ready ? (
        <Stack screenOptions={{ headerShown: false, statusBarStyle: dark ? "light" : "dark" }}>
          {/* Settings is a sheet you swipe down; marks and task stay pushes. */}
          <Stack.Screen name="settings" options={{ presentation: "modal" }} />
        </Stack>
      ) : null}
      {ready && <UpdatePrompt />}
      {(!ready || held) && <Boot />}
    </GestureHandlerRootView>
  );
}
