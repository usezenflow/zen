import { configDefaults, defineConfig } from "vitest/config";

process.env.TZ ??= "Asia/Ho_Chi_Minh"; // tests write Vietnam wall clocks; workers inherit this
// *.ui.test.tsx are React Native component tests: jest-expo runs them (jest.config.js).
// CI runners vary several times in speed: no per-test timeout there (timing tests skip themselves on CI); 5 s locally still flags a hang.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "**/*.ui.test.tsx"], ...(process.env.CI ? { testTimeout: 0 } : {}) } });
