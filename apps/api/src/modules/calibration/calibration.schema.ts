import { z } from 'zod';

const CATEGORY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

export const createPredictionSchema = z.object({
  incidentId: z.string().uuid(),
  statement:  z.string().trim().min(1).max(2000),
  category:   z.string().trim().regex(CATEGORY_RE, 'Use snake_case identifier'),
  confidence: z.number().finite().min(0).max(1),
});

export const resolvePredictionSchema = z.object({
  correct:        z.boolean(),
  resolutionNote: z.string().trim().max(2000).optional(),
});

export const listFilterSchema = z.object({
  incidentId: z.string().uuid().optional(),
  userId:     z.string().uuid().optional(),
  category:   z.string().trim().regex(CATEGORY_RE).optional(),
  resolved:   z.enum(['true', 'false']).optional(),
  limit:      z.coerce.number().int().min(1).max(500).default(100),
});

export const calibrationQuerySchema = z.object({
  userId:   z.string().uuid().optional(),
  category: z.string().trim().regex(CATEGORY_RE).optional(),
  binCount: z.coerce.number().int().min(2).max(50).default(10),
  /** Look-back window in days. Bounds memory and keeps recent skill front-and-center. */
  windowDays: z.coerce.number().int().min(7).max(730).default(180),
});
