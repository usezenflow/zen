import { Box, Button, Image, Row, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, fillMaxWidth, padding, size } from "@expo/ui/jetpack-compose/modifiers";
import type { JSX } from "react";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData } from "./data";
import { SAMPLE } from "./ZenNext.android";

// Small: capture. A widget cannot take the photo, so tapping opens the app with the camera up.
function ZenScan(_: WidgetData, env: WidgetEnvironment) {
  "widget";
  const c = env.colorScheme === "dark"
    ? { bg: "#0d0d0f", ink: "#f2f3f5", muted: "#8a8d94", chip: "#1a1b1f" }
    : { bg: "#ffffff", ink: "#0d0d0f", muted: "#737a87", chip: "#f1f3f7" };
  const tap = (target: string) => ({ target }) as object;
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
          <Image source={{ uri: "zen_logo" }} contentScale="fit" contentDescription={null} modifiers={[size(24, 24)]} />
          <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
            <Text color={c.muted} maxLines={1} style={{ fontSize: 14 }}>Chụp</Text>
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
