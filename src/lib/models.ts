export type ModelId = "whisper-vi" | "whisper-en" | "mind" | "embed";

// Host URLs are unverified against the hubs; swap here if one moves.
export const MODELS: Record<ModelId, { url: string; file: string }> = {
  "whisper-vi": {
    url: "https://huggingface.co/dongxiat/ggml-PhoWhisper-base/resolve/main/ggml-PhoWhisper-base.bin",
    file: "phowhisper-base.bin",
  },
  "whisper-en": {
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin",
    file: "ggml-base.en-q5_1.bin",
  },
  mind: {
    url: "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf",
    file: "qwen3-1.7b-q4_k_m.gguf",
  },
  embed: {
    url: "https://huggingface.co/milimyname/multilingual-e5-small-Q8_0-GGUF/resolve/main/multilingual-e5-small-q8_0.gguf",
    file: "multilingual-e5-small-q8_0.gguf",
  },
};

/** Total bytes from a response: Content-Range wins, else Content-Length plus what we already had. */
export function totalBytes(status: number, get: (h: string) => string | null, offset: number): number | undefined {
  const range = get("content-range")?.match(/\/(\d+)$/);
  if (status === 206 && range) return Number(range[1]);
  const len = Number(get("content-length"));
  if (!len) return undefined;
  return status === 206 ? offset + len : len;
}

async function fs() {
  const { File, Directory, Paths } = await import("expo-file-system");
  const dir = new Directory(Paths.document, "models");
  if (!dir.exists) dir.create({ intermediates: true });
  return { File, dir };
}

/** Local file uri when the model is fully downloaded, else undefined. */
export async function modelPath(id: ModelId): Promise<string | undefined> {
  const { File, dir } = await fs();
  const f = new File(dir, MODELS[id].file);
  return f.exists ? f.uri : undefined;
}

/** Downloads to `<file>.part`, resuming with a Range request, then renames after the size check. */
export async function ensureModel(id: ModelId, onProgress?: (done: number, total: number) => void): Promise<string> {
  const ready = await modelPath(id);
  if (ready) return ready;
  const { File, dir } = await fs();
  const { fetch } = await import("expo/fetch");
  const { FileMode } = await import("expo-file-system");
  const part = new File(dir, `${MODELS[id].file}.part`);
  if (!part.exists) part.create();
  const offset = part.size;
  const res = await fetch(MODELS[id].url, { headers: offset ? { Range: `bytes=${offset}-` } : {} });
  if (res.status === 416) {
    part.delete(); // stale partial longer than the file
    return ensureModel(id, onProgress);
  }
  if (!res.ok || !res.body) throw new Error(`download ${id}: ${res.status}`);
  const resumed = res.status === 206;
  const start = resumed ? offset : 0;
  const total = totalBytes(res.status, (h) => res.headers.get(h), offset);
  const handle = part.open(resumed ? FileMode.Append : FileMode.Truncate);
  let done = start;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      await handle.writeBytes(value);
      done += value.length;
      onProgress?.(done, total ?? done);
    }
  } finally {
    handle.close();
  }
  if (total !== undefined && part.size !== total) throw new Error(`download ${id}: size ${part.size} != ${total}`);
  part.move(new File(dir, MODELS[id].file));
  return new File(dir, MODELS[id].file).uri;
}
