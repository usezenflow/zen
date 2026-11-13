import { ExpoSpeechRecognitionModule as SR, type ExpoSpeechRecognitionResultEvent } from "expo-speech-recognition";

const LANG = "vi-VN";

/** The recognizer's -2..10 volume as 0..1 for the bars; under 0 is inaudible. */
export const level = (v: number) => Math.max(0, Math.min(1, v / 10));

/** Mic and speech permission in one prompt pair. */
export const askMic = async () => (await SR.requestPermissionsAsync()).granted;

/** Stops any recognition an earlier JS bundle left running (a reload keeps native modules alive) and releases the session, clearing iOS's orange dot. */
export function micReset() {
  SR.abort();
  try { SR.setAudioSessionActiveIOS(false, { notifyOthersOnDeactivation: true }); } catch { /* Android: no session */ }
}

let onDevice: Promise<boolean> | undefined;
// On-device when Vietnamese is installed (private, offline); otherwise the system's server recognizer.
const local = () => (onDevice ??= SR.getSupportedLocales({}).then((l) => l.installedLocales.includes(LANG)).catch(() => false));

/**
 * Live Vietnamese words from the system recognizer. `onPartial` gets the whole text so far every time it is refined;
 * `stop()` ends the mic, waits for the final result and resolves it (empty when nothing was heard).
 */
export async function listenLive(o: { onPartial?(text: string): void; onLevel?(level: number): void } = {}): Promise<{ stop(): Promise<string> }> {
  const dev = await local();
  let text = "";
  let done: () => void = () => {};
  const ended = new Promise<void>((ok) => (done = ok));
  let failed: string | undefined;
  const subs = [
    SR.addListener("result", (e: ExpoSpeechRecognitionResultEvent) => {
      const t = e.results[0]?.transcript?.trim();
      if (t) { text = t; o.onPartial?.(t); }
    }),
    SR.addListener("volumechange", (e: { value: number }) => o.onLevel?.(level(e.value))),
    // no-speech is an empty take, not a failure; anything else surfaces once start() has settled
    SR.addListener("error", (e: { error: string; message: string }) => { if (e.error !== "no-speech" && e.error !== "aborted") failed = `${e.error}: ${e.message}`; done(); }),
    SR.addListener("end", () => done()),
  ];
  const off = () => { subs.forEach((s) => s.remove()); micReset(); };
  SR.start({
    lang: LANG,
    interimResults: true,
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
      if (failed && !text) throw new Error(failed);
      return text;
    },
  };
}
