// The only file that imports whisper.rn and its PCM mic adapter, so stt.ts loads them on first use and tests mock this file.
// Explicit subpaths: whisper.rn's exports map has no "." entry for TypeScript's bundler resolution.
export { initWhisper, type WhisperContext } from "whisper.rn/index";
export { RealtimeTranscriber, type AudioStreamInterface } from "whisper.rn/realtime-transcription/index";
export { AudioPcmStreamAdapter } from "whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter";
