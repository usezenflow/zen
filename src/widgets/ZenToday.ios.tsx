import {
  Button, Circle, HStack, Image, Link, Rectangle, RoundedRectangle, Spacer, Text, UnevenRoundedRectangle, VStack, ZStack,
} from "@expo/ui/swift-ui";
import {
  aspectRatio, background, buttonStyle, clipShape, clipped, containerBackground, font, foregroundStyle, frame, kerning, lineLimit,
  monospacedDigit, offset, opacity, padding, resizable, strikethrough, strokeBorder, widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData, WRow } from "./data";

// Medium: next on the left, the rest of today on the right. Large: date, next card, the day as rows.
// Sizes are the mockup's px x1.25 (268x126 mockup = 338x158pt medium, 268x282 = 338x354pt large).
const ZenToday = (p: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const large = env.widgetFamily === "systemLarge";
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
        <ZStack modifiers={[frame({ width: 25, height: 25 }), background(grad(r.type)), clipShape("circle")]}>
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
            ticked: p.ticked.includes(r.id) ? p.ticked : [...p.ticked, r.id],
          }
        }>
        {r.done ? (
          <ZStack modifiers={[frame({ width: 25, height: 25 })]}>
            <Circle modifiers={[foregroundStyle(c.chip)]} />
            <Image systemName="checkmark" modifiers={[font({ size: 11, weight: "bold" }), foregroundStyle(c.ink)]} />
          </ZStack>
        ) : (
          <Circle
            modifiers={[
              foregroundStyle("clear"), frame({ width: 25, height: 25 }),
              strokeBorder({ content: c.line, style: { lineWidth: 1.6 }, shape: "circle" }),
            ]}
          />
        )}
      </Button>
    );
  };

  const row = (r: WRow, first: boolean) => (
    <VStack key={r.id} spacing={0} modifiers={large ? [] : [frame({ maxHeight: Infinity })]}>
      {first ? null : <Rectangle modifiers={[foregroundStyle(c.line), frame({ height: 1 })]} />}
      <HStack spacing={11} modifiers={[padding({ vertical: 9 }), frame({ maxHeight: large ? undefined : Infinity })]}>
        {box(r)}
        <Link destination={r.url}>
          <HStack spacing={8}>
            <Text
              modifiers={[
                f(16, "semibold"), foregroundStyle(r.done ? c.muted : c.ink), lineLimit(1),
                strikethrough({ isActive: r.done, pattern: "solid", color: c.muted }),
              ]}>
              {r.title}
            </Text>
            <Spacer minLength={0} />
            <Text modifiers={[f(15), foregroundStyle(c.muted), monospacedDigit()]}>{r.time}</Text>
          </HStack>
        </Link>
      </HStack>
    </VStack>
  );

  const meter = (fill: number, big: string, small: string) => (
    <HStack spacing={10}>
      <RoundedRectangle
        cornerRadius={5}
        modifiers={[
          foregroundStyle(W), frame({ width: 7, height: Math.max(0, Math.min(1, fill)) * 37 }), padding({ bottom: 4 }),
          frame({ width: 15, height: 45, alignment: "bottom" }),
          strokeBorder({ content: W, style: { lineWidth: 2 }, shape: "roundedRectangle", cornerRadius: 9 }),
        ]}
      />
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[f(25, "semibold"), foregroundStyle(W), lineLimit(1)]}>{big}</Text>
        <Text modifiers={[f(15, "medium"), foregroundStyle(W), opacity(0.9), lineLimit(1)]}>{small}</Text>
      </VStack>
    </HStack>
  );

  // Nothing left today: the ZenNext empty treatment on a chip card.
  const clear = (title: number) => (
    <VStack alignment="leading" spacing={0} modifiers={[padding({ all: 12.5 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "bottomLeading" })]}>
      {large ? null : logo(22, c.muted)}
      {large ? null : <Spacer minLength={0} />}
      <Text modifiers={[f(title, "semibold"), foregroundStyle(c.ink), kerning(-0.2)]}>{large ? "Xong hết hôm nay" : "Xong hết\nhôm nay"}</Text>
      {p.tomorrow ? <Text modifiers={[f(15), foregroundStyle(c.muted), lineLimit(2), padding({ top: 4 })]}>{p.tomorrow}</Text> : null}
    </VStack>
  );

  const n = p.next;
  const card = [clipShape("roundedRectangle", 17.5)];

  if (large) {
    return (
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[padding({ vertical: 16, horizontal: 18 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }), containerBackground(c.bg, "widget"), widgetURL(p.home)]}>
        <HStack>
          <Text modifiers={[f(15, "medium"), foregroundStyle(c.muted)]}>{p.weekday}</Text>
          <Spacer />
          <Text modifiers={[f(15, "medium"), foregroundStyle(c.muted), lineLimit(1)]}>{p.summary}</Text>
        </HStack>
        <Text modifiers={[f(25, "semibold"), foregroundStyle(c.ink), kerning(-0.5), padding({ top: 1 })]}>{p.date}</Text>
        {n ? (
          <Link destination={n.url} modifiers={[padding({ top: 12 })]}>
            <ZStack alignment="topLeading" modifiers={[frame({ maxWidth: Infinity, minHeight: 64, maxHeight: 120 }), background(grad(n.type)), ...card]}>
              {art(p.art?.[n.type]?.wide)}
              <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 12.5, horizontal: 15 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" })]}>
                <Text modifiers={[f(15, "medium"), foregroundStyle(W), opacity(0.85), lineLimit(1)]}>{`${n.label}, ${n.left}`}</Text>
                <Text modifiers={[f(19, "semibold"), foregroundStyle(W), kerning(-0.4), lineLimit(1), padding({ top: 5 })]}>{n.title}</Text>
              </VStack>
            </ZStack>
          </Link>
        ) : (
          <ZStack modifiers={[padding({ top: 12 }), frame({ maxWidth: Infinity, minHeight: 64, maxHeight: 120 })]}>
            <ZStack modifiers={[background(c.chip), ...card]}>
              {clear(19)}
            </ZStack>
          </ZStack>
        )}
        <VStack spacing={0} modifiers={[padding({ top: 7.5 })]}>
          {p.rows.slice(0, 4).map((r, i) => row(r, i === 0))}
        </VStack>
        <Spacer minLength={0} />
        {p.doneLabel ? <Text modifiers={[f(15, "medium"), foregroundStyle(c.muted)]}>{p.doneLabel}</Text> : null}
      </VStack>
    );
  }

  return (
    <HStack spacing={15} modifiers={[padding({ all: 12.5 }), frame({ maxWidth: Infinity, maxHeight: Infinity }), containerBackground(c.bg, "widget"), widgetURL(p.home)]}>
      {n ? (
        <Link destination={n.url}>
          <ZStack alignment="topLeading" modifiers={[frame({ width: 120 }), frame({ maxHeight: Infinity }), background(grad(n.type)), ...card]}>
            {art(p.art?.[n.type]?.square)}
            <VStack alignment="leading" spacing={0} modifiers={[padding({ all: 12.5 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" })]}>
              <Text modifiers={[f(15, "medium"), foregroundStyle(W), opacity(0.85)]}>{n.at}</Text>
              <Text modifiers={[f(16, "semibold"), foregroundStyle(W), kerning(-0.3), lineLimit(2), padding({ top: 5 })]}>{n.title}</Text>
              <Spacer minLength={0} />
              {meter(n.fill, n.mins, "còn lại")}
            </VStack>
          </ZStack>
        </Link>
      ) : (
        <ZStack modifiers={[frame({ width: 120 }), frame({ maxHeight: Infinity }), background(c.chip), ...card]}>
          {clear(16)}
        </ZStack>
      )}
      <VStack alignment="leading" spacing={0} modifiers={[padding({ top: 4 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" })]}>
        <HStack modifiers={[padding({ bottom: 2 })]}>
          <Text modifiers={[f(15, "medium"), foregroundStyle(c.muted)]}>Hôm nay</Text>
          <Spacer />
          <Text modifiers={[f(15, "medium"), foregroundStyle(c.muted)]}>{p.count}</Text>
        </HStack>
        {p.rows.length ? (
          p.rows.slice(0, 3).map((r, i) => row(r, i === 0))
        ) : (
          <Text modifiers={[f(15), foregroundStyle(c.muted), lineLimit(2), padding({ top: 9 })]}>{p.tomorrow}</Text>
        )}
        {p.rows.length > 0 && p.rows.length < 3 ? <Spacer minLength={0} /> : null}
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
  art: { plan: none, lecture: none, exam: none, assignment: none, busy: none },
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenToday", ZenToday, SAMPLE);
