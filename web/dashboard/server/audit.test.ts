import { describe, expect, it } from "vitest";
import { getPublicTierLimits, sanitizeAuditPayload } from "./audit";

describe("sanitizeAuditPayload", () => {
  it("keeps only supported sources and categories and never persists API keys", () => {
    const result = sanitizeAuditPayload({
      projectId: 7,
      overallScore: 83.4,
      counts: { pass: 4.8, warn: 2, fail: -1, na: 3 },
      dataSources: ["LIVE", "LAB", "FIELD", "UNKNOWN"],
      categories: [
        { category: "Performance", score: 91, pass: 5, warn: 1, fail: 0, na: 2 },
        { category: "Not real", score: 99, pass: 99, warn: 0, fail: 0, na: 0 },
      ],
      apiKey: "AIza-secret-must-not-survive",
      rawEvidence: { authorization: "Bearer secret", apiKey: "another-secret" },
    });

    expect(result).toMatchObject({
      projectId: 7,
      overallScore: 83,
      counts: { pass: 4, warn: 2, fail: 0, na: 3 },
      dataSources: ["LIVE", "LAB", "FIELD"],
      categories: [{ category: "Performance", score: 91, pass: 5, warn: 1, fail: 0, na: 2 }],
    });
    expect(JSON.stringify(result)).not.toContain("AIza-secret");
    expect(JSON.stringify(result)).not.toContain("another-secret");
  });

  it("rejects a missing project id instead of creating an unscoped run", () => {
    expect(() => sanitizeAuditPayload({ projectId: 0, counts: {}, dataSources: [], categories: [] })).toThrow("projectId");
  });
});

describe("getPublicTierLimits", () => {
  it("returns exact supported entitlement tiers", () => {
    expect(getPublicTierLimits("Free")).toEqual({ projects: 3, monthlyAudits: 25, historyDays: 7 });
    expect(getPublicTierLimits("Pro")).toEqual({ projects: 25, monthlyAudits: 500, historyDays: 90 });
    expect(getPublicTierLimits("Enterprise")).toEqual({ projects: "Unlimited", monthlyAudits: "Unlimited", historyDays: "Unlimited" });
  });
});
