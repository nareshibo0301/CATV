import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser, IdPrefixUpdate, ManagedRole } from '@catv/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const ROLES: ManagedRole[] = ['DISTRIBUTOR', 'OPERATOR', 'CUSTOMER'];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getPrefixes() {
    const rows = await this.prisma.idSequence.findMany({ orderBy: { role: 'asc' } });
    return {
      padding: rows[0]?.padding ?? 5,
      prefixes: Object.fromEntries(rows.map((row) => [row.role, row.prefix])),
    };
  }

  async updatePrefixes(actor: AuthUser, input: IdPrefixUpdate, ip: string | null) {
    const values = [input.prefixes.DISTRIBUTOR, input.prefixes.OPERATOR, input.prefixes.CUSTOMER];
    if (new Set(values).size !== values.length) {
      throw new BadRequestException('Each category needs a different prefix.');
    }
    const before = await this.getPrefixes();
    await this.prisma.$transaction(async (tx) => {
      for (const role of ROLES) {
        await tx.idSequence.update({ where: { role }, data: { prefix: `TMP${role}` } });
      }
      for (const role of ROLES) {
        await tx.idSequence.update({
          where: { role },
          data: { prefix: input.prefixes[role], padding: input.padding },
        });
      }
    });
    const after = await this.getPrefixes();
    await this.audit.record({
      actorId: actor.id,
      action: 'ID_PREFIX_UPDATED',
      entity: 'IdSequence',
      entityId: 'prefixes',
      before,
      after,
      ip,
    });
    return after;
  }
}
