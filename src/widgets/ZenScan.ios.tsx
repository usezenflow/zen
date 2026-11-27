import { Circle, HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import { aspectRatio, containerBackground, font, foregroundStyle, frame, padding, resizable, widgetURL } from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData } from "./data";
import { SAMPLE } from "./ZenTalk.ios";

// Small: capture. A widget cannot take the photo, so it opens the app with the camera up (mockups/widgets.html `scan`).
const ZenScan = (_: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const dark = env.colorScheme === "dark";
  const c = dark
    ? { bg: "#0d0d0f", ink: "#f2f3f5", muted: "#8a8d94", chip: "#1a1b1f" }
    : { bg: "#ffffff", ink: "#0d0d0f", muted: "#737a87", chip: "#f1f3f7" };

  return (
    <VStack
      spacing={0}
      modifiers={[
        padding({ vertical: 16, horizontal: 17 }), frame({ maxWidth: Infinity, maxHeight: Infinity }),
        containerBackground(c.bg, "widget"), widgetURL("zen:///?scan=1"),
      ]}>
      <HStack>
        <Image assetName="zen_logo" modifiers={[resizable(), aspectRatio({ contentMode: "fit" }), frame({ width: 22.5, height: 22.5 })]} />
        <Spacer />
        <Text modifiers={[font({ family: "BeVietnamPro-Medium", size: 13.75 }), foregroundStyle(c.muted)]}>Chụp</Text>
      </HStack>
      <Spacer minLength={0} />
      <ZStack>
        <Circle modifiers={[foregroundStyle(c.chip), frame({ width: 87.5, height: 87.5 })]} />
        <Circle modifiers={[foregroundStyle(c.ink), frame({ width: 72.5, height: 72.5 })]} />
        <Image systemName="camera" modifiers={[font({ size: 30, weight: "regular" }), foregroundStyle(c.bg)]} />
      </ZStack>
    </VStack>
  );
};

export default createWidget<WidgetData>("ZenScan", ZenScan, SAMPLE);
