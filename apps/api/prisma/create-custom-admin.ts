import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../../../deploy/.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function main() {
  const email = (process.argv[2] || 'admin@cloutgency.com').trim().toLowerCase();
  const password = process.argv[3] || 'Password123!';
  const name = process.argv[4] || 'Admin User';

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password, ARGON);
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: {
        role: 'ADMIN',
        adminType: 'SUPERADMIN',
        email,
        name,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    console.log(`Successfully created/updated admin user:`);
    console.log(`Email:    ${user.email}`);
    console.log(`Password: ${password}`);
    console.log(`Role:     ${user.role} (${user.adminType})`);
  } catch (err) {
    console.error('Error creating user:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
