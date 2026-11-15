import { Circle, HStack, Image, Spacer, Text, UnevenRoundedRectangle, VStack, ZStack } from "@expo/ui/swift-ui";
import { containerBackground, font, foregroundStyle, frame, offset, padding, widgetURL } from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData } from "./data";

// Small: talk. A widget cannot hold the mic, so it opens the app already listening (mockups/widgets.html `talk`).
const ZenTalk = (p: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const dark = env.colorScheme === "dark";
  const c = dark
    ? { bg: "#121314", ink: "#ecebe6", muted: "#7f817e", chip: "#1c1d1f" }
    : { bg: "#fbfaf7", ink: "#16181b", muted: "#8d8f8c", chip: "#f0eee9" };

  const logo = (s: number, ink: string) => (
    <ZStack alignment="topLeading" modifiers={[frame({ width: s, height: s, alignment: "topLeading" })]}>
      <UnevenRoundedRectangle
        topLeadingRadius={0.38 * s}
        bottomTrailingRadius={0.38 * s}
        modifiers={[foregroundStyle(ink), frame({ width: 0.62 * s, height: 0.76 * s }), offset({ x: 0.12 * s, y: 0.12 * s })]}
      />
      <Circle modifiers={[foregroundStyle("#d9432b"), frame({ width: 0.26 * s, height: 0.26 * s }), offset({ x: 0.71 * s, y: 0.71 * s })]} />
    </ZStack>
  );

  return (
    <VStack
      spacing={0}
      modifiers={[
        padding({ vertical: 16.25, horizontal: 17.5 }), frame({ maxWidth: Infinity, maxHeight: Infinity }),
        containerBackground(c.bg, "widget"), widgetURL(p.listen),
      ]}>
      <HStack>
        {logo(22.5, c.ink)}
        <Spacer />
        <Text modifiers={[font({ family: "BeVietnamPro-Medium", size: 13.75, weight: "medium" }), foregroundStyle(c.muted)]}>zen</Text>
      </HStack>
      <Spacer minLength={0} />
      {/* 58px ink disc with a 6px chip ring, x1.25 */}
      <ZStack>
        <Circle modifiers={[foregroundStyle(c.chip), frame({ width: 87.5, height: 87.5 })]} />
        <Circle modifiers={[foregroundStyle(c.ink), frame({ width: 72.5, height: 72.5 })]} />
        <Image systemName="mic" modifiers={[font({ size: 30, weight: "regular" }), foregroundStyle(c.bg)]} />
      </ZStack>
    </VStack>
  );
};

export const SAMPLE: WidgetData = {
  weekday: "T2", date: "16/11", short: "T2 16", summary: "5 việc, 1 tiết học", count: "5 việc",
  rows: [], doneLabel: "", tomorrow: "",
  ahead: [], more: [], aheadHead: "", aheadCount: "", doneCount: "", dayName: "T2 16",
  art: {
    plan: { square: "", wide: "" }, lecture: { square: "", wide: "" }, exam: { square: "", wide: "" },
    assignment: { square: "", wide: "" }, busy: { square: "", wide: "" },
  },
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenTalk", ZenTalk, SAMPLE);
