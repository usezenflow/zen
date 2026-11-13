import type { Widget } from "expo-widgets";

import type { WidgetData, WidgetName } from "./data";
import ZenExam from "./ZenExam.ios";
import ZenLock from "./ZenLock.ios";
import ZenNext from "./ZenNext.ios";
import ZenTalk from "./ZenTalk.ios";
import ZenToday from "./ZenToday.ios";

export const widgets: Partial<Record<WidgetName, Widget<WidgetData>>> = { ZenNext, ZenTalk, ZenExam, ZenToday, ZenLock };
