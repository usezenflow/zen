import type { Result } from "./apply";

/** A toast handed from one screen to the next (Detail deletes, then Home shows Undo). */
export interface Flash { text: string; sub?: string; r?: Result }

let pending: Flash | undefined;
export const setFlash = (f: Flash) => { pending = f; };
export const takeFlash = () => { const f = pending; pending = undefined; return f; };
