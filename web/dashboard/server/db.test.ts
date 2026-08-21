import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb, getPerformanceMetrics, getUserSettings, listAuditRuns, listProjects } from "./db";

describe("database helpers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fail safely without a configured database connection", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await getDb()).toBeNull();
    expect(await listProjects(42)).toEqual([]);
    expect(await listAuditRuns(42)).toEqual([]);
    expect(await getPerformanceMetrics(42)).toEqual([]);
    expect(await getUserSettings(42)).toBeUndefined();
  });
});
