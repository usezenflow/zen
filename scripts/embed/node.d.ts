// Just what the embed scripts and the eval test use of Node: no @types/node in this project (same approach as
// src/lib/nlu/reader/eval/node.d.ts).
declare module "node:fs" {
  export function readFileSync(path: string | URL, enc: string): string;
  export function writeFileSync(path: string | URL, data: string): void;
  export function mkdirSync(path: string | URL, opts?: { recursive?: boolean }): void;
}
declare module "node:path" {
  export function join(...p: string[]): string;
  export function dirname(p: string): string;
}
declare module "node:url" {
  export function fileURLToPath(u: string | URL): string;
}
