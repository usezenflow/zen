import type { Result } from "./apply";

/** A toast handed from one screen to the next (Detail deletes, then Home shows Undo). */
export interface Flash { text: string; sub?: string; r?: Result }

let pending: Flash | undefined;
export const setFlash = (f: Flash) => { pending = f; };
export const takeFlash = () => { const f = pending; pending = undefined; return f; };

// A screen opened cold (widget, link) has Home under it, not shown yet: Home first opens on that screen's day.
let homeDay: number | undefined, homeSeen = false;
export const openedOnDay = (ts: number) => { if (!homeSeen) homeDay = ts; };
export const takeHomeDay = () => { homeSeen = true; const d = homeDay; homeDay = undefined; return d; };

// Saves a screen makes as it closes land after the screen under it has reloaded; this tells that screen to reload again.
const subs = new Set<() => void>();
export const onLeftSaved = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export const leftSaved = (p: Promise<unknown> | undefined) => { if (p) void p.finally(() => subs.forEach((f) => f())).catch(() => {}); };
