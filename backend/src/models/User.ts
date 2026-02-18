import { z } from 'zod';

export type UserRole = 'admin' | 'viewer';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type LoginInput = z.infer<typeof LoginSchema>;
