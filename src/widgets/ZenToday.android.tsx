import { Box, Button, Column, Image, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxHeight, fillMaxSize, fillMaxWidth, height, padding, size, width } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData, WRow } from "./data";
import { SAMPLE } from "./ZenNext.android";

// Medium: next on its sand at the left, the rest of today on the right; the circle ticks in place.
// shortcut: Android gives the layout no size, so the resized (large) widget still shows this medium layout,
// upgrade when expo-widgets passes the widget size in `environment`.
function ZenToday(p: WidgetData, env: WidgetEnvironment) {
  "widget";
  const c = env.colorScheme === "dark"
    ? { bg: "#121314", ink: "#ecebe6", muted: "#7f817e", line: "#26282a", chip: "#1c1d1f" }
    : { bg: "#fbfaf7", ink: "#16181b", muted: "#8d8f8c", line: "#e6e4de", chip: "#f0eee9" };
  const mid = { plan: "#4f68e8", lecture: "#2f8a78", exam: "#d9432b", assignment: "#8a5cc4", busy: "#bdbcb6" };
  const tap = (target: string) => ({ target }) as object;
  const meter = (fill: number, big: string, small: string) => {
    const h = Math.round(43 * Math.max(0, Math.min(1, fill)));
    return (
      <Row verticalAlignment="center">
        <Box contentAlignment="bottomCenter" modifiers={[size(16, 47), cornerRadius(9), background("#ffffff40"), padding(2, 2, 2, 2)]}>
          {h > 0 ? <Box modifiers={[fillMaxWidth(), height(Math.max(h, 6)), cornerRadius(6), background("#ffffff")]} /> : null}
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
    ticked: p.ticked.includes(id) ? p.ticked : [...p.ticked, id],
  });
  const lead = (r: WRow) => {
    if (!r.check) {
      const src = p.art[r.type]?.square;
      return (
        <Box modifiers={[size(26, 26), cornerRadius(13), background(mid[r.type] ?? mid.plan)]}>
          {src ? <Image source={{ uri: src }} contentScale="crop" contentDescription={null} alpha={r.type === "busy" ? 0.55 : 1} modifiers={[size(26, 26)]} /> : null}
        </Box>
      );
    }
    if (done(r)) {
      return (
        <Box contentAlignment="center" modifiers={[size(26, 26), cornerRadius(13), background(c.chip)]}>
          <Text color={c.ink} maxLines={1} style={{ fontSize: 13, fontWeight: "bold" }}>✓</Text>
        </Box>
      );
    }
    return (
      <Button {...tap(`done:${r.id}`)} onClick={tick(r.id)} modifiers={[size(26, 40)]}>
        <Box modifiers={[size(26, 26), cornerRadius(13), background(c.line), padding(1.5, 1.5, 1.5, 1.5)]}>
          <Box modifiers={[fillMaxSize(), cornerRadius(11.5), background(c.bg)]} />
        </Box>
      </Button>
    );
  };
  const row = (r: WRow) => (
    <Row key={r.id} verticalAlignment="center" modifiers={[fillMaxWidth(), height(40)]}>
      {lead(r)}
      <Spacer modifiers={[width(12)]} />
      <Button {...tap(r.url)} modifiers={[fillMaxWidth(), height(40)]}>
        <Box contentAlignment="centerEnd" modifiers={[fillMaxSize()]}>
          {/* Title stops short of the time column; Expo UI on Android has no weight modifier. */}
          <Box contentAlignment="centerStart" modifiers={[fillMaxSize(), padding(0, 0, 52, 0)]}>
            <Text color={done(r) ? c.muted : c.ink} maxLines={1} style={{ fontSize: 17, fontWeight: "bold", textDecoration: done(r) ? "lineThrough" : "none" }}>{r.title}</Text>
          </Box>
          <Text color={c.muted} maxLines={1} style={{ fontSize: 16 }}>{r.time}</Text>
        </Box>
      </Button>
    </Row>
  );

  const n = p.next;
  const art = n && p.art[n.type]?.square;
  const rows = p.rows.slice(0, 3);
  return (
    <Box modifiers={[fillMaxSize(), cornerRadius(28), background(c.bg), padding(13, 13, 13, 13)]}>
      <Row modifiers={[fillMaxSize()]}>
        <Button {...tap(n ? n.url : p.home)} modifiers={[width(126), fillMaxHeight()]}>
          {n ? (
            <Box modifiers={[fillMaxSize(), cornerRadius(18), background(mid[n.type] ?? mid.plan)]}>
              {art ? <Image source={{ uri: art }} contentScale="crop" contentDescription={null} modifiers={[fillMaxSize()]} /> : null}
              <Box modifiers={[fillMaxSize(), padding(13, 13, 13, 13)]}>
                <Column>
                  <Text color="#ffffffd9" maxLines={1} style={{ fontSize: 15 }}>{n.at}</Text>
                  <Text color="#ffffff" maxLines={2} style={{ fontSize: 17, fontWeight: "bold" }}>{n.title}</Text>
                </Column>
                <Box contentAlignment="bottomStart" modifiers={[fillMaxSize()]}>
                  {meter(n.fill, n.mins, "còn lại")}
                </Box>
              </Box>
            </Box>
          ) : (
            <Box contentAlignment="bottomStart" modifiers={[fillMaxSize(), cornerRadius(18), background(c.chip), padding(13, 13, 13, 13)]}>
              <Text color={c.ink} maxLines={2} style={{ fontSize: 17, fontWeight: "bold" }}>{"Xong hết\nhôm nay"}</Text>
            </Box>
          )}
        </Button>
        <Spacer modifiers={[width(16)]} />
        <Column modifiers={[fillMaxSize(), padding(0, 4, 0, 0)]}>
          <Button {...tap(p.home)} modifiers={[fillMaxWidth()]}>
            <Row modifiers={[fillMaxWidth()]}>
              <Text color={c.muted} maxLines={1} style={{ fontSize: 15 }}>Hôm nay</Text>
              <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
                <Text color={c.muted} maxLines={1} style={{ fontSize: 15 }}>{p.count}</Text>
              </Box>
            </Row>
          </Button>
          {rows.length === 0 && p.tomorrow ? <Text color={c.muted} maxLines={2} style={{ fontSize: 15 }}>{p.tomorrow}</Text> : null}
          {rows.map((r, i) => (i === 0 ? row(r) : [<Box key={`l${r.id}`} modifiers={[fillMaxWidth(), height(1), background(c.line)]} />, row(r)]))}
        </Column>
      </Row>
    </Box>
  );
}

export default createWidget<WidgetData>("ZenToday", ZenToday, SAMPLE);
