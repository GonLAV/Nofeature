import { z } from 'zod';

export const createIncidentSchema = z.object({
  title:           z.string().min(5).max(200),
  description:     z.string().min(10).max(5000),
  severity:        z.enum(['P1', 'P2', 'P3', 'P4']),
  affectedSystems: z.array(z.string()).optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['open', 'investigating', 'resolved', 'closed']),
});
