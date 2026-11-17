export const ROLES = ['ADMIN', 'DISTRIBUTOR', 'OPERATOR', 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];

/** The three admin tiers. Required on users whose role is ADMIN. */
export const ADMIN_TYPES = ['DEVELOPER', 'SUPERADMIN', 'ADMIN'] as const;
export type AdminType = (typeof ADMIN_TYPES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ADMIN_TYPE_LABELS: Record<AdminType, string> = {
  DEVELOPER: 'Developer',
  SUPERADMIN: 'Super Admin',
  ADMIN: 'Admin',
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  DISTRIBUTOR: 'Distributor',
  OPERATOR: 'Operator',
  CUSTOMER: 'Customer',
};

export function isAdminRole(role: Role): boolean {
  return role === 'ADMIN';
}

/** Admin rows must carry a tier. Every other role must not. */
export function adminTypeMatchesRole(role: Role, adminType: AdminType | null): boolean {
  if (role === 'ADMIN') {
    return adminType !== null && ADMIN_TYPES.includes(adminType);
  }
  return adminType === null;
}
