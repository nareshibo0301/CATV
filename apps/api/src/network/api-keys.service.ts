import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { ApiKeyInput, AuthUser } from '@catv/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, input: ApiKeyInput, ip: string | null) {
    const secret = `catv_${randomBytes(24).toString('hex')}`;
    const row = await this.prisma.apiKey.create({
      data: {
        name: input.name,
        keyPrefix: secret.slice(0, 12),
        keyHash: hashKey(secret),
        scopes: input.scopes,
        ipAllowlist: input.ipAllowlist,
        rateLimitPerMinute: input.rateLimitPerMinute,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        scopeUserId: input.scopeUserId,
        createdById: actor.id,
      },
    });
    await this.audit.record({ actorId: actor.id, action: 'API_KEY_CREATED', entity: 'ApiKey', entityId: row.id, after: { name: input.name, scopes: input.scopes }, ip });
    return { id: row.id, secret, prefix: row.keyPrefix };
  }

  async list() {
    return this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, keyPrefix: true, scopes: true, expiresAt: true, revokedAt: true, rateLimitPerMinute: true, createdAt: true },
    });
  }

  async revoke(actor: AuthUser, id: string, ip: string | null) {
    const row = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('API key not found.');
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.record({ actorId: actor.id, action: 'API_KEY_REVOKED', entity: 'ApiKey', entityId: id, ip });
    return { ok: true };
  }

  async rotate(actor: AuthUser, id: string, ip: string | null) {
    const current = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('API key not found.');
    await this.revoke(actor, id, ip);
    return this.create(
      actor,
      {
        name: current.name,
        scopes: current.scopes as ApiKeyInput['scopes'],
        ipAllowlist: current.ipAllowlist,
        rateLimitPerMinute: current.rateLimitPerMinute,
        scopeUserId: current.scopeUserId,
        expiresAt: current.expiresAt?.toISOString() ?? null,
      },
      ip,
    );
  }

  usage(id: string) {
    return this.prisma.apiUsageLog.findMany({ where: { apiKeyId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}

export function hashKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
