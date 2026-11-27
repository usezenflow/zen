import { Box, Button, Column, Image, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxHeight, fillMaxSize, fillMaxWidth, height, padding, size, width } from "@expo/ui/jetpack-compose/modifiers";
import type { JSX } from "react";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetData, WRow } from "./data";
import { SAMPLE } from "./ZenNext.android";

// Medium: next on its line-field card at the left, the rest of today on the right; the circle ticks in place.
// shortcut: Android gives the layout no size, so the resized (large) widget still shows this medium layout, upgrade when expo-widgets passes the widget size in `environment`.
// shortcut: Glance (expo-widgets 58) renders 500/600 as Normal and has no line-height, letter-spacing or custom font, so display faces draw Bold and body rows draw Normal in the system font; upgrade when expo-widgets maps custom fonts.
function ZenToday(p0: WidgetData, env: WidgetEnvironment) {
  "widget";
  const base = p0 ?? ({ rows: [], ahead: [], more: [], ticked: [], home: "zen:///", listen: "zen:///?listen=1" } as unknown as WidgetData);
  const now = Date.now(), due = (base.tl ?? []).reduce<NonNullable<WidgetData["tl"]>[number] | undefined>((a, x) => (x.at <= now ? x : a), undefined);
  const p: WidgetData = due ? { ...base, ...due.p } : base;
  const rows0 = p.rows ?? [], ahead0 = p.ahead ?? [], more0 = p.more ?? [], ticked0 = p.ticked ?? [];
  const c = env.colorScheme === "dark"
    ? { bg: "#0d0d0f", ink: "#f2f3f5", muted: "#8a8d94", line: "#2a2c31", chip: "#1a1b1f" }
    : { bg: "#ffffff", ink: "#0d0d0f", muted: "#737a87", line: "#e1e5ec", chip: "#f1f3f7" };
  const mid: Record<string, string> = {
    plan: "#0b2f8f", lecture: "#0f8f6a", exam: "#ff4f2a",
    assignment: "#5c1450", night: "#1e2a8a", clay: "#6e2a16", busy: "#434952",
  };
  const swatch: Record<string, string> = {
    plan: "#2433f2", lecture: "#0f8f6a", exam: "#ff4f2a",
    assignment: "#c21f86", night: "#7a4dff", clay: "#cf4a2c", busy: "#9ea3ab",
  };
  const tap = (target: string) => ({ target }) as object;
  const meter = (fill: number, big: string, small: string) => {
    const h = Math.min(39.4, 43.2 * Math.max(0, Math.min(1, fill)));
    return (
      <Row verticalAlignment="center">
        <Box contentAlignment="bottomCenter" modifiers={[size(15.7, 47.2), cornerRadius(9.2), background("#ffffff40"), padding(3.9, 3.9, 3.9, 3.9)]}>
          {h > 0 ? <Box modifiers={[fillMaxWidth(), height(Math.max(h, 6)), cornerRadius(6.55), background("#ffffff")]} /> : null}
        </Box>
        <Spacer modifiers={[width(10)]} />
        <Column>
          <Text color="#ffffff" maxLines={1} style={{ fontSize: 25, fontWeight: "bold" }}>{big}</Text>
          <Text color="#ffffffeb" maxLines={1} style={{ fontSize: 14.5 }}>{small}</Text>
        </Column>
      </Row>
    );
  };
  const done = (r: WRow) => r.done || ticked0.includes(r.id);
  const tick = (id: string) => () => ({
    rows: rows0.map((r) => (r.id === id ? { ...r, done: true } : r)),
    ahead: ahead0.map((r) => (r.id === id ? { ...r, done: true } : r)),
    more: more0.map((r) => (r.id === id ? { ...r, done: true } : r)),
    ticked: ticked0.includes(id) ? ticked0 : [...ticked0, id],
  });
  const lead = (r: WRow) => {
    if (!r.check) {
      const type = swatch[r.type] ? r.type : "plan";
      return <Box modifiers={[size(23.6, 23.6), cornerRadius(11.8), background(swatch[type])]} />;
    }
    if (done(r)) {
      return (
        <Box contentAlignment="center" modifiers={[size(23.6, 23.6), cornerRadius(11.8), background(c.chip)]}>
          <Text color={c.ink} maxLines={1} style={{ fontSize: 14, fontWeight: "bold" }}>✓</Text>
        </Box>
      );
    }
    return (
      <Button {...tap(`done:${r.id}`)} onClick={tick(r.id)} modifiers={[size(23.6, 39.3)]}>
        <Box modifiers={[size(23.6, 23.6), cornerRadius(11.8), background(c.muted), padding(1.6, 1.6, 1.6, 1.6)]}>
          <Box modifiers={[fillMaxSize(), cornerRadius(10.2), background(c.bg)]} />
        </Box>
      </Button>
    );
  };
  const row = (r: WRow) => (
    <Row key={r.id} verticalAlignment="center" modifiers={[fillMaxWidth(), height(39.3)]}>
      {lead(r)}
      <Spacer modifiers={[width(10.5)]} />
      <Button {...tap(r.url)} modifiers={[fillMaxWidth(), height(39.3)]}>
        <Box contentAlignment="centerEnd" modifiers={[fillMaxSize()]}>
          <Box contentAlignment="centerStart" modifiers={[fillMaxSize(), padding(0, 0, r.time.length > 5 ? 82 : 48, 0)]}>
            <Text color={done(r) ? c.muted : c.ink} maxLines={1} style={{ fontSize: 15.5, textDecoration: done(r) ? "lineThrough" : "none" }}>{r.title}</Text>
          </Box>
          <Text color={c.muted} maxLines={1} style={{ fontSize: 14 }}>{r.time}</Text>
        </Box>
      </Button>
    </Row>
  );

  const sand = (type0: string, lab: string, title: string, foot: JSX.Element) => {
    const type = mid[type0] ? type0 : "plan";
    return (
      <Box modifiers={[fillMaxSize(), cornerRadius(18.5), background(mid[type])]}>
        <Image source={{ uri: `zen_art_${type}` }} contentScale="crop" contentDescription={null} modifiers={[fillMaxSize()]} />
        <Box modifiers={[fillMaxSize(), padding(15, 13, 15, 13)]}>
          <Column>
            <Text color="#ffffffe6" maxLines={1} style={{ fontSize: 11.5 }}>{lab.toUpperCase()}</Text>
            <Text color="#ffffff" maxLines={2} modifiers={[padding(0, 2.5, 0, 0)]} style={{ fontSize: 17, fontWeight: "bold" }}>{title}</Text>
          </Column>
          <Box contentAlignment="bottomStart" modifiers={[fillMaxSize()]}>
            {foot}
          </Box>
        </Box>
      </Box>
    );
  };
  const at = (left: number, top: number, child: JSX.Element) => (
    <Box modifiers={[fillMaxSize(), padding(left, top, 0, 0)]}>{child}</Box>
  );
  const mic = (fg: string, bg: string) => (
    <Box modifiers={[size(18.3, 18.3)]}>
      {at(3.5, 2.75, (
        <Box modifiers={[size(11.3, 11.3), cornerRadius(5.65), background(fg), padding(1.37, 1.37, 1.37, 1.37)]}>
          <Box modifiers={[fillMaxSize(), cornerRadius(4.3), background(bg)]} />
        </Box>
      ))}
      {at(3.5, 2.75, <Box modifiers={[size(11.3, 5.65), background(bg)]} />)}
      {at(6.17, 1.6, (
        <Box modifiers={[size(5.96, 9.78), cornerRadius(2.98), background(fg), padding(1.37, 1.37, 1.37, 1.37)]}>
          <Box modifiers={[fillMaxSize(), cornerRadius(1.6), background(bg)]} />
        </Box>
      ))}
      {at(8.48, 13.4, <Box modifiers={[size(1.37, 2.67), background(fg)]} />)}
    </Box>
  );
  const ink = (line: string, sub: string) => (
    <Box modifiers={[fillMaxSize(), cornerRadius(18.5), background(c.chip), padding(15, 13, 15, 13)]}>
      <Image source={{ uri: "zen_logo" }} contentScale="fit" contentDescription={null} modifiers={[size(24, 24)]} />
      <Box contentAlignment="bottomStart" modifiers={[fillMaxSize()]}>
        <Column>
          <Text color={c.ink} maxLines={2} style={{ fontSize: 17, fontWeight: "bold" }}>{line}</Text>
          {sub ? <Text color={c.muted} maxLines={1} style={{ fontSize: 14.5 }}>{sub}</Text> : null}
        </Column>
      </Box>
    </Box>
  );

  const n = p.next, ex = p.exam;
  const empty = !n && !rows0.length;
  const later = !rows0.length;
  const rows = [...(later ? ahead0 : rows0), ...more0].slice(0, 3);
  const free = empty && !p.doneCount;
  const TRY = ["Mai 9 giờ ôn Giải tích", "T6 nộp báo cáo nhóm", "Tối nào cũng đọc sách"].slice(rows.length);
  const head = !later ? ["Hôm nay", p.count ?? ""] : p.aheadHead ? [p.aheadHead, p.aheadCount ?? ""] : ["Thử nói", ""];
  return (
    <Box modifiers={[fillMaxSize(), cornerRadius(28), background(c.bg), padding(17, 13, 17, 13)]}>
      <Row modifiers={[fillMaxSize()]}>
        <Button {...tap(n ? n.url : free && ex ? ex.url : p.home || "zen:///")} modifiers={[width(126), fillMaxHeight()]}>
          {n ? sand(n.type, n.at, n.title, meter(n.fill, n.mins, "còn lại"))
            : free && ex ? sand("assignment", "Sắp thi", ex.title, (
              <Column>
                <Text color="#ffffff" maxLines={1} style={{ fontSize: 23.6, fontWeight: "bold" }}>{ex.big}</Text>
                <Text color="#ffffffeb" maxLines={1} style={{ fontSize: 13.8 }}>{ex.small}</Text>
              </Column>
            ))
            : free ? ink("Hôm nay\ntrống", p.dayName ?? "")
            : ink("Xong hết\nhôm nay", p.doneCount ?? "")}
        </Button>
        <Spacer modifiers={[width(16)]} />
        <Column modifiers={[fillMaxSize(), padding(0, 4, 0, 0)]}>
          <Button {...tap(p.home || "zen:///")} modifiers={[fillMaxWidth()]}>
            <Row modifiers={[fillMaxWidth()]}>
              <Text color={c.muted} maxLines={1} style={{ fontSize: 14 }}>{head[0]}</Text>
              <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
                <Text color={c.muted} maxLines={1} style={{ fontSize: 14 }}>{head[1]}</Text>
              </Box>
            </Row>
          </Button>

          {rows.map((r, i) => (i === 0 ? row(r) : [<Box key={`l${r.id}`} modifiers={[fillMaxWidth(), height(1), background(c.line)]} />, row(r)]))}
          {TRY.map((line, i) => [
            i || rows.length ? <Box key={`t${i}`} modifiers={[fillMaxWidth(), height(1), background(c.line)]} /> : null,
            <Button key={line} {...tap(p.listen || "zen:///?listen=1")} modifiers={[fillMaxWidth(), height(39.3)]}>
              <Row verticalAlignment="center" modifiers={[fillMaxSize()]}>
                <Box contentAlignment="center" modifiers={[size(23.6, 23.6)]}>{mic(c.muted, c.bg)}</Box>
                <Spacer modifiers={[width(10.5)]} />
                <Text color={c.ink} maxLines={1} style={{ fontSize: 15.5 }}>{`“${line}”`}</Text>
              </Row>
            </Button>,
          ])}
        </Column>
      </Row>
    </Box>
  );
}

export default createWidget<WidgetData>("ZenToday", ZenToday, SAMPLE);
