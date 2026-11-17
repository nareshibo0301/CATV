import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser, ReportQuery } from '@catv/shared';
import { DataScopeService } from '../access/data-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { asNumber, outstanding } from './money';

const REPORTS = [
  'users',
  'connections',
  'activations',
  'free-periods',
  'invoices',
  'payments',
  'outstanding',
  'commissions',
  'payouts',
  'audit',
] as const;

export type ReportName = (typeof REPORTS)[number];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: DataScopeService,
  ) {}

  names(): readonly ReportName[] {
    return REPORTS;
  }

  async dashboard(actor: AuthUser, from = new Date(Date.now() - 30 * 86400000), to = new Date()) {
    const ids = await this.ids(actor);
    const customer = ids ? { in: ids } : undefined;
    const connectionWhere = { ...(customer ? { customerId: customer } : {}) };
    const invoiceWhere = { ...(customer ? { customerId: customer } : {}) };
    const [total, pending, activePaid, activeFree, expiring7, expiring30, outstandingAgg, payments, statusGroups] =
      await Promise.all([
        this.prisma.connection.count({ where: connectionWhere }),
        this.prisma.connection.count({ where: { ...connectionWhere, status: 'PENDING_ACTIVATION' } }),
        this.prisma.connection.count({ where: { ...connectionWhere, status: 'ACTIVE_PAID' } }),
        this.prisma.connection.count({ where: { ...connectionWhere, status: 'ACTIVE_FREE' } }),
        this.prisma.connection.count({
          where: { ...connectionWhere, status: 'ACTIVE_FREE', freeEndDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) } },
        }),
        this.prisma.connection.count({
          where: { ...connectionWhere, status: 'ACTIVE_FREE', freeEndDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) } },
        }),
        this.prisma.invoice.aggregate({
          where: { ...invoiceWhere, status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] } },
          _sum: { total: true, amountPaid: true },
        }),
        this.prisma.payment.findMany({
          where: { voidedAt: null, receivedAt: { gte: from, lte: to }, invoice: invoiceWhere },
          select: { amount: true, receivedAt: true },
        }),
        this.prisma.connection.groupBy({ by: ['status'], where: connectionWhere, _count: true }),
      ]);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
    const revenueToday = payments.filter((row) => row.receivedAt >= dayStart).reduce((sum, row) => sum + asNumber(row.amount), 0);
    const revenueMonth = payments.filter((row) => row.receivedAt >= monthStart).reduce((sum, row) => sum + asNumber(row.amount), 0);
    const collected = payments.reduce((sum, row) => sum + asNumber(row.amount), 0);
    const outstandingTotal = outstanding(asNumber(outstandingAgg._sum.total ?? 0), asNumber(outstandingAgg._sum.amountPaid ?? 0));
    const ledgerWhere: Prisma.CommissionLedgerWhereInput =
      actor.role === 'DISTRIBUTOR' ? { distributorId: actor.id } : actor.role === 'OPERATOR' ? { operatorId: actor.id } : actor.role === 'CUSTOMER' ? { connection: { customerId: actor.id } } : {};
    const payable = await this.prisma.commissionLedger.aggregate({
      where: { ...ledgerWhere, status: { in: ['PENDING', 'APPROVED'] } },
      _sum: { commissionAmount: true },
    });
    const trend = new Map<string, number>();
    for (const payment of payments) {
      const key = payment.receivedAt.toISOString().slice(0, 10);
      trend.set(key, (trend.get(key) ?? 0) + asNumber(payment.amount));
    }
    const disconnected = await this.prisma.connection.count({
      where: { ...connectionWhere, status: 'DISCONNECTED', updatedAt: { gte: from, lte: to } },
    });
    const converted = await this.prisma.connectionStatusHistory.count({
      where: { reason: 'auto: free period ended', createdAt: { gte: from, lte: to }, connection: connectionWhere },
    });
    const endedFree = await this.prisma.freePeriod.count({ where: { endDate: { gte: from, lte: to }, connection: connectionWhere } });
    return {
      kpis: {
        total,
        pending,
        activePaid,
        activeFree,
        expiring7,
        expiring30,
        revenueToday,
        revenueMonth,
        outstanding: outstandingTotal,
        commissionPayable: asNumber(payable._sum.commissionAmount ?? 0),
      },
      funnel: [
        { name: 'Published', value: total },
        { name: 'Pending', value: pending },
        { name: 'Active free', value: activeFree },
        { name: 'Active paid', value: activePaid },
      ],
      revenueTrend: [...trend.entries()].sort().map(([date, amount]) => ({ date, amount })),
      collectionVsOutstanding: { collected, outstanding: outstandingTotal },
      statusDistribution: statusGroups.map((row) => ({ name: row.status, value: row._count })),
      conversionRate: endedFree === 0 ? 0 : Math.round((converted / endedFree) * 100),
      churn: total === 0 ? 0 : Math.round((disconnected / total) * 100),
    };
  }

  async table(actor: AuthUser, report: string, query: ReportQuery): Promise<{ columns: string[]; rows: string[][]; total: number }> {
    if (!REPORTS.includes(report as ReportName)) throw new NotFoundException('Unknown report.');
    const ids = await this.ids(actor);
    const skip = (query.page - 1) * query.pageSize;
    if (report === 'connections') {
      const where: Prisma.ConnectionWhereInput = { ...(ids ? { customerId: { in: ids } } : {}), ...(query.status ? { status: query.status as never } : {}) };
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.connection.count({ where }),
        this.prisma.connection.findMany({ where, skip, take: query.pageSize, orderBy: { createdAt: 'desc' }, include: { customer: true, plan: true } }),
      ]);
      return {
        total,
        columns: ['Customer', 'Plan', 'Status', 'Activation', 'Distributor', 'Operator'],
        rows: rows.map((row) => [row.customer.userCode ?? row.customer.name, row.plan.name, row.status, row.activationType ?? '', row.distributorId ?? '', row.operatorId ?? '']),
      };
    }
    if (report === 'invoices' || report === 'outstanding') {
      const where: Prisma.InvoiceWhereInput = {
        ...(ids ? { customerId: { in: ids } } : {}),
        ...(report === 'outstanding' ? { status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] } } : {}),
      };
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.invoice.count({ where }),
        this.prisma.invoice.findMany({ where, skip, take: query.pageSize, orderBy: { issuedAt: 'desc' } }),
      ]);
      return {
        total,
        columns: ['Number', 'Status', 'Total', 'Paid', 'Outstanding', 'Due'],
        rows: rows.map((row) => [row.number, row.status, String(asNumber(row.total)), String(asNumber(row.amountPaid)), String(outstanding(asNumber(row.total), asNumber(row.amountPaid))), row.dueAt.toISOString()]),
      };
    }
    if (report === 'payments') {
      const where: Prisma.PaymentWhereInput = { voidedAt: null, ...(ids ? { invoice: { customerId: { in: ids } } } : {}) };
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.payment.count({ where }),
        this.prisma.payment.findMany({ where, skip, take: query.pageSize, orderBy: { receivedAt: 'desc' }, include: { invoice: true } }),
      ]);
      return { total, columns: ['Invoice', 'Amount', 'Method', 'When'], rows: rows.map((row) => [row.invoice.number, String(asNumber(row.amount)), row.method, row.receivedAt.toISOString()]) };
    }
    if (report === 'commissions') {
      const where: Prisma.CommissionLedgerWhereInput = actor.role === 'DISTRIBUTOR' ? { distributorId: actor.id } : actor.role === 'OPERATOR' ? { operatorId: actor.id } : ids ? { connection: { customerId: { in: ids } } } : {};
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.commissionLedger.count({ where }),
        this.prisma.commissionLedger.findMany({ where, skip, take: query.pageSize, orderBy: { createdAt: 'desc' } }),
      ]);
      return { total, columns: ['Status', 'Base', 'Rule', 'Commission', 'When'], rows: rows.map((row) => [row.status, String(asNumber(row.baseAmount)), `${row.ruleType} ${asNumber(row.ruleValue)}`, String(asNumber(row.commissionAmount)), row.createdAt.toISOString()]) };
    }
    if (report === 'free-periods') {
      const where: Prisma.ConnectionWhereInput = { status: 'ACTIVE_FREE', ...(ids ? { customerId: { in: ids } } : {}) };
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.connection.count({ where }),
        this.prisma.connection.findMany({ where, skip, take: query.pageSize, include: { customer: true } }),
      ]);
      return { total, columns: ['Customer', 'Ends', 'Note'], rows: rows.map((row) => [row.customer.name, row.freeEndDate?.toISOString() ?? '', 'no commission – free period']) };
    }
    if (report === 'users') {
      const where: Prisma.UserWhereInput = { deletedAt: null, ...(ids ? { id: { in: ids } } : {}) };
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.user.count({ where }),
        this.prisma.user.findMany({ where, skip, take: query.pageSize, orderBy: { createdAt: 'desc' } }),
      ]);
      return { total, columns: ['Code', 'Name', 'Role', 'Status'], rows: rows.map((row) => [row.userCode ?? '', row.name, row.role, row.status]) };
    }
    if (report === 'audit') {
      if (actor.role !== 'ADMIN') return { columns: ['Action'], rows: [], total: 0 };
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.auditLog.count(),
        this.prisma.auditLog.findMany({ skip, take: query.pageSize, orderBy: { createdAt: 'desc' } }),
      ]);
      return { total, columns: ['When', 'Action', 'Entity'], rows: rows.map((row) => [row.createdAt.toISOString(), row.action, row.entity]) };
    }
    if (report === 'payouts') {
      const where = actor.role === 'DISTRIBUTOR' ? { distributorId: actor.id } : {};
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.payout.count({ where }),
        this.prisma.payout.findMany({ where, skip, take: query.pageSize, orderBy: { paidAt: 'desc' } }),
      ]);
      return { total, columns: ['Period', 'Total', 'Method', 'Reference'], rows: rows.map((row) => [row.period, String(asNumber(row.total)), row.method, row.reference ?? '']) };
    }
    const where: Prisma.ConnectionStatusHistoryWhereInput = ids ? { connection: { customerId: { in: ids } } } : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.connectionStatusHistory.count({ where }),
      this.prisma.connectionStatusHistory.findMany({ where, skip, take: query.pageSize, orderBy: { createdAt: 'desc' } }),
    ]);
    return { total, columns: ['From', 'To', 'Reason', 'When'], rows: rows.map((row) => [row.fromStatus ?? '', row.toStatus, row.reason ?? '', row.createdAt.toISOString()]) };
  }

  private async ids(actor: AuthUser): Promise<string[] | null> {
    const resolved = await this.scope.resolve(actor);
    return resolved.kind === 'all' ? null : resolved.ids;
  }
}
