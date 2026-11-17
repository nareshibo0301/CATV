import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser, DataScope } from '@catv/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DataScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin (Developer, Super Admin, and Admin) sees every user.
   * A distributor sees their own subtree. An operator sees themself and their customers.
   * A customer sees themself. Soft-deleted users are excluded.
   */
  async resolve(actor: Pick<AuthUser, 'id' | 'role'>): Promise<DataScope> {
    if (actor.role === 'ADMIN') {
      return { kind: 'all' };
    }
    if (actor.role === 'CUSTOMER') {
      return { kind: 'ids', ids: [actor.id] };
    }
    if (actor.role === 'OPERATOR') {
      const customers = await this.prisma.user.findMany({
        where: { parentId: actor.id, role: 'CUSTOMER', deletedAt: null },
        select: { id: true },
      });
      return { kind: 'ids', ids: [actor.id, ...customers.map((customer) => customer.id)] };
    }

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT id FROM users WHERE id = ${actor.id}::uuid AND deleted_at IS NULL
        UNION ALL
        SELECT u.id FROM users u
        INNER JOIN subtree s ON u.parent_id = s.id
        WHERE u.deleted_at IS NULL
      )
      SELECT id FROM subtree
    `);
    return { kind: 'ids', ids: rows.map((row) => row.id) };
  }
}
