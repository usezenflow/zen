import { Box, Button, Column, Image, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, padding, size, width } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData } from "./data";
import { SAMPLE } from "./ZenNext.android";

// Small: exam countdown on the dusk line-field art (artOf(exam) === "assignment").
function ZenExam(p0: WidgetData, env: WidgetEnvironment) {
  "widget";
  const base = p0 ?? ({ short: "", home: "zen:///" } as WidgetData);
  const now = Date.now(), due = (base.tl ?? []).reduce<NonNullable<WidgetData["tl"]>[number] | undefined>((a, x) => (x.at <= now ? x : a), undefined);
  const p: WidgetData = due ? { ...base, ...due.p } : base;
  const c = env.colorScheme === "dark"
    ? { bg: "#0d0d0f", ink: "#f2f3f5", muted: "#8a8d94" }
    : { bg: "#ffffff", ink: "#0d0d0f", muted: "#737a87" };
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
          <Text color="#ffffffeb" maxLines={2} style={{ fontSize: 14.5 }}>{small}</Text>
        </Column>
      </Row>
    );
  };

  const e = p.exam;
  if (!e) {
    return (
      <Button {...tap(p.home || "zen:///")} modifiers={[fillMaxSize()]}>
        <Box modifiers={[fillMaxSize(), cornerRadius(28), background(c.bg), padding(18, 17, 18, 17)]}>
          <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
            <Image source={{ uri: "zen_logo" }} contentScale="fit" contentDescription={null} modifiers={[size(24, 24)]} />
            <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
              <Text color={c.muted} maxLines={1} style={{ fontSize: 14 }}>{p.short ?? ""}</Text>
            </Box>
          </Row>
          <Box contentAlignment="bottomStart" modifiers={[fillMaxSize()]}>
            <Text color={c.ink} maxLines={2} style={{ fontSize: 21, fontWeight: "bold" }}>{"Chưa có kỳ thi nào sắp tới"}</Text>
          </Box>
        </Box>
      </Button>
    );
  }
  return (
    <Button {...tap(e.url)} modifiers={[fillMaxSize()]}>
      <Box modifiers={[fillMaxSize(), cornerRadius(28), background("#5c1450")]}>
        <Image source={{ uri: "zen_art_assignment" }} contentScale="crop" contentDescription={null} modifiers={[fillMaxSize()]} />
        <Box modifiers={[fillMaxSize(), padding(18, 17, 18, 17)]}>
          <Column>
            <Text color="#ffffffe6" maxLines={1} style={{ fontSize: 12 }}>SẮP THI</Text>
            <Text color="#ffffff" maxLines={2} modifiers={[padding(0, 3, 0, 0)]} style={{ fontSize: 21, fontWeight: "bold" }}>{e.title}</Text>
          </Column>
          <Box contentAlignment="bottomStart" modifiers={[fillMaxSize()]}>
            {meter(e.fill, e.big, e.small)}
          </Box>
        </Box>
      </Box>
    </Button>
  );
}

export default createWidget<WidgetData>("ZenExam", ZenExam, SAMPLE);
