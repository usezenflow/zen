import { useEffect, useRef, type ComponentRef, type RefObject } from "react";
import type { GestureResponderEvent, View } from "react-native";

export type Box = ComponentRef<typeof View>;

// Every tap in the app (not a drag), fed from the root view, so an open native picker closes only when the user taps elsewhere.
type Hit = (x: number, y: number) => void;
const subs = new Set<Hit>();
let at = { x: 0, y: 0 };
export const feedTaps = {
  onTouchStart: (e: GestureResponderEvent) => { at = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; },
  onTouchEnd: (e: GestureResponderEvent) => {
    const { pageX: x, pageY: y } = e.nativeEvent;
    if (Math.hypot(x - at.x, y - at.y) < 10) subs.forEach((f) => f(x, y));
  },
};

/** While `on`, a tap outside `box` calls `close`. Taps inside (the picker's own) do nothing. */
export function useTapOutside(box: RefObject<Box | null>, on: boolean, close: () => void) {
  const fn = useRef(close);
  useEffect(() => { fn.current = close; });
  useEffect(() => {
    if (!on) return;
    const f: Hit = (x, y) => box.current?.measureInWindow((bx, by, w, h) => { if (x < bx || x > bx + w || y < by || y > by + h) fn.current(); });
    subs.add(f);
    return () => { subs.delete(f); };
  }, [on, box]);
}
