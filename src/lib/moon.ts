// Live Vietnamese words from the on-device model: the mic's 16 kHz samples go in as they are heard, the lines come out as they are refined.
// Loaded only when ears.ts picks it; any failure here is the caller's cue to use the system dictation.
import type { Heard } from "./ears";
import { modelPath } from "./voiceModel";

const RATE = 16000;
type Transcriber = Awaited<ReturnType<(typeof import("@siteed/moonshine.rn"))["default"]["createTranscriberFromFiles"]>>;
let loaded: Promise<Transcriber> | undefined; // the model stays in memory between takes: loading it is the slow part
const load = () => (loaded ??= import("@siteed/moonshine.rn").then((m) => m.default.createTranscriberFromFiles({ modelArch: "tiny-streaming", modelPath: modelPath(), language: "vi" })).catch((e) => { loaded = undefined; throw e; }));

/** The mic's loudness for the bars: the root mean square of one chunk, 0..1 (speech sits near 0.05-0.2). */
export const rms = (pcm: ArrayLike<number>) => { let s = 0; for (let i = 0; i < pcm.length; i++) s += pcm[i] * pcm[i]; return Math.min(1, Math.sqrt(s / (pcm.length || 1)) * 6); };

export async function listenMoon(o: { onPartial?(text: string): void; onLevel?(level: number): void }): Promise<{ stop(): Promise<Heard>; abort(): void }> {
  const [t, { AudioStudioModule: mic }] = await Promise.all([load(), import("@siteed/audio-studio")]);
  const lines = new Map<string, string>(); // a line is refined in place until it completes
  const say = () => [...lines.values()].join(" ").replace(/\s+/g, " ").trim();
  const off = t.addListener((e) => {
    if (e.line?.text !== undefined && e.type.startsWith("line")) { lines.set(e.line.lineId, e.line.text); o.onPartial?.(say()); }
  });
  const sub = mic.addListener("AudioData", async (e: { pcmFloat32?: Float32Array | number[] }) => {
    if (!e.pcmFloat32) return;
    const pcm = e.pcmFloat32 instanceof Float32Array ? e.pcmFloat32 : Float32Array.from(e.pcmFloat32);
    o.onLevel?.(rms(pcm));
    await t.addAudio(pcm, RATE).catch(() => {});
  });
  let running = true;
  const halt = async () => { if (!running) return; running = false; sub.remove(); await mic.stopRecording().catch(() => {}); await t.stop().catch(() => {}); };
  try {
    await t.start();
    // streaming only: no WAV is kept; chunks of 100 ms keep the words close behind the voice
    await mic.startRecording({ sampleRate: RATE, channels: 1, encoding: "pcm_32bit", streamFormat: "float32", interval: 100, output: { primary: { enabled: false } } });
  } catch (e) { await halt(); off(); throw e; }
  return {
    async stop() {
      await halt();
      await new Promise((ok) => setTimeout(ok, 300)); // the last line completes just after the stream ends
      off();
      return { text: say(), alternatives: [], low: [] };
    },
    abort() { void halt().then(off); },
  };
}
