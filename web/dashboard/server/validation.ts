import { z } from "zod";

export const projectInput = z.object({
  name: z.string().trim().min(1).max(160),
  primaryUrl: z.string().url().max(2048),
  urls: z.array(z.string().url().max(2048)).min(1).max(100),
});

export const projectUpdateInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(160).optional(),
  primaryUrl: z.string().url().max(2048).optional(),
  urls: z.array(z.string().url().max(2048)).min(1).max(100).optional(),
});

export const backendProxyInput = z.object({
  backendProxyUrl: z.union([z.string().url().max(2048), z.literal("")]),
});

export function normalizeProxyUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const url = new URL(trimmed);
  return url.toString().replace(/\/$/, "");
}
