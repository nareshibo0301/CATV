import { z } from 'zod';
import type { AdminType, Role } from './roles';

export const ACCESS_COOKIE = 'catv_access';
export const REFRESH_COOKIE = 'catv_refresh';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  role: Role;
  adminType: AdminType | null;
  email: string;
  name: string;
}
