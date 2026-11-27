import { createElement, memo, type ComponentType } from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

// Path dictionary from mockups zen.js and ui.js (ui.js wins on clashes: mic, gear, back; the gear is a toothed cog so it never reads as the theme sun).
const I = {
  study: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/><path d="M4 19.5V22h16"/>',
  exercise: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  chores: '<path d="M3 21h18M5 21V9l7-6 7 6v12"/><path d="M9 21v-6h6v6"/>',
  social: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M16.5 14.6A4.5 4.5 0 0 1 21 19"/>',
  other: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  errand: '<path d="M5 8h14l-1 12H6Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  finance: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
  self: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  campus: '<path d="M2 10l10-5 10 5-10 5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bug: '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7V4M7 12H3M21 12h-4M7 17l-3 2M17 17l3 2M8 7 6 4M16 7l2-3"/>',
  note: '<path d="M5 4h14v12l-4 4H5Z"/><path d="M15 20v-4h4M9 9h6M9 13h4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  dots: '<circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="18" cy="12" r="1" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  // menu actions: each its own, no two deletes share the bin
  minus: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  toEnd: '<path d="M4 12h12M12 7l5 5-5 5M20 5v14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3-1-6Z"/><path d="M12 13v7"/>',
  pinOff: '<path d="M9 4h6l-1 6 3 3H7l3-3-1-6Z"/><path d="M12 13v7M4 4l16 16"/>',
  place: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  hourglass: '<path d="M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 1.6 3.2L12 12l-2.4 2.3A4 4 0 0 0 8 17.5V21M16 3v3.5a4 4 0 0 1-1.6 3.2L12 12l2.4 2.3A4 4 0 0 1 16 17.5V21"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="M13.5 6.5l4 4"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="12.5" r="3.5"/>',
  type: '<path d="M5 6.5h14M12 6.5V19M9 19h6"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  pdf: '<path d="M8 2.75h5.6c.53 0 1.04.21 1.41.59l3.65 3.65c.38.37.59.88.59 1.41V18.25a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5.75a3 3 0 0 1 3-3z"/><path d="M13.75 3v3a1.75 1.75 0 0 0 1.75 1.75h3.25M9 12.75h6M9 16.25h4"/>',
  // settings, task detail, toasts and empty states (added: same 24 grid, 1.8 stroke, round caps)
  play: '<path d="M8 5.8c0-.8.9-1.3 1.6-.9l8.6 5.2c.7.4.7 1.4 0 1.8l-8.6 5.2c-.7.4-1.6-.1-1.6-.9Z"/>',
  skip: '<path d="M6 6l8 6-8 6Z"/><path d="M18 6v12"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/>',
  school: '<path d="M2 9.5 12 5l10 4.5-10 4.5Z"/><path d="M6 11.5V16c2 1.8 10 1.8 12 0v-4.5"/><path d="M22 9.5V14"/>',
  book: '<path d="M2 5.5h7a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H2Z"/><path d="M22 5.5h-7a3 3 0 0 0-3 3V20a2.5 2.5 0 0 1 2.5-2.5H22Z"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.1"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8"/>',
  examCheck: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15.5l2 2 4-4"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6Z"/><path d="M9 12l2 2 4-4"/>',
  flame: '<path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.5-2.5-5.5-4-8-.5 2-1.5 3-3 3.5C11.5 7 12 4.5 10 2.5 9.5 6 5.5 8.5 5.5 14.5A6.5 6.5 0 0 0 12 21Z"/>',
  bird: '<path d="M4 14c0-4 3-7 7-7 1.5 0 2.5-1.5 4-1.5 1 0 2 .7 2.5 1.7L21 8l-2 2c0 5-3.5 9-8.5 9-3.6 0-6.5-2.3-6.5-5Z"/><circle cx="15.5" cy="9" r="0.6"/><path d="M8 19l-1 2.5M12 19v2.5"/>',
  owl: '<path d="M5 4l3 2h8l3-2v9a7 7 0 0 1-14 0Z"/><circle cx="9.5" cy="10.5" r="2"/><circle cx="14.5" cy="10.5" r="2"/><path d="M11.2 14.2h1.6L12 15.8ZM9 20v2M15 20v2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 16.8v.1"/>',
  leaf: '<path d="M5 19c0-8 4-13 14-14 0 10-5 14-13 14"/><path d="M5 19 13 11"/>',
};
export type IconName = keyof typeof I;

const TAGS: Record<string, ComponentType<any>> = { path: Path, circle: Circle, rect: Rect };

// Each icon's tags are regex-parsed once (first use), then only the colour is applied per render.
type Desc = { tag: ComponentType<any>; props: Record<string, string> };
const cache = new Map<IconName, Desc[]>();
function descs(name: IconName): Desc[] {
  let list = cache.get(name);
  if (!list) {
    list = [...I[name].matchAll(/<(\w+)([^>]*?)\/>/g)].map((m) => {
      const props: Record<string, string> = {};
      for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) props[a[1]] = a[2];
      return { tag: TAGS[m[1]], props };
    });
    cache.set(name, list);
  }
  return list;
}

// Turn the self-closing tags above into react-native-svg elements.
function parse(name: IconName, color: string) {
  return descs(name).map(({ tag, props }, i) => {
    const p: Record<string, string> = { key: String(i) };
    for (const k in props) p[k] = props[k] === "currentColor" ? color : props[k];
    return createElement(tag, p);
  });
}

export const Icon = memo(function Icon({ name, size = 20, color = "#000", w = 2 }: { name: IconName; size?: number; color?: string; w?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {parse(name, color)}
    </Svg>
  );
});
