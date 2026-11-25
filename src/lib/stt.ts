// On-device Vietnamese STT: whisper.rn with PhoWhisper (ggml) in two sizes. ears.ts picks it over the OS recognizer; any failure there falls back.
import * as FS from "expo-file-system/legacy";
import { File } from "expo-file-system";
import type { WhisperContext } from "./whisper-native";
import { Buffer } from "buffer";

const GB = 1024 ** 3;
const HF = "https://huggingface.co/dongxiat";
// Community ggml conversions of vinai/PhoWhisper. The exact byte size is the readiness check (a short file is a broken download).
export const TIERS = {
  small: { url: `${HF}/ggml-PhoWhisper-small/resolve/main/ggml-PhoWhisper-small.bin`, bytes: 487601984, file: "ggml-PhoWhisper-small.bin" },
  base: { url: `${HF}/ggml-PhoWhisper-base/resolve/main/ggml-PhoWhisper-base.bin`, bytes: 147951482, file: "ggml-PhoWhisper-base.bin" },
} as const;
export type Tier = keyof typeof TIERS;
export type Engine = Tier | "os";
// shortcut: these device gates are guesses; tune them from the bench's WER and first-partial numbers on real phones.
export const GATE: Record<Tier, { mem: number; year: number }> = { small: { mem: 6 * GB, year: 2021 }, base: { mem: 3 * GB, year: 2018 } };

export const engineOf = (v: string | null): Engine | null => (v === "small" || v === "base" || v === "os" ? v : null);
const dirOf = () => `${FS.documentDirectory}stt/`;
const pathOf = (t: Tier) => `${dirOf()}${TIERS[t].file}`;

export type Spec = { totalMemory: number | null; yearClass: number | null; cpus?: string[] | null; freeDisk?: number | null };
export type Weak = "mem" | "cpu" | "disk";
const ROOM = 300 * 1024 ** 2; // left free after the model: the merge holds one extra chunk, and the phone needs room to breathe

/** Why this device should not run tier `t`, or undefined when it can. Unknown memory or year counts as too weak (a 488 MB model that cannot load is worse than none). */
export function weakFor(t: Tier, o: Spec): Weak | undefined {
  if (o.freeDisk != null && o.freeDisk < TIERS[t].bytes + ROOM) return "disk";
  if (o.cpus && !o.cpus.some((c) => /arm64|aarch64/i.test(c))) return "cpu"; // whisper.cpp needs 64-bit ARM to be usable
  if ((o.totalMemory ?? 0) < GATE[t].mem) return "mem";
  if ((o.yearClass ?? 0) < GATE[t].year) return "cpu";
}

/** The biggest tier this device can run, else "os". */
export const recommended = (o: Spec): Engine => (Object.keys(GATE) as Tier[]).find((t) => !weakFor(t, o)) ?? "os";

/** The engine for one take: the setting (else the recommended tier), used only when that exact model is on disk; otherwise the OS recognizer. */
export function pickEngine(o: { setting: Engine | null; installed: Tier | null; totalMemory: number | null; yearClass: number | null }): Engine {
  const want = o.setting ?? recommended(o);
  return want !== "os" && want === o.installed ? want : "os";
}

export async function modelReady(t: Tier): Promise<boolean> {
  try { const i = await FS.getInfoAsync(pathOf(t)); return i.exists && i.size === TIERS[t].bytes; } catch { return false; }
}

/** The tier on disk, if any. Only one is kept. */
export async function installed(): Promise<Tier | null> {
  for (const t of Object.keys(TIERS) as Tier[]) if (await modelReady(t)) return t;
  return null;
}

const CHUNK = 16 * 1024 ** 2; // a dropped connection re-fetches at most one chunk
const RETRIES = 20;
const partOf = (t: Tier, i: number) => `${pathOf(t)}.${i}`;
const chunkBytes = (t: Tier, i: number) => Math.min(CHUNK, TIERS[t].bytes - i * CHUNK);
let job: { cur?: FS.DownloadResumable; paused?: boolean } | undefined;

/**
 * Fetches a tier as ranged chunks. Finished chunks stay on disk and a dropped chunk is retried, so a network drop or a restart
 * continues. Resolves false when paused. On success the other tier is deleted: only one model is kept.
 */
export async function download(t: Tier, onProgress: (fraction: number) => void): Promise<boolean> {
  if (await modelReady(t)) return true;
  await FS.makeDirectoryAsync(dirOf(), { intermediates: true });
  const { url, bytes } = TIERS[t];
  const n = Math.ceil(bytes / CHUNK);
  const have = async (i: number) => { const f = await FS.getInfoAsync(partOf(t, i)); return f.exists && f.size === chunkBytes(t, i); };
  if ((await FS.getFreeDiskStorageAsync().catch(() => Infinity)) < bytes + ROOM) throw new Error("disk"); // checked on every start: a resume too
  const j: NonNullable<typeof job> = (job = {});
  try {
    for (let i = 0; i < n; i++) {
      for (let tries = 0; !(await have(i)); tries++) {
        if (j.paused) return false;
        const start = i * CHUNK;
        j.cur = FS.createDownloadResumable(url, partOf(t, i), { headers: { Range: `bytes=${start}-${start + chunkBytes(t, i) - 1}` } }, (p) => onProgress((start + p.totalBytesWritten) / bytes));
        try { await j.cur.downloadAsync(); } catch (e) {
          if (j.paused) return false;
          if (tries >= RETRIES) throw e;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    const out = new File(pathOf(t));
    if (out.exists) out.delete();
    out.create();
    for (let i = 0; i < n; i++) {
      const p = new File(partOf(t, i));
      await out.write(await p.bytes(), { append: true });
      p.delete();
    }
    if (!(await modelReady(t))) throw new Error("model size mismatch");
    for (const o of Object.keys(TIERS) as Tier[]) if (o !== t) await FS.deleteAsync(pathOf(o), { idempotent: true });
    return true;
  } finally {
    job = undefined;
  }
}

/** Pauses an active download; the chunk in flight restarts on resume (at most one chunk lost). */
export async function pause() {
  if (!job) return;
  job.paused = true;
  await job.cur?.pauseAsync().catch(() => {});
}

let ctxs: Partial<Record<Tier, Promise<WhisperContext>>> = {};
const context = (t: Tier) => (ctxs[t] ??= import("./whisper-native").then(({ initWhisper }) => initWhisper({ filePath: pathOf(t) })).catch((e) => { delete ctxs[t]; throw e; }));

// shortcut: estimates tokens as chars / 2 (conservative for Vietnamese) instead of the Whisper tokenizer; upgrade if prompts get clipped.
/** The vocabulary Whisper is biased toward, comma-joined, dropping repeats and stopping at the ~200-token cap. */
export function promptOf(terms: string[], tokens = 200): string {
  const out: string[] = [];
  let n = 0;
  for (const t of new Set(terms.map((x) => x.trim()).filter(Boolean))) {
    const c = Math.ceil(t.length / 2);
    if (n + c > tokens) break;
    out.push(t);
    n += c;
  }
  return out.join(", ");
}

// shortcut: the 30 s slices are whisper.rn's default cadence; tune with the bench once a clip set exists.
/** Live Vietnamese from PhoWhisper, same shape as the OS listenLive: `onPartial` gets the whole text so far; `stop()` resolves it. Throws when the model cannot start, so ears.ts falls back. */
export async function whisperListen(o: { onPartial?(text: string): void; hints?: string[]; tier: Tier }) {
  const { RealtimeTranscriber, AudioPcmStreamAdapter } = await import("./whisper-native");
  const whisperContext = await context(o.tier);
  const stable: string[] = [];
  let live = "";
  let failed: string | undefined;
  const text = () => [...stable, live].filter(Boolean).join(" ");
  const rt = new RealtimeTranscriber(
    { whisperContext, audioStream: new AudioPcmStreamAdapter() },
    { audioSliceSec: 30, initialPrompt: promptOf(o.hints ?? []), transcribeOptions: { language: "vi" } },
    {
      onSliceTranscriptionStabilized: (t) => { stable.push(t.trim()); live = ""; o.onPartial?.(text()); },
      onTranscribe: (e) => { live = e.data?.result?.trim() ?? ""; o.onPartial?.(text()); },
      onError: (e) => { failed = e; },
    },
  );
  await rt.start();
  return {
    async stop() {
      await rt.stop();
      const t = text();
      if (failed && !t) throw new Error(failed);
      return { text: t, alternatives: [] as string[], low: [] as string[] }; // whisper gives no n-best or word doubts
    },
  };
}

/** 16 kHz mono 16-bit PCM as a WAV file. */
export function wav(pcm: Uint8Array, rate = 16000): Uint8Array {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, rate, true);
  h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, "data"); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(h.buffer), 0);
  out.set(pcm, 44);
  return out;
}

/** Records a bench take from the PCM mic stream. `stop()` resolves the raw 16 kHz mono PCM. */
export async function startClip() {
  const { AudioPcmStreamAdapter } = await import("./whisper-native");
  const a = new AudioPcmStreamAdapter();
  const chunks: Uint8Array[] = [];
  await a.initialize({ sampleRate: 16000, channels: 1, bitsPerSample: 16 });
  a.onData((d) => chunks.push(d.data));
  await a.start();
  return {
    async stop() {
      await a.stop();
      await a.release();
      const pcm = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let o = 0;
      for (const c of chunks) { pcm.set(c, o); o += c.length; }
      return pcm;
    },
  };
}

/** Writes the take as bench/NNN.wav and appends { clip, text } to bench/manifest.json, the file scripts/stt-bench reads. */
export async function saveClip(pcm: Uint8Array, text: string): Promise<string> {
  const dir = `${FS.documentDirectory}stt-bench/`;
  await FS.makeDirectoryAsync(dir, { intermediates: true });
  const manifest = `${dir}manifest.json`;
  const list: { clip: string; text: string }[] = (await FS.getInfoAsync(manifest)).exists ? JSON.parse(await FS.readAsStringAsync(manifest)) : [];
  const clip = `${String(list.length + 1).padStart(3, "0")}.wav`;
  await FS.writeAsStringAsync(dir + clip, Buffer.from(wav(pcm)).toString("base64"), { encoding: FS.EncodingType.Base64 });
  list.push({ clip, text });
  await FS.writeAsStringAsync(manifest, JSON.stringify(list, null, 2));
  return dir + clip;
}
