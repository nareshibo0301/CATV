import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient, type CommissionType, type Prisma } from '@prisma/client';
import { ADMIN_TYPES, type AdminType } from '@catv/shared';

loadEnv({ path: resolve(__dirname, '../../../deploy/.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

function isAdminType(value: string): value is AdminType {
  return (ADMIN_TYPES as readonly string[]).includes(value);
}

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@catv.local').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? 'CATV Super Admin';
  const adminTypeRaw = (process.env.SEED_ADMIN_TYPE ?? 'SUPERADMIN').trim().toUpperCase();
  if (!password || password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters.');
  }
  if (!isAdminType(adminTypeRaw)) {
    throw new Error('SEED_ADMIN_TYPE must be DEVELOPER, SUPERADMIN, or ADMIN.');
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password, ARGON);
    let admin = await prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!admin) {
      admin = await prisma.user.create({
        data: { role: 'ADMIN', adminType: adminTypeRaw, email, name, passwordHash, status: 'ACTIVE' },
      });
      console.log(`Seeded ${adminTypeRaw} admin ${email}.`);
    }

    const existingDistributor = await prisma.user.findFirst({
      where: { email: 'distributor.north@catv.local', deletedAt: null },
    });
    if (!existingDistributor) {
      await seedNetwork(prisma, admin.id, passwordHash);
      console.log('Seeded 2 distributors, 3 operators, and 10 customers.');
    } else {
      console.log('Network seed already present.');
    }

    const connectionCount = await prisma.connection.count();
    if (connectionCount === 0) {
      console.log('Seeding rich demo connections, invoices, payments, and movements...');
      await seedDemoData(prisma, admin.id);
      console.log('Demo data seeded successfully!');
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function seedDemoData(prisma: PrismaClient, adminId: string): Promise<void> {
  const planSilver = await prisma.plan.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Silver Starter HD',
      price: new Prisma.Decimal('249.00'),
      billingCycle: 'MONTHLY',
      taxPercent: new Prisma.Decimal('18.00'),
      active: true,
    },
  });
  const planGold = await prisma.plan.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Gold Entertainment Pack',
      price: new Prisma.Decimal('399.00'),
      billingCycle: 'MONTHLY',
      taxPercent: new Prisma.Decimal('18.00'),
      active: true,
    },
  });
  const planDiamond = await prisma.plan.upsert({
    where: { id: '00000000-0000-4000-8000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Diamond Sports + Cinema',
      price: new Prisma.Decimal('599.00'),
      billingCycle: 'MONTHLY',
      taxPercent: new Prisma.Decimal('18.00'),
      active: true,
    },
  });
  const planFiber = await prisma.plan.upsert({
    where: { id: '00000000-0000-4000-8000-000000000004' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000004',
      name: 'Ultra Fiber + Live TV',
      price: new Prisma.Decimal('899.00'),
      billingCycle: 'MONTHLY',
      taxPercent: new Prisma.Decimal('18.00'),
      active: true,
    },
  });

  const plans = [planSilver, planGold, planDiamond, planFiber];

  const customers = await prisma.user.findMany({
    where: { role: 'CUSTOMER', deletedAt: null },
    include: { parent: { include: { parent: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (customers.length === 0) return;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30);
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000);
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
  const twentyDaysAgo = new Date(Date.now() - 20 * 86400000);

  for (let i = 0; i < customers.length; i++) {
    const cust = customers[i];
    if (!cust) continue;

    const parent = cust.parent;
    const operatorId = parent?.role === 'OPERATOR' ? parent.id : null;
    const distributorId = parent?.role === 'DISTRIBUTOR' ? parent.id : parent?.parent?.role === 'DISTRIBUTOR' ? parent.parent.id : null;
    const plan = plans[i % plans.length]!;

    let status: 'PENDING_ACTIVATION' | 'ACTIVE_PAID' | 'ACTIVE_FREE' | 'SUSPENDED' | 'DISCONNECTED' = 'ACTIVE_PAID';
    let activationType: 'PAID' | 'FREE' | null = 'PAID';
    let freeStartDate: Date | null = null;
    let freeEndDate: Date | null = null;
    let freeReason: 'INITIAL_OFFER' | 'LOYALTY_OFFER' | null = null;
    let activatedAt: Date | null = tenDaysAgo;

    if (i === 2) {
      status = 'ACTIVE_FREE';
      activationType = 'FREE';
      freeStartDate = tenDaysAgo;
      freeEndDate = new Date(Date.now() + 4 * 86400000); // 4 days remaining -> hits expiring7
      freeReason = 'INITIAL_OFFER';
    } else if (i === 3) {
      status = 'ACTIVE_FREE';
      activationType = 'FREE';
      freeStartDate = fiveDaysAgo;
      freeEndDate = new Date(Date.now() + 18 * 86400000); // 18 days remaining -> hits expiring30
      freeReason = 'LOYALTY_OFFER';
    } else if (i === 4 || i === 8) {
      status = 'PENDING_ACTIVATION';
      activationType = null;
      activatedAt = null;
    } else if (i === 7) {
      status = 'SUSPENDED';
      activationType = 'PAID';
      activatedAt = twentyDaysAgo;
    } else if (i === 9) {
      status = 'DISCONNECTED';
      activationType = 'PAID';
      activatedAt = twentyDaysAgo;
    }

    const connection = await prisma.connection.create({
      data: {
        customerId: cust.id,
        planId: plan.id,
        publishedById: cust.parentId ?? adminId,
        distributorId,
        operatorId,
        status,
        activationType,
        freeStartDate,
        freeEndDate,
        freeReason,
        activatedAt,
        history: {
          create: [
            { toStatus: 'PENDING_ACTIVATION', reason: 'Order published by portal', createdAt: twentyDaysAgo },
            ...(status !== 'PENDING_ACTIVATION'
              ? [{
                  fromStatus: 'PENDING_ACTIVATION' as const,
                  toStatus: status,
                  reason: status === 'ACTIVE_FREE' ? 'Promotional trial activation' : status === 'SUSPENDED' ? 'Overdue invoice suspension' : status === 'DISCONNECTED' ? 'Subscriber relocation' : 'Subscriber online payment activation',
                  createdAt: activatedAt ?? tenDaysAgo,
                }]
              : []),
          ],
        },
      },
    });

    if (status === 'ACTIVE_FREE' && freeStartDate && freeEndDate && freeReason) {
      await prisma.freePeriod.create({
        data: {
          connectionId: connection.id,
          startDate: freeStartDate,
          endDate: freeEndDate,
          durationLabel: i === 2 ? '14 Days Free Pass' : '30 Days Trial Pass',
          reason: freeReason,
          grantedById: adminId,
        },
      });
    }

    if (status === 'ACTIVE_PAID' || status === 'SUSPENDED') {
      const rows = await prisma.$queryRaw<Array<{ allocated: number }>>`
        UPDATE document_sequences SET next_value = next_value + 1 WHERE name = 'invoice' RETURNING (next_value - 1) AS allocated
      `;
      const invNum = `INV-${String(rows[0]?.allocated ?? (i + 100)).padStart(5, '0')}`;
      const subtotalNum = Number(plan.price);
      const taxNum = Math.round(subtotalNum * 0.18 * 100) / 100;
      const totalNum = Math.round((subtotalNum + taxNum) * 100) / 100;

      let invStatus: 'PAID' | 'PARTIAL' | 'OVERDUE' = 'PAID';
      let amountPaidNum = totalNum;
      let payDate = fiveDaysAgo;

      if (i === 0 || i === 5) {
        invStatus = 'PAID';
        amountPaidNum = totalNum;
        payDate = todayStart;
      } else if (i === 6) {
        invStatus = 'PARTIAL';
        amountPaidNum = Math.round(totalNum * 0.4 * 100) / 100;
        payDate = tenDaysAgo;
      } else if (i === 7) {
        invStatus = 'OVERDUE';
        amountPaidNum = 0;
        payDate = twentyDaysAgo;
      }

      const invoice = await prisma.invoice.create({
        data: {
          number: invNum,
          sourceKey: `activation:${connection.id}`,
          connectionId: connection.id,
          customerId: cust.id,
          distributorId,
          operatorId,
          kind: 'ACTIVATION',
          status: invStatus,
          subtotal: new Prisma.Decimal(subtotalNum.toFixed(2)),
          tax: new Prisma.Decimal(taxNum.toFixed(2)),
          total: new Prisma.Decimal(totalNum.toFixed(2)),
          amountPaid: new Prisma.Decimal(amountPaidNum.toFixed(2)),
          issuedAt: payDate,
          dueAt: new Date(payDate.getTime() + 7 * 86400000),
          periodStart: payDate,
          periodEnd: new Date(payDate.getTime() + 30 * 86400000),
          items: {
            create: [
              { description: `${plan.name} Monthly Subscription`, amount: new Prisma.Decimal(subtotalNum.toFixed(2)) },
            ],
          },
        },
      });

      if (amountPaidNum > 0) {
        const payment = await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: new Prisma.Decimal(amountPaidNum.toFixed(2)),
            method: i % 2 === 0 ? 'UPI' : 'CASH',
            reference: i % 2 === 0 ? `UPI-${invNum}-${Math.floor(100000 + Math.random() * 900000)}` : `REC-CASH-${invNum}`,
            receivedAt: payDate,
            recordedById: adminId,
          },
        });

        if (distributorId) {
          const commAmt = Math.round(amountPaidNum * 0.1 * 100) / 100;
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
              commissionAmount: new Prisma.Decimal(commAmt.toFixed(2)),
              status: i === 0 ? 'PENDING' : 'APPROVED',
              createdAt: payDate,
            },
          });
        }
      }
    }
  }

  const northDist = await prisma.user.findFirst({ where: { email: 'distributor.north@catv.local' } });
  if (northDist) {
    await prisma.payout.create({
      data: {
        distributorId: northDist.id,
        period: '2026-11',
        total: new Prisma.Decimal('1250.00'),
        method: 'BANK_TRANSFER',
        reference: 'NEFT-CATV-202611-00918',
        paidAt: fiveDaysAgo,
        paidById: adminId,
      },
    });
  }

  const auditActions = [
    { action: 'ADMIN_SIGNIN', entity: 'User', ip: '192.168.1.1' },
    { action: 'PLAN_CREATED', entity: 'Plan', ip: '192.168.1.1' },
    { action: 'CONNECTION_ACTIVATED', entity: 'Connection', ip: '103.21.244.15' },
    { action: 'INVOICE_GENERATED', entity: 'Invoice', ip: '127.0.0.1' },
    { action: 'PAYMENT_RECEIVED', entity: 'Payment', ip: '103.21.244.15' },
    { action: 'COMMISSION_APPROVED', entity: 'CommissionLedger', ip: '192.168.1.1' },
  ];
  for (const item of auditActions) {
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: item.action,
        entity: item.entity,
        ip: item.ip,
        createdAt: fiveDaysAgo,
      },
    });
  }
}

async function seedNetwork(prisma: PrismaClient, adminId: string, passwordHash: string): Promise<void> {
  const north = await createCoded(prisma, {
    role: 'DISTRIBUTOR',
    name: 'North Distributor',
    email: 'distributor.north@catv.local',
    passwordHash,
    parentId: null,
    commission: { type: 'PERCENTAGE', value: 10 },
    createdById: adminId,
  });
  const south = await createCoded(prisma, {
    role: 'DISTRIBUTOR',
    name: 'South Distributor',
    email: 'distributor.south@catv.local',
    passwordHash,
    parentId: null,
    commission: { type: 'FIXED', value: 50 },
    createdById: adminId,
  });
  const northOperator = await createCoded(prisma, {
    role: 'OPERATOR',
    name: 'North Operator',
    email: 'operator.north@catv.local',
    passwordHash,
    parentId: north.id,
    commission: { type: 'PERCENTAGE', value: 5 },
    createdById: adminId,
  });
  const southOperator = await createCoded(prisma, {
    role: 'OPERATOR',
    name: 'South Operator',
    email: 'operator.south@catv.local',
    passwordHash,
    parentId: south.id,
    commission: { type: 'PERCENTAGE', value: 4 },
    createdById: adminId,
  });
  const directOperator = await createCoded(prisma, {
    role: 'OPERATOR',
    name: 'Direct Operator',
    email: 'operator.direct@catv.local',
    passwordHash,
    parentId: adminId,
  });

  const homes: Array<{ parentId: string; zone: string }> = [
    ...Array.from({ length: 4 }, () => ({ parentId: northOperator.id, zone: 'North' })),
    ...Array.from({ length: 3 }, () => ({ parentId: southOperator.id, zone: 'South' })),
    ...Array.from({ length: 2 }, () => ({ parentId: directOperator.id, zone: 'Central' })),
    { parentId: north.id, zone: 'North' },
  ];

  const customers = [];
  for (let index = 0; index < homes.length; index += 1) {
    const home = homes[index];
    if (!home) continue;
    const number = String(index + 1).padStart(2, '0');
    customers.push(
      await createCoded(prisma, {
        role: 'CUSTOMER',
        name: `Customer ${number}`,
        email: `customer${number}@catv.local`,
        passwordHash,
        parentId: home.parentId,
        customData: index === 0 ? { zone: 'North' } : { zone: home.zone },
      }),
    );
  }

  await prisma.attributeDefinition.create({
    data: {
      key: 'zone',
      label: 'Zone',
      dataType: 'TEXT',
      required: false,
      applicableRoles: ['CUSTOMER'],
    },
  });
  console.log(`Sample customer ${customers[0]?.email ?? ''} has zone North.`);
}

async function createCoded(
  prisma: PrismaClient,
  input: {
    role: 'DISTRIBUTOR' | 'OPERATOR' | 'CUSTOMER';
    name: string;
    email: string;
    passwordHash: string;
    parentId: string | null;
    customData?: Prisma.InputJsonValue;
    commission?: { type: CommissionType; value: number };
    createdById?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ prefix: string; padding: number; allocated: number }>>`
      UPDATE id_sequences
      SET next_value = next_value + 1, updated_at = NOW()
      WHERE role = CAST(${input.role} AS "Role")
      RETURNING prefix, padding, (next_value - 1) AS allocated
    `;
    const row = rows[0];
    if (!row) {
      throw new Error(`Missing ID sequence for ${input.role}`);
    }
    const userCode = `${row.prefix}-${String(Number(row.allocated)).padStart(row.padding, '0')}`;
    const user = await tx.user.create({
      data: {
        role: input.role,
        userCode,
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        parentId: input.parentId,
        customData: input.customData ?? {},
        status: 'ACTIVE',
      },
    });
    if (input.commission) {
      await tx.commissionRule.create({
        data: {
          userId: user.id,
          type: input.commission.type,
          value: input.commission.value,
          createdById: input.createdById,
        },
      });
    }
    return user;
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
