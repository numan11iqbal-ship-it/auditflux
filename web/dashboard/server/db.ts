import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditMetrics,
  auditRuns,
  InsertUser,
  projects,
  SanitizedAuditPayload,
  userSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
}

export async function createProject(userId: number, input: { name: string; primaryUrl: string; urls: string[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(projects).values({
    userId,
    name: input.name.trim(),
    primaryUrl: input.primaryUrl.trim(),
    urlsJson: JSON.stringify(input.urls.map(url => url.trim()).filter(Boolean)),
  });
  return { id: Number(result[0].insertId) };
}

export async function updateProject(userId: number, projectId: number, input: { name?: string; primaryUrl?: string; urls?: string[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: Partial<typeof projects.$inferInsert> = {};
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.primaryUrl !== undefined) values.primaryUrl = input.primaryUrl.trim();
  if (input.urls !== undefined) values.urlsJson = JSON.stringify(input.urls.map(url => url.trim()).filter(Boolean));
  if (!Object.keys(values).length) return;
  await db.update(projects).set(values).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

export async function deleteProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

export async function listAuditRuns(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const condition = projectId
    ? and(eq(auditRuns.userId, userId), eq(auditRuns.projectId, projectId))
    : eq(auditRuns.userId, userId);
  return db.select().from(auditRuns).where(condition).orderBy(desc(auditRuns.createdAt));
}

export async function getPerformanceMetrics(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ metric: auditMetrics, run: auditRuns })
    .from(auditMetrics)
    .innerJoin(auditRuns, eq(auditMetrics.auditRunId, auditRuns.id))
    .where(projectId ? and(eq(auditRuns.userId, userId), eq(auditRuns.projectId, projectId)) : eq(auditRuns.userId, userId))
    .orderBy(desc(auditRuns.createdAt));
  return rows;
}

export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return result[0];
}

export async function saveBackendProxyUrl(userId: number, backendProxyUrl: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(userSettings).values({ userId, backendProxyUrl }).onDuplicateKeyUpdate({ set: { backendProxyUrl } });
}

export async function saveAuditPayload(userId: number, payload: SanitizedAuditPayload) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(auditRuns).values({
    userId,
    projectId: payload.projectId,
    overallScore: payload.overallScore ?? null,
    passCount: payload.counts.pass,
    warnCount: payload.counts.warn,
    failCount: payload.counts.fail,
    naCount: payload.counts.na,
    dataSourcesJson: JSON.stringify(payload.dataSources),
    sanitizedPayloadJson: JSON.stringify(payload),
  });
  const auditRunId = Number(result[0].insertId);
  if (payload.categories.length) {
    await db.insert(auditMetrics).values(payload.categories.map(category => ({
      auditRunId,
      category: category.category,
      score: category.score ?? null,
      passCount: category.pass,
      warnCount: category.warn,
      failCount: category.fail,
      naCount: category.na,
    })));
  }
  return { id: auditRunId };
}
