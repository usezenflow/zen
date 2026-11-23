import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DownloadToast, UpdateDialog, UpdatePrompt, type Dlg } from "./update";
import { t } from "@/lib/i18n";
import { install, useDownload } from "@/lib/update";
import { kvGet, kvSet } from "@/lib/store";
import type { Update } from "@/lib/update-version";
import { server } from "../../test/msw/server";
import { githubDown, githubNewer } from "../../test/msw/scenarios";

// install downloads an APK or opens SideStore: a stub. checkUpdate stays real and asks the MSW GitHub handler.
// Gesture events take RNGH's JS path: the Reanimated mock has no native event bridge (as row.ui.test).
jest.mock("react-native-gesture-handler/lib/module/handlers/gestures/reanimatedWrapper", () => ({ Reanimated: undefined, Worklets: undefined }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 54, bottom: 34, left: 0, right: 0 }) }));
jest.mock("@/lib/update", () => ({ __esModule: true, ...jest.requireActual("@/lib/update"), install: jest.fn(async () => {}), useDownload: jest.fn(() => null), notes: ["Lịch thi mới"] }));

const U: Update = { version: "99.0.0", url: "https://github.com/usezenflow/zen/releases/download/v99.0.0/zen-android.apk", page: "https://github.com/usezenflow/zen/releases", notes: ["Sửa lỗi đồng bộ", "Lịch thi mới"] };
const upd: Dlg = { kind: "update", update: U };
const W = { timeout: 5_000 };

beforeEach(() => { jest.clearAllMocks(); jest.mocked(useDownload).mockReturnValue(null); });
afterEach(() => jest.restoreAllMocks());

describe("UpdateDialog", () => {
  it("what's new lists the notes and got-it closes", async () => {
    const onClose = jest.fn();
    await render(<UpdateDialog d={{ kind: "new", version: "26.0.0", notes: ["Một", "Hai"] }} onClose={onClose} />);
    expect(screen.getByText(t("whatsNew"))).toBeTruthy();
    expect(screen.getByText("zen 26.0.0")).toBeTruthy();
    expect(screen.getByText("Một")).toBeTruthy();
    expect(screen.getByText("Hai")).toBeTruthy();
    expect(screen.queryByText(t("notNow"))).toBeNull();
    await fireEvent.press(screen.getByText(t("gotIt")));
    expect(onClose).toHaveBeenCalled();
  });

  // 26.0.1's notes ran past the screen with no way out: they scroll inside the card, the button stays, a tap outside closes.
  it("a long list of notes scrolls under the button, and a tap outside closes", async () => {
    const onClose = jest.fn();
    const many = Array.from({ length: 60 }, (_, i) => `Ghi chú ${i + 1}`);
    await render(<UpdateDialog d={{ kind: "new", version: "26.0.1", notes: many }} onClose={onClose} />);
    expect(screen.getByText("Ghi chú 60")).toBeTruthy(); // all in the scroll, the button after them
    expect(screen.getByText(t("gotIt"))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t("close"), { includeHiddenElements: true })); // hidden from a screen reader beside the modal card: it has the button
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText(t("gotIt")));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("Android: Cập nhật starts the download behind and closes at once", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const onClose = jest.fn();
    await render(<UpdateDialog d={upd} onClose={onClose} />);
    expect(screen.getByText(t("newVersion"))).toBeTruthy();
    expect(screen.getByText("zen 99.0.0")).toBeTruthy();
    await fireEvent.press(screen.getByText(t("updateBtn")));
    expect(install).toHaveBeenCalledWith(U);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the download shows as a top toast with a ring, over any screen; none when idle", async () => {
    const r = await render(<DownloadToast />, { wrapper: GestureHandlerRootView });
    expect(screen.queryByRole("progressbar")).toBeNull();
    jest.mocked(useDownload).mockReturnValue({ version: "99.0.0", pct: 42 });
    await r.rerender(<DownloadToast />);
    expect(screen.getByText(t("updDownloading", { version: "99.0.0" }))).toBeTruthy();
    expect(screen.getByText(t("updDownloadingSub", { n: 42 }))).toBeTruthy();
    expect(screen.getByRole("progressbar").props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
  });

  it("a failed download keeps the toast, ring stopped where it broke, and says the browser takes over", async () => {
    jest.mocked(useDownload).mockReturnValue({ version: "99.0.0", pct: 42, failed: true });
    await render(<DownloadToast />, { wrapper: GestureHandlerRootView });
    expect(screen.getByText(t("updFailed", { version: "99.0.0" }))).toBeTruthy();
    expect(screen.getByText(t("updFailedSub"))).toBeTruthy();
    expect(screen.getByRole("progressbar").props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
  });

  it("iOS offers SideStore; not now and back close it", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const onClose = jest.fn();
    await render(<UpdateDialog d={upd} onClose={onClose} />);
    expect(screen.getByText(t("installSideStore"))).toBeTruthy();
    expect(screen.getByText(t("installAltStore"))).toBeTruthy();
    expect(screen.root!.props.onRequestClose).toBe(onClose);
    await fireEvent.press(screen.getByText(t("notNow")));
    expect(onClose).toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });
});

describe("UpdatePrompt", () => {
  const g = globalThis as { __DEV__?: boolean };
  let dev: boolean | undefined;
  beforeEach(() => { dev = g.__DEV__; g.__DEV__ = false; });
  afterEach(() => { g.__DEV__ = dev; });
  // `offered` is module state (once a run), so the one case that offers a release covers the first offer and the repeat.

  it("the same version shows nothing", async () => {
    await kvSet("seenVersion", "0.0.0");
    await render(<UpdatePrompt />);
    await waitFor(async () => expect(await kvGet("updateCheck")).not.toBeNull(), W); // GitHub was asked
    expect(screen.toJSON()).toBeNull();
  });

  it("a newer release opens the update dialog, once a run", async () => {
    server.use(...githubNewer);
    await kvSet("seenVersion", "0.0.0");
    let onChange!: (s: string) => void;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_e, h) => { onChange = h as never; return { remove: jest.fn() }; });
    await render(<UpdatePrompt />);
    await waitFor(() => expect(screen.getByText("zen 99.0.0")).toBeTruthy(), W);
    expect(screen.getByText(t("newVersion"))).toBeTruthy();
    expect(screen.getByText("Lịch thi mới")).toBeTruthy(); // the release notes, commit hash dropped
    await fireEvent.press(screen.getByText(t("notNow")));
    expect(screen.queryByText("zen 99.0.0")).toBeNull();
    await act(async () => { onChange("active"); await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByText("zen 99.0.0")).toBeNull();
  });

  it("after an update, shows what's new once", async () => {
    await kvSet("seenVersion", "25.0.0");
    await render(<UpdatePrompt />);
    await waitFor(() => expect(screen.getByText(t("whatsNew"))).toBeTruthy(), W);
    expect(screen.getByText("zen 0.0.0")).toBeTruthy();
    expect(await kvGet("seenVersion")).toBe("0.0.0");
  });

  it("a fresh install shows nothing but remembers the version", async () => {
    await render(<UpdatePrompt />);
    await waitFor(async () => expect(await kvGet("seenVersion")).toBe("0.0.0"), W);
    expect(screen.queryByText(t("whatsNew"))).toBeNull();
  });

  it("GitHub failing is just no update", async () => {
    server.use(...githubDown);
    await kvSet("seenVersion", "0.0.0");
    await render(<UpdatePrompt />);
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.toJSON()).toBeNull();
    expect(await kvGet("updateCheck")).toBeNull(); // a failure is not cached
  });

  it("dev builds never ask", async () => {
    g.__DEV__ = true;
    const add = jest.spyOn(AppState, "addEventListener");
    await render(<UpdatePrompt />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.toJSON()).toBeNull();
    expect(await kvGet("updateCheck")).toBeNull();
    expect(add).not.toHaveBeenCalled();
  });

  it("unmounting removes the app-state listener", async () => {
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove } as never);
    await render(<UpdatePrompt />);
    await screen.unmount();
    expect(remove).toHaveBeenCalled();
  });
});

