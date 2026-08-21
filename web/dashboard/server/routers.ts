import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { backendProxyInput, normalizeProxyUrl, projectInput, projectUpdateInput } from "./validation";
import { getPublicTierLimits, sanitizeAuditPayload } from "./audit";
import {
  createProject,
  deleteProject,
  getPerformanceMetrics,
  getUserSettings,
  listAuditRuns,
  listProjects,
  saveAuditPayload,
  saveBackendProxyUrl,
  updateProject,
} from "./db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const auditPayloadInput = z.object({
  projectId: z.number().int().positive(),
  overallScore: z.number().nullable().optional(),
  counts: z.object({ pass: z.number(), warn: z.number(), fail: z.number(), na: z.number() }),
  dataSources: z.array(z.enum(["LIVE", "LAB", "FIELD"])),
  categories: z.array(z.object({
    category: z.enum(["Performance", "Accessibility", "Best Practices", "SEO"]),
    score: z.number().nullable().optional(),
    pass: z.number(), warn: z.number(), fail: z.number(), na: z.number(),
  })),
  capturedAt: z.string().optional(),
  rawEvidence: z.unknown().optional(),
});

function userId(ctx: { user: { id: number } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return ctx.user.id;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  projects: router({
    list: protectedProcedure.query(({ ctx }) => listProjects(userId(ctx))),
    create: protectedProcedure.input(projectInput).mutation(({ ctx, input }) => createProject(userId(ctx), input)),
    update: protectedProcedure.input(projectUpdateInput).mutation(({ ctx, input }) => {
      const { id, ...changes } = input;
      return updateProject(userId(ctx), id, changes);
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => deleteProject(userId(ctx), input.id)),
  }),
  audits: router({
    history: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => listAuditRuns(userId(ctx), input?.projectId)),
    performance: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getPerformanceMetrics(userId(ctx), input?.projectId)),
    ingest: protectedProcedure.input(auditPayloadInput).mutation(({ ctx, input }) => {
      const sanitized = sanitizeAuditPayload(input);
      return saveAuditPayload(userId(ctx), sanitized);
    }),
  }),
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getUserSettings(userId(ctx));
      const tier = settings?.entitlementTier ?? "Free";
      return { ...settings, entitlementTier: tier, limits: getPublicTierLimits(tier) };
    }),
    saveProxy: protectedProcedure.input(backendProxyInput).mutation(({ ctx, input }) => saveBackendProxyUrl(userId(ctx), normalizeProxyUrl(input.backendProxyUrl))),
    testProxy: protectedProcedure.input(z.object({ backendProxyUrl: z.string().url().max(2048) })).mutation(async ({ input }) => {
      try {
        const response = await fetch(new URL("/health", input.backendProxyUrl), { signal: AbortSignal.timeout(5000) });
        return { ok: response.ok, status: response.status };
      } catch {
        return { ok: false, status: 0 };
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
