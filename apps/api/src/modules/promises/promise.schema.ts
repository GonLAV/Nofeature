import { z } from 'zod';

/**
 * Reject `javascript:` and other schemes that survive `z.string().url()`.
 * Evidence URLs are rendered as <a href> on the postmortem page, so we
 * must restrict to safe schemes.
 */
const safeUrl = z.string().url().max(2048).refine(
  (v) => /^https?:\/\//i.test(v),
  { message: 'URL must use http or https' },
);

const futureDate = z.coerce.date().refine(
  (d) => d.getTime() >= Date.now() - 24 * 60 * 60 * 1000,
  { message: 'Due date must not be more than 1 day in the past' },
);

export const createPromiseSchema = z.object({
  incidentId:  z.string().uuid(),
  title:       z.string().trim().min(1).max(280),
  detail:      z.string().trim().max(4000).optional(),
  ownerId:     z.string().uuid(),
  dueDate:     futureDate,
});

export const updatePromiseSchema = z.object({
  title:       z.string().trim().min(1).max(280).optional(),
  detail:      z.string().trim().max(4000).optional(),
  ownerId:     z.string().uuid().optional(),
  dueDate:     futureDate.optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' });

export const resolveSchema = z.object({
  evidenceUrl: safeUrl.optional(),
  reason:      z.string().trim().max(2000).optional(),
});

export const linkRecurrenceSchema = z.object({
  recurrenceIncidentId: z.string().uuid(),
  costMinutes:          z.number().nonnegative().max(1_000_000).default(0),
});

export const listFilterSchema = z.object({
  status:   z.enum(['open', 'kept', 'broken', 'cancelled']).optional(),
  ownerId:  z.string().uuid().optional(),
  incidentId: z.string().uuid().optional(),
  limit:    z.coerce.number().int().min(1).max(500).default(100),
});
