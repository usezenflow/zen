import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { ConnectForm } from "./settings-connect";
import { t } from "@/lib/i18n";
import { loadCreds } from "@/lib/dlu";
import { _reset as resetQueue } from "@/lib/queue";
import { calls, server } from "../../test/msw/server";
import { STUDENT } from "../../test/msw/fixtures";
import { lmsWrong, networkError, portalDataDown, portalSlow, portalWrong } from "../../test/msw/scenarios";

// shortcut: test/mocks/reanimated makes a new shared value each render, so effects keyed on one rerun; real ones are stable. Drop once the shared mock memoizes.
jest.mock("react-native-reanimated", () => {
  const m = jest.requireActual("../../test/mocks/reanimated");
  return { __esModule: true, ...m, useSharedValue: (v: unknown) => require("react").useState(() => m.useSharedValue(v))[0] };
});

beforeEach(() => { resetQueue(); jest.clearAllMocks(); }); // shortcut: per file until jest.config sets clearMocks

const W = { timeout: 10_000 };
const logins = () => calls.filter((c) => c === "POST /api/authenticate/authpsc").length;
const syncCalls = () => calls.filter((c) => c.startsWith("GET /api/student/") || c === "POST /lib/ajax/service.php");

async function form(props: Partial<React.ComponentProps<typeof ConnectForm>> = {}, pw = "p", lms = "q") {
  const onResult = jest.fn(), onFirst = jest.fn();
  await render(<ConnectForm initialId={STUDENT} onResult={onResult} onFirst={onFirst} {...props} />);
  if (pw && screen.queryByLabelText(t("portalPwLab"))) await fireEvent.changeText(screen.getByLabelText(t("portalPwLab")), pw);
  if (lms && screen.queryByLabelText(t("lmsPwLab"))) await fireEvent.changeText(screen.getByLabelText(t("lmsPwLab")), lms);
  return { onResult, onFirst, go: () => fireEvent.press(screen.getByText(t("connect"))) };
}

it("connects both accounts, saves them and runs the first sync behind the loading state", async () => {
  const { onResult, onFirst, go } = await form();
  await go();
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ portal: "ok", lms: "ok" })), W);
  expect(calls).toEqual(expect.arrayContaining(["POST /api/authenticate/authpsc", "GET /login/index.php", "POST /login/index.php", "GET /my/"]));
  expect(syncCalls()).toEqual(expect.arrayContaining(["GET /api/student/exam", "GET /api/student/DrawingStudentSchedules", "POST /lib/ajax/service.php"]));
  expect(onFirst.mock.calls).toEqual([["load"], [null]]);
  expect(await loadCreds()).toMatchObject({ studentId: STUDENT, password: "p", lmsPassword: "q", portalApiKey: "key" });
  expect(screen.getByText(t("connect"))).toBeTruthy(); // not "retry": nothing failed
});

it("a refused portal password turns its field red, shakes once and syncs nothing", async () => {
  server.use(...portalWrong);
  const { onResult, go } = await form({}, "bad", "");
  await go();
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ portal: "wrong", lms: "off" })), W);
  expect(screen.getByText(t("wrongPortal"))).toBeTruthy();
  expect(screen.getByText(t("retry"))).toBeTruthy();
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  expect(syncCalls()).toEqual([]);
  expect(await loadCreds()).toBeNull(); // nothing usable: nothing saved
});

it("a second wrong attempt in a row does not shake again", async () => {
  server.use(...portalWrong);
  const { onResult } = await form({}, "bad", "");
  await fireEvent.press(screen.getByText(t("connect")));
  await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1), W);
  await fireEvent.press(screen.getByText(t("retry")));
  await waitFor(() => expect(onResult).toHaveBeenCalledTimes(2), W);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
});

it("a refused LMS password marks only the LMS field", async () => {
  server.use(...lmsWrong);
  const { onResult, go } = await form();
  await go();
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ portal: "ok", lms: "wrong" })), W);
  expect(screen.getByText(t("wrongLms"))).toBeTruthy();
  expect(screen.queryByText(t("wrongPortal"))).toBeNull();
  expect(await loadCreds()).toMatchObject({ password: "p", lmsOff: true });
});

it("a slow portal gets a neutral note and the sync still runs", async () => {
  server.use(...portalSlow);
  const { onResult, go } = await form();
  await go();
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ portal: "slow", lms: "ok" })), W);
  expect(screen.getByText(t("slowPortal"))).toBeTruthy();
  expect(syncCalls()).toContain("POST /lib/ajax/service.php");
});

it("no network reads as slow on both accounts", async () => {
  server.use(...networkError);
  const { onResult, go } = await form();
  await go();
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ portal: "slow", lms: "slow" })), W);
  expect(screen.getByText(t("slowPortal"))).toBeTruthy();
  expect(screen.getByText(t("slowLms"))).toBeTruthy();
});

it("a first sync that brings nothing ends in the error state", async () => {
  server.use(...portalDataDown);
  const { onResult, onFirst, go } = await form({}, "p", "");
  await go();
  await waitFor(() => expect(onResult).toHaveBeenCalled(), W);
  expect(onFirst.mock.calls).toEqual([["load"], ["err"]]);
});

it("a throw while connecting stops the spinner and says so, so the user can try again", async () => {
  jest.spyOn(SecureStore, "getItemAsync").mockRejectedValueOnce(new Error("keychain locked"));
  const { onResult, go } = await form({}, "p", "");
  await go();
  await waitFor(() => expect(screen.getByText(t("retry"))).toBeTruthy(), W); // the spinner stops and says why: couldn't reach
  expect(screen.getByText(t("slowPortal"))).toBeTruthy();
  expect(onResult).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(t("retry"))); // and it works the second time
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ portal: "ok" })), W);
});

it.each([
  ["a blank student ID", "  ", "p", "q"],
  ["both passwords blank", STUDENT, "", ""],
])("%s sends nothing", async (_, id, pw, lms) => {
  const { onResult, go } = await form({ initialId: id }, pw, lms);
  await go();
  await new Promise((r) => setTimeout(r, 50));
  expect(calls).toEqual([]);
  expect(onResult).not.toHaveBeenCalled();
});

it("a second tap while busy sends one login", async () => {
  const { onResult } = await form({}, "p", "");
  const btn = screen.getByText(t("connect"));
  await fireEvent.press(btn);
  await fireEvent.press(btn);
  await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1), W);
  expect(logins()).toBe(1);
});

it("`only` and `hideId` hide fields, `focus` focuses its field", async () => {
  await render(<ConnectForm initialId={STUDENT} hideId only="lms" focus="lms" onResult={jest.fn()} />);
  expect(screen.queryByLabelText(t("studentId"))).toBeNull();
  expect(screen.queryByLabelText(t("portalPwLab"))).toBeNull();
  expect(screen.getByLabelText(t("lmsPwLab")).props.autoFocus).toBe(true);
  await screen.unmount();
  await render(<ConnectForm initialId={STUDENT} only="portal" focus="portal" onResult={jest.fn()} />);
  expect(screen.getByLabelText(t("studentId")).props.value).toBe(STUDENT);
  expect(screen.queryByLabelText(t("lmsPwLab"))).toBeNull();
  expect(screen.getByLabelText(t("portalPwLab")).props.autoFocus).toBe(true);
});

it("a blank LMS password leaves the LMS off and never asks it", async () => {
  const { onResult, go } = await form({}, "p", "");
  await go();
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ portal: "ok", lms: "off" })), W);
  expect((await loadCreds())?.lmsOff).toBe(true);
  expect(calls.some((c) => c.includes("/login/") || c.includes("/lib/ajax/"))).toBe(false);
});
