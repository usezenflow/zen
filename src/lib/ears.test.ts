import { expect, it, vi } from "vitest";

vi.mock("expo-speech-recognition", () => ({ ExpoSpeechRecognitionModule: {} }));
const { level } = await import("./ears");

it("maps the recognizer volume to 0..1, inaudible as 0", () => {
  expect(level(-2)).toBe(0);
  expect(level(0)).toBe(0);
  expect(level(5)).toBe(0.5);
  expect(level(12)).toBe(1);
});
