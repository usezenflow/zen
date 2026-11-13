import type { Widget } from "expo-widgets";
import type { WidgetData, WidgetName } from "./data";

// Web and typecheck fallback. index.ios.ts and index.android.ts export the real widgets with the same shape.
export const widgets: Partial<Record<WidgetName, Widget<WidgetData>>> = {};
