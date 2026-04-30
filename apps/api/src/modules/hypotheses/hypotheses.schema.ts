import { z } from 'zod';

export const createHypothesisSchema = z.object({
  statement: z.string().trim().min(1).max(1000),
});

export const settleHypothesisSchema = z.object({
  status:        z.enum(['confirmed', 'refuted']),
  settledReason: z.string().trim().max(4000).optional(),
});

export const addEvidenceSchema = z.object({
  kind:    z.enum(['link', 'note', 'metric', 'log']),
  content: z.string().trim().min(1).max(4000),
});

export const investigationQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(7).max(730).default(90),
});
