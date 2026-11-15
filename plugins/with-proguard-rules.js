// R8 (release minify) fails on pdfbox's optional JPX decoder, which isn't bundled. Tell it to ignore the missing class.
const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const RULES = "-dontwarn com.gemalto.jp2.**\n";

module.exports = function withProguardRules(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, "app", "proguard-rules.pro");
      const src = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (!src.includes(RULES)) fs.writeFileSync(file, `${src}\n${RULES}`);
      return config;
    },
  ]);
};
