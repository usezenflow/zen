// Constants and the Clock type the reader reaches from zenflow's shared task.ts / view.ts / scheduler.constants.ts.
export const SLOT_MINUTES = 30;
export const MAX_SESSION_DAYS = 14;
export const MAX_TASK_MINUTES = 2400;
export const SCAN_CAP_DAYS = 120;

/** A local clock range; `to` may be `25:00` (MIDNIGHT). */
export interface Clock {
  /** `HH:mm`. */
  from: string;
  /** `HH:mm`, after `from`. */
  to: string;
}
