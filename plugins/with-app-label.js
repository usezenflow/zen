// The home-screen name is lowercase "zen", but app.json's name must stay "Zen": it names the Xcode project/scheme CI builds.
const { withInfoPlist, withStringsXml, AndroidConfig } = require("expo/config-plugins");

const LABEL = "zen";

module.exports = function withAppLabel(config) {
  config = withInfoPlist(config, (c) => { c.modResults.CFBundleDisplayName = LABEL; return c; });
  return withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem([{ $: { name: "app_name" }, _: LABEL }], c.modResults);
    return c;
  });
};
