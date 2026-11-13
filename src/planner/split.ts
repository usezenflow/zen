// Effort over 90 min (or maxSitting) becomes sittings of at most that on the 15 min grid.
export function split(effort: number, maxSitting = 90): number[] {
  const n = Math.max(1, Math.ceil(effort / maxSitting));
  const len = Math.ceil(effort / n / 15) * 15;
  return Array.from({ length: n }, () => len);
}
