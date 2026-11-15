// app.json is the config; this adds what it cannot compute. The version is package.json's, which
// changesets bumps. Android only installs an update whose versionCode is higher, so it grows with
// x.y.z (each part below 100).
const fs = require("fs");
const { version } = require("./package.json");

// This version's "- " lines in CHANGELOG.md (written by changesets, commit hash dropped): the settings
// row and "Có gì mới" show them without asking GitHub. No CHANGELOG yet means no notes.
const notesOf = (v) => {
  const log = fs.existsSync(`${__dirname}/CHANGELOG.md`) ? fs.readFileSync(`${__dirname}/CHANGELOG.md`, "utf8") : "";
  const sec = log.split(/^## /m).find((x) => x.startsWith(`${v}\n`)) ?? "";
  return sec.split("\n").map((l) => /^\s*[-*]\s+(?:[0-9a-f]{7,40}: )?(.+)$/.exec(l)?.[1].trim()).filter(Boolean);
};

module.exports = ({ config }) => {
  // "1.2.0-beta.0": only the numbers count, or versionCode is NaN
  const [major, minor, patch] = version.split(/[-+]/)[0].split(".").map((x) => Number(x) || 0);
  const code = major * 10000 + minor * 100 + patch;
  return {
    ...config,
    version,
    ios: { ...config.ios, buildNumber: String(code) },
    android: { ...config.android, versionCode: code },
    // Short commit hash for the settings version row; `dev` outside CI.
    extra: { ...config.extra, buildHash: process.env.GITHUB_SHA?.slice(0, 7) ?? "dev", notes: notesOf(version) },
  };
};
