import type { Widget } from "expo-widgets";
import type { WidgetData, WidgetName } from "./data";
import ZenExam from "./ZenExam.android";
import ZenNext from "./ZenNext.android";
import ZenTalk from "./ZenTalk.android";
import ZenToday from "./ZenToday.android";

// ZenLock is a lock-screen accessory, iOS only.
export const widgets: Partial<Record<WidgetName, Widget<WidgetData>>> = { ZenNext, ZenTalk, ZenExam, ZenToday };
