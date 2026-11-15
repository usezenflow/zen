import { fireEvent, render, screen } from "@testing-library/react-native";
import { LogoState } from "./logostate";
import { t } from "@/lib/i18n";

it("loading shows its copy and no buttons", async () => {
  await render(<LogoState state="load" onRetry={jest.fn()} onLater={jest.fn()} />);
  expect(screen.getByText(t("syncLoadT"))).toBeOnTheScreen();
  expect(screen.getByText(t("syncLoadSub"))).toBeOnTheScreen();
  expect(screen.queryByText(t("retry"))).toBeNull();
  expect(screen.queryByText(t("notNow"))).toBeNull();
});

it("error offers retry and later", async () => {
  const onRetry = jest.fn(), onLater = jest.fn();
  await render(<LogoState state="err" onRetry={onRetry} onLater={onLater} />);
  expect(screen.getByText(t("syncErrT"))).toBeOnTheScreen();
  expect(screen.getByText(t("syncErrSub"))).toBeOnTheScreen();
  await fireEvent.press(screen.getByText(t("retry")));
  await fireEvent.press(screen.getByText(t("notNow")));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onLater).toHaveBeenCalledTimes(1);
});

it("error without handlers does not crash on press", async () => {
  await render(<LogoState state="err" />);
  await fireEvent.press(screen.getByText(t("retry")));
  await fireEvent.press(screen.getByText(t("notNow")));
  expect(screen.getByText(t("syncErrT"))).toBeOnTheScreen();
});
