// Ensō koi geometry (reference page enso()): one brush stroke round a circle. The blunt start is the head, the stroke thins
// as it turns and flicks into a split tail just short of the head, so the circle never closes. The dry-brush texture is
// fine rings used as a mask. Pure maths, computed once; Logo in art.tsx draws it.
export type EnsoGeo = {
  body: string; head: string; tailUp: string; tailLo: string; pivot: [number, number];
  eye: [number, number]; rings: number[]; lw: number;
};

const C = 50, R = 30, A0 = 120, SW = 300, N = 90, rad = Math.PI / 180;
const P2 = (p: number[]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;

export function enso({ brush = true, gap = 1.55, lw = 1.05 }: { brush?: boolean; gap?: number; lw?: number } = {}): EnsoGeo {
  const at = (t: number) => { const a = (A0 + SW * t) * rad; return { d: [Math.cos(a), Math.sin(a)], t: [-Math.sin(a), Math.cos(a)] }; };
  const w = (t: number) => 21 * Math.pow(1 - t, 0.85) * (1 - 0.12 * Math.sin(Math.PI * t * 2.2)) + 1.3;
  const o: number[][] = [], i2: number[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, q = at(t), ww = w(t) / 2;
    o.push([C + q.d[0] * (R + ww), C + q.d[1] * (R + ww)]);
    i2.push([C + q.d[0] * (R - ww), C + q.d[1] * (R - ww)]);
  }
  const h = at(0), hc = [C + h.d[0] * R, C + h.d[1] * R], hr = w(0) / 2;
  const body = `M${o.map(P2).join("L")}L${i2.reverse().map(P2).join("L")}Z`;
  const head = `M${P2([hc[0] + h.d[0] * hr, hc[1] + h.d[1] * hr])}A${hr} ${hr} 0 0 0 ${P2([hc[0] - h.d[0] * hr, hc[1] - h.d[1] * hr])}Z`;
  // The tail is two halves meeting at the notch g(5,0), so each half can fan out on its own (the err state).
  const e = at(1), E = [C + e.d[0] * R, C + e.d[1] * R];
  const g = (a: number, b: number) => [E[0] + e.t[0] * a + e.d[0] * b, E[1] + e.t[1] * a + e.d[1] * b];
  const tailUp = `M${P2(g(-1, 0.7))}Q${P2(g(6, 3))} ${P2(g(13, 10))}Q${P2(g(8, 3))} ${P2(g(5, 0))}Z`;
  const tailLo = `M${P2(g(-1, -0.7))}Q${P2(g(6, -3))} ${P2(g(13, -10))}Q${P2(g(8, -3))} ${P2(g(5, 0))}Z`;
  const eye: [number, number] = [hc[0] - h.t[0] * 3.5 + h.d[0] * 3, hc[1] - h.t[1] * 3.5 + h.d[1] * 3];
  const rings: number[] = [];
  if (brush) for (let r = R - 14; r <= R + 16; r += gap) rings.push(+r.toFixed(2));
  return { body, head, tailUp, tailLo, pivot: g(5, 0) as [number, number], eye, rings, lw };
}
