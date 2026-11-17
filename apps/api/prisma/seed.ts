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
    if (existingDistributor) {
      console.log('Network seed already present.');
      return;
    }

    await seedNetwork(prisma, admin.id, passwordHash);
    console.log('Seeded 2 distributors, 3 operators, and 10 customers.');
  } finally {
    await prisma.$disconnect();
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
