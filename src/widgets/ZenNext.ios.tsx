import { Circle, HStack, Image, RoundedRectangle, Spacer, Text, UnevenRoundedRectangle, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  aspectRatio, clipped, containerBackground, font, foregroundStyle, frame, kerning, lineLimit, lineHeight, offset, opacity, padding,
  resizable, strokeBorder, widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData } from "./data";

// Small: the next thing on its sand, time left in the battery meter (mockups/widgets.html `next()` and `clear`).
// Sizes are the mockup's px x1.25 (126px mockup widget = 158pt system small).
const ZenNext = (p: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const dark = env.colorScheme === "dark";
  const full = (env.widgetRenderingMode ?? "fullColor") === "fullColor";
  const c = dark
    ? { bg: "#121314", ink: "#ecebe6", muted: "#7f817e" }
    : { bg: "#fbfaf7", ink: "#16181b", muted: "#8d8f8c" };
  const PAL: Record<string, string[]> = {
    plan: ["#1f2b6e", "#4f68e8", "#a9b9ff"], lecture: ["#123f3a", "#2f8a78", "#a8dccb"], exam: ["#7a1d10", "#d9432b", "#ffb39f"],
    assignment: ["#3a2056", "#8a5cc4", "#dccaf5"], busy: ["#8d8f8c", "#bdbcb6", "#e6e4de"],
  };
  const FACE = { regular: "BeVietnamPro-Regular", medium: "BeVietnamPro-Medium", semibold: "BeVietnamPro-SemiBold" } as const;
  // lineHeight() is the mockup CSS line-height; SwiftUI applies it on iOS 26+ and keeps the font default before.
  const f = (size: number, weight: keyof typeof FACE = "regular") => font({ family: FACE[weight], size, weight });
  const fill = { minWidth: 0, maxWidth: Infinity, minHeight: 0, maxHeight: Infinity } as const;

  // Tea-leaf mark: square with two opposite corners rounded, vermilion sun in the open corner (LOGO in ui.js).
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

  const n = p.next;
  if (!n) {
    return (
      <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 16.25, horizontal: 17.5 }), frame({ ...fill, alignment: "topLeading" }), containerBackground(c.bg, "widget"), widgetURL(p.home)]}>
        <HStack>
          {logo(22.5, c.muted)}
          <Spacer />
          <Text modifiers={[f(13.75, "medium"), foregroundStyle(c.muted)]}>{p.short}</Text>
        </HStack>
        <Spacer />
        <Text modifiers={[f(20, "semibold"), foregroundStyle(c.ink), lineHeight(25)]}>{"Xong hết\nhôm nay"}</Text>
        {p.tomorrow ? (
          <Text modifiers={[f(14.375), foregroundStyle(c.muted), lineLimit(2), padding({ top: 3.75 })]}>{p.tomorrow}</Text>
        ) : null}
      </VStack>
    );
  }

  const pal = PAL[n.type] ?? PAL.plan;
  const art = p.art?.[n.type]?.square;
  const h = Math.max(0, Math.min(1, n.fill)) * 41.25;
  return (
    <ZStack
      alignment="topLeading"
      modifiers={[
        containerBackground({ type: "linearGradient", colors: pal, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }, "widget"),
        widgetURL(n.url),
      ]}>
      {full && art ? <Image uiImage={art} modifiers={[resizable(), aspectRatio({ contentMode: "fill" }), frame(fill), clipped()]} /> : null}
      <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 16.25, horizontal: 17.5 }), frame({ ...fill, alignment: "topLeading" })]}>
        <Text modifiers={[f(13.75, "medium"), foregroundStyle("#ffffff"), opacity(0.85)]}>{n.label}</Text>
        <Text modifiers={[f(20, "semibold"), foregroundStyle("#ffffff"), kerning(-0.4), lineHeight(24), lineLimit(2), padding({ top: 5 })]}>{n.title}</Text>
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
          <VStack alignment="leading" spacing={1.25}>
            <Text modifiers={[f(25, "semibold"), foregroundStyle("#ffffff"), lineHeight(25), lineLimit(1)]}>{n.big}</Text>
            <Text modifiers={[f(14.375, "medium"), foregroundStyle("#ffffff"), opacity(0.9), lineLimit(1)]}>{n.small}</Text>
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
  art: {
    plan: { square: "", wide: "" }, lecture: { square: "", wide: "" }, exam: { square: "", wide: "" },
    assignment: { square: "", wide: "" }, busy: { square: "", wide: "" },
  },
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenNext", ZenNext, SAMPLE);
