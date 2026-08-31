import { z } from 'zod';

const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

export const registerSchema = z.object({
  email:    z.string().email('Invalid email').toLowerCase().max(255),
  password: strongPassword,
  name:     z.string().min(2).max(100).trim(),
  tenantId: z.string().uuid('Invalid tenant ID'),
});

export const loginSchema = z.object({
  email:    z.string().email().toLowerCase().max(255),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword:     strongPassword,
});
