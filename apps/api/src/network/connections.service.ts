import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActivationInput, AuthUser, PublishConnectionInput } from '@catv/shared';
import { AuditService } from '../audit/audit.service';
import { DataScopeService } from '../access/data-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { asNumber, freePeriodEnd } from './money';
import { placementForCustomer } from './placement';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: DataScopeService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  async list(
    actor: AuthUser,
    query: { page: number; pageSize: number; status?: string; distributorId?: string; operatorId?: string; activationType?: string },
  ) {
    const where = await this.scopedWhere(actor);
    if (query.status) where.status = query.status as never;
    if (query.distributorId) where.distributorId = query.distributorId;
    if (query.operatorId) where.operatorId = query.operatorId;
    if (query.activationType) where.activationType = query.activationType as never;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.connection.count({ where }),
      this.prisma.connection.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          customer: { select: { name: true, userCode: true } },
          plan: { select: { name: true, price: true } },
          distributor: { select: { name: true, userCode: true } },
          operator: { select: { name: true, userCode: true } },
        },
      }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        ...row,
        plan: { name: row.plan.name, price: asNumber(row.plan.price) },
        freeStartDate: row.freeStartDate?.toISOString() ?? null,
        freeEndDate: row.freeEndDate?.toISOString() ?? null,
        activatedAt: row.activatedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async get(actor: AuthUser, id: string) {
    const connection = await this.prisma.connection.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, userCode: true } },
        plan: true,
        history: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true } } } },
        freePeriods: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { issuedAt: 'desc' } },
      },
    });
    if (!connection) throw new NotFoundException('Connection not found.');
    await this.billing.assertCustomer(actor, connection.customerId);
    return {
      ...connection,
      plan: { ...connection.plan, price: asNumber(connection.plan.price), taxPercent: asNumber(connection.plan.taxPercent) },
      invoices: connection.invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        total: asNumber(invoice.total),
        amountPaid: asNumber(invoice.amountPaid),
      })),
    };
  }

  async publish(actor: AuthUser, input: PublishConnectionInput, ip: string | null) {
    if (actor.role === 'CUSTOMER') throw new ForbiddenException('You cannot publish a connection.');
    await this.billing.assertCustomer(actor, input.customerId);
    const customer = await this.prisma.user.findFirst({
      where: { id: input.customerId, role: 'CUSTOMER', deletedAt: null },
      include: { parent: { include: { parent: true } } },
    });
    if (!customer) throw new BadRequestException('Choose an active customer.');
    const plan = await this.prisma.plan.findFirst({ where: { id: input.planId, active: true } });
    if (!plan) throw new BadRequestException('Choose an active plan.');
    const place = placementForCustomer(customer.parent);
    const connection = await this.prisma.connection.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        publishedById: actor.id,
        distributorId: place.distributorId,
        operatorId: place.operatorId,
        status: 'PENDING_ACTIVATION',
        history: { create: { toStatus: 'PENDING_ACTIVATION', reason: 'published', actorId: actor.id } },
      },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'CONNECTION_PUBLISHED',
      entity: 'Connection',
      entityId: connection.id,
      after: { customerId: customer.id, planId: plan.id },
      ip,
    });
    await this.billing.emit('connection.published', { connectionId: connection.id, customerId: customer.id });
    return connection;
  }

  async activate(actor: AuthUser, id: string, input: ActivationInput, ip: string | null) {
    const connection = await this.prisma.connection.findUnique({ where: { id }, include: { plan: true } });
    if (!connection) throw new NotFoundException('Connection not found.');
    await this.billing.assertCustomer(actor, connection.customerId);
    if (input.mode === 'FREE') {
      if (actor.role !== 'ADMIN') throw new ForbiddenException('Only an admin can grant free access.');
      return this.activateFree(actor, connection, input, ip);
    }
    if (connection.status !== 'PENDING_ACTIVATION') {
      throw new BadRequestException('Paid activation starts from pending.');
    }
    const invoiceId = await this.prisma.$transaction(async (tx) => {
      await tx.connection.update({
        where: { id },
        data: { status: 'ACTIVE_PAID', activationType: 'PAID', activatedAt: new Date() },
      });
      await tx.connectionStatusHistory.create({
        data: { connectionId: id, fromStatus: 'PENDING_ACTIVATION', toStatus: 'ACTIVE_PAID', reason: 'paid activation', actorId: actor.id },
      });
      const created = await this.billing.createInvoice(tx, {
        connectionId: id,
        customerId: connection.customerId,
        distributorId: connection.distributorId,
        operatorId: connection.operatorId,
        planName: connection.plan.name,
        price: asNumber(connection.plan.price),
        taxPercent: asNumber(connection.plan.taxPercent),
        cycle: connection.plan.billingCycle,
        kind: 'ACTIVATION',
        sourceKey: `activation:${id}`,
      });
      return created.invoice.id;
    });
    await this.audit.record({ actorId: actor.id, action: 'CONNECTION_ACTIVATED', entity: 'Connection', entityId: id, after: { mode: 'PAID', invoiceId }, ip });
    await this.billing.emit('connection.activated', { connectionId: id, mode: 'PAID' });
    await this.billing.emit('invoice.created', { invoiceId, connectionId: id });
    return { status: 'ACTIVE_PAID', invoiceId };
  }

  async setStatus(actor: AuthUser, id: string, to: 'SUSPENDED' | 'DISCONNECTED' | 'REACTIVATE', reason: string, ip: string | null) {
    const connection = await this.prisma.connection.findUnique({ where: { id } });
    if (!connection) throw new NotFoundException('Connection not found.');
    await this.billing.assertCustomer(actor, connection.customerId);
    if (actor.role === 'CUSTOMER') throw new ForbiddenException('You cannot change connection status.');
    if (to === 'REACTIVATE') {
      const last = await this.prisma.connectionStatusHistory.findFirst({
        where: { connectionId: id, toStatus: 'SUSPENDED' },
        orderBy: { createdAt: 'desc' },
      });
      const restore = last?.fromStatus === 'ACTIVE_FREE' ? 'ACTIVE_FREE' : 'ACTIVE_PAID';
      await this.transition(actor, connection.status, id, restore, reason || 'reactivated', ip);
      return { status: restore };
    }
    await this.transition(actor, connection.status, id, to, reason, ip);
    return { status: to };
  }

  private async activateFree(
    actor: AuthUser,
    connection: { id: string; status: string; customerId: string },
    input: Extract<ActivationInput, { mode: 'FREE' }>,
    ip: string | null,
  ) {
    if (connection.status !== 'PENDING_ACTIVATION' && connection.status !== 'ACTIVE_PAID' && connection.status !== 'ACTIVE_FREE') {
      throw new BadRequestException('Free access can be granted to a pending or active connection.');
    }
    const start = new Date(input.startDate);
    const end = freePeriodEnd(start, input.duration, input.customDays);
    if (end <= start) throw new BadRequestException('The free period must end after it starts.');
    await this.prisma.$transaction(async (tx) => {
      await tx.connection.update({
        where: { id: connection.id },
        data: {
          status: 'ACTIVE_FREE',
          activationType: 'FREE',
          freeStartDate: start,
          freeEndDate: end,
          freeReason: input.reason,
          activatedAt: connection.status === 'PENDING_ACTIVATION' ? start : undefined,
        },
      });
      await tx.freePeriod.create({
        data: {
          connectionId: connection.id,
          startDate: start,
          endDate: end,
          durationLabel: input.duration === 'CUSTOM' ? `${input.customDays} days` : input.duration,
          reason: input.reason,
          grantedById: actor.id,
        },
      });
      await tx.connectionStatusHistory.create({
        data: {
          connectionId: connection.id,
          fromStatus: connection.status as never,
          toStatus: 'ACTIVE_FREE',
          reason: input.reason,
          actorId: actor.id,
        },
      });
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'CONNECTION_FREE_GRANTED',
      entity: 'Connection',
      entityId: connection.id,
      after: { start, end, reason: input.reason },
      ip,
    });
    await this.billing.emit('connection.free_started', { connectionId: connection.id, end: end.toISOString() });
    return { status: 'ACTIVE_FREE', freeEndDate: end.toISOString() };
  }

  private async transition(
    actor: AuthUser,
    from: string,
    id: string,
    to: 'SUSPENDED' | 'DISCONNECTED' | 'ACTIVE_PAID' | 'ACTIVE_FREE',
    reason: string,
    ip: string | null,
  ) {
    await this.prisma.$transaction([
      this.prisma.connection.update({ where: { id }, data: { status: to } }),
      this.prisma.connectionStatusHistory.create({
        data: { connectionId: id, fromStatus: from as never, toStatus: to, reason, actorId: actor.id },
      }),
    ]);
    await this.audit.record({ actorId: actor.id, action: 'CONNECTION_STATUS', entity: 'Connection', entityId: id, before: { status: from }, after: { status: to, reason }, ip });
  }

  private async scopedWhere(actor: AuthUser) {
    const resolved = await this.scope.resolve(actor);
    if (resolved.kind === 'all') return {} as { status?: never; distributorId?: string; operatorId?: string; activationType?: never; customerId?: { in: string[] } };
    return { customerId: { in: resolved.ids } };
  }
}
