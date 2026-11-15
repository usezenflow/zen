// Effort over 120 min (or maxSitting) becomes sittings of whole half hours, as even as they go (150 in two: 90 and 60), never 45s.
export function split(effort: number, maxSitting = 120): number[] {
  const halves = Math.max(1, Math.ceil(effort / 30));
  const n = Math.min(halves, Math.max(1, Math.ceil(effort / maxSitting)));
  return Array.from({ length: n }, (_, i) => (Math.floor(halves / n) + (i < halves % n ? 1 : 0)) * 30);
}
