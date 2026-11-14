// Hermes (RN 0.88) drops `.groups` from String.prototype.matchAll results, while exec keeps them,
// so every reader rule that reads m.groups saw {} on device: dates read as NaN-NaN-NaN. Swap in an exec loop when broken.
export const brokenMatchAll = () => [..."x".matchAll(/(?<a>x)/g)][0]?.groups?.a !== "x";

export function matchAllByExec(this: string, re: RegExp): IterableIterator<RegExpExecArray> {
  if (!re.global) throw new TypeError("matchAll requires a global RegExp");
  const r = new RegExp(re.source, re.flags), s = String(this);
  return (function* () {
    for (let m: RegExpExecArray | null; (m = r.exec(s)); ) {
      if (m[0] === "") r.lastIndex += r.unicode && (s.codePointAt(r.lastIndex) ?? 0) > 0xffff ? 2 : 1; // an empty match moves on, as the spec does
      yield m;
    }
  })();
}

if (brokenMatchAll()) Object.defineProperty(String.prototype, "matchAll", { value: matchAllByExec, writable: true, configurable: true });
