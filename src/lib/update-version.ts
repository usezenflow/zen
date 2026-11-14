// Pure release logic for the self-updater; no React Native imports so it runs under vitest.
export const REPO = "usezenflow/zen";
export const APK = "zen-android.apk";
export const IPA = "zen-ios-unsigned.ipa";
const DOWNLOAD = `https://github.com/${REPO}/releases/download/`;

export type Release = { tag_name?: string; draft?: boolean; html_url?: string; body?: string | null; assets?: { name?: string; browser_download_url?: string }[] };
export type Update = { version: string; url: string; page: string; notes: string[] };

const parse = (v?: string | null) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v?.trim() ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** a > b, both x.y.z; false when either does not parse. */
export function newer(a?: string | null, b?: string | null): boolean {
  const x = parse(a), y = parse(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** The release body's bullets (CHANGELOG.md's section, from changesets), one string each, without the commit hash. */
export const notesOf = (body?: string | null): string[] =>
  (body ?? "").split("\n").map((l) => /^\s*[-*]\s+(?:[0-9a-f]{7,40}: )?(.+)$/.exec(l)?.[1].trim()).filter((l): l is string => !!l);

/** The latest release when it is newer than `current` and ships `asset` from our own repo; else null. */
export function pickUpdate(r: Release | null, current: string, asset: string): Update | null {
  if (!r || r.draft || !newer(r.tag_name, current)) return null;
  const url = r.assets?.find((a) => a.name === asset)?.browser_download_url;
  if (!url?.startsWith(DOWNLOAD)) return null; // only GitHub downloads of this repo are installed
  return { version: r.tag_name!.replace(/^v/, ""), url, page: r.html_url ?? `https://github.com/${REPO}/releases`, notes: notesOf(r.body) };
}
