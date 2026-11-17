// A share from another app opens expo-sharing://… ; send it to Home, which reads it. Every other link passes through unchanged.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return new URL(path, "zen://").hostname === "expo-sharing" ? "/" : path;
  } catch {
    return path;
  }
}
