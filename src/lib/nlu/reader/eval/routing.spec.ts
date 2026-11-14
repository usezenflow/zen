import { describe, expect, it } from "vitest";
import { held } from "./run";
import { ROUTING, route } from "./routing";

describe("routing", () => {
  for (const r of ROUTING)
    (held(r.phase) ? it : it.skip)(`${r.text} -> ${r.route}`, () => expect(route(r.text)).toBe(r.route));
});
