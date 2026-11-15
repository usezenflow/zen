import type { Result } from "./apply";

/** A toast handed from one screen to the next (Detail deletes, then Home shows Undo). */
export interface Flash { text: string; sub?: string; r?: Result }

let pending: Flash | undefined;
export const setFlash = (f: Flash) => { pending = f; };
export const takeFlash = () => { const f = pending; pending = undefined; return f; };

// Saves a screen makes as it closes land after the screen under it has reloaded; this tells that screen to reload again.
const subs = new Set<() => void>();
export const onLeftSaved = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export const leftSaved = (p: Promise<unknown> | undefined) => { if (p) void p.finally(() => subs.forEach((f) => f())).catch(() => {}); };
