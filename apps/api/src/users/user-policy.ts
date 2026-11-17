import type { CreateUserInput, ManagedRole, Role } from '@catv/shared';
import { commissionIsRequired } from '@catv/shared';

export interface ActorRef {
  id: string;
  role: Role;
}

export type CreatePlan =
  | { ok: false; status: 400 | 403; message: string }
  | {
      ok: true;
      role: ManagedRole;
      parentId: string | null;
      parentMustBe: 'self' | 'self-or-operator-in-subtree' | 'admin-choice';
      commissionRequired: boolean;
    };

export function planUserCreate(actor: ActorRef, input: CreateUserInput): CreatePlan {
  if (input.commission && actor.role !== 'ADMIN') {
    return { ok: false, status: 403, message: 'Only an admin can set a commission rule.' };
  }
  if (input.customData && Object.keys(input.customData).length > 0 && actor.role !== 'ADMIN') {
    return { ok: false, status: 403, message: 'Only an admin can set custom attributes.' };
  }

  if (actor.role === 'CUSTOMER') {
    return { ok: false, status: 403, message: 'You cannot create users.' };
  }

  if (actor.role === 'OPERATOR') {
    if (input.role !== 'CUSTOMER') {
      return { ok: false, status: 403, message: 'An operator can only create customers.' };
    }
    if (input.parentId && input.parentId !== actor.id) {
      return { ok: false, status: 403, message: 'An operator can only create their own customers.' };
    }
    return {
      ok: true,
      role: 'CUSTOMER',
      parentId: actor.id,
      parentMustBe: 'self',
      commissionRequired: false,
    };
  }

  if (actor.role === 'DISTRIBUTOR') {
    if (input.role !== 'OPERATOR' && input.role !== 'CUSTOMER') {
      return { ok: false, status: 403, message: 'A distributor can only create operators and customers.' };
    }
    if (input.parentId && input.parentId !== actor.id && input.role === 'OPERATOR') {
      return { ok: false, status: 403, message: 'A distributor can only create operators directly under themself.' };
    }
    return {
      ok: true,
      role: input.role,
      parentId: input.parentId ?? actor.id,
      parentMustBe: input.role === 'CUSTOMER' ? 'self-or-operator-in-subtree' : 'self',
      commissionRequired: false,
    };
  }

  const parentId = input.role === 'DISTRIBUTOR' ? null : (input.parentId ?? actor.id);
  const parentRole = parentRoleForAdminCreate(input.role, parentId, actor.id);
  const required = commissionIsRequired(input.role, parentRole);
  if (required && !input.commission) {
    return { ok: false, status: 400, message: 'A commission type and value are required.' };
  }
  if (!required && input.commission) {
    return { ok: false, status: 400, message: 'This user does not take a commission rule.' };
  }
  if (input.commission?.type === 'PERCENTAGE' && input.commission.value > 100) {
    return { ok: false, status: 400, message: 'A percentage commission cannot exceed 100.' };
  }
  return {
    ok: true,
    role: input.role,
    parentId,
    parentMustBe: 'admin-choice',
    commissionRequired: required,
  };
}

function parentRoleForAdminCreate(
  role: ManagedRole,
  parentId: string | null,
  actorId: string,
): Role | null {
  if (role === 'DISTRIBUTOR' || parentId === null) {
    return null;
  }
  if (parentId === actorId) {
    return 'ADMIN';
  }
  return 'DISTRIBUTOR';
}

export function canReadCommission(actorRole: Role): boolean {
  return actorRole === 'ADMIN' || actorRole === 'DISTRIBUTOR';
}
