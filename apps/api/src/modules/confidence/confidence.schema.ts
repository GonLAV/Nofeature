import { z } from 'zod';

export const recordConfidenceSchema = z.object({
  confidence: z.number().finite().min(0).max(1),
  note:       z.string().trim().max(2000).optional(),
});

export const confidenceQuerySchema = z.object({
  dropThreshold: z.coerce.number().finite().min(0.05).max(1).default(0.2),
});
