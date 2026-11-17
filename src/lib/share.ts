import type { ResolvedSharePayload } from "expo-sharing";

/** One thing shared into zen from another app (the system share sheet). */
export type Shared = { kind: "text" | "url" | "image" | "pdf"; value: string };

/** Which capture path reads it: the same ones as Gõ ("type"), Ảnh ("photo") and PDF ("pdf"). */
export type Via = "type" | "photo" | "pdf";

/** An expo-sharing payload as zen reads it, or null for a type zen does not read (the share filters keep those out). */
export function sharedOf(p: ResolvedSharePayload): Shared | null {
  const mime = p.contentMimeType ?? p.mimeType ?? "";
  if (p.shareType === "url" && p.value) return { kind: "url", value: p.value };
  if (p.contentUri && mime.startsWith("image/")) return { kind: "image", value: p.contentUri };
  if (p.contentUri && mime === "application/pdf") return { kind: "pdf", value: p.contentUri };
  if (p.shareType === "text" && p.value.trim()) return { kind: "text", value: p.value };
  return null;
}

/** Text and links go to the typed reader, a picture to the photo read, a PDF to the PDF read. */
export const viaOf = (s: Shared): Via => (s.kind === "image" ? "photo" : s.kind === "pdf" ? "pdf" : "type");
