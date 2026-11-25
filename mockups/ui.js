// Shared chrome for the zen mockups: line-field art, the ensō koi mark, icons and the dock.
const ic = (d, s = 20, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="12.5" r="3.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  dots: '<circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="18" cy="12" r="1" fill="currentColor"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/><path d="M4 19.5V22h16"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  hourglass: '<path d="M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 1.6 3.2L12 12l-2.4 2.3A4 4 0 0 0 8 17.5V21M16 3v3.5a4 4 0 0 1-1.6 3.2L12 12l2.4 2.3A4 4 0 0 1 16 17.5V21"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  repeat: '<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>',
  unlink: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M4 4l16 16"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
  play: '<path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6Z"/>',
  skip: '<path d="M6 5.5v13l9-6.5Z"/><path d="M18.5 5.5v13"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>',
  school: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14Z"/><path d="M6.5 11.8V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.2M21.5 9.5V15"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.8"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z"/>',

  flame: '<path d="M12 21a6 6 0 0 0 6-6c0-3.4-2.3-5.3-3.4-7.5-.6 1.6-1.5 2.4-2.6 2.9C11.6 7.2 11.5 5 10 3c-.6 3.2-4.6 5.4-4.6 10.2A6 6 0 0 0 12 21Z"/>',
  chart: '<rect x="4" y="12" width="3.5" height="8" rx="1.75"/><rect x="10.25" y="7" width="3.5" height="13" rx="1.75"/><rect x="16.5" y="3.5" width="3.5" height="16.5" rx="1.75"/>',
  calendarCheck: '<rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M9 15.2l2.2 2.1 3.8-3.9"/>',
  wallet: '<rect x="3" y="6.5" width="18" height="13" rx="4"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1"/>',
  leaf: '<path d="M5 19C5 11 9.5 5.5 19 4.5c-.5 9.5-5.5 14.5-14 14.5Z"/><path d="M5 19l8-8"/>',
};

// Line-field art, after the reference: a gradient ground, two radial colour fields seen through thin and thick stripe masks.
// Palettes are [ground start, field, ground end, accent]. Types map onto them; busy is a neutral grey field.
const PAL = {
  lagoon: ['#11b9d4', '#2433f2', '#a8f0ff', '#5a3cff'],
  dusk: ['#e9b04f', '#c21f86', '#a38ff0', '#ff4a5e'],
  moss: ['#bfe36a', '#0f8f6a', '#7cc8f0', '#1fd1a0'],
  citrus: ['#ffc83a', '#ff4f2a', '#ffb0c4', '#ff8a00'],
  // Card variants: the light ground stops are pulled toward the field colour so white text on them reaches >= 4.5:1 (the scrim adds more).
  lagoonC: ['#14a5d9', '#2433f2', '#94d4fd', '#5a3cff'],
  mossC: ['#a5d66a', '#0f8f6a', '#6cbfdc', '#1fd1a0'],
  citrusC: ['#ffb638', '#ff4f2a', '#ffa1ad', '#ff8a00'],
  duskC: ['#e39a57', '#c21f86', '#a87ee0', '#ff4a5e'],
  night: ['#1e2a8a', '#7a4dff', '#35e0ff', '#ff5ac8'],
  clay: ['#ebc8a4', '#cf4a2c', '#5f80dc', '#f08a5d'],
  nightC: ['#2c2f9c', '#7a4dff', '#3fcaff', '#ff5ac8'],
  clayC: ['#e7b592', '#cf4a2c', '#7078c2', '#f08a5d'],
  grey: ['#8d9196', '#c4c7cc', '#eceef0', '#6d7278'],
};
const TYPE = { plan: 'lagoonC', lecture: 'mossC', exam: 'duskC', assignment: 'clayC', busy: 'grey' };
// One mapping for every card, row and tile: by task kind, and by fixed type for timetable rows (prep follows its exam).
const KIND_PAL = { study: 'lagoonC', work: 'nightC', exercise: 'mossC', chores: 'citrusC', social: 'duskC', self: 'clayC', errand: 'citrusC', finance: 'nightC', other: 'clayC' };
const TYPE_PAL = { lecture: 'mossC', exam: 'duskC', assignment: 'clayC', busy: 'grey' };
const palOf = (type, kind) => TYPE_PAL[type] || KIND_PAL[kind] || 'lagoonC';
// A stable seed per item, so same-kind cards differ in field position and line direction.
const seedOf = (t) => [...String(t)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
const DOT = { plan: "#2433f2", lecture: "#0f8f6a", exam: "#ff4f2a", assignment: "#c21f86", busy: "#8d9196" };
function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
let uid = 0;
function lineField(seed, pal, dir, w, h, cls) {
  const r = rng(seed), [a, b, c, d] = PAL[pal], k = 'a' + (uid++);
  const rot = dir === 'v' ? 90 : dir === 'd' ? 62 : 0;
  const f = (x, y, ang, sx, sy) => `gradientTransform="translate(${x} ${y}) rotate(${ang}) scale(${sx} ${sy}) translate(${-x} ${-y})"`;
  const x1 = .25 + r() * .5, y1 = .3 + r() * .4, a1 = r() * 180, x2 = .1 + r() * .8, y2 = .1 + r() * .8, a2 = r() * 180;
  const gap = 4.2, thin = 1.5, thick = 3.1;
  const stripe = (id, t) => `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(${rot})"><rect width="${gap}" height="${t}" fill="#fff"/></pattern>`;
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs>
    <linearGradient id="${k}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient>
    <radialGradient id="${k}f" cx="${x1}" cy="${y1}" r=".55" ${f(x1, y1, a1, 1.15, .62)}><stop offset="0" stop-color="${b}"/><stop offset=".6" stop-color="${b}" stop-opacity=".9"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${k}c" cx="${x1}" cy="${y1}" r=".3" ${f(x1, y1, a1, 1.2, .55)}><stop offset="0" stop-color="${b}"/><stop offset=".7" stop-color="${b}" stop-opacity=".8"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${k}e" cx="${x2}" cy="${y2}" r=".42" ${f(x2, y2, a2, 1.3, .5)}><stop offset="0" stop-color="${d}"/><stop offset="1" stop-color="${d}" stop-opacity="0"/></radialGradient>
    ${stripe(k + 'p', thin)}${stripe(k + 'q', thick)}
    <linearGradient id="${k}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".32" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset=".88" stop-color="#000" stop-opacity=".26"/><stop offset="1" stop-color="#000" stop-opacity=".26"/></linearGradient>
    <mask id="${k}m"><rect width="${w}" height="${h}" fill="url(#${k}p)"/></mask>
    <mask id="${k}n"><rect width="${w}" height="${h}" fill="url(#${k}q)"/></mask>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#${k}g)"/>
  <rect width="${w}" height="${h}" fill="url(#${k}e)" mask="url(#${k}m)"/>
  <rect width="${w}" height="${h}" fill="url(#${k}f)" mask="url(#${k}m)"/>
  <rect width="${w}" height="${h}" fill="url(#${k}c)" mask="url(#${k}n)"/>
  <rect width="${w}" height="${h}" fill="url(#${k}s)"/>
  </svg>`;
}
// Card art: type picks the palette, the seed picks the field and the line direction (h, v or d).
function art(type, { w = 300, h = 300, seed = 3, cls = "bgart" } = {}) {
  return lineField(+seed, TYPE[type] || type, ['h', 'v', 'd'][Math.abs(+seed) % 3], w, h, cls);
}
const swatch = (type, seed = 7) => `<span class="sw-art">${art(type, { w: 40, h: 40, seed })}</span>`;
// Repaints every [data-art="seed,palette,dir"] box to its own size (used by the logo board and the art tiles).
function paint() {
  document.querySelectorAll('[data-art]').forEach(el => {
    const old = el.querySelector(':scope > svg.bgart'); if (old) old.remove();
    const [seed, pal, dir] = el.dataset.art.split(',');
    const w = Math.max(20, el.clientWidth), h = Math.max(20, el.clientHeight);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.insertAdjacentHTML('afterbegin', lineField(+seed, pal, dir || 'h', w, h, 'bgart'));
  });
}

// The ensō koi: one brush stroke round a circle. The blunt start is the head (eye knocked out), the stroke thins as it turns
// and flicks into a split tail just short of the head, so the circle never closes. Dry-brush texture = fine rings inside the stroke.
// spread widens the tail (the error state); line draws outlines only (the empty state).
let kid = 0;
const P2 = p => p[0].toFixed(2) + ' ' + p[1].toFixed(2);
function enso({ brush = true, gap = 1.55, lw = 1.05, spread = 1, line = false } = {}) {
  const k = 'e' + (kid++), C = 50, R = 30, A0 = 120, SW = 300, N = 90, rad = Math.PI / 180;
  const at = t => { const a = (A0 + SW * t) * rad; return { d: [Math.cos(a), Math.sin(a)], t: [-Math.sin(a), Math.cos(a)] }; };
  const w = t => 21 * Math.pow(1 - t, .85) * (1 - .12 * Math.sin(Math.PI * t * 2.2)) + 1.3;
  const o = [], i2 = [];
  for (let i = 0; i <= N; i++) { const t = i / N, q = at(t), ww = w(t) / 2; o.push([C + q.d[0] * (R + ww), C + q.d[1] * (R + ww)]); i2.push([C + q.d[0] * (R - ww), C + q.d[1] * (R - ww)]); }
  const h = at(0), hc = [C + h.d[0] * R, C + h.d[1] * R], hr = w(0) / 2;
  const body = `M${o.map(P2).join('L')}L${i2.reverse().map(P2).join('L')}Z`;
  const head = `M${P2([hc[0] + h.d[0] * hr, hc[1] + h.d[1] * hr])}A${hr} ${hr} 0 0 0 ${P2([hc[0] - h.d[0] * hr, hc[1] - h.d[1] * hr])}Z`;
  const e = at(1), E = [C + e.d[0] * R, C + e.d[1] * R], g = (a, b) => [E[0] + e.t[0] * a + e.d[0] * b, E[1] + e.t[1] * a + e.d[1] * b];
  const s = spread;
  const tail = `M${P2(g(-1, .7))}Q${P2(g(6, 3 * s))} ${P2(g(13, 10 * s))}Q${P2(g(8, 3 * s))} ${P2(g(5, 0))}Q${P2(g(8, -3 * s))} ${P2(g(13, -10 * s))}Q${P2(g(6, -3 * s))} ${P2(g(-1, -.7))}Z`;
  if (line) {
    const st = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"';
    return `<path d="${body}" ${st}/><path d="${head}" ${st}/><path d="${tail}" ${st}/>`;
  }
  const eye = [hc[0] - h.t[0] * 3.5 + h.d[0] * 3, hc[1] - h.t[1] * 3.5 + h.d[1] * 3];
  const rings = []; for (let r = R - 14; r <= R + 16; r += gap) rings.push(`<circle cx="50" cy="50" r="${r.toFixed(2)}"/>`);
  return `<defs><clipPath id="${k}c"><path d="${body}"/><path d="${head}"/><path d="${tail}"/></clipPath>
    <mask id="${k}m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">${brush ? `<g class="zl-rg" fill="none" stroke="#fff" stroke-width="${lw}">${rings.join('')}</g>` : '<rect width="100" height="100" fill="#fff"/>'}<circle cx="${eye[0].toFixed(2)}" cy="${eye[1].toFixed(2)}" r="${brush ? 2.4 : 2.8}" fill="#000"/></mask></defs>
    <g clip-path="url(#${k}c)"><rect width="100" height="100" fill="currentColor" mask="url(#${k}m)"/></g>`;
}
// Logo. mode: color (ink, the default), white, line (outline). state: load (ring turns), err (tipped, tail split wider), line.
function LOGO(s = 40, mode = "color", state = "") {
  const line = mode === "line" || state === "line";
  // color: brand orange (#ff8a5c, the koi's colour); hot: the same for navy tiles; white and ink for the rest.
  const color = mode === "white" ? "#fff" : mode === "ink" ? "currentColor" : "#ff8a5c";
  const cls = state === "load" || state === "err" ? ` zl ${state}` : " zl";
  const body = enso({ brush: s >= 30 && !line, line, spread: state === "err" ? 1.7 : 1 });
  return `<svg class="${cls.trim()}" width="${s}" height="${s}" viewBox="0 0 100 100" style="color:${color};overflow:visible" aria-hidden="true">${body}</svg>`;
}

function ring(p) {
  const C = 2 * Math.PI * 44;
  return `<svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" stroke-width="3"/><circle cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 50 50)"/></svg>`;
}

function chrome(inner, { time = "14:20", dock = "idle", p = 0 } = {}) {
  const label = { idle: "Giữ để nói", rule: "Giữ để dặn", live: "Thả tay khi xong", think: "Đang sắp xếp", off: `Đang chuẩn bị ${Math.round(p * 100)}%` }[dock];
  return `<div class="sb"><span>${time}</span><span>●●● ▮</span></div><div class="scr">${inner}</div>
  ${dock ? `<div class="fade"></div><div class="dock"><div class="hold ${dock === "rule" ? "idle" : dock}">${p ? ring(p) : ""}${dock === "think" ? LOGO(34, "color", "load") : ic(I.mic, 28, 1.8)}</div><div class="dlabel">${label}</div></div>` : ""}<div class="hi"></div>`;
}

// Toast: title and sub wrap (two lines each); actions sit in a bottom row, right-aligned.
// The alternative slot is an outline pill left of the one filled button: "hoặc T7 9:00", or a plain action ("Xem") when its third item is true.
// iOS-style notification banner. o: { art: palette key (lagoonC, mossC, citrusC, duskC, clayC, nightC), the tile is that art with the white koi,
// state: err (red dot on the sender line only), lead: custom leading html (the download ring). Default tile: the koi on lagoon art.
function toast(title, sub, acts = [], o = {}) {
  const lead = o.lead || `<span class="ta app">${art(o.art || "lagoonC", { w: 36, h: 36, seed: o.seed || 4 })}${LOGO(22, "white")}</span>`;
  const row = acts.length ? `<div class="acts">${acts.map(([t]) => `<span class="a">${/Hoàn tác/.test(t) ? ic(I.undo, 16, 2) : ""}${t}</span>`).join("")}</div>` : "";
  return `<div class="toast ${o.state || ""}"><div class="tl">${lead}<div class="tx"><div class="sender"><b>zen</b>${o.state === "err" ? `<i class="ed"></i>` : ""}</div><div class="t1">${title}</div>${sub ? `<span>${sub}</span>` : ""}</div></div>${row}</div>`;
}

// Weekdays are T2..T7, CN. The date appears only outside the current Mon-Sun week (TODAY).
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"], TODAY = "2026-11-16";
function when(iso, time = "") {
  const d = new Date(iso + "T00:00:00Z"), t = new Date(TODAY + "T00:00:00Z"), mon = (x) => x.getTime() - ((x.getUTCDay() + 6) % 7) * 864e5, p = (n) => String(n).padStart(2, "0");
  return [WD[d.getUTCDay()], mon(d) === mon(t) ? "" : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, time].filter(Boolean).join(" ");
}

// iOS-style dropdown from a tapped button: items are [label, iconKey, destructive]. Place with top/right.
// Home header: hello, date, count; the search circle, the theme circle (sun in light, moon in dark) then the gear.
const head = (hello, title, n, go) => `<div style="position:relative;display:flex;align-items:flex-start;justify-content:space-between;margin-top:6px"><div><div class="hello">${hello}</div><div class="h" style="margin-top:2px">${title}</div><div class="sub">${n}</div></div><div style="display:flex;gap:8px;margin-top:2px"><span class="o">${ic(I.search, 20)}</span><span class="o th">${ic(I.sun, 20).replace("<svg", '<svg class="sun"')}${ic(I.moon, 20).replace("<svg", '<svg class="moon"')}</span><span class="o">${ic(I.gear, 20)}</span></div>${go ? `<span class="go">Hôm nay</span>` : ""}</div>`;

// Live voice, after LiveKit's bar visualizer: five pill bars that rest as dots.
// "silent": listening, nothing heard yet, the centre dot breathes. "speak": all lit, heights follow loudness (0..1 per bar).
// "think": all dots, one lit, sweeping side to side while it plans.
const VIZ = (mode, lv = [0.4, 0.75, 1, 0.65, 0.35], lit = 2) => `<div class="vbars">${[0.55, 0.8, 1, 0.8, 0.55].map((e, i) => {
  const h = mode === "speak" ? Math.max(8, Math.round(8 + 40 * e * lv[i])) : 8;
  const on = mode === "speak" || i === lit;
  return `<i class="${on ? "on" : ""}" style="height:${h}px"></i>`;
}).join("")}</div>`;

// Text-only rows; the panel fits its longest label.
// Menu-row icons (src/components/icons.tsx): each action its own, no two deletes share the bin; place is I.pin, the rest from I.
const MI = {
  minus: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  toEnd: '<path d="M4 12h12M12 7l5 5-5 5M20 5v14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  pushpin: '<path d="M9 4h6l-1 6 3 3H7l3-3-1-6Z"/><path d="M12 13v7"/>',
  pinOff: '<path d="M9 4h6l-1 6 3 3H7l3-3-1-6Z"/><path d="M12 13v7M4 4l16 16"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="M13.5 6.5l4 4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  study: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/><path d="M4 19.5V22h16"/>',
  exercise: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  chores: '<path d="M3 21h18M5 21V9l7-6 7 6v12"/><path d="M9 21v-6h6v6"/>',
  social: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M16.5 14.6A4.5 4.5 0 0 1 21 19"/>',
  other: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  errand: '<path d="M5 8h14l-1 12H6Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  finance: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
  self: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/>',
};
// right "c": a row's menu, centred on the screen. Each item: [label, icon, red]; the icon leads.
const menu = (items, top = 96, right = 18) => `<div class="mscrim"></div><div class="menu" style="top:${top}px;${right === "c" ? "left:50%;transform:translateX(-50%)" : `right:${right}px`}">${items.map(([t, i, red]) => `<div class="mi ${red ? "red" : ""}">${i ? ic(MI[i] ?? I[i]) : ""}<span>${t}</span></div>`).join("")}</div>`;
const DEL = [["Xoá buổi này", "minus"], ["Xoá buổi này và các buổi sau", "toEnd"], ["Xoá tất cả", "trash", 1]];

function mount(frames) {
  document.querySelector(".gallery").innerHTML = frames.map((f) => `<div class="frame"><div class="cap"><b>${f.tag}</b><span>${f.sub}</span></div><div class="device${f.dark ? " dark" : ""}"><div class="island"></div>${f.html}</div></div>`).join("");
}
addEventListener('resize', () => { clearTimeout(window._p); window._p = setTimeout(paint, 150); });
document.fonts && document.fonts.ready.then(paint);
