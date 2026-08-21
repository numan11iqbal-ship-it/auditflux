import {
  datetime,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  primaryUrl: varchar("primaryUrl", { length: 2048 }).notNull(),
  urlsJson: text("urlsJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const auditRuns = mysqlTable("audit_runs", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  overallScore: int("overallScore"),
  passCount: int("passCount").default(0).notNull(),
  warnCount: int("warnCount").default(0).notNull(),
  failCount: int("failCount").default(0).notNull(),
  naCount: int("naCount").default(0).notNull(),
  dataSourcesJson: text("dataSourcesJson").notNull(),
  sanitizedPayloadJson: text("sanitizedPayloadJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditMetrics = mysqlTable("audit_metrics", {
  id: int("id").autoincrement().primaryKey(),
  auditRunId: int("auditRunId").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  passCount: int("passCount").default(0).notNull(),
  warnCount: int("warnCount").default(0).notNull(),
  failCount: int("failCount").default(0).notNull(),
  naCount: int("naCount").default(0).notNull(),
  score: int("score"),
});

export const userSettings = mysqlTable("user_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  backendProxyUrl: varchar("backendProxyUrl", { length: 2048 }),
  entitlementTier: mysqlEnum("entitlementTier", ["Free", "Pro", "Enterprise"]).default("Free").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type AuditRun = typeof auditRuns.$inferSelect;
export type AuditMetric = typeof auditMetrics.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;

export type AuditDataSource = "LIVE" | "LAB" | "FIELD";
export type AuditCategory = "Performance" | "Accessibility" | "Best Practices" | "SEO";

export type SanitizedAuditPayload = {
  projectId: number;
  overallScore?: number | null;
  counts: { pass: number; warn: number; fail: number; na: number };
  dataSources: AuditDataSource[];
  categories: Array<{
    category: AuditCategory;
    score?: number | null;
    pass: number;
    warn: number;
    fail: number;
    na: number;
  }>;
  capturedAt?: string;
};
