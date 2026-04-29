import { z } from 'zod';

export const registerSchema = z.object({
  email:    z.string().email('Invalid email').toLowerCase(),
  password: z.string().min(8).regex(/[A-Z]/, 'Need uppercase').regex(/[0-9]/, 'Need number'),
  name:     z.string().min(2).max(100),
  tenantId: z.string().uuid('Invalid tenant ID'),
});

export const loginSchema = z.object({
  email:    z.string().email().toLowerCase(),
  password: z.string().min(1),
});
