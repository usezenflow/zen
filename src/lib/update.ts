import Constants from "expo-constants";
import * as FS from "expo-file-system/legacy";
import * as Intent from "expo-intent-launcher";
import { Linking, Platform } from "react-native";
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
  const saved = JSON.parse((await kvGet("updateCheck")) ?? "null") as { at: number; r: Release | null } | null;
  if (saved && Date.now() - saved.at < H6) return pickUpdate(saved.r, installed, asset);
  const r = await api("latest");
  if (r) { await kvSet("updateCheck", JSON.stringify({ at: Date.now(), r })); }
  return pickUpdate(r, installed, asset);
}

/**
 * Android: download the APK and open the system installer (it asks to confirm; it only accepts our signing key).
 * iOS: the .ipa is unsigned, so SideStore installs and re-signs it. Any failure opens the release page instead.
 */
export async function install(u: Update, onProgress: (pct: number) => void): Promise<void> {
  try {
    if (Platform.OS === "ios") return void (await Linking.openURL(`sidestore://install?url=${encodeURIComponent(u.url)}`));
    const target = `${FS.cacheDirectory}zen-update.apk`;
    await FS.deleteAsync(target, { idempotent: true });
    const res = await FS.createDownloadResumable(u.url, target, {}, ({ totalBytesWritten: w, totalBytesExpectedToWrite: t }) => {
      if (t > 0) onProgress(Math.round((w / t) * 100));
    }).downloadAsync();
    if (res?.status !== 200) throw new Error(`download ${res?.status}`);
    await Intent.startActivityAsync("android.intent.action.VIEW", {
      data: await FS.getContentUriAsync(res.uri),
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: "application/vnd.android.package-archive",
    });
  } catch {
    await Linking.openURL(u.page).catch(() => {});
  }
}
