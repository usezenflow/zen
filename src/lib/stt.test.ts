import { expect, it, vi } from "vitest";

vi.mock("./whisper-native", () => ({
  initWhisper: vi.fn(async () => { throw new Error("no model"); }),
  RealtimeTranscriber: class { start = vi.fn(); stop = vi.fn(); },
  AudioPcmStreamAdapter: class {},
}));
vi.mock("./store", () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn() }));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///d/", getInfoAsync: vi.fn(async () => ({ exists: false })), makeDirectoryAsync: vi.fn(), createDownloadResumable: vi.fn(), deleteAsync: vi.fn(), EncodingType: { Base64: "base64" } }));
const { pickEngine, promptOf, recommended, wav, weakFor, whisperListen } = await import("./stt");

const GB = 1024 ** 3;

it("recommends the small tier from 6 GB and 2021, the base tier from 3 GB and 2018, else the OS recognizer (inclusive boundaries)", () => {
  expect(recommended({ totalMemory: 6 * GB, yearClass: 2021 })).toBe("small");
  expect(recommended({ totalMemory: 6 * GB - 1, yearClass: 2021 })).toBe("base");
  expect(recommended({ totalMemory: 6 * GB, yearClass: 2020 })).toBe("base");
  expect(recommended({ totalMemory: 3 * GB, yearClass: 2018 })).toBe("base");
  expect(recommended({ totalMemory: 3 * GB - 1, yearClass: 2018 })).toBe("os");
  expect(recommended({ totalMemory: 3 * GB, yearClass: 2017 })).toBe("os");
  expect(recommended({ totalMemory: 8 * GB, yearClass: 2017 })).toBe("os");
  expect(recommended({ totalMemory: null, yearClass: null })).toBe("os"); // unknown: assume too weak
  expect(recommended({ totalMemory: 8 * GB, yearClass: 2023, cpus: ["armeabi-v7a"] })).toBe("os"); // 32-bit only
  expect(recommended({ totalMemory: 8 * GB, yearClass: 2023, freeDisk: 600 * 1024 ** 2 })).toBe("base"); // small does not fit
  expect(recommended({ totalMemory: 8 * GB, yearClass: 2023, freeDisk: 100 * 1024 ** 2 })).toBe("os");
});

it("says why a tier is too much for this phone", () => {
  expect(weakFor("small", { totalMemory: 4 * GB, yearClass: 2023 })).toBe("mem");
  expect(weakFor("small", { totalMemory: 8 * GB, yearClass: 2019 })).toBe("cpu");
  expect(weakFor("base", { totalMemory: 8 * GB, yearClass: 2023, cpus: ["arm64-v8a"], freeDisk: 10 * GB })).toBeUndefined();
});

const dev = { totalMemory: 8 * GB, yearClass: 2022 };
it("uses the setting, else the recommended tier, only when that exact model is on disk", () => {
  expect(pickEngine({ setting: null, installed: "small", ...dev })).toBe("small");
  expect(pickEngine({ setting: null, installed: null, ...dev })).toBe("os");
  expect(pickEngine({ setting: null, installed: "base", ...dev })).toBe("os"); // recommended small is not on disk
  expect(pickEngine({ setting: "base", installed: "base", ...dev })).toBe("base");
  expect(pickEngine({ setting: "os", installed: "small", ...dev })).toBe("os");
});

it("lets the setting override the device gate", () => {
  expect(pickEngine({ setting: "small", installed: "small", totalMemory: 4 * GB, yearClass: 2019 })).toBe("small");
});

it("builds the term prompt: trimmed, unique, capped", () => {
  expect(promptOf([" Toán cao cấp ", "", "Toán cao cấp", "CSDL"])).toBe("Toán cao cấp, CSDL");
  const many = Array.from({ length: 200 }, (_, i) => `môn học số ${i}`);
  const p = promptOf(many, 200);
  expect(p.split(", ").length).toBeLessThan(200);
  expect(p.startsWith("môn học số 0, ")).toBe(true);
});

it("wraps PCM in a 16 kHz mono 16-bit WAV header", () => {
  const out = wav(new Uint8Array(10));
  const dv = new DataView(out.buffer);
  expect(out.length).toBe(54);
  expect(String.fromCharCode(...out.slice(0, 4))).toBe("RIFF");
  expect(dv.getUint32(24, true)).toBe(16000);
  expect(dv.getUint32(40, true)).toBe(10);
});

it("throws when the model cannot start, so ears.ts falls back", async () => {
  await expect(whisperListen({ tier: "small" })).rejects.toThrow("no model");
});
