import { Box, Button, Column, Image, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, padding, size, width } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData } from "./data";

// Small: the next thing on its line-field art with the time left in a battery meter (mockups/widgets.html).
// The widget runtime sees nothing at module scope, so tokens and helpers live inside the function.
// shortcut: Glance (expo-widgets 58) renders 500/600 as Normal and has no line-height, letter-spacing or custom font, so display faces draw Bold in the system font; upgrade when expo-widgets maps custom fonts.
function ZenNext(p0: WidgetData, env: WidgetEnvironment) {
  "widget";
  const base = p0 ?? ({ short: "", home: "zen:///", tomorrow: "" } as WidgetData);
  const now = Date.now(), due = (base.tl ?? []).reduce<NonNullable<WidgetData["tl"]>[number] | undefined>((a, x) => (x.at <= now ? x : a), undefined);
  const p: WidgetData = due ? { ...base, ...due.p } : base;
  const c = env.colorScheme === "dark"
    ? { bg: "#0d0d0f", ink: "#f2f3f5", muted: "#8a8d94" }
    : { bg: "#ffffff", ink: "#0d0d0f", muted: "#737a87" };
  const mid: Record<string, string> = {
    plan: "#0b2f8f", lecture: "#0f8f6a", exam: "#ff4f2a",
    assignment: "#5c1450", night: "#1e2a8a", clay: "#6e2a16", busy: "#434952",
  };
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
          <Text color="#ffffffeb" maxLines={1} style={{ fontSize: 14.5 }}>{small}</Text>
        </Column>
      </Row>
    );
  };

  const n = p.next;
  if (!n) {
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
            <Column>
              <Text color={c.ink} maxLines={2} style={{ fontSize: 21, fontWeight: "bold" }}>{"Xong hết\nhôm nay"}</Text>
              {p.tomorrow ? <Text color={c.muted} maxLines={2} modifiers={[padding(0, 3.9, 0, 0)]} style={{ fontSize: 14.5 }}>{p.tomorrow}</Text> : null}
            </Column>
          </Box>
        </Box>
      </Button>
    );
  }
  const type = mid[n.type] ? n.type : "plan";
  return (
    <Button {...tap(n.url)} modifiers={[fillMaxSize()]}>
      <Box modifiers={[fillMaxSize(), cornerRadius(28), background(mid[type])]}>
        <Image source={{ uri: `zen_art_${type}` }} contentScale="crop" contentDescription={null} modifiers={[fillMaxSize()]} />
        <Box modifiers={[fillMaxSize(), padding(18, 17, 18, 17)]}>
          <Column>
            <Text color="#ffffffe6" maxLines={1} style={{ fontSize: 12 }}>{n.label.toUpperCase()}</Text>
            <Text color="#ffffff" maxLines={2} modifiers={[padding(0, 3, 0, 0)]} style={{ fontSize: 21, fontWeight: "bold" }}>{n.title}</Text>
          </Column>
          <Box contentAlignment="bottomStart" modifiers={[fillMaxSize()]}>
            {meter(n.fill, n.big, n.small)}
          </Box>
        </Box>
      </Box>
    </Button>
  );
}

// Mockup copy, shown until the app's first updateSnapshot. Shared by the other Android widgets.
export const SAMPLE: WidgetData = {
  weekday: "T2", date: "16/11", short: "T2 16", summary: "5 việc, 1 tiết học", count: "5 việc",
  next: { id: "s1", title: "Ôn Giải tích", type: "plan", label: "Tiếp theo", big: "10p", small: "đến 14:30", mins: "10′", at: "14:30", fill: 0.35, rect: "14:30, còn 10p", left: "còn 10p", url: "zen:///" },
  rows: [
    { id: "s2", title: "Báo cáo nhóm", type: "clay", time: "16:00", check: true, done: false, url: "zen:///" },
    { id: "s3", title: "Cơ sở dữ liệu", type: "lecture", time: "17:30", check: false, done: false, url: "zen:///" },
    { id: "s4", title: "Ăn tối với Minh", type: "busy", time: "19:00", check: false, done: false, url: "zen:///" },
  ],
  doneLabel: "Xong (2)", tomorrow: "Mai: Cấu trúc dữ liệu 07:00",
  ahead: [], more: [], aheadHead: "", aheadCount: "", doneCount: "", dayName: "T2 16",
  exam: { id: "s6", title: "Giải tích 2", big: "11 ngày", small: "T6 27/11 08:00", fill: 0.6, inline: "Thi GT2 còn 11 ngày", n: "11", unit: "ngày nữa", url: "zen:///" },
  art: "",
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenNext", ZenNext, SAMPLE);
