import { Circle, HStack, Image, RoundedRectangle, Spacer, Text, UnevenRoundedRectangle, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  aspectRatio, clipped, containerBackground, font, foregroundStyle, frame, kerning, lineLimit, offset, opacity, padding,
  resizable, strokeBorder, widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData } from "./data";

// Small: exam countdown on exam sand, days left in the battery meter (mockups/widgets.html `exam`).
// Same frame as ZenNext; sizes are the mockup's px x1.25.
const ZenExam = (p: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const dark = env.colorScheme === "dark";
  const full = (env.widgetRenderingMode ?? "fullColor") === "fullColor";
  const c = dark
    ? { bg: "#121314", ink: "#ecebe6", muted: "#7f817e" }
    : { bg: "#fbfaf7", ink: "#16181b", muted: "#8d8f8c" };
  const FACE = { regular: "BeVietnamPro-Regular", medium: "BeVietnamPro-Medium", semibold: "BeVietnamPro-SemiBold" } as const;
  const f = (size: number, weight: keyof typeof FACE = "regular") => font({ family: FACE[weight], size, weight });
  const fill = { maxWidth: Infinity, maxHeight: Infinity } as const;

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

  const n = p.exam;
  if (!n) {
    return (
      <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 16, horizontal: 18 }), frame({ ...fill, alignment: "topLeading" }), containerBackground(c.bg, "widget"), widgetURL(p.home)]}>
        <HStack>
          {logo(22, c.muted)}
          <Spacer />
          <Text modifiers={[f(15, "medium"), foregroundStyle(c.muted)]}>{p.short}</Text>
        </HStack>
        <Spacer />
        <Text modifiers={[f(20, "semibold"), foregroundStyle(c.ink), kerning(-0.2)]}>{"Không có kỳ thi sắp tới"}</Text>
      </VStack>
    );
  }

  const pal = ["#7a1d10", "#d9432b", "#ffb39f"];
  const art = p.art?.exam?.square;
  const h = Math.max(0, Math.min(1, n.fill)) * 37;
  return (
    <ZStack
      alignment="topLeading"
      modifiers={[
        containerBackground({ type: "linearGradient", colors: pal, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }, "widget"),
        widgetURL(n.url),
      ]}>
      {full && art ? <Image uiImage={art} modifiers={[resizable(), aspectRatio({ contentMode: "fill" }), frame(fill), clipped()]} /> : null}
      <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 16, horizontal: 18 }), frame({ ...fill, alignment: "topLeading" })]}>
        <Text modifiers={[f(15, "medium"), foregroundStyle("#ffffff"), opacity(0.85)]}>{"Sắp thi"}</Text>
        <Text modifiers={[f(20, "semibold"), foregroundStyle("#ffffff"), kerning(-0.4), lineLimit(2), padding({ top: 5 })]}>{n.title}</Text>
        <Spacer minLength={0} />
        <HStack spacing={10}>
          <RoundedRectangle
            cornerRadius={5}
            modifiers={[
              foregroundStyle("#ffffff"), frame({ width: 7, height: h }), padding({ bottom: 4 }),
              frame({ width: 15, height: 45, alignment: "bottom" }),
              strokeBorder({ content: "#ffffff", style: { lineWidth: 2 }, shape: "roundedRectangle", cornerRadius: 9 }),
            ]}
          />
          <VStack alignment="leading" spacing={1}>
            <Text modifiers={[f(25, "semibold"), foregroundStyle("#ffffff"), lineLimit(1)]}>{n.big}</Text>
            <Text modifiers={[f(15, "medium"), foregroundStyle("#ffffff"), opacity(0.9), lineLimit(1)]}>{n.small}</Text>
          </VStack>
        </HStack>
      </VStack>
    </ZStack>
  );
};

const SAMPLE: WidgetData = {
  weekday: "Thứ hai", date: "16 tháng 11", short: "T2 16", summary: "5 việc, 1 tiết học", count: "5 việc",
  exam: {
    id: "e1", title: "Giải tích 2", big: "11 ngày", small: "T6 27/11 08:00", fill: 0.6, inline: "Thi Giải tích 2 còn 11 ngày",
    url: "zen:///task/e1",
  },
  rows: [], doneLabel: "Xong (2)", tomorrow: "Mai: Cấu trúc dữ liệu 07:00",
  art: {
    plan: { square: "", wide: "" }, lecture: { square: "", wide: "" }, exam: { square: "", wide: "" },
    assignment: { square: "", wide: "" }, busy: { square: "", wide: "" },
  },
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenExam", ZenExam, SAMPLE);
