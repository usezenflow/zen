import { ExpoSpeechRecognitionModule as SR, type ExpoSpeechRecognitionResult, type ExpoSpeechRecognitionResultEvent } from "expo-speech-recognition";
import * as Device from "expo-device";
import { kvGet } from "./store";
import { engineOf, installed, pickEngine, whisperListen } from "./stt";

const LANG = "vi-VN";

/** The recognizer's -2..10 volume as 0..1 for the bars; under 0 is inaudible. */
export const level = (v: number) => Math.max(0, Math.min(1, v / 10));

/**
 * Mic and speech permission in one prompt pair. Check first, ask only when missing: on Android the ask always opens the
 * system permission activity, even when granted, which pauses the app and its AppState guard cancels the hold.
 */
export const askMic = async () => (await SR.getPermissionsAsync()).granted || (await SR.requestPermissionsAsync()).granted;

/** Stops any recognition an earlier JS bundle left running (a reload keeps native modules alive) and releases the session, clearing iOS's orange dot. */
export function micReset() {
  SR.abort();
  try { SR.setAudioSessionActiveIOS(false, { notifyOthersOnDeactivation: true }); } catch { /* Android: no session */ }
}

const ALTS = 5; // the library's own default; kept explicit so the n-best list is never cut by a default change
const LOW = 0.5; // a word the recognizer was this unsure of (0..1; -1 means it gave none)

/** What one listen heard: the best text, the other readings of it, and the words the recognizer doubted. */
export interface Heard { text: string; alternatives: string[]; low: string[] }

/**
 * The n-best transcripts of a take. Android sends each pause as its own final segment, then partials of the next,
 * so the text is every final followed by the live partial; iOS sends one final, which is the same shape.
 * Rank k joins each part's k-th reading (its best when it has fewer), identical readings dropped.
 */
export function transcripts(finals: string[][], partial: string[] = []): string[] {
  const parts = partial.length ? [...finals, partial] : finals;
  const n = Math.max(0, ...parts.map((p) => p.length));
  return [...new Set(Array.from({ length: n }, (_, k) => parts.map((p) => p[k] ?? p[0]).join(" ")))];
}

/** Words of a final result's first reading whose segment the recognizer was unsure of. */
export const lowWords = (r?: Pick<ExpoSpeechRecognitionResult, "segments">) =>
  (r?.segments ?? []).filter((x) => x.confidence >= 0 && x.confidence < LOW).map((x) => x.segment.trim()).filter(Boolean);

let onDevice: Promise<boolean> | undefined;
// On-device when Vietnamese is installed (private, offline); otherwise the system's server recognizer.
const local = () => (onDevice ??= SR.getSupportedLocales({}).then((l) => l.installedLocales.includes(LANG)).catch(() => false));

/**
 * Live Vietnamese words from the system recognizer. `onPartial` gets the whole text so far every time it is refined;
 * `stop()` ends the mic, waits for the final result and resolves it (empty text when nothing was heard).
 * `hints` bias the recognizer toward words it would otherwise miss (course names, task titles, English terms).
 */
export async function listenLive(o: { onPartial?(text: string): void; onLevel?(level: number): void; hints?: string[] } = {}): Promise<{ stop(): Promise<Heard> }> {
  const engine = pickEngine({ setting: engineOf(await kvGet("stt.engine")), installed: await installed(), totalMemory: Device.totalMemory, yearClass: Device.deviceYearClass });
  if (engine !== "os") { try { return await whisperListen({ ...o, tier: engine }); } catch (e) { console.warn("whisper failed, using the OS recognizer:", e); } }
  const dev = await local();
  const finals: string[][] = [];
  let partial: string[] = [];
  let low: string[] = [];
  const best = () => transcripts(finals, partial)[0] ?? "";
  let done: () => void = () => {};
  const ended = new Promise<void>((ok) => (done = ok));
  let failed: string | undefined;
  const subs = [
    SR.addListener("result", (e: ExpoSpeechRecognitionResultEvent) => {
      const alts = e.results.map((r) => r.transcript?.trim()).filter(Boolean);
      if (!alts.length) return;
      if (e.isFinal) { finals.push(alts); partial = []; low = [...low, ...lowWords(e.results[0])]; } else partial = alts;
      o.onPartial?.(best());
    }),
    SR.addListener("volumechange", (e: { value: number }) => o.onLevel?.(level(e.value))),
    // no-speech and speech-timeout (Android's "no speech input") are an empty take, not a failure; anything else surfaces once start() has settled
    SR.addListener("error", (e: { error: string; message: string }) => { if (!["no-speech", "speech-timeout", "aborted"].includes(e.error)) failed = `${e.error}: ${e.message}`; done(); }),
    SR.addListener("end", () => done()),
  ];
  const off = () => { subs.forEach((s) => s.remove()); micReset(); };
  SR.start({
    lang: LANG,
    interimResults: true,
    maxAlternatives: ALTS,
    ...(o.hints?.length ? { contextualStrings: o.hints } : {}),
    continuous: true, // keeps listening through pauses until the button is released
    requiresOnDeviceRecognition: dev,
    addsPunctuation: false,
    volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
  });
  // start() reports failures as events: give it a beat so a refused start throws here, not on release.
  await new Promise((ok) => setTimeout(ok, 150));
  if (failed) { off(); throw new Error(failed); }
  return {
    async stop() {
      SR.stop(); // flushes a final result, then "end"
      await Promise.race([ended, new Promise((ok) => setTimeout(ok, 3000))]); // a recognizer that never ends must not hang the button
      off();
      const all = transcripts(finals, partial);
      if (failed && !all.length) throw new Error(failed);
      return { text: all[0] ?? "", alternatives: all.slice(1), low };
    },
  };
}
