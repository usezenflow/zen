import { expect, it } from "vitest";
import { mine } from "./mine";

it("mines commands, verb-led creates and undone commands from a dev log, one per line said", () => {
  const log = [
    ` LOG  [heard] {"via":"voice","text":"xoá gym","alternatives":["xoá gym","xoá jim"],"actions":[{"op":"delete","target":"a1"}]}`,
    ` LOG  [heard] {"via":"type","text":"mua sữa","actions":[{"op":"create","title":"Mua sữa"}]}`,
    ` LOG  [heard] {"via":"type","text":"dời họp sang 3h","actions":[{"op":"create","title":"Dời họp"}]}`,
    ` LOG  [undo-after-command] {"via":"voice","text":"xoá yoga","ones":[{"label":"xoá Yoga sáng"}]}`,
    ` LOG  [heard] {broken`,
  ].join("\n");
  expect(mine(log)).toEqual([
    { text: "xoá gym", from: "heard", ops: [{ op: "delete" }], alts: ["xoá jim"] },
    { text: "dời họp sang 3h", from: "heard", create: true },
    { text: "xoá yoga", from: "undone", wrong: ["xoá Yoga sáng"] },
  ]);
});
