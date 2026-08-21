import { describe, expect, it } from "vitest";
import { backendProxyInput, normalizeProxyUrl, projectInput, projectUpdateInput } from "./validation";

describe("project validation contracts", () => {
  it("accepts a tracked project with one or more valid URLs", () => {
    expect(projectInput.parse({ name: "Marketing site", primaryUrl: "https://example.com", urls: ["https://example.com", "https://example.com/pricing"] })).toMatchObject({ name: "Marketing site" });
  });

  it("rejects malformed URLs and invalid update identifiers", () => {
    expect(() => projectInput.parse({ name: "Site", primaryUrl: "not-a-url", urls: ["not-a-url"] })).toThrow();
    expect(() => projectUpdateInput.parse({ id: 0, name: "Renamed" })).toThrow();
  });
});

describe("backend proxy configuration", () => {
  it("normalizes a per-user proxy URL and permits clearing it", () => {
    expect(normalizeProxyUrl("https://proxy.example.com/ ")).toBe("https://proxy.example.com");
    expect(backendProxyInput.parse({ backendProxyUrl: "" })).toEqual({ backendProxyUrl: "" });
    expect(normalizeProxyUrl("   ")).toBeNull();
  });

  it("rejects non-URL proxy values", () => {
    expect(() => backendProxyInput.parse({ backendProxyUrl: "proxy" })).toThrow();
  });
});
