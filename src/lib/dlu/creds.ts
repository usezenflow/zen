import * as SecureStore from "expo-secure-store";

export interface Creds {
  studentId: string;
  /** Empty when the portal account is disconnected. */
  password: string;
  /** LMS password; none means the LMS is not connected (no fallback to the portal one). */
  lmsPassword?: string;
  /** Portal `apikey` header; the portal rejects calls without it. */
  portalApiKey: string;
  /** Set when the LMS account is disconnected. */
  lmsOff?: boolean;
  portalUrl?: string;
  lmsUrl?: string;
}

const KEY = "dlu.creds";

export const saveCreds = (c: Creds) => SecureStore.setItemAsync(KEY, JSON.stringify(c));
export const clearCreds = () => SecureStore.deleteItemAsync(KEY);
export async function loadCreds(): Promise<Creds | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  const c = JSON.parse(raw) as Creds;
  // Older installs used the portal password for the LMS when it had none of its own: keep those connected.
  return !c.lmsOff && !c.lmsPassword && c.password ? { ...c, lmsPassword: c.password } : c;
}

/** Each account has its own password; a blank one means that source is not connected. */
export const hasPortal = (c: Creds) => !!c.password;
export const hasLms = (c: Creds) => !c.lmsOff && !!c.lmsPassword;

/** The creds with one account forgotten. */
export const forget = (c: Creds, which: "portal" | "lms"): Creds =>
  which === "lms" ? { ...c, lmsOff: true, lmsPassword: undefined } : { ...c, password: "" };
