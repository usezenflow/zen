import { AccessoryWidgetBackground, Gauge, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  clipShape, containerBackground, font, foregroundStyle, frame, gaugeStyle, lineLimit, opacity, padding, widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData } from "./data";

// Lock screen: monochrome, drawn by the system (vibrant). Inline: nearest exam. Circle: minutes to next. Rectangle: next.
const ZenLock = (p: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const FACE = { medium: "BeVietnamPro-Medium", semibold: "BeVietnamPro-SemiBold", bold: "BeVietnamPro-Bold" } as const;
  const f = (size: number, weight: keyof typeof FACE) => font({ family: FACE[weight], size, weight });
  const n = p.next;
  const base = [containerBackground("clear", "widget"), widgetURL(n?.url ?? p.home)];

  if (env.widgetFamily === "accessoryInline") {
    const tail = p.exam?.inline ?? n?.title;
    return <Text modifiers={base}>{tail ? `${p.short} · ${tail}` : p.short}</Text>;
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
              <VStack spacing={-1}>
                <Text modifiers={[f(19, "bold")]}>{n.mins}</Text>
                <Text modifiers={[f(12, "semibold"), opacity(0.8)]}>{n.at}</Text>
              </VStack>
            }
          />
        ) : (
          <Text modifiers={[f(15, "bold"), lineLimit(1)]}>{p.short}</Text>
        )}
      </ZStack>
    );
  }

  return (
    <ZStack alignment="leading" modifiers={base}>
      <AccessoryWidgetBackground modifiers={[clipShape("roundedRectangle", 17.5)]} />
      <VStack alignment="leading" spacing={1} modifiers={[padding({ vertical: 8, horizontal: 13 }), frame({ maxWidth: Infinity, alignment: "leading" })]}>
        <Text modifiers={[f(16.5, "bold"), lineLimit(1)]}>{n ? n.title : "Xong hết hôm nay"}</Text>
        <Text modifiers={[f(15, "medium"), opacity(0.8), lineLimit(2)]}>{n ? n.rect : p.tomorrow || p.short}</Text>
      </VStack>
    </ZStack>
  );
};

const none = { square: "", wide: "" };
const SAMPLE: WidgetData = {
  weekday: "Thứ hai", date: "16 tháng 11", short: "T2 16", summary: "5 việc, 1 tiết học", count: "5 việc",
  next: {
    id: "s1", title: "Ôn Giải tích", type: "plan", label: "Tiếp theo", big: "10 phút", small: "đến 14:30", mins: "10′", at: "14:30",
    fill: 0.35, rect: "14:30, còn 10 phút", left: "còn 10 phút", url: "zen:///task/s1",
  },
  rows: [], doneLabel: "", tomorrow: "Mai: Cấu trúc dữ liệu 07:00",
  exam: {
    id: "e1", title: "Giải tích 2", big: "11 ngày", small: "T6 27/11 08:00", fill: 0.6, inline: "Thi Giải tích 2 còn 11 ngày",
    url: "zen:///task/e1",
  },
  art: { plan: none, lecture: none, exam: none, assignment: none, busy: none },
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenLock", ZenLock, SAMPLE);
