import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { UserCodeService } from './user-code.service';
import type { PrismaService } from '../prisma/prisma.service';

loadEnv({ path: resolve(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('UserCodeService concurrency', () => {
  const prisma = new PrismaClient();
  const service = new UserCodeService(prisma as unknown as PrismaService);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('issues unique prefixed codes when allocations run together', async () => {
    const before = await prisma.idSequence.findUniqueOrThrow({ where: { role: 'CUSTOMER' } });
    const codes = await Promise.all(Array.from({ length: 20 }, () => service.allocate('CUSTOMER')));
    expect(new Set(codes).size).toBe(20);
    expect(codes.every((code) => code.startsWith(`${before.prefix}-`))).toBe(true);
    const width = before.padding;
    expect(codes.every((code) => code.split('-')[1]?.length === width)).toBe(true);
  });
});
