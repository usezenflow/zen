// Bundles Be Vietnam Pro into the iOS widget extension; expo-font only adds it to the main app.
// List this plugin BEFORE "expo-widgets" in app.json: mods run in reverse order, and expo-widgets rewrites ios/ExpoWidgetsTarget.
const fs = require("fs");
const path = require("path");
const plist = require("@expo/plist").default;
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const TARGET = "ExpoWidgetsTarget";
const FONTS = ["Regular", "Medium", "SemiBold", "Bold"].map((w) => `BeVietnamPro-${w}.ttf`);

const withFiles = (config) =>
  withDangerousMod(config, ["ios", (c) => {
    const dir = path.join(c.modRequest.platformProjectRoot, TARGET);
    for (const f of FONTS) fs.copyFileSync(path.join(c.modRequest.projectRoot, "assets/fonts", f), path.join(dir, f));
    const p = path.join(dir, "Info.plist");
    const info = plist.parse(fs.readFileSync(p, "utf8"));
    info.UIAppFonts = FONTS;
    fs.writeFileSync(p, plist.build(info));
    return c;
  }]);

const withProject = (config) =>
  withXcodeProject(config, (c) => {
    const proj = c.modResults;
    const target = proj.findTargetKey(TARGET);
    if (!target) throw new Error(`with-widget-fonts: no ${TARGET} target; list this plugin before expo-widgets`);
    const group = proj.findPBXGroupKey({ name: TARGET }) ?? proj.findPBXGroupKey({ path: TARGET });
    // pbxResourcesBuildPhaseObj(target) falls back to the app's phase, so find the extension's own one.
    const phase = () => proj.pbxNativeTargetSection()[target].buildPhases.map((b) => proj.hash.project.objects.PBXResourcesBuildPhase?.[b.value]).find(Boolean);
    if (!phase()) proj.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target);
    const ph = phase(), builds = proj.pbxBuildFileSection(), refs = proj.pbxFileReferenceSection();
    for (const f of FONTS) {
      const file = proj.addFile(f, group); // null when the ref already exists (prebuild without --clean)
      const ref = file?.fileRef ?? Object.keys(refs).find((k) => refs[k]?.path === `"${f}"` || refs[k]?.path === f);
      if (ph.files.some(({ value }) => builds[value]?.fileRef === ref)) continue;
      const build = { uuid: proj.generateUuid(), fileRef: ref, basename: f, group: "Resources" };
      proj.addToPbxBuildFileSection(build);
      ph.files.push({ value: build.uuid, comment: `${f} in Resources` });
    }
    return c;
  });

module.exports = (config) => withProject(withFiles(config));
