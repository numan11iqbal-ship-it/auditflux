import type { AuditCategory, AuditDataSource, SanitizedAuditPayload } from "../drizzle/schema";

const SOURCES = new Set<AuditDataSource>(["LIVE", "LAB", "FIELD"]);
const CATEGORIES = new Set<AuditCategory>(["Performance", "Accessibility", "Best Practices", "SEO"]);
const SECRET_KEYS = /api.?key|authorization|token|secret|password/i;

function safeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function safeScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

function removeSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEYS.test(key)).map(([key, nested]) => [key, removeSecrets(nested)]));
}

export function sanitizeAuditPayload(input: Record<string, unknown>): SanitizedAuditPayload {
  const countsInput = (input.counts && typeof input.counts === "object" ? input.counts : {}) as Record<string, unknown>;
  const sourceValues = Array.isArray(input.dataSources) ? input.dataSources : [];
  const dataSources = Array.from(new Set(sourceValues.filter((value): value is AuditDataSource => typeof value === "string" && SOURCES.has(value as AuditDataSource))));
  const categoryValues = Array.isArray(input.categories) ? input.categories : [];
  const categories = categoryValues.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const category = item.category;
    if (typeof category !== "string" || !CATEGORIES.has(category as AuditCategory)) return [];
    return [{
      category: category as AuditCategory,
      score: safeScore(item.score),
      pass: safeCount(item.pass),
      warn: safeCount(item.warn),
      fail: safeCount(item.fail),
      na: safeCount(item.na),
    }];
  });

  const projectId = typeof input.projectId === "number" && Number.isInteger(input.projectId) && input.projectId > 0 ? input.projectId : 0;
  if (!projectId) throw new Error("A valid projectId is required");

  return {
    projectId,
    overallScore: safeScore(input.overallScore),
    counts: {
      pass: safeCount(countsInput.pass),
      warn: safeCount(countsInput.warn),
      fail: safeCount(countsInput.fail),
      na: safeCount(countsInput.na),
    },
    dataSources,
    categories,
    capturedAt: typeof input.capturedAt === "string" ? input.capturedAt : undefined,
  };
}

export function getPublicTierLimits(tier: "Free" | "Pro" | "Enterprise") {
  return {
    Free: { projects: 3, monthlyAudits: 25, historyDays: 7 },
    Pro: { projects: 25, monthlyAudits: 500, historyDays: 90 },
    Enterprise: { projects: "Unlimited", monthlyAudits: "Unlimited", historyDays: "Unlimited" },
  }[tier];
}
