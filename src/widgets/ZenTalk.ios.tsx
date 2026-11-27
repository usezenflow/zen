import { Circle, HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import { aspectRatio, containerBackground, font, foregroundStyle, frame, kerning, padding, resizable, widgetURL } from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData } from "./data";

// Small: talk. A widget cannot hold the mic, so it opens the app already listening (mockups/widgets.html `talk`).
const ZenTalk = (p0: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const listen = p0?.listen || "zen:///?listen=1";
  const dark = env.colorScheme === "dark";
  const c = dark
    ? { bg: "#0d0d0f", ink: "#f2f3f5", muted: "#8a8d94", chip: "#1a1b1f" }
    : { bg: "#ffffff", ink: "#0d0d0f", muted: "#737a87", chip: "#f1f3f7" };

  return (
    <VStack
      spacing={0}
      modifiers={[
        padding({ vertical: 16, horizontal: 17 }), frame({ maxWidth: Infinity, maxHeight: Infinity }),
        containerBackground(c.bg, "widget"), widgetURL(listen),
      ]}>
      <HStack>
        <Image assetName="zen_logo" modifiers={[resizable(), aspectRatio({ contentMode: "fit" }), frame({ width: 22.5, height: 22.5 })]} />
        <Spacer />
        <Text modifiers={[font({ family: "BricolageGrotesque-ExtraBold", size: 15 }), kerning(-0.5), foregroundStyle(c.muted)]}>zen</Text>
      </HStack>
      <Spacer minLength={0} />
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
  art: "",
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenTalk", ZenTalk, SAMPLE);
