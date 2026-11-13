import { modelPath } from "./models";

type Lang = "vi" | "en";
type Ctx = { transcribeData(data: ArrayBuffer, o: { language: string }): { promise: Promise<{ result: string }> } };
type Pcm = { init(o: object): void; start(): void; stop(): Promise<string>; on(e: "data", cb: (b64: string) => void): { remove(): void } };
const ctxs: Partial<Record<Lang, Promise<Ctx>>> = {};

async function load(lang: Lang): Promise<Ctx> {
  const path = await modelPath(lang === "vi" ? "whisper-vi" : "whisper-en");
  if (!path) throw new Error(`ears: ${lang} model not downloaded`);
  const { initWhisper } = await import("whisper.rn/index");
  return initWhisper({ filePath: path });
}

/** Joins base64 chunks of 16 kHz mono s16le PCM into one buffer. */
export function joinPcm(chunks: string[]): ArrayBuffer {
  const parts = chunks.map((c) => Uint8Array.from(atob(c), (ch) => ch.charCodeAt(0)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

/** Starts the mic as raw 16 kHz mono PCM, which whisper reads on both platforms. Returns stop, which yields the audio. */
export async function listen(): Promise<() => Promise<ArrayBuffer>> {
  const pcm: Pcm = (await import("@fugood/react-native-audio-pcm-stream")).default as Pcm;
  const chunks: string[] = [];
  pcm.init({ sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 6, bufferSize: 4096, wavFile: "" });
  const sub = pcm.on("data", (b) => chunks.push(b));
  pcm.start();
  return async () => {
    await pcm.stop();
    sub.remove();
    return joinPcm(chunks);
  };
}

export async function transcribe(pcm: ArrayBuffer, lang: Lang): Promise<string> {
  const ctx = await (ctxs[lang] ??= load(lang).catch((e) => {
    delete ctxs[lang]; // allow retry after the download finishes
    throw e;
  }));
  const { result } = await ctx.transcribeData(pcm, { language: lang }).promise;
  return result.trim();
}
