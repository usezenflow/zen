// Bundles Be Vietnam Pro, Bricolage Grotesque, and widget art/logo assets into the iOS widget extension and Android drawables;
// expo-font only adds fonts to the main app, and symbolic Asset Catalog / R.drawable images avoid per-entry UIImage/Bitmap decodes (skeletons).
// List this plugin BEFORE "expo-widgets" in app.json: mods run in reverse order, and expo-widgets rewrites ios/ExpoWidgetsTarget.
const fs = require("fs");
const path = require("path");
// @expo/plist is not a direct dependency (pnpm hides it in CI); load the copy @expo/config-plugins depends on.
const configPlugins = path.dirname(require.resolve("@expo/config-plugins/package.json", { paths: [path.dirname(require.resolve("expo/package.json"))] }));
const plist = require(require.resolve("@expo/plist", { paths: [configPlugins] })).default;
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const TARGET = "ExpoWidgetsTarget";
const FONTS = [
  "BeVietnamPro-Light.ttf",
  "BeVietnamPro-Regular.ttf",
  "BeVietnamPro-Medium.ttf",
  "BeVietnamPro-SemiBold.ttf",
  "BeVietnamPro-Bold.ttf",
  "BricolageGrotesque_500Medium.ttf",
  "BricolageGrotesque_700Bold.ttf",
  "BricolageGrotesque_800ExtraBold.ttf",
];
const ARTS = ["plan", "lecture", "exam", "assignment", "night", "clay", "busy"];
const IMAGES = [...ARTS.map((k) => [`zen_art_${k}`, `${k}.png`]), ["zen_logo", "logo.png"]];

const withIosFiles = (config) =>
  withDangerousMod(config, ["ios", (c) => {
    const dir = path.join(c.modRequest.platformProjectRoot, TARGET);
    for (const f of FONTS) fs.copyFileSync(path.join(c.modRequest.projectRoot, "assets/fonts", f), path.join(dir, f));
    const xcassets = path.join(dir, "Assets.xcassets");
    fs.mkdirSync(xcassets, { recursive: true });
    fs.writeFileSync(path.join(xcassets, "Contents.json"), JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2));
    for (const [name, file] of IMAGES) {
      const setDir = path.join(xcassets, `${name}.imageset`);
      fs.mkdirSync(setDir, { recursive: true });
      fs.copyFileSync(path.join(c.modRequest.projectRoot, "assets/widgets", file), path.join(setDir, file));
      fs.writeFileSync(
        path.join(setDir, "Contents.json"),
        JSON.stringify({ images: [{ filename: file, idiom: "universal" }], info: { author: "xcode", version: 1 } }, null, 2),
      );
    }
    const p = path.join(dir, "Info.plist");
    const info = plist.parse(fs.readFileSync(p, "utf8"));
    info.UIAppFonts = FONTS;
    fs.writeFileSync(p, plist.build(info));
    return c;
  }]);

const withIosProject = (config) =>
  withXcodeProject(config, (c) => {
    const proj = c.modResults;
    const target = proj.findTargetKey(TARGET);
    if (!target) throw new Error(`with-widget-fonts: no ${TARGET} target; list this plugin before expo-widgets`);
    const group = proj.findPBXGroupKey({ name: TARGET }) ?? proj.findPBXGroupKey({ path: TARGET });
    // pbxResourcesBuildPhaseObj(target) falls back to the app's phase, so find the extension's own one.
    const phase = () => proj.pbxNativeTargetSection()[target].buildPhases.map((b) => proj.hash.project.objects.PBXResourcesBuildPhase?.[b.value]).find(Boolean);
    if (!phase()) proj.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target);
    const ph = phase(), builds = proj.pbxBuildFileSection(), refs = proj.pbxFileReferenceSection();
    for (const f of [...FONTS, "Assets.xcassets"]) {
      const file = proj.addFile(f, group); // null when the ref already exists (prebuild without --clean)
      const ref = file?.fileRef ?? Object.keys(refs).find((k) => refs[k]?.path === `"${f}"` || refs[k]?.path === f);
      if (ph.files.some(({ value }) => builds[value]?.fileRef === ref)) continue;
      const build = { uuid: proj.generateUuid(), fileRef: ref, basename: f, group: "Resources" };
      proj.addToPbxBuildFileSection(build);
      ph.files.push({ value: build.uuid, comment: `${f} in Resources` });
    }
    return c;
  });

const withAndroidAssets = (config) =>
  withDangerousMod(config, ["android", (c) => {
    const drawable = path.join(c.modRequest.platformProjectRoot, "app/src/main/res/drawable-nodpi");
    fs.mkdirSync(drawable, { recursive: true });
    for (const [name, file] of IMAGES) {
      fs.copyFileSync(path.join(c.modRequest.projectRoot, "assets/widgets", file), path.join(drawable, `${name}.png`));
    }
    return c;
  }]);

module.exports = (config) => withAndroidAssets(withIosProject(withIosFiles(config)));
