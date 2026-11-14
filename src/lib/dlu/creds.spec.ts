import { expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({}));
import { forget, hasLms, hasPortal, type Creds } from "./creds";

const C: Creds = { studentId: "1", password: "p", lmsPassword: "q", portalApiKey: "k" };

it("forgetting one account leaves the other working", () => {
  const noPortal = forget(C, "portal");
  expect([hasPortal(noPortal), hasLms(noPortal)]).toEqual([false, true]); 
  const noLms = forget(C, "lms");
  expect([hasPortal(noLms), hasLms(noLms)]).toEqual([true, false]);
  expect(hasLms(forget(noLms, "portal")) || hasPortal(forget(noLms, "portal"))).toBe(false);
  expect(hasLms({ ...C, lmsPassword: undefined })).toBe(false); // no fallback to the portal password
});
