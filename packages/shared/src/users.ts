import { z } from 'zod';
import { ROLES, USER_STATUSES, type Role } from './roles';

export const MANAGED_ROLES = ['DISTRIBUTOR', 'OPERATOR', 'CUSTOMER'] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export const ATTRIBUTE_DATA_TYPES = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'] as const;
export type AttributeDataType = (typeof ATTRIBUTE_DATA_TYPES)[number];

export const COMMISSION_TYPES = ['PERCENTAGE', 'FIXED'] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

export const commissionInputSchema = z.object({
  type: z.enum(COMMISSION_TYPES),
  value: z.number().nonnegative(),
});

export type CommissionInput = z.infer<typeof commissionInputSchema>;

export const createUserSchema = z.object({
  role: z.enum(MANAGED_ROLES),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  password: z
    .string()
    .min(10)
    .max(128)
    .regex(/[A-Za-z]/, 'Include a letter.')
    .regex(/\d/, 'Include a number.'),
  parentId: z.string().uuid().nullable().optional(),
  customData: z.record(z.unknown()).optional(),
  commission: commissionInputSchema.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: z.string().trim().max(20).nullable().optional().or(z.literal('')),
  password: z
    .string()
    .min(10)
    .max(128)
    .regex(/[A-Za-z]/, 'Include a letter.')
    .regex(/\d/, 'Include a number.')
    .optional(),
  customData: z.record(z.unknown()).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userListQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  parentId: z.string().uuid().optional(),
  attributeKey: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,40}$/)
    .optional(),
  attributeValue: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['name', 'email', 'userCode', 'createdAt', 'status']).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;

const prefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,7}$/);

export const idPrefixUpdateSchema = z.object({
  padding: z.number().int().min(3).max(8),
  prefixes: z.object({
    DISTRIBUTOR: prefixSchema,
    OPERATOR: prefixSchema,
    CUSTOMER: prefixSchema,
  }),
});

export type IdPrefixUpdate = z.infer<typeof idPrefixUpdateSchema>;

export const attributeDefinitionSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().trim().min(1).max(80),
  dataType: z.enum(ATTRIBUTE_DATA_TYPES),
  options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  required: z.boolean().default(false),
  applicableRoles: z.array(z.enum(ROLES)).max(4).default([]),
  targetUserId: z.string().uuid().nullable().optional(),
});

export type AttributeDefinitionInput = z.infer<typeof attributeDefinitionSchema>;

export function commissionIsRequired(role: ManagedRole, parentRole: Role | null): boolean {
  if (role === 'DISTRIBUTOR') {
    return true;
  }
  return role === 'OPERATOR' && parentRole === 'DISTRIBUTOR';
}

export function formatUserCode(prefix: string, padding: number, value: number): string {
  return `${prefix}-${String(value).padStart(padding, '0')}`;
}
