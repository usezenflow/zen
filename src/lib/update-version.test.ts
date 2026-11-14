import { describe, expect, it } from "vitest";
import { APK, newer, notesOf, pickUpdate } from "./update-version";

const url = "https://github.com/usezenflow/zen/releases/download/v1.1.0/zen-android.apk";
const rel = { tag_name: "v1.1.0", html_url: "https://github.com/usezenflow/zen/releases/tag/v1.1.0", body: "## 1.1.0\n- Một\n* Hai\nkhác", assets: [{ name: APK, browser_download_url: url }] };

describe("update-version", () => {
  it("compares x.y.z", () => {
    expect(newer("1.10.0", "1.9.9")).toBe(true);
    expect(newer("v2.0.0", "1.99.99")).toBe(true);
    expect(newer("1.0.0", "1.0.0")).toBe(false);
    expect(newer("1.0.0", "1.0.1")).toBe(false);
    expect(newer("1.1.0-beta.1", "1.0.0")).toBe(false);
  });
  it("reads bullets only", () => expect(notesOf(rel.body)).toEqual(["Một", "Hai"]));
  it("drops the changesets commit hash", () =>
    expect(notesOf("### Major Changes\n\n- 1a2b3c4: Bản đầu tiên\n  - Widget")).toEqual(["Bản đầu tiên", "Widget"]));
  it("offers a newer release with our asset", () => {
    expect(pickUpdate(rel, "1.0.0", APK)).toEqual({ version: "1.1.0", url, page: rel.html_url, notes: ["Một", "Hai"] });
    expect(pickUpdate(rel, "1.1.0", APK)).toBeNull();
    expect(pickUpdate({ ...rel, draft: true }, "1.0.0", APK)).toBeNull();
    expect(pickUpdate(rel, "1.0.0", "zen-ios-unsigned.ipa")).toBeNull();
    expect(pickUpdate({ ...rel, assets: [{ name: APK, browser_download_url: "https://evil.example/zen-android.apk" }] }, "1.0.0", APK)).toBeNull();
    expect(pickUpdate(null, "1.0.0", APK)).toBeNull();
  });
});
