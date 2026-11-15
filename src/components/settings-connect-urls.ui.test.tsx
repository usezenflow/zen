// Its own file: ConnectForm reads the campus URLs when its module loads, so they are set before the first require.
// (jest.isolateModules would reload React Native's setup, which reinstalls fetch over MSW's.)
process.env.EXPO_PUBLIC_DLU_PORTAL_URL = "http://campus.test";
process.env.EXPO_PUBLIC_DLU_LMS_URL = "http://lms.test";
const rtl = require("@testing-library/react-native") as typeof import("@testing-library/react-native");
const { fireEvent, render, waitFor } = rtl;
const { ConnectForm } = require("./settings-connect") as typeof import("./settings-connect");
const { t } = require("@/lib/i18n") as typeof import("@/lib/i18n");
const { loadCreds } = require("@/lib/dlu") as typeof import("@/lib/dlu");

it("saves the campus URLs the app was built with, and talks to them", async () => {
  const onResult = jest.fn();
  await render(<ConnectForm initialId="2112345" onResult={onResult} />);
  await fireEvent.changeText(rtl.screen.getByLabelText(t("portalPwLab")), "p");
  await fireEvent.press(rtl.screen.getByText(t("connect")));
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ portal: "ok" })), { timeout: 10_000 });
  expect(await loadCreds()).toMatchObject({ portalUrl: "http://campus.test", lmsUrl: "http://lms.test" });
});
