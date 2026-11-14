import { Box, Button, Row, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, fillMaxWidth, padding, size } from "@expo/ui/jetpack-compose/modifiers";
import type { JSX } from "react";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData } from "./data";
import { SAMPLE } from "./ZenNext.android";

// Small: talk. A widget cannot hold the mic, so tapping opens the app already listening.
function ZenTalk(p: WidgetData, env: WidgetEnvironment) {
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
  // Mic glyph (ui.js I.mic, 24-unit icon at 31dp) from boxes: stroked capsule, lower half of a ring, stem.
  // Every layer is a full-size Box pushed down by top padding, since a Box aligns all its children alike.
  const at = (top: number, child: JSX.Element) => (
    <Box contentAlignment="topCenter" modifiers={[fillMaxSize(), padding(0, top, 0, 0)]}>{child}</Box>
  );
  const mic = (fg: string, bg: string) => (
    <Box modifiers={[size(31, 31)]}>
      {at(4.7, (
        <Box modifiers={[size(19, 19), cornerRadius(9.5), background(fg), padding(2.3, 2.3, 2.3, 2.3)]}>
          <Box modifiers={[fillMaxSize(), cornerRadius(7.2), background(bg)]} />
        </Box>
      ))}
      {at(4.7, <Box modifiers={[size(19, 9.5), background(bg)]} />)}
      {at(2.7, (
        <Box modifiers={[size(10, 16.6), cornerRadius(5), background(fg), padding(2.3, 2.3, 2.3, 2.3)]}>
          <Box modifiers={[fillMaxSize(), cornerRadius(2.7), background(bg)]} />
        </Box>
      ))}
      {at(22.5, <Box modifiers={[size(2.3, 5.8), background(fg)]} />)}
    </Box>
  );

  return (
    <Button {...tap(p.listen)} modifiers={[fillMaxSize()]}>
      <Box modifiers={[fillMaxSize(), cornerRadius(28), background(c.bg), padding(18, 17, 18, 17)]}>
        <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
          {logo(c.ink)}
          <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
            <Text color={c.muted} maxLines={1} style={{ fontSize: 14.4 }}>Zen</Text>
          </Box>
        </Row>
        <Box contentAlignment="bottomCenter" modifiers={[fillMaxSize()]}>
          <Box contentAlignment="center" modifiers={[size(92, 92), cornerRadius(46), background(c.chip)]}>
            <Box contentAlignment="center" modifiers={[size(76, 76), cornerRadius(38), background(c.ink)]}>
              {mic(c.bg, c.ink)}
            </Box>
          </Box>
        </Box>
      </Box>
    </Button>
  );
}

export default createWidget<WidgetData>("ZenTalk", ZenTalk, SAMPLE);
