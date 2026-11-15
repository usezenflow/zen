// Shared chrome for zen mockups.
const ic = (d, s = 22, w = 2.2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  study: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/><path d="M4 19.5V22h16"/>',
  exercise: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  chores: '<path d="M3 21h18M5 21V9l7-6 7 6v12"/><path d="M9 21v-6h6v6"/>',
  social: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M16.5 14.6A4.5 4.5 0 0 1 21 19"/>',
  other: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  campus: '<path d="M2 10l10-5 10 5-10 5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bug: '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7V4M7 12H3M21 12h-4M7 17l-3 2M17 17l3 2M8 7 6 4M16 7l2-3"/>',
  note: '<path d="M5 4h14v12l-4 4H5Z"/><path d="M15 20v-4h4M9 9h6M9 13h4"/>',
};
const TONE = { study: "var(--study)", exercise: "var(--exercise)", chores: "var(--chores)", social: "var(--social)", other: "var(--other)" };
// Tea-leaf mark in white (LOGO in ui.js).
const MARK = (s = 26) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100"><path d="M12 50A38 38 0 0 1 50 12H74V50A38 38 0 0 1 36 88H12Z" fill="#fff"/><circle cx="84" cy="84" r="11" fill="#fff"/></svg>`;
// Empty / night: the leaf in outline, sun still vermilion (LOGO "line" in art.tsx).
const STONES = `<svg width="96" height="96" viewBox="0 0 100 100"><path d="M12 50A38 38 0 0 1 50 12H74V50A38 38 0 0 1 36 88H12Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="84" cy="84" r="11" fill="#d9432b"/></svg>`;
const tails = (n = 9) => `<div class="tail">${Array.from({ length: n }, (_, i) => `<i style="left:${8 + ((i * 37) % 84)}%;top:${10 + ((i * 53) % 80)}%;opacity:${0.25 + (i % 3) * 0.2}"></i>`).join("")}</div>`;

function chrome(inner, { time = "14:20", dock = "idle", grab = true, gear = true } = {}) {
  const holdCls = dock === "live" ? "hold live" : dock === "think" ? "hold think" : "hold";
  const label = { idle: "Giữ để nói", live: "Thả tay khi xong", think: "Đang sắp xếp" }[dock];
  return `<div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
  <div class="sb"><span>${time}</span><span>●●● ▮</span></div>
  <div class="scr">${gear ? `<div class="top"><span class="circ">${ic(I.gear, 19)}</span></div>` : ""}${inner}</div>
  ${dock ? `<div class="dock"><div class="${holdCls}" style="color:#fff">${dock === "think" ? MARK(54) : ic(I.mic, 44, 2.4)}</div><div class="label">${label}</div></div>` : ""}
  ${grab ? '<div class="grab"></div>' : ""}<div class="hi"></div>`;
}

function card({ kind, title, until, p = "40%" }) {
  return `<div class="card" style="--tone:${TONE[kind]}">${tails()}<div class="kind">${ic(I[kind], 26, 2.4)}</div><h2>${title}</h2><div class="until">${until}</div><div class="bar" style="--p:${p}"><i></i></div></div>
  <div class="hint"><span>← Để sau</span><span>Xong →</span></div>`;
}

function toast(title, sub, act = "Hoàn tác") {
  return `<div class="toast"><div class="tile">${MARK(22)}</div><div class="tx">${title}${sub ? `<span>${sub}</span>` : ""}</div><div class="act">${act}<svg class="ring" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="34.5" stroke-dashoffset="12" transform="rotate(-90 7 7)"/></svg></div></div>`;
}

function mount(frames) {
  document.querySelector(".gallery").innerHTML = frames.map((f) => `<div class="frame"><div class="cap"><b>${f.tag}</b><span>${f.sub}</span></div><div class="device${f.dark ? " dark" : ""}"><div class="island"></div>${f.html}</div></div>`).join("");
}
