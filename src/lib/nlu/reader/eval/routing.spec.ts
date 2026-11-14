import { describe, expect, it } from "vitest";
import { CURRENT_PHASE } from "./run";
import { ROUTING, route } from "./routing";

describe("routing", () => {
  for (const r of ROUTING)
    ((r.phase ?? 0) <= CURRENT_PHASE ? it : it.skip)(`${r.text} -> ${r.route}`, () => expect(route(r.text)).toBe(r.route));
});
