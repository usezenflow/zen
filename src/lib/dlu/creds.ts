import * as SecureStore from "expo-secure-store";

export interface Creds {
  studentId: string;
  password: string;
  /** Portal `apikey` header; the portal rejects calls without it. */
  portalApiKey: string;
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
