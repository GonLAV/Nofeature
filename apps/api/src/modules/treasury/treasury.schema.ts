import { z } from 'zod';

export const createAccountSchema = z.object({
  serviceName: z.string().min(1).max(120),
  sloTarget:   z.number().gt(0).lt(1),
  windowDays:  z.number().int().min(1).max(365).default(30),
});

export const txSchema = z.object({
  minutes:    z.number().positive().max(1_000_000),
  incidentId: z.string().uuid().optional(),
  note:       z.string().max(2000).optional(),
});
