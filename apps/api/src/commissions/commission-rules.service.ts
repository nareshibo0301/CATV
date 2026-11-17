import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser, CommissionInput } from '@catv/shared';
import { AuditService } from '../audit/audit.service';
import { DataScopeService } from '../access/data-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { canReadCommission } from '../users/user-policy';

@Injectable()
export class CommissionRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: DataScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser, userId: string) {
    if (!canReadCommission(actor.role)) {
      throw new ForbiddenException('You cannot view commission rules.');
    }
    await this.assertUser(actor, userId);
    const rows = await this.prisma.commissionRule.findMany({
      where: { userId },
      orderBy: { effectiveFrom: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      value: row.value.toString(),
      effectiveFrom: row.effectiveFrom.toISOString(),
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    }));
  }

  async add(actor: AuthUser, userId: string, input: CommissionInput, ip: string | null) {
    if (input.type === 'PERCENTAGE' && input.value > 100) {
      throw new BadRequestException('A percentage commission cannot exceed 100.');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { parent: { select: { role: true } } },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    const allowed =
      user.role === 'DISTRIBUTOR' || (user.role === 'OPERATOR' && user.parent?.role === 'DISTRIBUTOR');
    if (!allowed) {
      throw new BadRequestException('Commission applies to distributors and to operators under a distributor.');
    }
    const created = await this.prisma.commissionRule.create({
      data: { userId, type: input.type, value: input.value, createdById: actor.id },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'COMMISSION_RULE_CREATED',
      entity: 'CommissionRule',
      entityId: created.id,
      after: { userId, type: input.type, value: input.value },
      ip,
    });
    return { id: created.id, type: created.type, value: created.value.toString(), effectiveFrom: created.effectiveFrom.toISOString() };
  }

  private async assertUser(actor: AuthUser, userId: string) {
    const resolved = await this.scope.resolve(actor);
    if (resolved.kind === 'ids' && !resolved.ids.includes(userId)) {
      throw new ForbiddenException('You do not have access to this user.');
    }
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
  }
}
