import { useColorScheme } from "react-native";

export function useTheme() {
  const dark = useColorScheme() === "dark";
  return dark
    ? { dark, bg: "#14110d", card: "#221d16", text: "#fff7ea", muted: "#a99c88", sun: "#f59e0b", line: "#3a3228", red: "#ef4444" }
    : { dark, bg: "#fff8ec", card: "#ffffff", text: "#2a2118", muted: "#8a7a64", sun: "#f59e0b", line: "#eadfca", red: "#dc2626" };
}
export type Theme = ReturnType<typeof useTheme>;
