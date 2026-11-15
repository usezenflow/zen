import { Box, Button, Column, Image, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, padding, size, width } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData } from "./data";

// Small: the next thing on its sand with the time left in a battery meter (mockups/widgets.html).
// Sizes are mockup px x 1.31 (300px mockup phone vs 393dp). The widget runtime sees nothing at module scope,
// so tokens and helpers live inside the function.
// shortcut: Glance (expo-widgets 58) renders 500/600 as Normal and has no line-height, letter-spacing or custom font, so 600 is drawn Bold in the system font; upgrade when expo-widgets maps Medium/SemiBold.
function ZenNext(p0: WidgetData, env: WidgetEnvironment) {
  "widget";
  // The timeline entry due now (data.ts tl); ticks and art stay on the stored top level.
  const now = Date.now(), due = (p0.tl ?? []).reduce<NonNullable<WidgetData["tl"]>[number] | undefined>((a, x) => (x.at <= now ? x : a), undefined);
  const p: WidgetData = due ? { ...p0, ...due.p } : p0;
  const c = env.colorScheme === "dark"
    ? { bg: "#121314", ink: "#ecebe6", muted: "#7f817e" }
    : { bg: "#fbfaf7", ink: "#16181b", muted: "#8d8f8c" };
  const mid = { plan: "#4f68e8", lecture: "#2f8a78", exam: "#d9432b", assignment: "#8a5cc4", busy: "#bdbcb6" };
  // Expo UI has no click modifier on Android: a Button with an explicit target is the only tappable node.
  const tap = (target: string) => ({ target }) as object;
  // Tea-leaf mark: a circle with two opposite corners squared off, vermilion sun bottom-right.
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
  // Battery meter: a translucent track with the white fill rising from the bottom (Glance has no borders).
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

  const n = p.next;
  if (!n) {
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
            <Column>
              <Text color={c.ink} maxLines={2} style={{ fontSize: 21, fontWeight: "bold" }}>{"Xong hết\nhôm nay"}</Text>
              {p.tomorrow ? <Text color={c.muted} maxLines={2} modifiers={[padding(0, 3.9, 0, 0)]} style={{ fontSize: 15 }}>{p.tomorrow}</Text> : null}
            </Column>
          </Box>
        </Box>
      </Button>
    );
  }
  const art = p.art[n.type]?.square;
  return (
    <Button {...tap(n.url)} modifiers={[fillMaxSize()]}>
      <Box modifiers={[fillMaxSize(), cornerRadius(28), background(mid[n.type] ?? mid.plan)]}>
        {art ? <Image source={{ uri: art }} contentScale="crop" contentDescription={null} modifiers={[fillMaxSize()]} /> : null}
        <Box modifiers={[fillMaxSize(), padding(18, 17, 18, 17)]}>
          <Column>
            <Text color="#ffffffd9" maxLines={1} style={{ fontSize: 14.4 }}>{n.label}</Text>
            <Text color="#ffffff" maxLines={2} style={{ fontSize: 21, fontWeight: "bold" }}>{n.title}</Text>
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
  weekday: "Thứ hai", date: "16 tháng 11", short: "T2 16", summary: "5 việc, 1 tiết học", count: "5 việc",
  next: { id: "s1", title: "Ôn Giải tích", type: "plan", label: "Tiếp theo", big: "10 phút", small: "đến 14:30", mins: "10′", at: "14:30", fill: 0.35, rect: "14:30, còn 10 phút", left: "còn 10 phút", url: "zen:///" },
  rows: [
    { id: "s2", title: "Báo cáo nhóm", type: "assignment", time: "16:00", check: true, done: false, url: "zen:///" },
    { id: "s3", title: "Cơ sở dữ liệu", type: "lecture", time: "17:30", check: false, done: false, url: "zen:///" },
    { id: "s4", title: "Ăn tối với Minh", type: "busy", time: "19:00", check: false, done: false, url: "zen:///" },
    { id: "s5", title: "Đọc sách", type: "plan", time: "20:00", check: true, done: false, url: "zen:///" },
  ],
  doneLabel: "Xong (2)", tomorrow: "Mai: Cấu trúc dữ liệu 07:00",
  ahead: [], aheadHead: "", aheadCount: "", doneCount: "", dayName: "Thứ hai 16",
  exam: { id: "s6", title: "Giải tích 2", big: "11 ngày", small: "T6 27/11 08:00", fill: 0.6, inline: "Thi GT2 còn 11 ngày", n: "11", unit: "ngày nữa", url: "zen:///" },
  // Empty art falls back to the type's flat colour until the app has copied the PNGs.
  art: { plan: { square: "", wide: "" }, lecture: { square: "", wide: "" }, exam: { square: "", wide: "" }, assignment: { square: "", wide: "" }, busy: { square: "", wide: "" } },
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenNext", ZenNext, SAMPLE);
