import { render, screen } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Day } from "./day";
import { t } from "@/lib/i18n";
import { at, DAY, HOUR, NOW, TODAY, task } from "../../test/factories";

// Gesture events take RNGH's JS path: the Reanimated mock has no native event bridge.
jest.mock("react-native-gesture-handler/lib/module/handlers/gestures/reanimatedWrapper", () => ({ Reanimated: undefined, Worklets: undefined }));

// A daily repeat's occurrence on `day`: no time yet (start undefined), the day's own due at midnight after it.
const occurrence = (day: number) => task({ title: "Đọc 10 cuốn sách", kind: "study", effort: 90, rrule: "FREQ=DAILY", start: undefined, end: undefined, notBefore: day + 7 * HOUR, deadline: day + DAY });

const draw = async (day: number, tasks: ReturnType<typeof task>[], now = NOW, empty?: "rest" | "inl", over: { activeId?: string; label?: string } = {}) => render(
  <GestureHandlerRootView>
    <Day tasks={tasks} hols={new Map()} day={day} now={now} empty={empty} overlaps={[]} trail={{}} moves={[]} warns={[]} rules={[]} {...over}
      onFix={jest.fn()} onMove={jest.fn()} onKeep={jest.fn()} onToggle={jest.fn()} onTitle={jest.fn()} onTime={jest.fn()} onOpen={jest.fn()}
      itemsFor={() => []} onHold={jest.fn()} onSwipeDelete={jest.fn()} />
  </GestureHandlerRootView>,
);

describe("Day: a repeat past the 30-day plan", () => {
  it("shows the occurrence 40 days out under 'Chưa xếp giờ' with its length and note", async () => {
    const day40 = TODAY + 40 * DAY;
    await draw(day40, [occurrence(day40)]);
    expect(screen.getByText("Chưa xếp giờ")).toBeTruthy();
    expect(screen.getByText("Mỗi ngày")).toBeTruthy();
    expect(screen.getByText("Sẽ có giờ trong 7 ngày tới")).toBeTruthy();
  });

  it("inside the 7-day plan an occurrence with no slot shows as 'Chưa có giờ trống', with no 7-day note", async () => {
    const day5 = TODAY + 5 * DAY;
    await draw(day5, [occurrence(day5)]);
    expect(screen.queryByText("Chưa xếp giờ")).toBeNull();
    expect(screen.getByText("Chưa có giờ trống")).toBeTruthy();
    expect(screen.queryByText("Sẽ có giờ trong 7 ngày tới")).toBeNull();
  });

  it("a task with no slot is never hidden: a past window shows today, a gone repeat day does not", async () => {
    const lost = task({ title: "Tập gym", start: undefined, end: undefined, notAfter: TODAY - DAY + 23 * HOUR });
    await draw(TODAY, [lost, occurrence(TODAY - 2 * DAY)]);
    expect(screen.getByText("Tập gym")).toBeTruthy();
    expect(screen.queryByText("Đọc 10 cuốn sách")).toBeNull();
  });
});

describe("Day: all of today done (card.html \"Night, nothing left\")", () => {
  it("the rest card says it, and its sub names tomorrow's first task", async () => {
    const done = task({ title: "Viết luận", start: at(9), end: at(10), doneAt: at(10) });
    const tomorrow = task({ title: "Đọc chương 4", start: at(8, 0, TODAY + DAY), end: at(9, 0, TODAY + DAY) });
    await draw(TODAY, [done, tomorrow], at(21), "rest");
    expect(screen.getByText("Hôm nay xong rồi")).toBeTruthy();
    expect(screen.getByText("Mai 8:00, Đọc chương 4")).toBeTruthy();
  });

  // The day is over from 20:00 and past its last block; before that, no nudge toward tomorrow.
  const done = () => task({ title: "Viết luận", start: at(9), end: at(10), doneAt: at(10) });
  const tomorrow = () => task({ title: "Đọc chương 4", start: at(8, 0, TODAY + DAY), end: at(9, 0, TODAY + DAY) });
  it("at 14:00 no 'Ngày mai' list and no tomorrow sub", async () => {
    await draw(TODAY, [done(), tomorrow()], at(14), "rest");
    expect(screen.queryByText(t("tomorrow"))).toBeNull();
    expect(screen.queryByText("Mai 8:00, Đọc chương 4")).toBeNull();
  });
  it("at 21:00 the 'Ngày mai' list shows", async () => {
    await draw(TODAY, [done(), tomorrow()], at(21), "rest");
    expect(screen.getByText(t("tomorrow"))).toBeTruthy();
  });
  it("a past day all done says Xong hết rồi, never Hôm nay xong rồi or its next day", async () => {
    const y = TODAY - DAY, past = task({ title: "Viết luận", start: at(9, 0, y), end: at(10, 0, y), doneAt: at(10, 0, y) });
    const today = task({ title: "Đọc chương 4", start: at(15), end: at(16) });
    await draw(y, [past, today], at(10), "rest");
    expect(screen.getByText("Xong hết rồi")).toBeTruthy();
    expect(screen.queryByText("Hôm nay xong rồi")).toBeNull();
    expect(screen.queryByText(t("tomorrow"))).toBeNull();
  });
});

describe("Day: today's cap reached (views.html \"Day, enough\")", () => {
  const done = () => task({ title: "Viết luận", start: at(9), end: at(10), doneAt: at(10) });
  it("done time plus the placed work fills the cap: one card, done rows kept, the rest folded", async () => {
    const planned = task({ title: "Đọc chương 4", start: at(11), end: at(16) }); // 5 h, with 1 h done = the 6 h base
    await draw(TODAY, [done(), planned], at(12), "rest");
    expect(screen.getByText("Xong buổi này")).toBeTruthy();
    expect(screen.getByText("Bạn xong 1 việc rồi. Phần còn lại để mai.")).toBeTruthy();
    expect(screen.getByText("Để tuần sau, 1 việc")).toBeTruthy();
    expect(screen.queryByText("Đọc chương 4")).toBeNull();
    expect(screen.getByText(t("doneN", { n: 1 }))).toBeTruthy();
  });
  it("under the cap the usual rows show and no 'Xong buổi này' card", async () => {
    const planned = task({ title: "Đọc chương 4", start: at(11), end: at(13) }); // 2 h + 1 h done < 6 h
    await draw(TODAY, [done(), planned], at(12), "rest");
    expect(screen.queryByText("Xong buổi này")).toBeNull();
    expect(screen.queryByText("Để tuần sau, 1 việc")).toBeNull();
    expect(screen.getByText("Đọc chương 4")).toBeTruthy();
  });
});

describe("Day: running and completed tasks stay out of the upcoming list", () => {
  it("excludes the active Now-card task and completed tasks from 'Sau đó'", async () => {
    const finished = task({ id: "d1", title: "Bài đã xong", start: at(8), end: at(9), doneAt: at(9) });
    const running = task({ id: "r1", title: "Việc đang làm", start: at(10), end: at(11) });
    const later = task({ id: "u1", title: "Việc chiều nay", start: at(14), end: at(15) });
    await draw(TODAY, [finished, running, later], at(10, 30), "inl", { activeId: "r1", label: t("after") });
    expect(screen.getByText(t("after"))).toBeTruthy();
    expect(screen.getByText("Việc chiều nay")).toBeTruthy();
    expect(screen.queryByText("Việc đang làm")).toBeNull();
    expect(screen.queryByText("Bài đã xong")).toBeNull();
    expect(screen.getByText(t("doneN", { n: 1 }))).toBeTruthy();
  });

  it("when the running task is today's last, hides 'Sau đó' and shows no 'Chưa có việc nào' note", async () => {
    const running = task({ id: "r1", title: "Việc đang làm", start: at(10), end: at(11) });
    await draw(TODAY, [running], at(10, 30), "inl", { activeId: "r1", label: t("after") });
    expect(screen.queryByText(t("after"))).toBeNull();
    expect(screen.queryByText(t("noTasks"))).toBeNull();
  });
});
