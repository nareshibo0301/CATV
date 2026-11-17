import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../.env') });

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const demo = process.argv.includes('--demo');
  const basic = await prisma.plan.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Basic cable',
      price: new Prisma.Decimal('299.00'),
      billingCycle: 'MONTHLY',
      taxPercent: new Prisma.Decimal('18.00'),
    },
  });
  await prisma.plan.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Premium cable',
      price: new Prisma.Decimal('499.00'),
      billingCycle: 'MONTHLY',
      taxPercent: new Prisma.Decimal('18.00'),
    },
  });

  const customers = await prisma.user.findMany({
    where: { role: 'CUSTOMER', deletedAt: null },
    include: { parent: { include: { parent: true } } },
    take: demo ? 200 : 10,
  });
  let made = 0;
  for (const [index, customer] of customers.entries()) {
    const exists = await prisma.connection.findFirst({ where: { customerId: customer.id } });
    if (exists) continue;
    const parent = customer.parent;
    const operatorId = parent?.role === 'OPERATOR' ? parent.id : null;
    const distributorId = parent?.role === 'DISTRIBUTOR' ? parent.id : parent?.parent?.role === 'DISTRIBUTOR' ? parent.parent.id : null;
    const status = ['PENDING_ACTIVATION', 'ACTIVE_PAID', 'ACTIVE_FREE', 'SUSPENDED', 'DISCONNECTED'][index % 5] as
      | 'PENDING_ACTIVATION'
      | 'ACTIVE_PAID'
      | 'ACTIVE_FREE'
      | 'SUSPENDED'
      | 'DISCONNECTED';
    const connection = await prisma.connection.create({
      data: {
        customerId: customer.id,
        planId: basic.id,
        publishedById: customer.parentId ?? customer.id,
        distributorId,
        operatorId,
        status,
        activationType: status === 'ACTIVE_FREE' ? 'FREE' : status === 'PENDING_ACTIVATION' ? null : 'PAID',
        freeStartDate: status === 'ACTIVE_FREE' ? new Date() : null,
        freeEndDate: status === 'ACTIVE_FREE' ? new Date(Date.now() + 5 * 86400000) : null,
        freeReason: status === 'ACTIVE_FREE' ? 'INITIAL_OFFER' : null,
        activatedAt: status === 'PENDING_ACTIVATION' ? null : new Date(),
        history: {
          create: [
            { toStatus: 'PENDING_ACTIVATION', reason: 'published' },
            ...(status === 'PENDING_ACTIVATION' ? [] : [{ fromStatus: 'PENDING_ACTIVATION' as const, toStatus: status, reason: status === 'ACTIVE_FREE' ? 'INITIAL_OFFER' : 'paid activation' }]),
          ],
        },
      },
    });
    if (status === 'ACTIVE_PAID' || status === 'SUSPENDED') {
      const rows = await prisma.$queryRaw<Array<{ allocated: number }>>`
        UPDATE document_sequences SET next_value = next_value + 1 WHERE name = 'invoice' RETURNING (next_value - 1) AS allocated
      `;
      const number = `INV-${String(rows[0]?.allocated ?? 1).padStart(5, '0')}`;
      const invoice = await prisma.invoice.create({
        data: {
          number,
          sourceKey: `activation:${connection.id}`,
          connectionId: connection.id,
          customerId: customer.id,
          distributorId,
          operatorId,
          kind: 'ACTIVATION',
          status: index % 2 === 0 ? 'PARTIAL' : 'PAID',
          subtotal: new Prisma.Decimal('299.00'),
          tax: new Prisma.Decimal('53.82'),
          total: new Prisma.Decimal('352.82'),
          amountPaid: index % 2 === 0 ? new Prisma.Decimal('100.00') : new Prisma.Decimal('352.82'),
          dueAt: new Date(Date.now() + 7 * 86400000),
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 86400000),
          items: { create: { description: basic.name, amount: new Prisma.Decimal('299.00') } },
        },
      });
      const payment = await prisma.payment.create({
        data: { invoiceId: invoice.id, amount: invoice.amountPaid, method: 'UPI', reference: `DEMO-${number}` },
      });
      if (distributorId) {
        const base = Number(payment.amount);
        await prisma.commissionLedger.create({
          data: {
            sourceKey: `payment:${payment.id}`,
            distributorId,
            operatorId,
            connectionId: connection.id,
            invoiceId: invoice.id,
            paymentId: payment.id,
            baseAmount: payment.amount,
            ruleType: 'PERCENTAGE',
            ruleValue: new Prisma.Decimal('10.00'),
            commissionAmount: new Prisma.Decimal((Math.round(base * 10) / 100).toFixed(2)),
            status: 'PENDING',
          },
        });
      }
    }
    made += 1;
  }
  console.log(`Demo data ready. Connections added: ${made}.`);
  await prisma.$disconnect();
}

void main();
