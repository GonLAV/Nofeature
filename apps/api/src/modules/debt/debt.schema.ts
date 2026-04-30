/**
 * Cognitive Debt Ledger \u2014 schema validators.
 */

import { z } from 'zod';

export const declareDebtSchema = z.object({
  category: z.enum([
    'rate_limit_raised','feature_flag_flipped','retry_added',
    'capacity_scaled','alert_silenced','monkey_patch','config_override',
    'data_repaired','rollback','other',
  ]),
  title:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  surface:     z.number().int().min(1).max(5).default(1),
  principal:   z.number().min(0).max(100).default(1),
});

export const repayDebtSchema = z.object({
  repaymentUrl:  z.string().url().optional(),
  repaymentNote: z.string().max(2000).optional(),
});
