import { render, screen } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Day } from "./day";
import { at, DAY, HOUR, NOW, TODAY, task } from "../../test/factories";

// Gesture events take RNGH's JS path: the Reanimated mock has no native event bridge.
jest.mock("react-native-gesture-handler/lib/module/handlers/gestures/reanimatedWrapper", () => ({ Reanimated: undefined, Worklets: undefined }));

// A daily repeat's occurrence on `day`: no time yet (start undefined), the day's own due at midnight after it.
const occurrence = (day: number) => task({ title: "Đọc 10 cuốn sách", kind: "study", effort: 90, rrule: "FREQ=DAILY", start: undefined, end: undefined, notBefore: day + 7 * HOUR, deadline: day + DAY });

const draw = async (day: number, tasks: ReturnType<typeof task>[], now = NOW, empty?: "rest") => render(
  <GestureHandlerRootView>
    <Day tasks={tasks} hols={new Map()} day={day} now={now} empty={empty} pop={new Set()} overlaps={[]} trail={{}} moves={[]} warns={[]} rules={[]}
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
    expect(screen.getByText("Có giờ khi vào 30 ngày tới")).toBeTruthy();
  });

  it("inside the 30-day plan an occurrence with no slot shows as 'Chưa có giờ trống', with no 30-day note", async () => {
    const day5 = TODAY + 5 * DAY;
    await draw(day5, [occurrence(day5)]);
    expect(screen.queryByText("Chưa xếp giờ")).toBeNull();
    expect(screen.getByText("Chưa có giờ trống")).toBeTruthy();
    expect(screen.queryByText("Có giờ khi vào 30 ngày tới")).toBeNull();
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
    await draw(TODAY, [done, tomorrow], at(20), "rest");
    expect(screen.getByText("Hôm nay xong rồi")).toBeTruthy();
    expect(screen.getByText("Mai 8:00, Đọc chương 4")).toBeTruthy();
  });
});
