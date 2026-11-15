import { configDefaults, defineConfig } from "vitest/config";

process.env.TZ ??= "Asia/Ho_Chi_Minh"; // tests write Vietnam wall clocks; workers inherit this
// *.ui.test.tsx are React Native component tests: jest-expo runs them (jest.config.js).
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "**/*.ui.test.tsx"] } });
