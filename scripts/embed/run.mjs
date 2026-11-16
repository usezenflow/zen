// Runs one TypeScript script with Vite's SSR loader (resolves the app's extensionless imports, no tsx needed).
// Usage: node scripts/embed/run.mjs scripts/embed/dump_terms.ts [args...]
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// vite is a transitive dependency (pnpm keeps it under .pnpm), so find it there.
const store = join(process.cwd(), "node_modules/.pnpm");
const dir = readdirSync(store).find((d) => /^vite@\d/.test(d));
const { createServer } = await import(join(store, dir, "node_modules/vite/dist/node/index.js"));

const [file, ...args] = process.argv.slice(2);
process.argv = [process.argv[0], resolve(file), ...args];
// STUB_CLASSIFY=1: frame.ts's "./classify" resolves to a stub, so frameOf() shows the rule pass alone.
const alias = process.env.STUB_CLASSIFY ? [{ find: /^\.\/classify$/, replacement: resolve("scripts/embed/stub_classify.ts") }] : [];
const server = await createServer({ root: process.cwd(), configFile: false, logLevel: "error", resolve: { alias }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  await server.ssrLoadModule(resolve(file));
} finally {
  await server.close();
}
