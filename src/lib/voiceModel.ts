// The on-device Vietnamese recognizer (Moonshine tiny streaming, MIT, ~32 MB): downloaded once when the user asks, kept in app files.
// Until it is ready, or when it cannot run, ears.ts uses the system dictation.
import * as Device from "expo-device";
import * as FS from "expo-file-system/legacy";
import { kvGet, kvSet } from "./store";

const PIN = "tiny-streaming-vi/quantized_26_08_24"; // the catalog's pin for Vietnamese (moonshine core/moonshine-model-catalog.cpp)
const BASE = `https://download.moonshine.ai/model/${PIN}/`;
// file and its exact size: a short file is a broken download, never a model
export const FILES: [string, number][] = [["adapter.ort", 1318472], ["cross_kv.ort", 1288120], ["decoder_kv.ort", 19717336], ["encoder.ort", 7772792], ["frontend.model.ort", 23176], ["frontend.weights.ort", 2093280], ["streaming_config.json", 509], ["tokenizer.bin", 95323]];
export const MODEL_BYTES = FILES.reduce((n, [, b]) => n + b, 0);
const MIN_RAM = 3 * 1024 ** 3; // under this the system dictation is kept: the model needs room beside the app

const dir = () => `${FS.documentDirectory}moonshine/${PIN.replace("/", "-")}/`;
/** The path the native side wants: no file:// prefix, no trailing slash. */
export const modelPath = () => dir().replace(/^file:\/\//, "").replace(/\/$/, "");

/** Every file is there at its exact size. */
export async function modelReady(): Promise<boolean> {
  try {
    for (const [f, size] of FILES) { const i = await FS.getInfoAsync(dir() + f); if (!i.exists || i.size !== size) return false; }
    return true;
  } catch { return false; }
}

/** Downloads what is missing, file by file (a part file moves into place only at full size). `onProgress` gets 0..1 of the whole. False when a file failed. */
export async function downloadModel(onProgress?: (done: number) => void): Promise<boolean> {
  try {
    reset();
    await FS.makeDirectoryAsync(dir(), { intermediates: true });
    let before = 0;
    for (const [f, size] of FILES) {
      const have = await FS.getInfoAsync(dir() + f);
      if (!have.exists || have.size !== size) {
        const part = `${dir()}${f}.part`;
        await FS.deleteAsync(part, { idempotent: true });
        const r = await FS.createDownloadResumable(BASE + f, part, {}, (p) => onProgress?.((before + p.totalBytesWritten) / MODEL_BYTES)).downloadAsync();
        const got = await FS.getInfoAsync(part);
        if (r?.status !== 200 || !got.exists || got.size !== size) { await FS.deleteAsync(part, { idempotent: true }); return false; }
        await FS.moveAsync({ from: part, to: dir() + f });
      }
      before += size;
      onProgress?.(before / MODEL_BYTES);
    }
    return true;
  } catch { return false; }
}

export const removeModel = () => { reset(); return FS.deleteAsync(dir(), { idempotent: true }).catch(() => {}); };

/** A phone with room for it: total memory is unknown on some devices, and those keep the system dictation. */
export const roomy = () => (Device.totalMemory ?? 0) >= MIN_RAM;

/** The user's switch: "1" once they downloaded it and left it on. */
export const fastOn = async () => (await kvGet("voiceFast")) === "1";
export const setFast = (on: boolean) => { reset(); return kvSet("voiceFast", on ? "1" : "0"); };

// Whether this press of the mic may use the model: asked once, until the switch, the download or a failure changes it.
let usableP: Promise<boolean> | undefined;
const reset = () => { usableP = undefined; };
export const usable = () => (usableP ??= (async () => (await fastOn()) && roomy() && (await modelReady()))());
/** The model failed to load or start on this phone: the system dictation for the rest of the session. */
export const broke = () => { usableP = Promise.resolve(false); };
