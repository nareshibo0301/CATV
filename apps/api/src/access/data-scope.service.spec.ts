import { adminTypeMatchesRole, userIdFilter } from '@catv/shared';
import type { DataScope } from '@catv/shared';
import { Prisma } from '@prisma/client';
import { DataScopeService } from './data-scope.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('adminTypeMatchesRole', () => {
  it('requires a tier for every admin and none for other roles', () => {
    expect(adminTypeMatchesRole('ADMIN', 'DEVELOPER')).toBe(true);
    expect(adminTypeMatchesRole('ADMIN', 'SUPERADMIN')).toBe(true);
    expect(adminTypeMatchesRole('ADMIN', 'ADMIN')).toBe(true);
    expect(adminTypeMatchesRole('ADMIN', null)).toBe(false);
    expect(adminTypeMatchesRole('DISTRIBUTOR', null)).toBe(true);
    expect(adminTypeMatchesRole('OPERATOR', 'ADMIN')).toBe(false);
    expect(adminTypeMatchesRole('CUSTOMER', null)).toBe(true);
  });
});

describe('userIdFilter', () => {
  it('returns an empty filter for the whole network', () => {
    expect(userIdFilter({ kind: 'all' })).toEqual({});
  });

  it('returns an id list for a restricted scope', () => {
    const scope: DataScope = { kind: 'ids', ids: ['a', 'b'] };
    expect(userIdFilter(scope)).toEqual({ id: { in: ['a', 'b'] } });
  });
});

describe('DataScopeService', () => {
  const prisma = {
    user: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const service = new DataScopeService(prisma as unknown as PrismaService);

  beforeEach(() => {
    prisma.user.findMany.mockReset();
    prisma.$queryRaw.mockReset();
  });

  it.each(['DEVELOPER', 'SUPERADMIN', 'ADMIN'] as const)(
    'gives %s the whole network',
    async () => {
      await expect(service.resolve({ id: 'admin', role: 'ADMIN' })).resolves.toEqual({ kind: 'all' });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('limits a customer to themself', async () => {
    await expect(service.resolve({ id: 'cus', role: 'CUSTOMER' })).resolves.toEqual({
      kind: 'ids',
      ids: ['cus'],
    });
  });

  it('limits an operator to themself and their customers', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    await expect(service.resolve({ id: 'op', role: 'OPERATOR' })).resolves.toEqual({
      kind: 'ids',
      ids: ['op', 'c1', 'c2'],
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { parentId: 'op', role: 'CUSTOMER', deletedAt: null },
      select: { id: true },
    });
  });

  it('limits a distributor to their subtree', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'dst' }, { id: 'op' }, { id: 'cus' }]);
    await expect(service.resolve({ id: 'dst', role: 'DISTRIBUTOR' })).resolves.toEqual({
      kind: 'ids',
      ids: ['dst', 'op', 'cus'],
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});

describe('subtree query', () => {
  it('builds a parameterized SQL statement', () => {
    const statement = Prisma.sql`SELECT ${'dst'}::uuid`;
    expect(statement.strings.join(' ')).toContain('uuid');
    expect(statement.values).toEqual(['dst']);
  });
});
