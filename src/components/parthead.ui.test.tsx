import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { delay, http, HttpResponse } from "msw";
import { PartHead } from "./parthead";
import { t } from "@/lib/i18n";
import { saveCreds } from "@/lib/dlu/creds";
import { _reset as resetQueue } from "@/lib/queue";
import { kvGet, kvSet } from "@/lib/store";
import { when } from "@/lib/when";
import { calls, server } from "../../test/msw/server";
import { feeRows, STUDENT } from "../../test/msw/fixtures";
import { portalSlow, portalWrong } from "../../test/msw/scenarios";
import { NOW } from "../../test/now";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));

const W = { timeout: 10_000 };
const prefix = (s: string) => s.slice(0, s.indexOf("{") >= 0 ? s.indexOf("{") : undefined);
beforeEach(async () => {
  resetQueue(); jest.clearAllMocks();
  await saveCreds({ studentId: STUDENT, password: "p", portalApiKey: "key" });
});

it("refresh fetches the part, shows it running, then when it came, and lands once", async () => {
  const onLand = jest.fn();
  await render(<PartHead part="marks" title={t("marks")} onLand={onLand} />);
  expect(screen.getByText(t("marks"))).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(t("refresh")));
  await waitFor(() => expect(onLand).toHaveBeenCalledTimes(1), W);
  expect(calls).toEqual(expect.arrayContaining(["GET /api/student/getstudyprogram", "GET /api/student/marks"]));
  expect(screen.getByText(new RegExp(`^${prefix(t("updatedWhen"))}${t("today")}`))).toBeTruthy();
  expect(onLand).toHaveBeenCalledTimes(1);
});

it("shows the running state while the job is out", async () => {
  server.use(http.get("*/api/student/AccountFeeHocPhan", async () => { await delay(300); return HttpResponse.json(feeRows); }));
  await render(<PartHead part="fees" title={t("fees")} />);
  await fireEvent.press(screen.getByLabelText(t("refresh")));
  await waitFor(() => expect(screen.getByText(t("updating"))).toBeTruthy(), W);
  await waitFor(() => expect(screen.queryByText(t("updating"))).toBeNull(), W);
});

it("a slow campus puts the job back and says when it retries", async () => {
  server.use(...portalSlow);
  await render(<PartHead part="marks" title={t("marks")} />);
  await fireEvent.press(screen.getByLabelText(t("refresh")));
  await waitFor(() => expect(screen.getByText(new RegExp(`^${prefix(t("retryAt"))}`))).toBeTruthy(), W);
});

it("a refused login clears the line and flags the portal", async () => {
  server.use(...portalWrong);
  const onLand = jest.fn();
  await render(<PartHead part="marks" title={t("marks")} onLand={onLand} />);
  await fireEvent.press(screen.getByLabelText(t("refresh")));
  await waitFor(() => expect(onLand).toHaveBeenCalled(), W);
  expect(await kvGet("sync.loginError")).toBe("portal");
  expect(screen.queryByText(new RegExp(`^(${prefix(t("updatedWhen"))}|${prefix(t("retryAt"))})`))).toBeNull();
});

it("back goes back", async () => {
  await render(<PartHead part="marks" title={t("marks")} />);
  await fireEvent.press(screen.getByLabelText(t("back")));
  expect(router.back).toHaveBeenCalled();
});

it("never fetched: no subtitle; fetched before: when it came", async () => {
  await render(<PartHead part="fees" title={t("fees")} />);
  await waitFor(() => expect(screen.queryByText(new RegExp(`^${prefix(t("updatedWhen"))}`))).toBeNull());
  await screen.unmount();
  await kvSet("fees.at", String(NOW - 3_600_000));
  await render(<PartHead part="fees" title={t("fees")} />);
  await waitFor(() => expect(screen.getByText(t("updatedWhen", { time: when(NOW - 3_600_000, Date.now()) }))).toBeTruthy());
});
