import { z } from 'zod';
import { emailSchema, passwordSchema } from './common';

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginInputSchema = z.object({
  email: emailSchema,
  // Not `passwordSchema`: an existing password predates any rule change, and
  // rejecting it here would lock someone out of their own account.
  password: z.string().min(1, 'Enter your password'),
});

export const forgotInputSchema = z.object({ email: emailSchema });

export const resetInputSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type ForgotInput = z.infer<typeof forgotInputSchema>;
export type ResetInput = z.infer<typeof resetInputSchema>;
