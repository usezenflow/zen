import { expect, it, vi } from "vitest";

vi.mock("expo-speech-recognition", () => ({ ExpoSpeechRecognitionModule: {} }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
const { level, lowWords, transcripts } = await import("./ears");

it("maps the recognizer volume to 0..1, inaudible as 0", () => {
  expect(level(-2)).toBe(0);
  expect(level(0)).toBe(0);
  expect(level(5)).toBe(0.5);
  expect(level(12)).toBe(1);
});

it("joins Android's final segments and the live partial into one take (1.4)", () => {
  expect(transcripts([["họp nhóm"], ["mai 9 giờ"]], ["nộp bài"])).toEqual(["họp nhóm mai 9 giờ nộp bài"]);
  expect(transcripts([["họp nhóm mai"]])).toEqual(["họp nhóm mai"]); // iOS: one final
  expect(transcripts([])).toEqual([]);
});

it("keeps the n-best of each segment aligned by rank, without repeats (1.2)", () => {
  expect(transcripts([["nộp bài đét lai", "nộp bài deadline"], ["thứ 6"]])).toEqual(["nộp bài đét lai thứ 6", "nộp bài deadline thứ 6"]);
});

it("lists the words the recognizer doubted, not the ones it gave no confidence for (1.5)", () => {
  const seg = (segment: string, confidence: number) => ({ segment, confidence, startTimeMillis: 0, endTimeMillis: 1 });
  expect(lowWords({ segments: [seg("họp", 0.9), seg("nhóm", 0.3), seg("mai", -1)] })).toEqual(["nhóm"]);
  expect(lowWords(undefined)).toEqual([]);
});
