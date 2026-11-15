import Constants from "expo-constants";
import * as FS from "expo-file-system/legacy";
import * as Intent from "expo-intent-launcher";
import { useSyncExternalStore } from "react";
import { AppState, Linking, Platform } from "react-native";
import { kvGet, kvSet } from "./store";
import { APK, IPA, pickUpdate, REPO, type Release, type Update } from "./update-version";

/** package.json's version (via app.config.js), plus the commit hash (`dev` outside CI). */
export const installed = Constants.expoConfig?.version ?? "0.0.0";
export const buildHash = String(Constants.expoConfig?.extra?.buildHash ?? "dev");
/** This version's notes, built in from CHANGELOG.md by app.config.js. */
export const notes: string[] = Constants.expoConfig?.extra?.notes ?? [];

const api = (path: string): Promise<Release | null> =>
  fetch(`https://api.github.com/repos/${REPO}/releases/${path}`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);

const asset = Platform.OS === "ios" ? IPA : APK;
const H6 = 6 * 3600_000;

// GitHub is asked at most every six hours, across restarts: the last answer is kept in kv with its time.
// A failure is just "no update". The answer carries the new release's notes for the update dialog.
export async function checkUpdate(): Promise<Update | null> {
  let saved: { at: number; r: Release | null } | null = null;
  try { saved = JSON.parse((await kvGet("updateCheck")) ?? "null"); } catch {} // corrupt: as if never asked
  if (saved && typeof saved.at === "number" && Date.now() - saved.at < H6) return pickUpdate(saved.r, installed, asset);
  const r = await api("latest");
  if (r) { await kvSet("updateCheck", JSON.stringify({ at: Date.now(), r })); }
  return pickUpdate(r, installed, asset);
}

// The APK download runs behind whatever screen is open: the dialog closes at once and the top toast shows the ring.
export type Download = { version: string; pct: number };
let dl: Download | null = null;
const subs = new Set<() => void>();
const set = (d: Download | null) => { dl = d; subs.forEach((f) => f()); };
const onDownload = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** The running download, or null. */
export const useDownload = () => useSyncExternalStore(onDownload, () => dl);
// Android does not let an app open an activity from the background: the installer waits for the app to be on screen.
const onScreen = () => new Promise<void>((r) => {
  if (AppState.currentState === "active") return r();
  const sub = AppState.addEventListener("change", (st) => { if (st === "active") { sub.remove(); r(); } });
});

/**
 * Android: download the APK in the background, then open the system installer (it asks to confirm; it only accepts our signing key).
 * iOS: the .ipa is unsigned, so SideStore installs and re-signs it. Any failure opens the release page instead. A second call mid-download does nothing.
 */
export async function install(u: Update): Promise<void> {
  if (dl) return;
  try {
    if (Platform.OS === "ios") return void (await Linking.openURL(`sidestore://install?url=${encodeURIComponent(u.url)}`));
    set({ version: u.version, pct: 0 });
    const target = `${FS.cacheDirectory}zen-update.apk`;
    await FS.deleteAsync(target, { idempotent: true });
    const res = await FS.createDownloadResumable(u.url, target, {}, ({ totalBytesWritten: w, totalBytesExpectedToWrite: t }) => {
      if (t > 0 && dl) { const pct = Math.round((w / t) * 100); if (pct !== dl.pct) set({ ...dl, pct }); }
    }).downloadAsync();
    if (res?.status !== 200) throw new Error(`download ${res?.status}`);
    set({ version: u.version, pct: 100 });
    await onScreen();
    await Intent.startActivityAsync("android.intent.action.VIEW", {
      data: await FS.getContentUriAsync(res.uri),
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: "application/vnd.android.package-archive",
    });
  } catch {
    await Linking.openURL(u.page).catch(() => {});
  } finally {
    set(null);
  }
}
