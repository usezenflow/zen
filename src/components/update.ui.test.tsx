import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, Platform } from "react-native";
import { UpdateDialog, UpdatePrompt, type Dlg } from "./update";
import { t } from "@/lib/i18n";
import { install } from "@/lib/update";
import { kvGet, kvSet } from "@/lib/store";
import type { Update } from "@/lib/update-version";
import { server } from "../../test/msw/server";
import { githubDown, githubNewer } from "../../test/msw/scenarios";

// install downloads an APK or opens SideStore: a stub. checkUpdate stays real and asks the MSW GitHub handler.
jest.mock("@/lib/update", () => ({ __esModule: true, ...jest.requireActual("@/lib/update"), install: jest.fn(async () => {}), notes: ["Lịch thi mới"] }));

const U: Update = { version: "99.0.0", url: "https://github.com/usezenflow/zen/releases/download/v99.0.0/zen-android.apk", page: "https://github.com/usezenflow/zen/releases", notes: ["Sửa lỗi đồng bộ", "Lịch thi mới"] };
const upd: Dlg = { kind: "update", update: U };
const W = { timeout: 5_000 };

beforeEach(() => jest.clearAllMocks());
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

  it("Android: downloads with a percentage, back ignored meanwhile, then closes", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    let finish!: () => void;
    jest.mocked(install).mockImplementation((_u, onProgress) => new Promise((r) => { onProgress(42); finish = r; }));
    const onClose = jest.fn();
    await render(<UpdateDialog d={upd} onClose={onClose} />);
    expect(screen.getByText(t("newVersion"))).toBeTruthy();
    expect(screen.getByText("zen 99.0.0")).toBeTruthy();
    expect(screen.getByText(t("notNow"))).toBeTruthy();
    // The press stays in its act until the install resolves. No other act may start meanwhile (overlapping acts broke every later test),
    // so the download state is read synchronously. A second tap mid-download would be a second act: shortcut: that guard (pct !== null in go) is untested here.
    const pressed = fireEvent.press(screen.getByText(t("updateBtn")));
    for (let i = 0; i < 20 && !screen.queryByText(t("downloadingPct", { n: 42 })); i++) await Promise.resolve();
    expect(screen.getByText(t("downloadingPct", { n: 42 }))).toBeTruthy();
    expect(screen.queryByText(t("notNow"))).toBeNull();
    expect(screen.root!.props.onRequestClose).toBeUndefined(); // back does nothing mid-download
    expect(install).toHaveBeenCalledWith(U, expect.any(Function));
    finish();
    await pressed;
    expect(install).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("iOS offers SideStore; not now and back close it", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const onClose = jest.fn();
    await render(<UpdateDialog d={upd} onClose={onClose} />);
    expect(screen.getByText(t("installSideStore"))).toBeTruthy();
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

