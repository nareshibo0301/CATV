import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { AuthUser, PaymentInput } from '@catv/shared';
import { AuditService } from '../audit/audit.service';
import { DataScopeService } from '../access/data-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { asNumber, cycleEnd, invoiceTotals, outstanding, round2 } from './money';
import { COMMISSION_QUEUE, WEBHOOK_QUEUE } from './queues';

type Tx = Prisma.TransactionClient;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: DataScopeService,
    private readonly audit: AuditService,
    @Inject(COMMISSION_QUEUE) private readonly commissionQueue: Queue,
    @Inject(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  async customerScope(actor: AuthUser): Promise<Prisma.InvoiceWhereInput> {
    const resolved = await this.scope.resolve(actor);
    if (resolved.kind === 'all') {
      return {};
    }
    return { customerId: { in: resolved.ids } };
  }

  async listInvoices(actor: AuthUser, page = 1, pageSize = 20) {
    const where = await this.customerScope(actor);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customer: { select: { name: true, userCode: true } }, connection: { select: { status: true } } },
      }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        number: row.number,
        status: row.status,
        kind: row.kind,
        total: asNumber(row.total),
        amountPaid: asNumber(row.amountPaid),
        outstanding: outstanding(asNumber(row.total), asNumber(row.amountPaid)),
        issuedAt: row.issuedAt.toISOString(),
        dueAt: row.dueAt.toISOString(),
        customer: row.customer,
        connectionId: row.connectionId,
      })),
    };
  }

  async getInvoice(actor: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, payments: true, customer: { select: { name: true, userCode: true, email: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    await this.assertCustomer(actor, invoice.customerId);
    return {
      ...invoice,
      subtotal: asNumber(invoice.subtotal),
      tax: asNumber(invoice.tax),
      total: asNumber(invoice.total),
      amountPaid: asNumber(invoice.amountPaid),
      outstanding: outstanding(asNumber(invoice.total), asNumber(invoice.amountPaid)),
      items: invoice.items.map((item) => ({ ...item, amount: asNumber(item.amount) })),
      payments: invoice.payments.map((payment) => ({ ...payment, amount: asNumber(payment.amount) })),
    };
  }

  async createInvoice(
    tx: Tx,
    input: {
      connectionId: string;
      customerId: string;
      distributorId: string | null;
      operatorId: string | null;
      planName: string;
      price: number;
      taxPercent: number;
      cycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
      kind: 'ACTIVATION' | 'RECURRING';
      sourceKey: string;
      periodStart?: Date;
    },
  ) {
    const existing = await tx.invoice.findUnique({ where: { sourceKey: input.sourceKey } });
    if (existing) return { invoice: existing, created: false };
    const totals = invoiceTotals(input.price, input.taxPercent);
    const number = await this.nextInvoiceNumber(tx);
    const periodStart = input.periodStart ?? new Date();
    const dueAt = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    try {
      const invoice = await tx.invoice.create({
        data: {
          number,
          sourceKey: input.sourceKey,
          connectionId: input.connectionId,
          customerId: input.customerId,
          distributorId: input.distributorId,
          operatorId: input.operatorId,
          kind: input.kind,
          subtotal: new Prisma.Decimal(totals.subtotal.toFixed(2)),
          tax: new Prisma.Decimal(totals.tax.toFixed(2)),
          total: new Prisma.Decimal(totals.total.toFixed(2)),
          issuedAt: new Date(),
          dueAt,
          periodStart,
          periodEnd: cycleEnd(periodStart, input.cycle),
          items: { create: { description: input.planName, amount: new Prisma.Decimal(totals.subtotal.toFixed(2)) } },
        },
      });
      return { invoice, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await tx.invoice.findUnique({ where: { sourceKey: input.sourceKey } });
        if (raced) return { invoice: raced, created: false };
      }
      throw error;
    }
  }

  async recordPayment(actor: AuthUser, input: PaymentInput, ip: string | null) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    await this.assertCustomer(actor, invoice.customerId);
    if (invoice.status === 'VOID') throw new BadRequestException('This invoice is void.');
    const due = outstanding(asNumber(invoice.total), asNumber(invoice.amountPaid));
    if (input.amount - due > 0.001) {
      throw new BadRequestException(`Amount is above the outstanding balance of ${due.toFixed(2)}.`);
    }
    const payment = await this.prisma.$transaction(async (tx) => {
      const current = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      const currentDue = outstanding(asNumber(current.total), asNumber(current.amountPaid));
      if (input.amount - currentDue > 0.001) {
        throw new BadRequestException('That payment no longer fits the outstanding balance.');
      }
      const created = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(round2(input.amount).toFixed(2)),
          method: input.method,
          reference: input.reference,
          recordedById: actor.id,
        },
      });
      const paid = round2(asNumber(current.amountPaid) + input.amount);
      const status = paid + 0.001 >= asNumber(current.total) ? 'PAID' : 'PARTIAL';
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: new Prisma.Decimal(paid.toFixed(2)), status },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'PAYMENT_RECORDED',
          entity: 'Payment',
          entityId: created.id,
          after: { invoiceId: invoice.id, amount: input.amount, method: input.method },
          ip,
        },
        tx,
      );
      return created;
    });
    await this.commissionQueue.add('payment', { paymentId: payment.id }, { jobId: `payment-${payment.id}` });
    await this.emit('payment.received', { paymentId: payment.id, invoiceId: invoice.id, amount: input.amount });
    return { id: payment.id, amount: asNumber(payment.amount) };
  }

  async voidPayment(actor: AuthUser, paymentId: string, ip: string | null) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Only an admin can void a payment.');
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
    if (!payment || payment.voidedAt) throw new NotFoundException('Payment not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { voidedAt: new Date() } });
      const remaining = await tx.payment.aggregate({
        where: { invoiceId: payment.invoiceId, voidedAt: null },
        _sum: { amount: true },
      });
      const paid = asNumber(remaining._sum.amount ?? 0);
      const total = asNumber(payment.invoice.total);
      const status = paid <= 0 ? 'ISSUED' : paid + 0.001 >= total ? 'PAID' : 'PARTIAL';
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { amountPaid: new Prisma.Decimal(paid.toFixed(2)), status },
      });
      await this.audit.record(
        { actorId: actor.id, action: 'PAYMENT_VOIDED', entity: 'Payment', entityId: paymentId, ip },
        tx,
      );
    });
    await this.commissionQueue.add('reversal', { paymentId }, { jobId: `reversal-${paymentId}` });
    return { ok: true };
  }

  async convertExpiredFree(now = new Date()): Promise<number> {
    const due = await this.prisma.connection.findMany({
      where: { status: 'ACTIVE_FREE', freeEndDate: { lte: now } },
      include: { plan: true },
    });
    let converted = 0;
    for (const connection of due) {
      const invoiceId = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.connection.updateMany({
          where: { id: connection.id, status: 'ACTIVE_FREE', freeEndDate: { lte: now } },
          data: { status: 'ACTIVE_PAID', activationType: 'PAID' },
        });
        if (claimed.count !== 1) return null;
        await tx.connectionStatusHistory.create({
          data: {
            connectionId: connection.id,
            fromStatus: 'ACTIVE_FREE',
            toStatus: 'ACTIVE_PAID',
            reason: 'auto: free period ended',
          },
        });
        const created = await this.createInvoice(tx, {
          connectionId: connection.id,
          customerId: connection.customerId,
          distributorId: connection.distributorId,
          operatorId: connection.operatorId,
          planName: connection.plan.name,
          price: asNumber(connection.plan.price),
          taxPercent: asNumber(connection.plan.taxPercent),
          cycle: connection.plan.billingCycle,
          kind: 'ACTIVATION',
          sourceKey: `convert:${connection.id}:${connection.freeEndDate?.toISOString() ?? now.toISOString()}`,
          periodStart: now,
        });
        return created.invoice.id;
      });
      if (invoiceId) {
        converted += 1;
        await this.emit('connection.converted_to_paid', { connectionId: connection.id, invoiceId });
        await this.emit('connection.free_expired', { connectionId: connection.id });
        await this.emit('invoice.created', { invoiceId, connectionId: connection.id });
      }
    }
    return converted;
  }

  async generateRecurring(now = new Date()): Promise<number> {
    const connections = await this.prisma.connection.findMany({
      where: { status: 'ACTIVE_PAID' },
      include: { plan: true, invoices: { orderBy: { periodEnd: 'desc' }, take: 1 } },
    });
    let created = 0;
    for (const connection of connections) {
      const latest = connection.invoices[0];
      if (latest && latest.periodEnd > now) continue;
      const periodStart = latest?.periodEnd ?? connection.activatedAt ?? now;
      const sourceKey = `recur:${connection.id}:${periodStart.toISOString()}`;
      const result = await this.prisma.$transaction((tx) =>
        this.createInvoice(tx, {
          connectionId: connection.id,
          customerId: connection.customerId,
          distributorId: connection.distributorId,
          operatorId: connection.operatorId,
          planName: connection.plan.name,
          price: asNumber(connection.plan.price),
          taxPercent: asNumber(connection.plan.taxPercent),
          cycle: connection.plan.billingCycle,
          kind: 'RECURRING',
          sourceKey,
          periodStart,
        }),
      );
      if (result.created) {
        created += 1;
        await this.emit('invoice.created', { invoiceId: result.invoice.id, connectionId: connection.id });
      }
    }
    return created;
  }

  async markOverdue(now = new Date()): Promise<number> {
    const result = await this.prisma.invoice.updateMany({
      where: { status: { in: ['ISSUED', 'PARTIAL'] }, dueAt: { lt: now } },
      data: { status: 'OVERDUE' },
    });
    return result.count;
  }

  async assertCustomer(actor: AuthUser, customerId: string): Promise<void> {
    const resolved = await this.scope.resolve(actor);
    if (resolved.kind === 'ids' && !resolved.ids.includes(customerId)) {
      throw new ForbiddenException('That account is outside your scope.');
    }
  }

  private async nextInvoiceNumber(tx: Tx): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ allocated: number }>>(Prisma.sql`
      UPDATE document_sequences
      SET next_value = next_value + 1
      WHERE name = 'invoice'
      RETURNING (next_value - 1) AS allocated
    `);
    const allocated = rows[0]?.allocated ?? 1;
    return `INV-${String(allocated).padStart(5, '0')}`;
  }

  async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.webhookQueue.add('event', { type, eventId: randomUUID(), payload });
  }
}
