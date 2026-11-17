import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import type Redis from 'ioredis';
import {
  adminTypeMatchesRole,
  type AdminType,
  type AuthUser,
  type LoginInput,
  type Role,
} from '@catv/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { REDIS } from '../redis/redis.constants';
import { sha256 } from './hash';
import { ttlToMs } from './ttl';

export const MAX_LOGIN_FAILURES = 5;
export const LOCKOUT_SECONDS = 15 * 60;

const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

interface DbUser {
  id: string;
  role: Role;
  adminType: AdminType | null;
  email: string;
  name: string;
  passwordHash: string;
  status: 'ACTIVE' | 'SUSPENDED';
  deletedAt: Date | null;
}

interface RefreshPayload {
  sub: string;
  familyId: string;
  jti: string;
  type: 'refresh';
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
    await this.assertNotLocked(input.email);
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
    });

    const passwordOk = user
      ? await argon2.verify(user.passwordHash, input.password)
      : await this.verifyAgainstDummy(input.password);

    if (!user || !passwordOk) {
      await this.recordFailure(input.email, user?.id ?? null, meta);
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!adminTypeMatchesRole(user.role, user.adminType)) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('This account is suspended.');
    }

    await this.redis.del(this.failKey(input.email));
    const session = await this.issue(user, randomUUID(), meta);
    await this.audit.record({
      actorId: user.id,
      action: 'AUTH_LOGIN',
      entity: 'User',
      entityId: user.id,
      ip: meta.ip,
    });
    return session;
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<IssuedSession> {
    const payload = await this.readRefresh(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(payload.jti) },
    });
    if (!row || row.userId !== payload.sub || row.familyId !== payload.familyId) {
      throw new UnauthorizedException('Session expired.');
    }
    if (row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
      await this.revokeFamily(row.familyId);
      await this.audit.record({
        actorId: row.userId,
        action: 'AUTH_REFRESH_REUSE',
        entity: 'RefreshToken',
        entityId: row.id,
        ip: meta.ip,
      });
      throw new UnauthorizedException('Session expired.');
    }

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.revokeFamily(row.familyId);
      await this.audit.record({
        actorId: row.userId,
        action: 'AUTH_REFRESH_REUSE',
        entity: 'RefreshToken',
        entityId: row.id,
        ip: meta.ip,
      });
      throw new UnauthorizedException('Session expired.');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: row.userId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!user || !adminTypeMatchesRole(user.role, user.adminType)) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Session expired.');
    }

    return this.issue(user, row.familyId, meta);
  }

  async logout(refreshToken: string | undefined, meta: RequestMeta): Promise<void> {
    if (!refreshToken) {
      return;
    }
    try {
      const payload = await this.readRefresh(refreshToken);
      const row = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: sha256(payload.jti) },
      });
      if (!row) {
        return;
      }
      await this.prisma.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        actorId: row.userId,
        action: 'AUTH_LOGOUT',
        entity: 'User',
        entityId: row.userId,
        ip: meta.ip,
      });
    } catch {
      return;
    }
  }

  private async issue(user: DbUser, familyId: string, meta: RequestMeta): Promise<IssuedSession> {
    const jti = randomUUID();
    const refreshTtl = this.config.getOrThrow<string>('JWT_REFRESH_TTL');
    const accessTtl = this.config.getOrThrow<string>('JWT_ACCESS_TTL');
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, familyId, jti, type: 'refresh' },
      { secret: this.refreshSecret(), expiresIn: Math.floor(ttlToMs(refreshTtl) / 1000) },
    );
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, type: 'access' },
      { secret: this.accessSecret(), expiresIn: Math.floor(ttlToMs(accessTtl) / 1000) },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(jti),
        familyId,
        expiresAt: new Date(Date.now() + ttlToMs(refreshTtl)),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return { accessToken, refreshToken, user: toAuthUser(user) };
  }

  private async readRefresh(token: string): Promise<RefreshPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.refreshSecret(),
      });
      if (payload.type !== 'refresh' || !payload.sub || !payload.jti || !payload.familyId) {
        throw new UnauthorizedException('Session expired.');
      }
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Session expired.');
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async assertNotLocked(email: string): Promise<void> {
    let current: string | null;
    try {
      current = await this.redis.get(this.failKey(email));
    } catch {
      throw new ServiceUnavailableException('Sign-in is temporarily unavailable.');
    }
    if (current !== null && Number(current) >= MAX_LOGIN_FAILURES) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async recordFailure(
    email: string,
    userId: string | null,
    meta: RequestMeta,
  ): Promise<void> {
    const key = this.failKey(email);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, LOCKOUT_SECONDS);
    }
    const locked = count >= MAX_LOGIN_FAILURES;
    await this.audit.record({
      actorId: userId,
      action: locked ? 'AUTH_LOCKOUT' : 'AUTH_LOGIN_FAILED',
      entity: 'User',
      entityId: userId,
      after: { email },
      ip: meta.ip,
    });
    if (locked) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async verifyAgainstDummy(password: string): Promise<boolean> {
    this.dummyHash ??= argon2.hash('not-a-real-password', ARGON_OPTIONS);
    const hash = await this.dummyHash;
    await argon2.verify(hash, password);
    return false;
  }

  private failKey(email: string): string {
    return `auth:fail:${email}`;
  }

  private accessSecret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private refreshSecret(): string {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }
}

function toAuthUser(user: DbUser): AuthUser {
  return {
    id: user.id,
    role: user.role,
    adminType: user.adminType,
    email: user.email,
    name: user.name,
  };
}
