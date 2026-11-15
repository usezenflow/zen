// Component tests (*.ui.test.tsx). Pure logic stays on vitest (vitest.config.ts excludes these).
const preset = require("jest-expo/jest-preset");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.ui.test.tsx"],
  setupFiles: ["<rootDir>/test/env.ts", "react-native-gesture-handler/jestSetup"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  // msw and its helpers ship ESM-only builds (some .mjs): compile them like the app's own files.
  transform: { ...preset.transform, "\\.mjs$": preset.transform["\\.[jt]sx?$"] },
  transformIgnorePatterns: preset.transformIgnorePatterns.map((p, i) => (i ? p : p.replace("(?!(", "(?!(msw|@mswjs|@msw|@open-draft|rettime|until-async|cookie|headers-polyfill|tough-cookie|outvariant|strict-event-emitter|is-node-process|"))),
};
