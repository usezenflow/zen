/** DLU wall clock to epoch ms. shortcut: fixed UTC+7 (Vietnam has no DST), `_tz` ignored; revisit if another campus zone is added. */
export function minutesToUtc(dateString: string, minutes: number, _tz?: string): Date {
  return new Date(Date.parse(`${dateString}T00:00:00Z`) + (minutes - 7 * 60) * 60_000);
}
