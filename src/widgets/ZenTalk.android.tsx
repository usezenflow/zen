import { Box, Button, Image, Row, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, fillMaxWidth, padding, size } from "@expo/ui/jetpack-compose/modifiers";
import type { JSX } from "react";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData } from "./data";
import { SAMPLE } from "./ZenNext.android";

// Small: talk. A widget cannot hold the mic, so tapping opens the app already listening.
function ZenTalk(p0: WidgetData, env: WidgetEnvironment) {
  "widget";
  const listen = p0?.listen || "zen:///?listen=1";
  const c = env.colorScheme === "dark"
    ? { bg: "#0d0d0f", ink: "#f2f3f5", muted: "#8a8d94", chip: "#1a1b1f" }
    : { bg: "#ffffff", ink: "#0d0d0f", muted: "#737a87", chip: "#f1f3f7" };
  const tap = (target: string) => ({ target }) as object;
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
    <Button {...tap(listen)} modifiers={[fillMaxSize()]}>
      <Box modifiers={[fillMaxSize(), cornerRadius(28), background(c.bg), padding(18, 17, 18, 17)]}>
        <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
          <Image source={{ uri: "zen_logo" }} contentScale="fit" contentDescription={null} modifiers={[size(24, 24)]} />
          <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
            <Text color={c.muted} maxLines={1} style={{ fontSize: 15, fontWeight: "bold" }}>zen</Text>
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
