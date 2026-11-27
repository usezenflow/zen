import { AccessoryWidgetBackground, Gauge, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  clipShape, containerBackground, font, foregroundStyle, frame, gaugeStyle, kerning, lineHeight, lineLimit, opacity, padding, widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData } from "./data";

// Lock screen: monochrome, drawn by the system (vibrant). Inline: nearest exam. Circle: minutes to next. Rectangle: next.
// shortcut: no koi mark before the inline line (an inline accessory draws only Text and an SF Symbol), upgrade with a template symbol image if needed.
// shortcut: no bottom-right "tap to talk" lock control, expo-widgets 58 has no ControlWidget; upgrade when it ships one (or add a native target via a config plugin).
const ZenLock = (p0: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const p = p0 ?? ({ short: "", home: "zen:///", tomorrow: "" } as WidgetData);
  const FACE = {
    regular: "BeVietnamPro-Regular", medium: "BeVietnamPro-Medium", semibold: "BeVietnamPro-SemiBold",
    d700: "BricolageGrotesque-Bold",
  } as const;
  const f = (size: number, face: keyof typeof FACE) => font({ family: FACE[face], size });
  const n = p.next;
  const base = [containerBackground("clear", "widget"), widgetURL(n?.url ?? (p.home || "zen:///"))];

  if (env.widgetFamily === "accessoryInline") {
    const tail = p.exam?.inline ?? n?.title;
    return <Text modifiers={base}>{tail ? `${p.short ?? ""} · ${tail}` : p.short ?? ""}</Text>;
  }

  if (env.widgetFamily === "accessoryCircular") {
    return (
      <ZStack modifiers={base}>
        <AccessoryWidgetBackground />
        {n ? (
          <Gauge
            value={Math.max(0, Math.min(1, n.fill))}
            modifiers={[gaugeStyle("circularCapacity"), foregroundStyle("#ffffff")]}
            currentValueLabel={
              <VStack spacing={-2}>
                <Text modifiers={[f(18.5, "d700"), kerning(-0.4)]}>{n.mins}</Text>
                <Text modifiers={[f(11, "medium"), opacity(0.8)]}>{n.at}</Text>
              </VStack>
            }
          />
        ) : (
          <Text modifiers={[f(17.5, "d700"), kerning(-0.4), lineLimit(1)]}>{p.short ?? ""}</Text>
        )}
      </ZStack>
    );
  }

  return (
    <ZStack alignment="leading" modifiers={base}>
      <AccessoryWidgetBackground modifiers={[clipShape("roundedRectangle", 17.5)]} />
      <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 10, horizontal: 13.75 }), frame({ maxWidth: Infinity, alignment: "leading" })]}>
        <Text modifiers={[f(16.5, "d700"), kerning(-0.35), lineHeight(21.5), lineLimit(1)]}>{n ? n.title : "Xong hết hôm nay"}</Text>
        <Text modifiers={[f(14.5, "regular"), opacity(0.82), lineHeight(19.5), lineLimit(2)]}>{n ? n.rect : p.tomorrow || p.short || ""}</Text>
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
  rows: [], doneLabel: "", tomorrow: "Mai: Cấu trúc dữ liệu 07:00",
  ahead: [], more: [], aheadHead: "", aheadCount: "", doneCount: "", dayName: "T2 16",
  exam: {
    id: "e1", title: "Giải tích 2", big: "11 ngày", small: "T6 27/11 08:00", fill: 0.6, inline: "Thi GT2 còn 11 ngày", n: "11", unit: "ngày nữa",
    url: "zen:///task/e1",
  },
  art: "",
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenLock", ZenLock, SAMPLE);
