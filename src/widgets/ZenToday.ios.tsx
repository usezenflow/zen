import {
  Button, Circle, HStack, Image, Link, Rectangle, RoundedRectangle, Spacer, Text, VStack, ZStack,
} from "@expo/ui/swift-ui";
import {
  aspectRatio, background, buttonStyle, clipShape, clipped, containerBackground, fixedSize, font, foregroundStyle, frame, kerning,
  layoutPriority, lineHeight, lineLimit, monospacedDigit, opacity, padding, resizable, strikethrough, strokeBorder, truncationMode, widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetData, WRow } from "./data";

// Medium: next on the left line-field card, the rest of today on the right.
const ZenToday = (p0: WidgetData, env: WidgetEnvironment) => {
  "widget";
  const p = p0 ?? ({ rows: [], ahead: [], more: [], ticked: [], count: "", aheadHead: "", aheadCount: "", doneCount: "", dayName: "", home: "zen:///", listen: "zen:///?listen=1" } as unknown as WidgetData);
  const rows0 = p.rows ?? [], ahead0 = p.ahead ?? [], more0 = p.more ?? [], ticked0 = p.ticked ?? [];
  const dark = env.colorScheme === "dark";
  const full = (env.widgetRenderingMode ?? "fullColor") === "fullColor";
  const c = dark
    ? { bg: "#0d0d0f", ink: "#f2f3f5", muted: "#8a8d94", line: "#2a2c31", chip: "#1a1b1f" }
    : { bg: "#ffffff", ink: "#0d0d0f", muted: "#737a87", line: "#e1e5ec", chip: "#f1f3f7" };
  const PAL: Record<string, string[]> = {
    plan: ["#0a5f7a", "#2433f2", "#0b2f8f"], lecture: ["#0b5443", "#0f8f6a", "#173f6e"], exam: ["#9e2a0c", "#ff4f2a", "#6a1838"],
    assignment: ["#5c1450", "#c21f86", "#2e2478"], night: ["#1e2a8a", "#7a4dff", "#1c58b8"], clay: ["#6e2a16", "#cf4a2c", "#1f3c80"],
    busy: ["#8d9196", "#c4c7cc", "#eceef0"],
  };
  const CARD_PAL: Record<string, string[]> = { ...PAL, busy: ["#434952", "#6b727d", "#2f343b"] };
  const FACE = {
    regular: "BeVietnamPro-Regular", medium: "BeVietnamPro-Medium",
    d500: "BricolageGrotesque-Medium", d700: "BricolageGrotesque-Bold",
  } as const;
  const f = (size: number, face: keyof typeof FACE = "regular") => font({ family: FACE[face], size });
  const W = "#ffffff";
  const grad = (type: string, card = false) => ({
    type: "linearGradient" as const, colors: (card ? CARD_PAL[type] : PAL[type]) ?? PAL.plan, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 },
  });

  // Hairline circle that ticks in place (plan/assignment), or a smooth gradient swatch (matching art.tsx <=48px: no stripe bitmap).
  const box = (r: WRow) => {
    if (!r.check) {
      return <Circle modifiers={[foregroundStyle("clear"), frame({ width: 22.5, height: 22.5 }), background(grad(r.type)), clipShape("circle"), opacity(r.type === "busy" ? 0.65 : 1)]} />;
    }
    const isDone = r.done || ticked0.includes(r.id);
    return (
      <Button
        target={`done:${r.id}`}
        modifiers={[buttonStyle("plain")]}
        onPress={() =>
          isDone ? undefined : {
            rows: rows0.map((x) => (x.id === r.id ? { ...x, done: true } : x)),
            ahead: ahead0.map((x) => (x.id === r.id ? { ...x, done: true } : x)),
            more: more0.map((x) => (x.id === r.id ? { ...x, done: true } : x)),
            ticked: ticked0.includes(r.id) ? ticked0 : [...ticked0, r.id],
          }
        }>
        {isDone ? (
          <ZStack modifiers={[frame({ width: 22.5, height: 22.5 })]}>
            <Circle modifiers={[foregroundStyle(c.chip)]} />
            <Image systemName="checkmark" modifiers={[font({ size: 12, weight: "bold" }), foregroundStyle(c.ink)]} />
          </ZStack>
        ) : (
          <Circle
            modifiers={[
              foregroundStyle("clear"), frame({ width: 22.5, height: 22.5 }),
              strokeBorder({ content: c.muted, style: { lineWidth: 1.5 }, shape: "circle" }),
            ]}
          />
        )}
      </Button>
    );
  };

  const row = (r: WRow, first: boolean) => {
    const isDone = r.done || ticked0.includes(r.id);
    return (
      <VStack key={r.id} spacing={0}>
        {first ? null : <Rectangle modifiers={[foregroundStyle(c.line), frame({ height: 1 })]} />}
        <HStack spacing={10} modifiers={[padding({ vertical: 7.5 })]}>
          {box(r)}
          <Link destination={r.url}>
            <HStack spacing={8}>
              <Text
                modifiers={[
                  f(15, "medium"), foregroundStyle(isDone ? c.muted : c.ink), lineLimit(1),
                  strikethrough({ isActive: isDone, pattern: "solid", color: c.muted }),
                ]}>
                {r.title}
              </Text>
              <Spacer minLength={0} />
              <Text modifiers={[f(13.75, "d500"), foregroundStyle(c.muted), monospacedDigit()]}>{r.time}</Text>
            </HStack>
          </Link>
        </HStack>
      </VStack>
    );
  };

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
      <VStack alignment="leading" spacing={1.5}>
        <Text modifiers={[f(24, "d700"), kerning(-0.55), foregroundStyle(W), lineHeight(25), lineLimit(1)]}>{big}</Text>
        <Text modifiers={[f(13.75, "medium"), foregroundStyle(W), opacity(0.92), lineLimit(1)]}>{small}</Text>
      </VStack>
    </HStack>
  );

  const ink = (line: string, sub: string) => (
    <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 12.5, horizontal: 15 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "bottomLeading" })]}>
      <Image assetName="zen_logo" modifiers={[resizable(), aspectRatio({ contentMode: "fit" }), frame({ width: 22.5, height: 22.5 })]} />
      <Spacer minLength={0} />
      <Text modifiers={[f(16.5, "d700"), kerning(-0.4), foregroundStyle(c.ink), lineHeight(20)]}>{line}</Text>
      {sub ? <Text modifiers={[f(13.75), foregroundStyle(c.muted), lineLimit(1), padding({ top: 1.5 })]}>{sub}</Text> : null}
    </VStack>
  );

  const card = [clipShape("roundedRectangle", 18)];
  const sand = (type0: string, url: string, lab: string, title: string, fill: number, big: string, small: string) => {
    const type = CARD_PAL[type0] ? type0 : "plan";
    return (
      <Link destination={url}>
        <ZStack alignment="topLeading" modifiers={[frame({ width: 122 }), frame({ maxHeight: Infinity }), background(grad(type, true)), ...card]}>
          {full ? <Image assetName={`zen_art_${type}`} modifiers={[resizable(), aspectRatio({ contentMode: "fill" }), frame({ maxWidth: Infinity, maxHeight: Infinity }), clipped()]} /> : null}
          <VStack alignment="leading" spacing={0} modifiers={[padding({ vertical: 12.5, horizontal: 14.5 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" })]}>
            <Text modifiers={[f(11, "medium"), kerning(0.8), foregroundStyle(W), opacity(0.9)]}>{lab.toUpperCase()}</Text>
            <Text modifiers={[f(16.5, "d700"), foregroundStyle(W), kerning(-0.45), lineHeight(19.8), lineLimit(2), truncationMode("tail"), fixedSize({ horizontal: false, vertical: true }), layoutPriority(1), padding({ top: 4.5 })]}>{title}</Text>
            <Spacer minLength={0} />
            {meter(fill, big, small)}
          </VStack>
        </ZStack>
      </Link>
    );
  };

  const n = p.next, ex = p.exam;
  const empty = !n && !rows0.length;
  const later = !rows0.length;
  const list = [...(later ? ahead0 : rows0), ...more0].slice(0, 3);
  const TRY = ["Mai 9 giờ ôn Giải tích", "T6 nộp báo cáo nhóm", "Tối nào cũng đọc sách"].slice(list.length);
  const head = !later ? ["Hôm nay", p.count ?? ""] : p.aheadHead ? [p.aheadHead, p.aheadCount ?? ""] : ["Thử nói", ""];

  return (
    <HStack spacing={15} modifiers={[padding({ vertical: 12.5, horizontal: 16 }), frame({ maxWidth: Infinity, maxHeight: Infinity }), containerBackground(c.bg, "widget"), widgetURL(p.home || "zen:///")]}>
      {n ? sand(n.type, n.url, n.at, n.title, n.fill, n.mins, "còn lại")
        : empty && !p.doneCount && ex ? sand("assignment", ex.url, "Sắp thi", ex.title, ex.fill, ex.n, ex.unit)
        : (
          <ZStack modifiers={[frame({ width: 122 }), frame({ maxHeight: Infinity }), background(c.chip), ...card]}>
            {empty && !p.doneCount ? ink("Hôm nay\ntrống", p.dayName ?? "") : ink("Xong hết\nhôm nay", p.doneCount ?? "")}
          </ZStack>
        )}
      <VStack alignment="leading" spacing={0} modifiers={[padding({ top: 3.5 }), frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" })]}>
        <HStack modifiers={[padding({ bottom: 2 })]}>
          <Text modifiers={[f(13.5, "medium"), foregroundStyle(c.muted), lineLimit(1)]}>{head[0]}</Text>
          <Spacer />
          <Text modifiers={[f(13.5, "medium"), foregroundStyle(c.muted), lineLimit(1)]}>{head[1]}</Text>
        </HStack>
        {list.map((r, i) => row(r, i === 0))}
        {TRY.map((line, i) => (
          <VStack key={line} spacing={0}>
            {i || list.length ? <Rectangle modifiers={[foregroundStyle(c.line), frame({ height: 1 })]} /> : null}
            <Link destination={p.listen || "zen:///?listen=1"}>
              <HStack spacing={10} modifiers={[padding({ vertical: 7.5 })]}>
                <Image systemName="mic" modifiers={[font({ size: 14 }), foregroundStyle(c.muted), frame({ width: 22.5 })]} />
                <Text modifiers={[f(15, "medium"), foregroundStyle(c.ink), lineLimit(1), truncationMode("tail")]}>{`“${line}”`}</Text>
                <Spacer minLength={0} />
              </HStack>
            </Link>
          </VStack>
        ))}
        <Spacer minLength={0} />
      </VStack>
    </HStack>
  );
};

const SAMPLE: WidgetData = {
  weekday: "T2", date: "16/11", short: "T2 16", summary: "5 việc, 1 tiết học", count: "5 việc",
  next: {
    id: "s1", title: "Ôn Giải tích", type: "plan", label: "Tiếp theo", big: "10p", small: "đến 14:30", mins: "10′", at: "14:30",
    fill: 0.35, rect: "14:30, còn 10p", left: "còn 10p", url: "zen:///task/s1",
  },
  rows: [
    { id: "s2", title: "Báo cáo nhóm", type: "clay", time: "16:00", check: true, done: false, url: "zen:///task/s2" },
    { id: "s3", title: "Cơ sở dữ liệu", type: "lecture", time: "17:30", check: false, done: false, url: "zen:///task/s3" },
    { id: "s4", title: "Ăn tối với Minh", type: "busy", time: "19:00", check: false, done: false, url: "zen:///task/s4" },
  ],
  doneLabel: "Xong (2)", tomorrow: "Mai: Cấu trúc dữ liệu 07:00",
  ahead: [], more: [], aheadHead: "", aheadCount: "", doneCount: "", dayName: "T2 16",
  art: "",
  ticked: [], home: "zen:///", listen: "zen:///?listen=1",
};

export default createWidget<WidgetData>("ZenToday", ZenToday, SAMPLE);
