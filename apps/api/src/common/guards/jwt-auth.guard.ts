import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import { ACCESS_COOKIE, adminTypeMatchesRole, type AuthUser } from '@catv/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.constants';
import { hashKey } from '../../network/api-keys.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface AccessPayload {
  sub: string;
  type: 'access';
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser; apiKey?: { id: string; scopes: string[] } }>();
    const response = context.switchToHttp().getResponse<Response>();
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (bearer?.startsWith('catv_')) {
      return this.apiKey(request, response, bearer);
    }
    const token = request.cookies?.[ACCESS_COOKIE] ?? bearer;
    if (!token) {
      throw new UnauthorizedException('Session expired.');
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Session expired.');
    }
    if (payload.type !== 'access' || !payload.sub) {
      throw new UnauthorizedException('Session expired.');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, role: true, adminType: true, email: true, name: true },
    });
    if (!user || !adminTypeMatchesRole(user.role, user.adminType)) {
      throw new UnauthorizedException('Session expired.');
    }

    request.user = {
      id: user.id,
      role: user.role,
      adminType: user.adminType,
      email: user.email,
      name: user.name,
    };
    return true;
  }

  private async apiKey(request: Request & { user?: AuthUser; apiKey?: { id: string; scopes: string[] } }, response: Response, secret: string): Promise<boolean> {
    const row = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashKey(secret) },
      include: { scopeUser: true },
    });
    if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date()) || row.scopeUser.deletedAt || row.scopeUser.status !== 'ACTIVE') {
      throw new UnauthorizedException('API key is not valid.');
    }
    const ip = request.ip ?? '';
    if (row.ipAllowlist.length > 0 && !row.ipAllowlist.includes(ip)) {
      throw new UnauthorizedException('API key is not valid for this address.');
    }
    const bucket = Math.floor(Date.now() / 60_000);
    const hits = await this.redis.incr(`apikey:${row.id}:${bucket}`);
    if (hits === 1) await this.redis.expire(`apikey:${row.id}:${bucket}`, 70);
    if (hits > row.rateLimitPerMinute) {
      throw new HttpException('API key rate limit reached.', 429);
    }
    request.user = {
      id: row.scopeUser.id,
      role: row.scopeUser.role,
      adminType: row.scopeUser.adminType,
      email: row.scopeUser.email,
      name: row.scopeUser.name,
    };
    request.apiKey = { id: row.id, scopes: row.scopes };
    const started = Date.now();
    response.on('finish', () => {
      void this.prisma.apiUsageLog.create({
        data: { apiKeyId: row.id, method: request.method, path: request.originalUrl.slice(0, 180), status: response.statusCode, ms: Date.now() - started },
      });
    });
    return true;
  }
}
