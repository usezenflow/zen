import type { ResolvedSharePayload } from "expo-sharing";
import { expect, it } from "vitest";
import { sharedOf, viaOf } from "./share";

const P = (x: object) => x as ResolvedSharePayload; // the resolved payload's union, as expo-sharing returns it
const text = { value: "", shareType: "text", mimeType: "text/plain", contentUri: null, contentType: undefined, contentMimeType: null, originalName: null, contentSize: null };

it("maps each shared kind to the capture path it reads by", () => {
  expect(viaOf({ kind: "text", value: "Nộp bài 20/11" })).toBe("type");
  expect(viaOf({ kind: "url", value: "https://online.dlu.edu.vn" })).toBe("type");
  expect(viaOf({ kind: "image", value: "file:///cache/a.jpg" })).toBe("photo");
  expect(viaOf({ kind: "pdf", value: "file:///cache/b.pdf" })).toBe("pdf");
});

it("reads an expo-sharing payload as text, link, picture or PDF", () => {
  expect(sharedOf(P({ ...text, value: "Lịch thi" }))).toEqual({ kind: "text", value: "Lịch thi" });
  expect(sharedOf(P({ ...text, shareType: "url", value: "https://x.test" }))).toEqual({ kind: "url", value: "https://x.test" });
  expect(sharedOf(P({ ...text, shareType: "image", mimeType: "image/jpeg", value: "file:///c/p.jpg", contentUri: "file:///c/p.jpg", contentType: "image", contentMimeType: "image/jpeg" }))).toEqual({ kind: "image", value: "file:///c/p.jpg" });
  expect(sharedOf(P({ ...text, shareType: "file", mimeType: "application/pdf", value: "file:///c/d.pdf", contentUri: "file:///c/d.pdf", contentType: "file", contentMimeType: "application/pdf" }))).toEqual({ kind: "pdf", value: "file:///c/d.pdf" });
});

it("drops what zen does not read, and blank text", () => {
  expect(sharedOf(P({ ...text, shareType: "file", mimeType: "audio/mpeg", value: "file:///c/a.mp3", contentUri: "file:///c/a.mp3", contentType: "audio", contentMimeType: "audio/mpeg" }))).toBeNull();
  expect(sharedOf(P({ ...text, value: "   " }))).toBeNull();
  expect(sharedOf(P({ ...text, shareType: "image", mimeType: "image/png", value: "file:///c/p.png", contentUri: null }))).toBeNull();
});
