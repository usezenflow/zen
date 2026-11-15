import { Box, Button, Column, Image, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, padding, size, width } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData } from "./data";
import { SAMPLE } from "./ZenNext.android";

// Small: exam countdown on the exam sand. Same frame as ZenNext; the runtime cannot share helpers between widgets.
function ZenExam(p0: WidgetData, env: WidgetEnvironment) {
  "widget";
  // The timeline entry due now (data.ts tl); ticks and art stay on the stored top level.
  const now = Date.now(), due = (p0.tl ?? []).reduce<NonNullable<WidgetData["tl"]>[number] | undefined>((a, x) => (x.at <= now ? x : a), undefined);
  const p: WidgetData = due ? { ...p0, ...due.p } : p0;
  const c = env.colorScheme === "dark"
    ? { bg: "#121314", ink: "#ecebe6", muted: "#7f817e" }
    : { bg: "#fbfaf7", ink: "#16181b", muted: "#8d8f8c" };
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
          <Text color="#ffffffe6" maxLines={2} style={{ fontSize: 15 }}>{small}</Text>
        </Column>
      </Row>
    );
  };

  const e = p.exam;
  if (!e) {
    return (
      <Button {...tap(p.home)} modifiers={[fillMaxSize()]}>
        <Box modifiers={[fillMaxSize(), cornerRadius(28), background(c.bg), padding(18, 17, 18, 17)]}>
          <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
            {logo(c.muted)}
            <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
              <Text color={c.muted} maxLines={1} style={{ fontSize: 14.4 }}>{p.short}</Text>
            </Box>
          </Row>
          <Box contentAlignment="bottomStart" modifiers={[fillMaxSize()]}>
            <Text color={c.ink} maxLines={2} style={{ fontSize: 21, fontWeight: "bold" }}>{"Không có kỳ thi sắp tới"}</Text>
          </Box>
        </Box>
      </Button>
    );
  }
  const art = p.art.exam?.square;
  return (
    <Button {...tap(e.url)} modifiers={[fillMaxSize()]}>
      <Box modifiers={[fillMaxSize(), cornerRadius(28), background("#d9432b")]}>
        {art ? <Image source={{ uri: art }} contentScale="crop" contentDescription={null} modifiers={[fillMaxSize()]} /> : null}
        <Box modifiers={[fillMaxSize(), padding(18, 17, 18, 17)]}>
          <Column>
            <Text color="#ffffffd9" maxLines={1} style={{ fontSize: 14.4 }}>Sắp thi</Text>
            <Text color="#ffffff" maxLines={2} style={{ fontSize: 21, fontWeight: "bold" }}>{e.title}</Text>
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
