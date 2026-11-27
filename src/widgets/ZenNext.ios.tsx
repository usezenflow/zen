import { HStack, Image, RoundedRectangle, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  aspectRatio, clipped, containerBackground, font, foregroundStyle, frame, kerning, lineHeight, lineLimit, opacity, padding,
  resizable, strokeBorder, widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData } from "./data";

// Small: the next thing on its line-field art, time left in the battery meter (mockups/widgets.html `next()` and `clear`).
const ZenNext = (p0: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const p = p0 ?? ({ short: "", home: "zen:///", tomorrow: "" } as WidgetData);
  const dark = env.colorScheme === "dark";
  const full = (env.widgetRenderingMode ?? "fullColor") === "fullColor";
  const c = dark
    ? { bg: "#0d0d0f", ink: "#f2f3f5", muted: "#8a8d94" }
    : { bg: "#ffffff", ink: "#0d0d0f", muted: "#737a87" };
  const PAL: Record<string, string[]> = {
    plan: ["#0a5f7a", "#2433f2", "#0b2f8f"], lecture: ["#0b5443", "#0f8f6a", "#173f6e"], exam: ["#9e2a0c", "#ff4f2a", "#6a1838"],
    assignment: ["#5c1450", "#c21f86", "#2e2478"], night: ["#1e2a8a", "#7a4dff", "#1c58b8"], clay: ["#6e2a16", "#cf4a2c", "#1f3c80"],
    busy: ["#434952", "#6b727d", "#2f343b"],
  };
  const FACE = {
    regular: "BeVietnamPro-Regular", medium: "BeVietnamPro-Medium",
    d700: "BricolageGrotesque-Bold", d800: "BricolageGrotesque-ExtraBold",
  } as const;
  const f = (size: number, face: keyof typeof FACE = "regular") => font({ family: FACE[face], size });
  const fill = { minWidth: 0, maxWidth: Infinity, minHeight: 0, maxHeight: Infinity } as const;

  const n = p.next;
  if (!n) {
    return (
      <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 16, horizontal: 17 }), frame({ ...fill, alignment: "topLeading" }), containerBackground(c.bg, "widget"), widgetURL(p.home || "zen:///")]}>
        <HStack>
          <Image assetName="zen_logo" modifiers={[resizable(), aspectRatio({ contentMode: "fit" }), frame({ width: 22.5, height: 22.5 })]} />
          <Spacer />
          <Text modifiers={[f(13.5, "medium"), foregroundStyle(c.muted)]}>{p.short ?? ""}</Text>
        </HStack>
        <Spacer />
        <Text modifiers={[f(20.5, "d700"), kerning(-0.5), foregroundStyle(c.ink), lineHeight(24.5)]}>{"Xong hết\nhôm nay"}</Text>
        {p.tomorrow ? (
          <Text modifiers={[f(14), foregroundStyle(c.muted), lineLimit(2), padding({ top: 3.75 })]}>{p.tomorrow}</Text>
        ) : null}
      </VStack>
    );
  }

  const type = PAL[n.type] ? n.type : "plan";
  const h = Math.max(0, Math.min(1, n.fill)) * 41.25;
  return (
    <ZStack
      alignment="topLeading"
      modifiers={[
        containerBackground({ type: "linearGradient", colors: PAL[type], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }, "widget"),
        widgetURL(n.url),
      ]}>
      {full ? <Image assetName={`zen_art_${type}`} modifiers={[resizable(), aspectRatio({ contentMode: "fill" }), frame(fill), clipped()]} /> : null}
      <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 16, horizontal: 17 }), frame({ ...fill, alignment: "topLeading" })]}>
        <Text modifiers={[f(11.5, "medium"), kerning(0.9), foregroundStyle("#ffffff"), opacity(0.9)]}>{n.label.toUpperCase()}</Text>
        <Text modifiers={[f(20.5, "d800"), foregroundStyle("#ffffff"), kerning(-0.6), lineHeight(24.2), lineLimit(2), padding({ top: 5 })]}>{n.title}</Text>
        <Spacer minLength={0} />
        <HStack spacing={10}>
          <RoundedRectangle
            cornerRadius={6.25}
            modifiers={[
              foregroundStyle("#ffffff"), frame({ width: 7.5, height: h }), padding({ bottom: 3.75 }),
              frame({ width: 15, height: 45, alignment: "bottom" }),
              strokeBorder({ content: "#ffffffe6", style: { lineWidth: 1.875 }, shape: "roundedRectangle", cornerRadius: 8.75 }),
            ]}
          />
          <VStack alignment="leading" spacing={1.5}>
            <Text modifiers={[f(25, "d700"), kerning(-0.6), foregroundStyle("#ffffff"), lineHeight(26), lineLimit(1)]}>{n.big}</Text>
            <Text modifiers={[f(14, "medium"), foregroundStyle("#ffffff"), opacity(0.92), lineLimit(1)]}>{n.small}</Text>
          </VStack>
        </HStack>
      </VStack>
    </ZStack>
  );
};

const SAMPLE: WidgetData = {
  weekday: "T2", date: "16/11", short: "T2 16", summary: "5 việc, 1 tiết học", count: "5 việc",
  next: {
    id: "s1", title: "Ôn Giải tích", type: "plan", label: "Tiếp theo", big: "10p", small: "đến 14:30", mins: "10′", at: "14:30",
    fill: 0.35, rect: "14:30, còn 10p", left: "còn 10p", url: "zen:///task/s1",
  },
  rows: [], doneLabel: "Xong (2)", tomorrow: "Mai: Cấu trúc dữ liệu 07:00",
  ahead: [], more: [], aheadHead: "", aheadCount: "", doneCount: "", dayName: "T2 16",
  art: "",
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenNext", ZenNext, SAMPLE);
