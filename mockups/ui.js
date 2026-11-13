// Shared chrome for the zen mockups: scanline art, the disc logo, icons and the dock.
const ic = (d, s = 20, w = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  dots: '<circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="18" cy="12" r="1" fill="currentColor"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
};

// Five types; colour lives only inside cards. Own palette, no yellow.
const PAL = {
  plan: ["#1f2b6e", "#4f68e8", "#a9b9ff"],
  lecture: ["#123f3a", "#2f8a78", "#a8dccb"],
  exam: ["#7a1d10", "#d9432b", "#ffb39f"],
  assignment: ["#3a2056", "#8a5cc4", "#dccaf5"],
  busy: ["#8d8f8c", "#bdbcb6", "#e6e4de"],
};
const DOT = { plan: "#4f68e8", lecture: "#2f8a78", exam: "#d9432b", assignment: "#8a5cc4", busy: "#bdbcb6" };
let uid = 0;
// Raked sand: a stone and its ripples, like a karesansui garden.
function art(type, { w = 300, h = 300, seed = 3, cls = "" } = {}) {
  const [d, m, l] = PAL[type], n = ++uid;
  const sx = w * (0.62 + ((seed * 37) % 30) / 100), sy = h * (0.35 + ((seed * 53) % 40) / 100);
  const R = Math.max(w, h) * 1.3, sr = Math.max(10, Math.min(w, h) * 0.13), step = Math.max(3.5, Math.min(w, h) * 0.035);
  let rings = "";
  for (let r = sr + step * 1.4; r < R; r += step) rings += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${r.toFixed(1)}"/>`;
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs>
    <linearGradient id="a${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${d}"/><stop offset=".65" stop-color="${m}"/><stop offset="1" stop-color="${l}"/></linearGradient>
    <radialGradient id="s${n}" cx=".4" cy=".35"><stop offset="0" stop-color="${l}"/><stop offset="1" stop-color="${d}"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#a${n})"/>
    <g fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="${Math.max(0.6, step * 0.22).toFixed(2)}">${rings}</g>
    <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr.toFixed(1)}" fill="${d}" fill-opacity=".85"/></svg>`;
}
const swatch = (type) => `<span class="sw-art">${art(type, { w: 40, h: 40, seed: 7 })}</span>`;

// Logo: a vermilion stone, slightly off centre, with three raked ripples.
function LOGO(s = 40, mode = "color") {
  const ink = mode === "white" ? "#fff" : "currentColor", stone = mode === "color" ? "#d9432b" : ink;
  // Open ring: 300 degrees, the gap at upper right where the day enters.
  const arc = (r) => { const a0 = -40 * Math.PI / 180, a1 = 260 * Math.PI / 180; return `M${50 + r * Math.cos(a0)} ${50 + r * Math.sin(a0)}A${r} ${r} 0 1 1 ${50 + r * Math.cos(a1)} ${50 + r * Math.sin(a1)}`; };
  return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" fill="none"><g stroke="${ink}" stroke-width="4.5" stroke-linecap="round"><circle cx="50" cy="50" r="25"/><path d="${arc(40)}" opacity=".5"/></g><circle cx="50" cy="50" r="11" fill="${stone}"/></svg>`;
}

function ring(p) {
  const C = 2 * Math.PI * 44;
  return `<svg class="ring" viewBox="0 0 100 100"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16181b"/><stop offset="1" stop-color="#d9432b"/></linearGradient></defs><circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" stroke-width="3"/><circle cx="50" cy="50" r="44" fill="none" stroke="url(#rg)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 50 50)"/></svg>`;
}

function chrome(inner, { time = "14:20", dock = "idle", p = 0 } = {}) {
  const label = { idle: "Giữ để nói", live: "Thả tay khi xong", think: "Đang sắp xếp", off: `Đang chuẩn bị ${Math.round(p * 100)}%` }[dock];
  return `<div class="sb"><span>${time}</span><span>●●● ▮</span></div><div class="scr">${inner}</div>
  ${dock ? `<div class="fade"></div><div class="dock"><div class="hold ${dock}">${dock === "off" ? ring(p) : ""}${dock === "think" ? LOGO(34, "white") : ic(I.mic, 28, 1.8)}</div><div class="dlabel">${label}</div></div>` : ""}<div class="hi"></div>`;
}

function toast(title, sub, acts) {
  return `<div class="toast"><div class="tx">${title}${sub ? `<span>${sub}</span>` : ""}</div>${acts.map(([t, ol]) => `<span class="a ${ol ? "ol" : ""}">${t}</span>`).join("")}</div>`;
}

function mount(frames) {
  document.querySelector(".gallery").innerHTML = frames.map((f) => `<div class="frame"><div class="cap"><b>${f.tag}</b><span>${f.sub}</span></div><div class="device${f.dark ? " dark" : ""}"><div class="island"></div>${f.html}</div></div>`).join("");
}
