// Just what the eval harness uses of Node, so no @types/node is needed.
declare module "node:fs" {
  export function readFileSync(path: string, enc: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function writeFileSync(path: string, data: string): void;
}
declare module "node:path" {
  export function join(...p: string[]): string;
}
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void }; cpuUsage(prev?: { user: number; system: number }): { user: number; system: number } };
