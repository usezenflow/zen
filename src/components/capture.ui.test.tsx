import { fireEvent, render, screen } from "@testing-library/react-native";
import { Keyboard, StyleSheet, type EmitterSubscription } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PdfView, PhotoMenu, PhotoView, TypeBar, Veil } from "./capture";
import { t } from "@/lib/i18n";

// The native expo-image view carries circular refs; a plain view keeps the tree inspectable.
jest.mock("expo-image", () => ({ Image: (p: object) => require("react").createElement(require("react-native").View, { ...p, testID: "image" }) }));
// RNGH's gesture hooks ask Reanimated for isSharedValue, which the shared mock lacks.
jest.mock("react-native-reanimated", () => ({ __esModule: true, ...jest.requireActual("../../test/mocks/reanimated"), isSharedValue: (v: unknown) => !!v && typeof v === "object" && "value" in v }));

type J = { type: string; props: Record<string, any>; children: unknown[] | null };
const nodes = (j: unknown): J[] => (!j || typeof j === "string" ? [] : Array.isArray(j) ? j.flatMap(nodes) : [j as J, ...nodes((j as J).children)]);
const all = () => nodes(screen.toJSON());
const styleOf = (n: J) => StyleSheet.flatten(n.props.style) ?? {};
const images = () => screen.queryAllByTestId("image");
const scans = () => all().filter((n) => typeof styleOf(n).top === "string" && styleOf(n).height === 2); // the sweep line
const MARK = "rgba(217,67,43,0.18)";
const lit = () => all().filter((n) => n.type === "Text" && styleOf(n).backgroundColor === MARK).map((n) => (n.children ?? []).join(""));

describe("Veil", () => {
  it("closes on press", async () => {
    const onPress = jest.fn();
    await render(<Veil onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText(t("close")));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it("without onPress has nothing to press and lets touches through", async () => {
    await render(<Veil />);
    expect(screen.queryByLabelText(t("close"))).toBeNull();
    expect(all()[0].props.pointerEvents).toBe("none");
  });
});

describe("PhotoMenu", () => {
  it.each([["camera"], ["library"]] as const)("%s picks its source", async (src) => {
    const onPick = jest.fn();
    await render(<PhotoMenu onPick={onPick} />);
    await fireEvent.press(screen.getByText(t(src)));
    expect(onPick.mock.calls).toEqual([[src]]);
  });
});

describe("TypeBar", () => {
  const field = () => screen.getByPlaceholderText(t("typeHint"));
  const send = () => screen.getByLabelText(t("send"));
  it("sends the trimmed text from the button", async () => {
    const onSend = jest.fn();
    await render(<TypeBar onSend={onSend} onClose={jest.fn()} />, { wrapper: GestureHandlerRootView });
    await fireEvent.changeText(field(), "  học nhóm 3h chiều mai  ");
    await fireEvent.press(send());
    expect(onSend.mock.calls).toEqual([["học nhóm 3h chiều mai"]]);
  });
  it("sends from the keyboard's send key too", async () => {
    const onSend = jest.fn();
    await render(<TypeBar onSend={onSend} onClose={jest.fn()} />, { wrapper: GestureHandlerRootView });
    await fireEvent.changeText(field(), "đi chợ");
    await fireEvent(field(), "submitEditing");
    expect(onSend.mock.calls).toEqual([["đi chợ"]]);
  });
  it("whitespace only: send is disabled and nothing goes", async () => {
    const onSend = jest.fn();
    await render(<TypeBar onSend={onSend} onClose={jest.fn()} />, { wrapper: GestureHandlerRootView });
    await fireEvent.changeText(field(), "   \n ");
    expect(send()).toBeDisabled();
    await fireEvent.press(send());
    await fireEvent(field(), "submitEditing");
    expect(onSend).not.toHaveBeenCalled();
  });
  it("blur closes", async () => {
    const onClose = jest.fn();
    await render(<TypeBar onSend={jest.fn()} onClose={onClose} />, { wrapper: GestureHandlerRootView });
    await fireEvent(field(), "blur");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("removes its keyboard listeners on unmount", async () => {
    const remove = jest.fn();
    const add = jest.spyOn(Keyboard, "addListener").mockImplementation(() => ({ remove }) as unknown as EmitterSubscription);
    const r = await render(<TypeBar onSend={jest.fn()} onClose={jest.fn()} />, { wrapper: GestureHandlerRootView });
    expect(add.mock.calls.map((c) => c[0])).toEqual(["keyboardWillShow", "keyboardWillHide"]); // jest-expo runs as iOS
    await r.unmount();
    expect(remove).toHaveBeenCalledTimes(2);
    add.mockRestore();
  });
});

describe("PdfView", () => {
  it("a scanned page shows its picture under the sweep, not the text", async () => {
    await render(<PdfView page={1} pages={2} image="file:///p1.png" text="chữ" marks={[]} />);
    expect(images()).toHaveLength(1);
    expect(scans()).toHaveLength(1);
    expect(screen.queryByText("chữ")).toBeNull();
  });
  it("text pages light what was found", async () => {
    await render(<PdfView page={1} pages={1} text="Nộp bài thứ 6 lúc 9h" marks={[{ start: 0, end: 7 }]} />);
    expect(lit()).toEqual(["Nộp bài"]);
    expect(screen.getByText(t("pdfPage", { n: 1, total: 1 }))).toBeOnTheScreen();
  });
  it("no page count before it is known", async () => {
    await render(<PdfView page={0} pages={0} text="x" />);
    expect(screen.queryByText(t("pdfPage", { n: 0, total: 0 }))).toBeNull();
  });
  it("overlapping marks light the rest of the later one; one inside another is skipped", async () => {
    await render(<PdfView page={1} pages={1} text="abcdefgh" marks={[{ start: 2, end: 6 }, { start: 0, end: 4 }, { start: 1, end: 3 }]} />);
    expect(lit()).toEqual(["abcd", "ef"]);
  });
  it("neither image nor text: an empty page", async () => {
    await render(<PdfView page={1} pages={1} />);
    expect(images()).toHaveLength(0);
    expect(lit()).toEqual([]);
  });
});

describe("PhotoView", () => {
  const shot = () => all().find((n) => n.children?.some((c) => (c as J).props?.testID === "image"))!;
  it("an unknown size falls back to 80% width at 0.84", async () => {
    await render(<PhotoView uri="file:///a.jpg" w={0} h={0} reading={false} />);
    expect(styleOf(shot())).toMatchObject({ aspectRatio: 0.84 });
  });
  it("a known size keeps its ratio", async () => {
    await render(<PhotoView uri="file:///a.jpg" w={400} h={200} reading={false} />);
    const st = styleOf(shot());
    expect(st.width / st.height).toBeCloseTo(2);
  });
  it("text without marks shows no overlay; text with marks does", async () => {
    await render(<PhotoView uri="file:///a.jpg" w={10} h={10} text="Họp lớp" reading={false} />);
    expect(screen.queryByText("Họp lớp")).toBeNull();
    await render(<PhotoView uri="file:///a.jpg" w={10} h={10} text="Họp lớp" marks={[{ start: 0, end: 3 }]} reading={false} />);
    expect(lit()).toEqual(["Họp"]);
  });
  it("sweeps only while reading", async () => {
    await render(<PhotoView uri="file:///a.jpg" w={10} h={10} reading />);
    expect(scans()).toHaveLength(1);
    await render(<PhotoView uri="file:///a.jpg" w={10} h={10} reading={false} />);
    expect(scans()).toHaveLength(0);
  });
});
