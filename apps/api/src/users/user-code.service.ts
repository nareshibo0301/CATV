import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatUserCode, type ManagedRole } from '@catv/shared';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class UserCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async allocate(role: ManagedRole, db: Db = this.prisma): Promise<string> {
    const rows = await db.$queryRaw<Array<{ prefix: string; padding: number; allocated: number }>>(
      Prisma.sql`
        UPDATE id_sequences
        SET next_value = next_value + 1, updated_at = NOW()
        WHERE role = CAST(${role} AS "Role")
        RETURNING prefix, padding, (next_value - 1) AS allocated
      `,
    );
    const row = rows[0];
    if (!row) {
      throw new BadRequestException('ID prefixes are not configured.');
    }
    return formatUserCode(row.prefix, row.padding, Number(row.allocated));
  }
}
