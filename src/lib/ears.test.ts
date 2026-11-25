import { expect, it, vi } from "vitest";

const SR = {
  getPermissionsAsync: vi.fn(), requestPermissionsAsync: vi.fn(), start: vi.fn(), stop: vi.fn(), abort: vi.fn(), setAudioSessionActiveIOS: vi.fn(),
  addListener: vi.fn(() => ({ remove() {} })), getSupportedLocales: vi.fn(async () => ({ installedLocales: [] })),
};
vi.mock("expo-speech-recognition", () => ({ ExpoSpeechRecognitionModule: SR }));
const W = vi.hoisted(() => ({ init: vi.fn(async () => ({})) }));
vi.mock("./whisper-native", () => ({
  initWhisper: W.init,
  RealtimeTranscriber: class { start = vi.fn(async () => {}); stop = vi.fn(async () => {}); nextSlice = vi.fn(async () => {}); },
  AudioPcmStreamAdapter: class { onData() {} },
}));
const kv = new Map<string, string>();
const FS = { exists: false, size: 0 };
vi.mock("./store", () => ({ kvGet: vi.fn(async (k: string) => kv.get(k) ?? null), kvSet: vi.fn() }));
vi.mock("expo-device", () => ({ totalMemory: 8 * 1024 ** 3, deviceYearClass: 2022 }));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///d/", getInfoAsync: vi.fn(async () => FS), makeDirectoryAsync: vi.fn(), createDownloadResumable: vi.fn(), deleteAsync: vi.fn(), EncodingType: { Base64: "base64" } }));
const { askMic, level, listenLive, lowWords, transcripts } = await import("./ears");

it("asks for the mic only when it is missing (Android's ask pauses the app and cancels the hold)", async () => {
  SR.getPermissionsAsync.mockResolvedValue({ granted: true });
  expect(await askMic()).toBe(true);
  expect(SR.requestPermissionsAsync).not.toHaveBeenCalled();
  SR.getPermissionsAsync.mockResolvedValue({ granted: false });
  SR.requestPermissionsAsync.mockResolvedValue({ granted: true });
  expect(await askMic()).toBe(true);
  expect(SR.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

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

// The fallback runs first: a failed load is not cached, so the success case below loads again.
it("falls back to the OS recognizer when the whisper model cannot start", async () => {
  FS.exists = true; FS.size = 487601984; kv.clear(); SR.start.mockClear();
  W.init.mockRejectedValueOnce(new Error("load failed"));
  await listenLive({});
  expect(SR.start).toHaveBeenCalledTimes(1);
  FS.exists = false;
});

it("uses whisper when the recommended model is on disk and it starts", async () => {
  FS.exists = true; FS.size = 487601984; kv.clear(); SR.start.mockClear();
  const s = await listenLive({});
  expect(SR.start).not.toHaveBeenCalled();
  expect(s).toHaveProperty("stop");
  FS.exists = false;
});

it("uses the OS recognizer when the setting says so or no model is on disk", async () => {
  SR.start.mockClear();
  FS.exists = true; FS.size = 487601984; kv.set("stt.engine", "os");
  await listenLive({});
  expect(SR.start).toHaveBeenCalledTimes(1);
  FS.exists = false; kv.clear();
  SR.start.mockClear();
  await listenLive({});
  expect(SR.start).toHaveBeenCalledTimes(1);
});
