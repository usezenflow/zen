import { setupServer } from "msw/node";
import { handlers } from "./handlers.ts";

export const server = setupServer(...handlers);
export { calls } from "./handlers.ts";
