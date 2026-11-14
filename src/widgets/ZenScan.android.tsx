import { Box, Button, Row, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, fillMaxWidth, padding, size } from "@expo/ui/jetpack-compose/modifiers";
import type { JSX } from "react";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData } from "./data";
import { SAMPLE } from "./ZenNext.android";

// Small: capture. A widget cannot take the photo, so tapping opens the app with the camera up.
function ZenScan(_: WidgetData, env: WidgetEnvironment) {
  "widget";
  const c = env.colorScheme === "dark"
    ? { bg: "#121314", ink: "#ecebe6", muted: "#7f817e", chip: "#1c1d1f" }
    : { bg: "#fbfaf7", ink: "#16181b", muted: "#8d8f8c", chip: "#f0eee9" };
  const tap = (target: string) => ({ target }) as object;
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
  // Camera glyph (ui.js I.camera at 31dp) from boxes: the top bump, a stroked body over it, a stroked lens.
  const at = (top: number, child: JSX.Element) => (
    <Box contentAlignment="topCenter" modifiers={[fillMaxSize(), padding(0, top, 0, 0)]}>{child}</Box>
  );
  const ring = (w: number, h: number, r: number, fg: string, bg: string) => (
    <Box modifiers={[size(w, h), cornerRadius(r), background(fg), padding(2.3, 2.3, 2.3, 2.3)]}>
      <Box modifiers={[fillMaxSize(), cornerRadius(Math.max(0, r - 2.3)), background(bg)]} />
    </Box>
  );
  const camera = (fg: string, bg: string) => (
    <Box modifiers={[size(31, 31)]}>
      {at(5.2, <Box modifiers={[size(10, 4), cornerRadius(1.5), background(fg)]} />)}
      {at(8.5, ring(23, 16, 3, fg, bg))}
      {at(11.6, ring(10, 10, 5, fg, bg))}
    </Box>
  );

  return (
    <Button {...tap("zen:///?scan=1")} modifiers={[fillMaxSize()]}>
      <Box modifiers={[fillMaxSize(), cornerRadius(28), background(c.bg), padding(18, 17, 18, 17)]}>
        <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
          {logo(c.ink)}
          <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
            <Text color={c.muted} maxLines={1} style={{ fontSize: 14.4 }}>Chụp</Text>
          </Box>
        </Row>
        <Box contentAlignment="bottomCenter" modifiers={[fillMaxSize()]}>
          <Box contentAlignment="center" modifiers={[size(92, 92), cornerRadius(46), background(c.chip)]}>
            <Box contentAlignment="center" modifiers={[size(76, 76), cornerRadius(38), background(c.ink)]}>
              {camera(c.bg, c.ink)}
            </Box>
          </Box>
        </Box>
      </Box>
    </Button>
  );
}

export default createWidget<WidgetData>("ZenScan", ZenScan, SAMPLE);
