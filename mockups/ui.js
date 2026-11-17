// Shared chrome for the zen mockups: scanline art, the disc logo, icons and the dock.
const ic = (d, s = 20, w = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
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
// Tea-leaf mark: a square with two opposite corners turned round, vermilion sun in the open corner.
function LOGO(s = 40, mode = "color") {
  const ink = mode === "white" ? "#fff" : "currentColor", sun = mode === "color" || mode === "line" ? "#d9432b" : ink;
  const paint = mode === "line" ? `fill="none" stroke="currentColor" stroke-width="${Math.max(3, 140 / s)}" stroke-linejoin="round"` : `fill="${ink}"`;
  return `<svg width="${s}" height="${s}" viewBox="0 0 100 100"><path d="M12 50A38 38 0 0 1 50 12H74V50A38 38 0 0 1 36 88H12Z" ${paint}/><circle cx="84" cy="84" r="${s < 24 ? 13 : 11}" fill="${sun}"/></svg>`;
}

function ring(p) {
  const C = 2 * Math.PI * 44;
  return `<svg class="ring" viewBox="0 0 100 100"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16181b"/><stop offset="1" stop-color="#d9432b"/></linearGradient></defs><circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" stroke-width="3"/><circle cx="50" cy="50" r="44" fill="none" stroke="url(#rg)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 50 50)"/></svg>`;
}

function chrome(inner, { time = "14:20", dock = "idle", p = 0 } = {}) {
  const label = { idle: "Giữ để nói", live: "Thả tay khi xong", think: "Đang sắp xếp", off: `Đang chuẩn bị ${Math.round(p * 100)}%` }[dock];
  return `<div class="sb"><span>${time}</span><span>●●● ▮</span></div><div class="scr">${inner}</div>
  ${dock ? `<div class="fade"></div><div class="dock"><div class="hold ${dock}">${p ? ring(p) : ""}${dock === "think" ? LOGO(34, "mono") : ic(I.mic, 28, 1.8)}</div><div class="dlabel">${label}</div></div>` : ""}<div class="hi"></div>`;
}

// Toast: title and sub wrap (two lines each); actions sit in a bottom row, right-aligned.
// The alternative slot is an outline pill left of the one filled button: "hoặc T7 9:00", or a plain action ("Xem") when its third item is true.
function toast(title, sub, acts = []) {
  const alt = acts.find(([, ol]) => ol), btn = acts.find(([, ol]) => !ol);
  const row = alt || btn ? `<div class="acts">${alt ? `<span class="a ol">${alt[2] ? "" : "hoặc "}${alt[0]}</span>` : ""}${btn ? `<span class="a">${btn[0]}</span>` : ""}</div>` : "";
  return `<div class="toast"><div class="tx"><div class="t1">${title}</div>${sub ? `<span>${sub}</span>` : ""}</div>${row}</div>`;
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
