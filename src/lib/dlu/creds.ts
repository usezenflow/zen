import * as SecureStore from "expo-secure-store";

export interface Creds {
  studentId: string;
  /** Empty when the portal account is disconnected. */
  password: string;
  /** LMS password when it differs from the portal one. */
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
  return raw ? (JSON.parse(raw) as Creds) : null;
}

/** Portal needs the portal password; the LMS reuses it unless it has its own. */
export const hasPortal = (c: Creds) => !!c.password;
export const hasLms = (c: Creds) => !c.lmsOff && !!(c.lmsPassword || c.password);

/** The creds with one account forgotten; the LMS keeps working on the old shared password. */
export const forget = (c: Creds, which: "portal" | "lms"): Creds =>
  which === "lms" ? { ...c, lmsOff: true } : { ...c, lmsPassword: c.lmsPassword || c.password, password: "" };
