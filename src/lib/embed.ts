import { modelPath } from "./models";

type Ctx = { embedding(t: string, p: { embd_normalize: number }): Promise<{ embedding: number[] }> };
let ctx: Promise<Ctx | undefined> | undefined;

async function load(): Promise<Ctx | undefined> {
  const path = await modelPath("embed");
  if (!path) return undefined;
  const { initLlama } = await import("llama.rn");
  return initLlama({ model: path, embedding: true, n_ctx: 512, n_gpu_layers: 99 });
}

/** 384-d L2-normalised vector, or undefined while the model is not downloaded. */
export async function embed(title: string): Promise<Float32Array | undefined> {
  ctx ??= load();
  const c = await ctx;
  if (!c) {
    ctx = undefined;
    return undefined;
  }
  const { embedding } = await c.embedding(`query: ${title}`, { embd_normalize: 2 });
  return Float32Array.from(embedding);
}
