import { configDefaults, defineConfig } from "vitest/config";

process.env.TZ ??= "Asia/Ho_Chi_Minh"; // tests write Vietnam wall clocks; workers inherit this
// *.ui.test.tsx are React Native component tests: jest-expo runs them (jest.config.js).
// CI runners vary several times in speed: no per-test timeout there (timing tests skip themselves on CI); 20 s locally still flags a hang (the big grid tests pass in 5 s alone but not under a parallel full run).
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "**/*.ui.test.tsx", ".claude/**"], ...(process.env.CI ? { testTimeout: 0 } : { testTimeout: 20_000 }) } });
