import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { Hold, SAT_DX, SAT_DY, SAT_UP, type Aside, type HoldState } from "./hold";
import { t } from "@/lib/i18n";

beforeEach(() => jest.clearAllMocks()); // haptics mocks are shared across tests
const X = 200, Y = 700; // where the thumb lands on the mic
const ev = (dx = 0, dy = 0) => ({ nativeEvent: { pageX: X + dx, pageY: Y + dy, touches: [] } });
// Screen y grows downwards: a satellite `up` px above the mic is at dy = -up.
const SPOT: Record<Exclude<Aside, "">, [number, number]> = { photo: [-SAT_DX, -SAT_DY], pdf: [0, -SAT_UP], type: [SAT_DX, -SAT_DY] };

async function setup(p: { state?: HoldState; pinned?: Aside; idle?: "hold" | "holdRule" } = {}) {
  const cb = { onStart: jest.fn(), onEnd: jest.fn(), onAside: jest.fn() };
  await render(<Hold state={p.state ?? "idle"} pinned={p.pinned} idle={p.idle} {...cb} />);
  return { ...cb, mic: screen.getByLabelText(t(p.idle ?? "hold")) };
}

it("a press starts with a medium tap, and a release on the mic ends with no aside", async () => {
  const { mic, onStart, onEnd } = await setup();
  await fireEvent(mic, "responderGrant", ev());
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  expect(screen.getByText(t("satPhoto"))).toBeOnTheScreen(); // the fan opens while held
  await fireEvent(mic, "responderRelease", ev());
  expect(onEnd).toHaveBeenCalledWith("");
  expect(screen.queryByText(t("satPhoto"))).toBeNull();
});

it.each(Object.entries(SPOT) as [Exclude<Aside, "">, [number, number]][])("sliding onto %s lights it once, and releasing there ends with it", async (a, [dx, dy]) => {
  const { mic, onAside, onEnd } = await setup();
  await fireEvent(mic, "responderGrant", ev());
  await fireEvent(mic, "responderMove", ev(dx, dy));
  await fireEvent(mic, "responderMove", ev(dx + 5, dy + 5)); // still within reach: no second call
  expect(onAside.mock.calls).toEqual([[a]]);
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  expect(screen.getByText(t(a === "photo" ? "dropPhoto" : a === "pdf" ? "dropPdf" : "dropType"))).toBeOnTheScreen();
  await fireEvent(mic, "responderRelease", ev(dx, dy));
  expect(onEnd).toHaveBeenCalledWith(a);
});

it("sliding back off a satellite reports the empty aside", async () => {
  const { mic, onAside, onEnd } = await setup();
  await fireEvent(mic, "responderGrant", ev());
  await fireEvent(mic, "responderMove", ev(...SPOT.type));
  await fireEvent(mic, "responderMove", ev(0, 0));
  expect(onAside.mock.calls).toEqual([["type"], [""]]);
  await fireEvent(mic, "responderTerminate", ev());
  expect(onEnd).toHaveBeenCalledWith("");
});

it("screen readers pick photo, pdf or type as named actions", async () => {
  const { mic, onEnd } = await setup();
  for (const actionName of ["photo", "pdf", "type"]) await fireEvent(mic, "accessibilityAction", { nativeEvent: { actionName } });
  expect(onEnd.mock.calls).toEqual([["photo"], ["pdf"], ["type"]]);
});

it("refuses to start while thinking or while a satellite is pinned", async () => {
  expect((await setup({ state: "thinking" })).mic.props.onStartShouldSetResponder()).toBe(false);
  expect((await setup({ pinned: "photo" })).mic.props.onStartShouldSetResponder()).toBe(false);
  expect((await setup()).mic.props.onStartShouldSetResponder()).toBe(true);
});

it("never lets a scroll take the hold over", async () => {
  expect((await setup()).mic.props.onResponderTerminationRequest()).toBe(false);
});

it.each([
  [{}, "hold"], [{ idle: "holdRule" as const }, "holdRule"],
  [{ state: "listening" as const }, "listening"], [{ state: "thinking" as const }, "thinking"],
  [{ pinned: "photo" as const }, "photoFrom"], [{ pinned: "pdf" as const }, "dropPdf"], [{ pinned: "type" as const }, "dropType"],
] as const)("labels %j as %s", async (p, key) => {
  await setup(p);
  expect(screen.getByText(t(key))).toBeOnTheScreen();
});

it("a pinned satellite keeps the fan open after release", async () => {
  await setup({ pinned: "photo" });
  expect(screen.getByText(t("satPhoto"))).toBeOnTheScreen();
  expect(screen.getByText(t("satPdf"))).toBeOnTheScreen();
  expect(screen.getByText(t("satType"))).toBeOnTheScreen();
});
