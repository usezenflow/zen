import { Text, type StyleProp, type TextStyle } from "react-native";
import { ff } from "@/lib/theme";

/** A sentence from t() with its task title (wrapped by i18n `fill`) set in bold, as children of the caller's <Text>. */
export const bolded = (s: string, style?: StyleProp<TextStyle>) =>
  s.split(/⁣([^⁤]*)⁤/).map((p, i) => (i % 2 ? <Text key={i} style={[{ fontFamily: ff("700") }, style]}>{p}</Text> : p));
