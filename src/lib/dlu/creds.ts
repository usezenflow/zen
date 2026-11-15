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
  /** Sessions kept between syncs so a login is not repeated each time; `exp` is epoch ms. A refused one is replaced by a fresh login. */
  portalToken?: PortalToken;
  lmsSession?: LmsSession;
}
export type PortalToken = { t: string; exp: number };
/** `cookie` is the signed-in `MoodleSession=…`; sessions kept from before it was carried lack it and get replaced. */
export type LmsSession = { sesskey: string; cookie?: string; exp: number };

const KEY = "dlu.creds";

// Readable after the first unlock since boot, so the background sync can sign in while the phone is locked.
export const saveCreds = (c: Creds) => SecureStore.setItemAsync(KEY, JSON.stringify(c), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
export const clearCreds = () => SecureStore.deleteItemAsync(KEY);
export async function loadCreds(): Promise<Creds | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Creds; // a blank LMS password stays blank: no falling back to the portal one
}

/** Each account has its own password; a blank one means that source is not connected. */
export const hasPortal = (c: Creds) => !!c.password;
export const hasLms = (c: Creds) => !c.lmsOff && !!c.lmsPassword;

/** The creds with one account forgotten. */
export const forget = (c: Creds, which: "portal" | "lms"): Creds =>
  which === "lms" ? { ...c, lmsOff: true, lmsPassword: undefined, lmsSession: undefined } : { ...c, password: "", portalToken: undefined };
