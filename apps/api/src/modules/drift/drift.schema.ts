import { z } from 'zod';

export const driftQuerySchema = z.object({
  halfLifeMinutes: z.coerce.number().finite().min(5).max(60 * 24 * 30).default(60),
});

export const tenantDriftQuerySchema = z.object({
  halfLifeMinutes: z.coerce.number().finite().min(5).max(60 * 24 * 30).default(60),
  limit:           z.coerce.number().int().min(1).max(50).default(10),
  windowDays:      z.coerce.number().int().min(1).max(365).default(7),
});
