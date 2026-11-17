import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminType, AuthUser } from '@catv/shared';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

function contextFor(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  beforeEach(() => {
    reflector.getAllAndOverride.mockReset();
  });

  function requireAdmin(): void {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return ['ADMIN'];
      return undefined;
    });
  }

  it.each(['DEVELOPER', 'SUPERADMIN', 'ADMIN'] as AdminType[])(
    'allows admin type %s on an admin route',
    (adminType) => {
      requireAdmin();
      const user: AuthUser = {
        id: '1',
        role: 'ADMIN',
        adminType,
        email: 'a@catv.local',
        name: 'A',
      };
      expect(guard.canActivate(contextFor(user))).toBe(true);
    },
  );

  it.each(['DISTRIBUTOR', 'OPERATOR', 'CUSTOMER'] as const)(
    'blocks %s from an admin route',
    (role) => {
      requireAdmin();
      const user: AuthUser = {
        id: '1',
        role,
        adminType: null,
        email: 'a@catv.local',
        name: 'A',
      };
      expect(() => guard.canActivate(contextFor(user))).toThrow(ForbiddenException);
    },
  );
});
