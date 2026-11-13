import { createElement, type ComponentType } from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

// Path dictionary from mockups zen.js and ui.js (ui.js wins on clashes: mic, gear, back).
const I = {
  study: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/><path d="M4 19.5V22h16"/>',
  exercise: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  chores: '<path d="M3 21h18M5 21V9l7-6 7 6v12"/><path d="M9 21v-6h6v6"/>',
  social: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M15 20a4 4 0 0 1 6 0"/>',
  other: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  campus: '<path d="M2 10l10-5 10 5-10 5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bug: '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7V4M7 12H3M21 12h-4M7 17l-3 2M17 17l3 2M8 7 6 4M16 7l2-3"/>',
  note: '<path d="M5 4h14v12l-4 4H5Z"/><path d="M15 20v-4h4M9 9h6M9 13h4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  dots: '<circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="18" cy="12" r="1" fill="currentColor"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
};
export type IconName = keyof typeof I;

const TAGS: Record<string, ComponentType<any>> = { path: Path, circle: Circle, rect: Rect };

// Turn the self-closing tags above into react-native-svg elements.
function parse(src: string, color: string) {
  return [...src.matchAll(/<(\w+)([^>]*?)\/>/g)].map((m, i) => {
    const props: Record<string, string> = { key: String(i) };
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) props[a[1]] = a[2] === "currentColor" ? color : a[2];
    return createElement(TAGS[m[1]], props);
  });
}

export function Icon({ name, size = 20, color = "#000", w = 1.8 }: { name: IconName; size?: number; color?: string; w?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {parse(I[name], color)}
    </Svg>
  );
}
