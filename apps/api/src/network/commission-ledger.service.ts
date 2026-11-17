import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser, PayoutInput } from '@catv/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { asNumber, commissionAmount, round2 } from './money';
import { BillingService } from './billing.service';

@Injectable()
export class CommissionLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  async recordForPayment(paymentId: string): Promise<void> {
    const sourceKey = `payment:${paymentId}`;
    const existing = await this.prisma.commissionLedger.findUnique({ where: { sourceKey } });
    if (existing) return;
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: { include: { connection: true } } },
    });
    if (!payment || payment.voidedAt) return;
    const connection = payment.invoice.connection;
    if (!connection.distributorId || connection.status === 'ACTIVE_FREE') return;
    const rule = await this.ruleAt(connection.operatorId, connection.distributorId, payment.invoice.issuedAt);
    if (!rule) return;
    const base = asNumber(payment.amount);
    const amount = commissionAmount(rule.type, asNumber(rule.value), base, asNumber(payment.invoice.total));
    try {
      const row = await this.prisma.commissionLedger.create({
        data: {
          sourceKey,
          distributorId: connection.distributorId,
          operatorId: connection.operatorId,
          connectionId: connection.id,
          invoiceId: payment.invoiceId,
          paymentId: payment.id,
          baseAmount: new Prisma.Decimal(base.toFixed(2)),
          ruleType: rule.type,
          ruleValue: rule.value,
          commissionAmount: new Prisma.Decimal(amount.toFixed(2)),
          status: 'PENDING',
        },
      });
      await this.billing.emit('commission.created', { ledgerId: row.id, amount });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }

  async reverseForPayment(paymentId: string): Promise<void> {
    const original = await this.prisma.commissionLedger.findUnique({ where: { sourceKey: `payment:${paymentId}` } });
    if (!original || original.status === 'CANCELLED') return;
    const reversalKey = `reversal:${paymentId}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.commissionLedger.update({ where: { id: original.id }, data: { status: 'CANCELLED' } });
      await tx.commissionLedger.create({
        data: {
          sourceKey: reversalKey,
          distributorId: original.distributorId,
          operatorId: original.operatorId,
          connectionId: original.connectionId,
          invoiceId: original.invoiceId,
          paymentId: original.paymentId,
          reversalOfId: original.id,
          baseAmount: original.baseAmount,
          ruleType: original.ruleType,
          ruleValue: original.ruleValue,
          commissionAmount: new Prisma.Decimal((-asNumber(original.commissionAmount)).toFixed(2)),
          status: 'CANCELLED',
        },
      });
    });
  }

  async list(actor: AuthUser, page = 1) {
    const where = await this.whereFor(actor);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.commissionLedger.count({ where }),
      this.prisma.commissionLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
        include: { operator: { select: { name: true, userCode: true } }, distributor: { select: { name: true } } },
      }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        ...row,
        baseAmount: asNumber(row.baseAmount),
        ruleValue: asNumber(row.ruleValue),
        commissionAmount: asNumber(row.commissionAmount),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async approve(actor: AuthUser, ids: string[], ip: string | null) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Only an admin can approve commission.');
    const result = await this.prisma.commissionLedger.updateMany({
      where: { id: { in: ids }, status: 'PENDING', payoutId: null },
      data: { status: 'APPROVED' },
    });
    await this.audit.record({ actorId: actor.id, action: 'COMMISSION_APPROVED', entity: 'CommissionLedger', after: { ids, count: result.count }, ip });
    return { updated: result.count };
  }

  async payout(actor: AuthUser, input: PayoutInput, ip: string | null) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Only an admin can pay commission.');
    const [year, month] = input.period.split('-').map(Number);
    const start = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1));
    const end = new Date(Date.UTC(year ?? 0, month ?? 1, 1));
    const payout = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.commissionLedger.findMany({
        where: { distributorId: input.distributorId, status: 'APPROVED', payoutId: null, createdAt: { gte: start, lt: end } },
      });
      if (rows.length === 0) throw new BadRequestException('No approved commission in that period.');
      const total = round2(rows.reduce((sum, row) => sum + asNumber(row.commissionAmount), 0));
      const created = await tx.payout.create({
        data: {
          distributorId: input.distributorId,
          period: input.period,
          total: new Prisma.Decimal(total.toFixed(2)),
          method: input.method,
          reference: input.reference,
          paidById: actor.id,
        },
      });
      await tx.commissionLedger.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { status: 'PAID', payoutId: created.id },
      });
      return created;
    });
    await this.audit.record({ actorId: actor.id, action: 'PAYOUT_CREATED', entity: 'Payout', entityId: payout.id, after: input, ip });
    await this.billing.emit('commission.paid', { payoutId: payout.id, distributorId: input.distributorId });
    return { id: payout.id, total: asNumber(payout.total) };
  }

  async freeExclusion(actor: AuthUser) {
    const resolved = await this.prisma.connection.findMany({
      where: {
        status: 'ACTIVE_FREE',
        ...(actor.role === 'ADMIN' ? {} : { distributorId: actor.role === 'DISTRIBUTOR' ? actor.id : undefined, operatorId: actor.role === 'OPERATOR' ? actor.id : undefined }),
      },
      select: { id: true, customerId: true, freeEndDate: true },
      take: 100,
    });
    return resolved.map((row) => ({ ...row, note: 'no commission – free period' }));
  }

  private async whereFor(actor: AuthUser): Promise<Prisma.CommissionLedgerWhereInput> {
    if (actor.role === 'ADMIN') return {};
    if (actor.role === 'DISTRIBUTOR') return { distributorId: actor.id };
    if (actor.role === 'OPERATOR') return { operatorId: actor.id };
    throw new ForbiddenException('You cannot view commission.');
  }

  private async ruleAt(operatorId: string | null, distributorId: string, at: Date) {
    if (operatorId) {
      const operatorRule = await this.prisma.commissionRule.findFirst({
        where: { userId: operatorId, effectiveFrom: { lte: at } },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (operatorRule) return operatorRule;
    }
    return this.prisma.commissionRule.findFirst({
      where: { userId: distributorId, effectiveFrom: { lte: at } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }
}
