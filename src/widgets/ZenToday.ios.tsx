import {
  Button, Circle, HStack, Image, Link, Rectangle, RoundedRectangle, Spacer, Text, UnevenRoundedRectangle, VStack, ZStack,
} from "@expo/ui/swift-ui";
import {
  aspectRatio, background, buttonStyle, clipShape, clipped, containerBackground, font, foregroundStyle, frame, fixedSize, kerning, layoutPriority, lineLimit,
  lineHeight, monospacedDigit, offset, opacity, padding, resizable, strikethrough, strokeBorder, truncationMode, widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData, WRow } from "./data";

// Medium: next on the left, the rest of today on the right.
// Sizes are the mockup's px x1.25 (268x126 mockup = 338x158pt).
const ZenToday = (p: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const dark = env.colorScheme === "dark";
  const full = (env.widgetRenderingMode ?? "fullColor") === "fullColor";
  const c = dark
    ? { bg: "#121314", ink: "#ecebe6", muted: "#7f817e", line: "#26282a", chip: "#1c1d1f" }
    : { bg: "#fbfaf7", ink: "#16181b", muted: "#8d8f8c", line: "#e6e4de", chip: "#f0eee9" };
  const PAL: Record<string, string[]> = {
    plan: ["#1f2b6e", "#4f68e8", "#a9b9ff"], lecture: ["#123f3a", "#2f8a78", "#a8dccb"], exam: ["#7a1d10", "#d9432b", "#ffb39f"],
    assignment: ["#3a2056", "#8a5cc4", "#dccaf5"], busy: ["#8d8f8c", "#bdbcb6", "#e6e4de"],
  };
  const FACE = { regular: "BeVietnamPro-Regular", medium: "BeVietnamPro-Medium", semibold: "BeVietnamPro-SemiBold" } as const;
  // lineHeight() is the mockup CSS line-height; SwiftUI applies it on iOS 26+ and keeps the font default before.
  const f = (size: number, weight: keyof typeof FACE = "regular") => font({ family: FACE[weight], size, weight });
  const W = "#ffffff";
  const grad = (type: string) => ({
    type: "linearGradient" as const, colors: PAL[type] ?? PAL.plan, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 },
  });
  // Full-bleed sand: aspect fill, clipped by the card that holds it.
  const art = (uri?: string) =>
    full && uri ? (
      <Image uiImage={uri} modifiers={[resizable(), aspectRatio({ contentMode: "fill" }), frame({ maxWidth: Infinity, maxHeight: Infinity }), clipped()]} />
    ) : (
      <Rectangle modifiers={[foregroundStyle("clear")]} />
    );

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

  // Hairline circle that ticks in place (plan/assignment), or a round art swatch for the rest.
  const box = (r: WRow) => {
    if (!r.check) {
      return (
        <ZStack modifiers={[frame({ width: 22.5, height: 22.5 }), background(grad(r.type)), clipShape("circle")]}>
          {art(p.art?.[r.type]?.square)}
        </ZStack>
      );
    }
    return (
      <Button
        target={`done:${r.id}`}
        modifiers={[buttonStyle("plain")]}
        onPress={() =>
          r.done ? undefined : {
            rows: p.rows.map((x) => (x.id === r.id ? { ...x, done: true } : x)),
            ahead: p.ahead.map((x) => (x.id === r.id ? { ...x, done: true } : x)),
            ticked: p.ticked.includes(r.id) ? p.ticked : [...p.ticked, r.id],
          }
        }>
        {r.done ? (
          <ZStack modifiers={[frame({ width: 22.5, height: 22.5 })]}>
            <Circle modifiers={[foregroundStyle(c.chip)]} />
            <Image systemName="checkmark" modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(c.ink)]} />
          </ZStack>
        ) : (
          <Circle
            modifiers={[
              foregroundStyle("clear"), frame({ width: 22.5, height: 22.5 }),
              // muted, not line: a line-coloured ring vanishes on the dark paper
              strokeBorder({ content: c.muted, style: { lineWidth: 1.625 }, shape: "circle" }),
            ]}
          />
        )}
      </Button>
    );
  };

  const row = (r: WRow, first: boolean) => (
    <VStack key={r.id} spacing={0}>
      {first ? null : <Rectangle modifiers={[foregroundStyle(c.line), frame({ height: 1.25 })]} />}
      <HStack spacing={10} modifiers={[padding({ vertical: 7.5 })]}>
        {box(r)}
        <Link destination={r.url}>
          <HStack spacing={8}>
            <Text
              modifiers={[
                f(15, "semibold"), foregroundStyle(r.done ? c.muted : c.ink), lineLimit(1),
                strikethrough({ isActive: r.done, pattern: "solid", color: c.muted }),
              ]}>
              {r.title}
            </Text>
            <Spacer minLength={0} />
            <Text modifiers={[f(13.75, "semibold"), foregroundStyle(c.muted), monospacedDigit()]}>{r.time}</Text>
          </HStack>
        </Link>
      </HStack>
    </VStack>
  );

  const meter = (fill: number, big: string, small: string) => (
    <HStack spacing={10}>
      <RoundedRectangle
        cornerRadius={6.25}
        modifiers={[
          foregroundStyle(W), frame({ width: 7.5, height: Math.max(0, Math.min(1, fill)) * 41.25 }), padding({ bottom: 3.75 }),
          frame({ width: 15, height: 45, alignment: "bottom" }),
          strokeBorder({ content: "#ffffffe6", style: { lineWidth: 1.875 }, shape: "roundedRectangle", cornerRadius: 8.75 }),
        ]}
      />
      <VStack alignment="leading" spacing={1.25}>
        <Text modifiers={[f(25, "semibold"), foregroundStyle(W), lineHeight(25), lineLimit(1)]}>{big}</Text>
        <Text modifiers={[f(14.375, "medium"), foregroundStyle(W), opacity(0.9), lineLimit(1)]}>{small}</Text>
      </VStack>
    </HStack>
  );

  // Nothing left (mockups/widgets.html `inkCard`): the line in ink at the foot, a muted count under it.
  const ink = (line: string, sub: string) => (
    <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 12.5, horizontal: 15 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "bottomLeading" })]}>
      {logo(22.5, c.ink)}
      <Spacer minLength={0} />
      <Text modifiers={[f(16.25, "semibold"), foregroundStyle(c.ink), lineHeight(20.3)]}>{line}</Text>
      {sub ? <Text modifiers={[f(14.375), foregroundStyle(c.muted), lineLimit(1), padding({ top: 1.25 })]}>{sub}</Text> : null}
    </VStack>
  );
  // Sand card on the left: the next thing, or on a free day the nearest exam (`examCard`).
  const sand = (type: string, url: string, lab: string, title: string, fill: number, big: string, small: string) => (
    <Link destination={url}>
      <ZStack alignment="topLeading" modifiers={[frame({ width: 120 }), frame({ maxHeight: Infinity }), background(grad(type)), ...card]}>
        {art(p.art?.[type as keyof typeof p.art]?.square)}
        <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 12.5, horizontal: 15 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" })]}>
          <Text modifiers={[f(13.125, "medium"), foregroundStyle(W), opacity(0.85)]}>{lab}</Text>
          <Text modifiers={[f(16.25, "semibold"), foregroundStyle(W), kerning(-0.325), lineHeight(19.5), lineLimit(2), truncationMode("tail"), fixedSize({ horizontal: false, vertical: true }), layoutPriority(1), padding({ top: 5 })]}>{title}</Text>
          <Spacer minLength={0} />
          {meter(fill, big, small)}
        </VStack>
      </ZStack>
    </Link>
  );

  const n = p.next, ex = p.exam;
  const card = [clipShape("roundedRectangle", 17.5)];
  // Nothing left today: the right half turns to the next day that has anything.
  const empty = !n && !p.rows.length;
  const list = empty ? p.ahead : p.rows.slice(0, 3);
  const head = empty && p.aheadHead ? [p.aheadHead, p.aheadCount] : ["Hôm nay", p.count];

  return (
    <HStack spacing={15} modifiers={[padding({ vertical: 12.5, horizontal: 16.25 }), frame({ maxWidth: Infinity, maxHeight: Infinity }), containerBackground(c.bg, "widget"), widgetURL(p.home)]}>
      {n ? sand(n.type, n.url, n.at, n.title, n.fill, n.mins, "còn lại")
        : empty && !p.doneCount && ex ? sand("exam", ex.url, "Sắp thi", ex.title, ex.fill, ex.n, ex.unit)
        : (
          <ZStack modifiers={[frame({ width: 120 }), frame({ maxHeight: Infinity }), background(c.chip), ...card]}>
            {empty && !p.doneCount ? ink("Hôm nay\ntrống", p.dayName) : ink("Xong hết\nhôm nay", p.doneCount)}
          </ZStack>
        )}
      <VStack alignment="leading" spacing={0} modifiers={[padding({ top: 3.75 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" })]}>
        <HStack modifiers={[padding({ bottom: 2 })]}>
          <Text modifiers={[f(13.75, "medium"), foregroundStyle(c.muted)]}>{head[0]}</Text>
          <Spacer />
          <Text modifiers={[f(13.75, "medium"), foregroundStyle(c.muted), lineLimit(1)]}>{head[1]}</Text>
        </HStack>
        {list.map((r, i) => row(r, i === 0))}
        {/* shortcut: a week with nothing at all is not in the mockup; one muted line, upgrade if it shows up in use. */}
        {empty && !list.length ? <Text modifiers={[f(14.375), foregroundStyle(c.muted), padding({ top: 8.75 })]}>7 ngày tới trống</Text> : null}
        <Spacer minLength={0} />
      </VStack>
    </HStack>
  );
};

const none = { square: "", wide: "" };
const SAMPLE: WidgetData = {
  weekday: "Thứ hai", date: "16 tháng 11", short: "T2 16", summary: "5 việc, 1 tiết học", count: "5 việc",
  next: {
    id: "s1", title: "Ôn Giải tích", type: "plan", label: "Tiếp theo", big: "10 phút", small: "đến 14:30", mins: "10′", at: "14:30",
    fill: 0.35, rect: "14:30, còn 10 phút", left: "còn 10 phút", url: "zen:///task/s1",
  },
  rows: [
    { id: "s2", title: "Báo cáo nhóm", type: "assignment", time: "16:00", check: true, done: false, url: "zen:///task/s2" },
    { id: "s3", title: "Cơ sở dữ liệu", type: "lecture", time: "17:30", check: false, done: false, url: "zen:///task/s3" },
    { id: "s4", title: "Ăn tối với Minh", type: "busy", time: "19:00", check: false, done: false, url: "zen:///task/s4" },
    { id: "s5", title: "Đọc sách", type: "plan", time: "20:00", check: true, done: false, url: "zen:///task/s5" },
  ],
  doneLabel: "Xong (2)", tomorrow: "Mai: Cấu trúc dữ liệu 07:00",
  ahead: [], aheadHead: "", aheadCount: "", doneCount: "", dayName: "Thứ hai 16",
  art: { plan: none, lecture: none, exam: none, assignment: none, busy: none },
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenToday", ZenToday, SAMPLE);
