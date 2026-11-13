import { expect, it } from "vitest";
import { joinPcm } from "./ears";

it("joins base64 PCM chunks in order", () => {
  const b = joinPcm([btoa("\x01\x02"), btoa("\x03")]);
  expect([...new Uint8Array(b)]).toEqual([1, 2, 3]);
});
