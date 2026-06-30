import { z } from 'zod';
import { USER_ROLES, UserRole } from '../enums';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Yönetici',
  SUPERVISOR: 'Sorumlu',
  OPERATOR: 'Operatör',
};

export const createUserSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
  fullName: z.string().min(2, 'Ad soyad gerekli'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
  role: z.enum(USER_ROLES as [UserRole, ...UserRole[]]).default(UserRole.OPERATOR),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(USER_ROLES as [UserRole, ...UserRole[]]),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;
