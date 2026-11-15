import { Box, Button, Column, Image, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxHeight, fillMaxSize, fillMaxWidth, height, padding, size, width } from "@expo/ui/jetpack-compose/modifiers";
import type { JSX } from "react";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData, WRow } from "./data";
import { SAMPLE } from "./ZenNext.android";

// Medium: next on its sand at the left, the rest of today on the right; the circle ticks in place.
// shortcut: Android gives the layout no size, so the resized (large) widget still shows this medium layout,
// upgrade when expo-widgets passes the widget size in `environment`.
// shortcut: Glance (expo-widgets 58) renders 500/600 as Normal and has no line-height, letter-spacing or custom font, so 600 is drawn Bold in the system font; upgrade when expo-widgets maps Medium/SemiBold.
function ZenToday(p0: WidgetData, env: WidgetEnvironment) {
  "widget";
  // The timeline entry due now (data.ts tl); ticks and art stay on the stored top level.
  const now = Date.now(), due = (p0.tl ?? []).reduce<NonNullable<WidgetData["tl"]>[number] | undefined>((a, x) => (x.at <= now ? x : a), undefined);
  const p: WidgetData = due ? { ...p0, ...due.p } : p0;
  const c = env.colorScheme === "dark"
    ? { bg: "#121314", ink: "#ecebe6", muted: "#7f817e", line: "#26282a", chip: "#1c1d1f" }
    : { bg: "#fbfaf7", ink: "#16181b", muted: "#8d8f8c", line: "#e6e4de", chip: "#f0eee9" };
  const mid = { plan: "#4f68e8", lecture: "#2f8a78", exam: "#d9432b", assignment: "#8a5cc4", busy: "#bdbcb6" };
  const tap = (target: string) => ({ target }) as object;
  const meter = (fill: number, big: string, small: string) => {
    const h = Math.min(39.4, 43.2 * Math.max(0, Math.min(1, fill)));
    return (
      <Row verticalAlignment="center">
        <Box contentAlignment="bottomCenter" modifiers={[size(15.7, 47.2), cornerRadius(9.2), background("#ffffff40"), padding(3.9, 3.9, 3.9, 3.9)]}>
          {h > 0 ? <Box modifiers={[fillMaxWidth(), height(Math.max(h, 6)), cornerRadius(6.55), background("#ffffff")]} /> : null}
        </Box>
        <Spacer modifiers={[width(10)]} />
        <Column>
          <Text color="#ffffff" maxLines={1} style={{ fontSize: 26, fontWeight: "bold" }}>{big}</Text>
          <Text color="#ffffffe6" maxLines={1} style={{ fontSize: 15 }}>{small}</Text>
        </Column>
      </Row>
    );
  };
  const done = (r: WRow) => r.done || p.ticked.includes(r.id);
  // Returned props merge into the stored ones and the widget re-renders; the app reads `ticked` on its next run.
  const tick = (id: string) => () => ({
    rows: p.rows.map((r) => (r.id === id ? { ...r, done: true } : r)),
    ahead: p.ahead.map((r) => (r.id === id ? { ...r, done: true } : r)),
    ticked: p.ticked.includes(id) ? p.ticked : [...p.ticked, id],
  });
  const lead = (r: WRow) => {
    if (!r.check) {
      const src = p.art[r.type]?.square;
      return (
        <Box modifiers={[size(23.6, 23.6), cornerRadius(11.8), background(mid[r.type] ?? mid.plan)]}>
          {src ? <Image source={{ uri: src }} contentScale="crop" contentDescription={null} modifiers={[size(23.6, 23.6)]} /> : null}
        </Box>
      );
    }
    if (done(r)) {
      return (
        <Box contentAlignment="center" modifiers={[size(23.6, 23.6), cornerRadius(11.8), background(c.chip)]}>
          <Text color={c.ink} maxLines={1} style={{ fontSize: 14.4, fontWeight: "bold" }}>✓</Text>
        </Box>
      );
    }
    return (
      <Button {...tap(`done:${r.id}`)} onClick={tick(r.id)} modifiers={[size(23.6, 39.3)]}>
        {/* muted, not line: a line-coloured ring vanishes on the dark paper */}
        <Box modifiers={[size(23.6, 23.6), cornerRadius(11.8), background(c.muted), padding(1.7, 1.7, 1.7, 1.7)]}>
          <Box modifiers={[fillMaxSize(), cornerRadius(10.1), background(c.bg)]} />
        </Box>
      </Button>
    );
  };
  const row = (r: WRow) => (
    <Row key={r.id} verticalAlignment="center" modifiers={[fillMaxWidth(), height(39.3)]}>
      {lead(r)}
      <Spacer modifiers={[width(10.5)]} />
      <Button {...tap(r.url)} modifiers={[fillMaxWidth(), height(39.3)]}>
        <Box contentAlignment="centerEnd" modifiers={[fillMaxSize()]}>
          {/* Title stops short of the time column; Expo UI on Android has no weight modifier. */}
          <Box contentAlignment="centerStart" modifiers={[fillMaxSize(), padding(0, 0, 48, 0)]}>
            <Text color={done(r) ? c.muted : c.ink} maxLines={1} style={{ fontSize: 15.7, fontWeight: "bold", textDecoration: done(r) ? "lineThrough" : "none" }}>{r.title}</Text>
          </Box>
          <Text color={c.muted} maxLines={1} style={{ fontSize: 14.4, fontWeight: "bold" }}>{r.time}</Text>
        </Box>
      </Button>
    </Row>
  );

  const logo = (ink: string) => (
    <Box modifiers={[size(24, 24)]}>
      <Box modifiers={[fillMaxSize(), padding(3, 3, 0, 0)]}>
        <Box modifiers={[size(15, 18), cornerRadius(7.5), background(ink)]} />
      </Box>
      <Box modifiers={[fillMaxSize(), padding(10.5, 3, 0, 0)]}>
        <Box modifiers={[size(7.5, 9), background(ink)]} />
      </Box>
      <Box modifiers={[fillMaxSize(), padding(3, 12, 0, 0)]}>
        <Box modifiers={[size(7.5, 9), background(ink)]} />
      </Box>
      <Box modifiers={[fillMaxSize(), padding(17, 17, 0, 0)]}>
        <Box modifiers={[size(6.5, 6.5), cornerRadius(3.25), background("#d9432b")]} />
      </Box>
    </Box>
  );
  // Sand card on the left: the next thing, or on a free day the nearest exam (mockups/widgets.html `examCard`).
  const sand = (type: WRow["type"], lab: string, title: string, foot: JSX.Element) => {
    const src = p.art[type]?.square;
    return (
      <Box modifiers={[fillMaxSize(), cornerRadius(18.3), background(mid[type] ?? mid.plan)]}>
        {src ? <Image source={{ uri: src }} contentScale="crop" contentDescription={null} modifiers={[fillMaxSize()]} /> : null}
        <Box modifiers={[fillMaxSize(), padding(15.7, 13, 15.7, 13)]}>
          <Column>
            <Text color="#ffffffd9" maxLines={1} style={{ fontSize: 13.8 }}>{lab}</Text>
            <Text color="#ffffff" maxLines={2} style={{ fontSize: 17, fontWeight: "bold" }}>{title}</Text>
          </Column>
          <Box contentAlignment="bottomStart" modifiers={[fillMaxSize()]}>
            {foot}
          </Box>
        </Box>
      </Box>
    );
  };
  // Nothing left (`inkCard`): the line in ink at the foot, a muted count under it.
  const ink = (line: string, sub: string) => (
    <Box modifiers={[fillMaxSize(), cornerRadius(18.3), background(c.chip), padding(15.7, 13, 15.7, 13)]}>
      {logo(c.ink)}
      <Box contentAlignment="bottomStart" modifiers={[fillMaxSize()]}>
        <Column>
          <Text color={c.ink} maxLines={2} style={{ fontSize: 17, fontWeight: "bold" }}>{line}</Text>
          {sub ? <Text color={c.muted} maxLines={1} style={{ fontSize: 15 }}>{sub}</Text> : null}
        </Column>
      </Box>
    </Box>
  );

  const n = p.next, ex = p.exam;
  // Nothing left today: the right half turns to the next day that has anything.
  const empty = !n && !p.rows.length;
  const rows = empty ? p.ahead : p.rows.slice(0, 3);
  const free = empty && !p.doneCount;
  const head = empty && p.aheadHead ? [p.aheadHead, p.aheadCount] : ["Hôm nay", p.count];
  return (
    <Box modifiers={[fillMaxSize(), cornerRadius(28), background(c.bg), padding(17, 13, 17, 13)]}>
      <Row modifiers={[fillMaxSize()]}>
        <Button {...tap(n ? n.url : free && ex ? ex.url : p.home)} modifiers={[width(126), fillMaxHeight()]}>
          {n ? sand(n.type, n.at, n.title, meter(n.fill, n.mins, "còn lại"))
            : free && ex ? sand("exam", "Sắp thi", ex.title, (
              // Too narrow for the meter: the days on one line, the date under it.
              <Column>
                <Text color="#ffffff" maxLines={1} style={{ fontSize: 23.6, fontWeight: "bold" }}>{ex.big}</Text>
                <Text color="#ffffffe6" maxLines={1} style={{ fontSize: 13.8 }}>{ex.small}</Text>
              </Column>
            ))
            : free ? ink("Hôm nay\ntrống", p.dayName)
            : ink("Xong hết\nhôm nay", p.doneCount)}
        </Button>
        <Spacer modifiers={[width(16)]} />
        <Column modifiers={[fillMaxSize(), padding(0, 4, 0, 0)]}>
          <Button {...tap(p.home)} modifiers={[fillMaxWidth()]}>
            <Row modifiers={[fillMaxWidth()]}>
              <Text color={c.muted} maxLines={1} style={{ fontSize: 14.4 }}>{head[0]}</Text>
              <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
                <Text color={c.muted} maxLines={1} style={{ fontSize: 14.4 }}>{head[1]}</Text>
              </Box>
            </Row>
          </Button>
          {/* shortcut: a week with nothing at all is not in the mockup; one muted line, upgrade if it shows up in use. */}
          {empty && !rows.length ? <Text color={c.muted} maxLines={1} style={{ fontSize: 15 }}>7 ngày tới trống</Text> : null}
          {rows.map((r, i) => (i === 0 ? row(r) : [<Box key={`l${r.id}`} modifiers={[fillMaxWidth(), height(1.31), background(c.line)]} />, row(r)]))}
        </Column>
      </Row>
    </Box>
  );
}

export default createWidget<WidgetData>("ZenToday", ZenToday, SAMPLE);
