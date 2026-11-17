import { HttpException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type Redis from 'ioredis';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn().mockResolvedValue('dummy-hash'),
  verify: jest.fn(),
}));

const meta = { ip: '127.0.0.1', userAgent: 'jest' };

function config(): ConfigService {
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
  };
  return {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(key);
      return value;
    },
  } as unknown as ConfigService;
}

describe('AuthService login lockout', () => {
  const prisma = {
    user: { findFirst: jest.fn() },
    refreshToken: { create: jest.fn() },
  };
  const redis = {
    get: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
  };
  const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const verify = argon2.verify as jest.Mock;

  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config(),
    audit as unknown as AuditService,
    redis as unknown as Redis,
  );

  const admin = {
    id: 'admin-1',
    role: 'ADMIN',
    adminType: 'SUPERADMIN',
    email: 'admin@catv.local',
    name: 'Super',
    passwordHash: 'hash',
    status: 'ACTIVE',
    deletedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.del.mockResolvedValue(1);
    prisma.refreshToken.create.mockResolvedValue({});
    jwt.signAsync.mockImplementation(async (payload: { type: string }) => payload.type);
  });

  it('rejects a locked account before checking the password', async () => {
    redis.get.mockResolvedValue('5');
    await expect(
      service.login({ email: 'admin@catv.local', password: 'ChangeMeNow!123' }, meta),
    ).rejects.toBeInstanceOf(HttpException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('counts a bad password and does not store the password', async () => {
    prisma.user.findFirst.mockResolvedValue(admin);
    verify.mockResolvedValue(false);
    redis.incr.mockResolvedValue(1);
    await expect(
      service.login({ email: 'admin@catv.local', password: 'wrong-password' }, meta),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.incr).toHaveBeenCalledWith('auth:fail:admin@catv.local');
    const recorded = audit.record.mock.calls[0]?.[0] as { after?: { email?: string; password?: string } };
    expect(recorded.after).toEqual({ email: 'admin@catv.local' });
    expect(JSON.stringify(recorded)).not.toContain('wrong-password');
  });

  it('locks the account on the fifth failure', async () => {
    prisma.user.findFirst.mockResolvedValue(admin);
    verify.mockResolvedValue(false);
    redis.incr.mockResolvedValue(5);
    try {
      await service.login({ email: 'admin@catv.local', password: 'wrong-password' }, meta);
      throw new Error('expected lockout');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_LOCKOUT' }),
    );
  });

  it('issues a session for a super admin', async () => {
    prisma.user.findFirst.mockResolvedValue(admin);
    verify.mockResolvedValue(true);
    const session = await service.login(
      { email: 'admin@catv.local', password: 'ChangeMeNow!123' },
      meta,
    );
    expect(session.user.adminType).toBe('SUPERADMIN');
    expect(session.accessToken).toBe('access');
    expect(session.refreshToken).toBe('refresh');
    expect(redis.del).toHaveBeenCalledWith('auth:fail:admin@catv.local');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_LOGIN' }));
  });
});
