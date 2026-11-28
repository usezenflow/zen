import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Reanimated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { addDays, dayAt, mondayOf, monthGrid, startOfDay, type Rect } from "@/components/cal";
import type { Box } from "@/components/outside";
import type { Drag } from "@/components/row";
import { useTheme, font, ff } from "@/lib/theme";
import type { Task } from "@/lib/types";

const EDGE = 24; // before the grid is measured: a finger this close to the screen's side pages it
const WAIT = 400, EVERY = 700; // first page after resting at the edge, then one more page per beat while it stays

/**
 * Week and month: hold a row, move it onto a day of the grid, let go. Resting at the left or right edge pages the grid (not the
 * selected day, so the list and the row being dragged stay put), past weeks and months too. `onDrop` gets the task and the day.
 */
export function useDragDay(view: "week" | "month" | undefined, sel: number, onDrop: (x: Task, day: number) => void) {
  const th = useTheme();
  const { width } = useWindowDimensions();
  const x = useSharedValue(0), y = useSharedValue(0), cw = useSharedValue(0);
  const gridRef = useRef<Box>(null), originRef = useRef<Box>(null);
  const [task, setTask] = useState<Task>();
  const [hover, setHover] = useState<number>();
  const [peek, setPeek] = useState(0);
  // What the grid shows now, read from callbacks that outlive the render that made them.
  const grid = view === "week" ? { start: addDays(mondayOf(sel), 7 * peek), rows: 1, first: addDays(mondayOf(sel), 7 * peek) } : (() => {
    const d = new Date(sel), g = monthGrid(new Date(d.getFullYear(), d.getMonth() + peek, 1).getTime());
    return { start: g.start, rows: g.rows, first: g.first };
  })();
  const st = useRef({ rect: undefined as Rect | undefined, rowH: 0, origin: { x: 0, y: 0 }, edge: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined, hover: undefined as number | undefined, fx: 0, fy: 0, grid, task: undefined as Task | undefined, onDrop });
  useEffect(() => { st.current.grid = grid; st.current.onDrop = onDrop; });

  const look = (fx: number, fy: number) => {
    const s = st.current, r = s.rect;
    s.fx = fx; s.fy = fy;
    // The grid only slides sideways while paging, so its first rect holds; a month of more or fewer weeks only changes its height.
    const d = r ? dayAt({ ...r, h: s.rowH * s.grid.rows }, s.grid.start, s.grid.rows, fx, fy) : undefined;
    if (d !== s.hover) { s.hover = d; setHover(d); if (d !== undefined) Haptics.selectionAsync().catch(() => {}); }
  };
  const stopEdge = () => { clearTimeout(st.current.timer); st.current.timer = undefined; st.current.edge = 0; };
  const page = (side: -1 | 1) => {
    const s = st.current;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPeek((p) => p + side);
    s.timer = setTimeout(() => page(side), EVERY);
  };
  useEffect(() => { if (st.current.task) look(st.current.fx, st.current.fy); }, [peek]); // the new page under a resting finger

  const drag: Drag | undefined = useMemo(() => view && ({
    x, y,
    begin: (t: Task) => {
      const s = st.current;
      s.task = t; s.hover = undefined; s.rect = undefined;
      setTask(t); setPeek(0);
      originRef.current?.measureInWindow((ox, oy) => { s.origin = { x: ox, y: oy }; });
      gridRef.current?.measureInWindow((gx, gy, w, h) => { s.rect = { x: gx, y: gy, w, h }; s.rowH = h / s.grid.rows; look(s.fx, s.fy); });
    },
    move: (fx: number, fy: number) => {
      look(fx, fy);
      // Past the grid's own sides (the gutter), so a finger over Mon or Sun never pages away from them.
      const r = st.current.rect, l = r ? r.x : EDGE, rt = r ? r.x + r.w : width - EDGE;
      const side = fx < l ? -1 : fx > rt ? 1 : 0;
      if (side === st.current.edge) return;
      stopEdge();
      st.current.edge = side;
      if (side) st.current.timer = setTimeout(() => page(side), WAIT);
    },
    end: (fx: number, fy: number) => {
      const s = st.current, t = s.task;
      stopEdge();
      if (t && Number.isFinite(fx)) look(fx, fy);
      const d = s.hover;
      s.task = undefined; s.hover = undefined;
      setTask(undefined); setHover(undefined); setPeek(0);
      if (t && d !== undefined && (t.start === undefined || d !== startOfDay(t.start)) && d >= startOfDay(Date.now())) s.onDrop(t, d);
    },
  }), [view, width]); // eslint-disable-line react-hooks/exhaustive-deps -- the rest is read through st
  useEffect(() => () => clearTimeout(st.current.timer), []);

  // The chip rides centred above the finger, so the finger never hides which task it carries and each edge is as near as the other.
  const chip = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() - st.current.origin.x - cw.get() / 2 }, { translateY: y.get() - st.current.origin.y - 64 }] }));
  const ghost = (
    <View ref={originRef} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {task && (
        <Reanimated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(120)} onLayout={(e) => cw.set(e.nativeEvent.layout.width)} style={[s.chip, { backgroundColor: th.ink }, chip]}>
          <Text numberOfLines={1} style={[s.t, { color: th.bg }]}>{task.title}</Text>
        </Reanimated.View>
      )}
    </View>
  );
  return { drag, hover, gridRef, ghost, peek, anchor: grid.first };
}

const s = StyleSheet.create({
  chip: { position: "absolute", left: 0, top: 0, maxWidth: 220, height: 40, paddingHorizontal: 16, borderRadius: 99, justifyContent: "center", boxShadow: "0 14px 30px -10px rgba(0,0,0,0.45)" },
  t: { fontSize: font.sub, lineHeight: 22, fontFamily: ff("600") },
});
