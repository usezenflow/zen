// The Expo template signs release builds with the shared debug keystore, so Android refuses to update
// over an install signed by another key. With ANDROID_KEYSTORE_PATH set (CI releases) release builds
// sign with that keystore; without it (local builds) they keep the debug key.
const { withAppBuildGradle } = require("expo/config-plugins");

const RELEASE_SIGNING_CONFIG = `
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;
    if (src.includes("ANDROID_KEYSTORE_PATH")) return config;
    const debugBlock = /(signingConfigs \{\s*debug \{[^}]*\})/;
    const releaseUse =
      /(release \{\s*\/\/ Caution![^\n]*\n\s*\/\/ see[^\n]*\n\s*)signingConfig signingConfigs\.debug/;
    if (!debugBlock.test(src) || !releaseUse.test(src)) {
      throw new Error("with-release-signing: android/app/build.gradle no longer matches the Expo template");
    }
    config.modResults.contents = src
      .replace(debugBlock, `$1${RELEASE_SIGNING_CONFIG}`)
      .replace(
        releaseUse,
        "$1signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
      );
    return config;
  });
};
