import { z } from 'zod';

const SLUG_RE = /^[a-z][a-z0-9-]{1,63}$/;

export const taxonomyEntrySchema = z.object({
  slug:        z.string().trim().regex(SLUG_RE, 'Use kebab-case slug'),
  label:       z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).optional(),
});

export const tagFailureModeSchema = z.object({
  failureModeSlug: z.string().trim().regex(SLUG_RE),
  confidence:      z.number().finite().min(0).max(1).default(1),
});

export const applyMitigationSchema = z.object({
  mitigationSlug:    z.string().trim().regex(SLUG_RE),
  effective:         z.boolean().optional(),
  mttrDeltaSeconds:  z.number().finite().int().min(-86_400 * 30).max(86_400 * 30).optional(),
  notes:             z.string().trim().max(4000).optional(),
});

export const updateMitigationSchema = z.object({
  effective:         z.boolean().optional(),
  mttrDeltaSeconds:  z.number().finite().int().min(-86_400 * 30).max(86_400 * 30).optional(),
  notes:             z.string().trim().max(4000).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' });

export const memoryQuerySchema = z.object({
  failureModeSlug: z.string().trim().regex(SLUG_RE),
  windowDays:      z.coerce.number().int().min(7).max(730).default(365),
});

export const recommendQuerySchema = z.object({
  windowDays:      z.coerce.number().int().min(7).max(730).default(365),
});
