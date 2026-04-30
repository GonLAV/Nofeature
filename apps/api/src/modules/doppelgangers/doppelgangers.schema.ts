import { z } from 'zod';

export const searchDoppelgangersSchema = z.object({
  q:     z.string().trim().min(2).max(2000),
  tags:  z.array(z.string().trim().min(1).max(120)).max(50).optional().default([]),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const incidentDoppelgangersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
