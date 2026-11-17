import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser, IntegrationInput } from '@catv/shared';
import { PrismaService } from '../prisma/prisma.service';
import { decryptString, encryptString } from './crypto-box';

export interface IntegrationAdapter {
  init(config: Record<string, string>): void;
  send(message: { to: string; body: string }): Promise<{ ok: boolean; detail: string }>;
  healthCheck(): Promise<boolean>;
}

class StubAdapter implements IntegrationAdapter {
  init(): void {}
  async send(message: { to: string; body: string }): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: `stub accepted ${message.to}` };
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

class SmsHttpAdapter implements IntegrationAdapter {
  private url = '';
  private token = '';
  init(config: Record<string, string>): void {
    this.url = config.url ?? '';
    this.token = config.token ?? '';
  }
  async send(message: { to: string; body: string }): Promise<{ ok: boolean; detail: string }> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ to: message.to, body: message.body }),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: response.ok, detail: `HTTP ${response.status}` };
  }
  async healthCheck(): Promise<boolean> {
    return this.url.startsWith('http');
  }
}

@Injectable()
export class IntegrationsService {
  private failures = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private key(): string {
    return this.config.get<string>('INTEGRATION_ENCRYPTION_KEY') || this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  adapter(kind: string): IntegrationAdapter {
    return kind === 'SMS_HTTP' ? new SmsHttpAdapter() : new StubAdapter();
  }

  async create(actor: AuthUser, input: IntegrationInput) {
    const row = await this.prisma.integration.create({
      data: {
        kind: input.kind,
        name: input.name,
        enabled: input.enabled,
        configCipher: encryptString(JSON.stringify(input.config), this.key()),
        createdById: actor.id,
      },
    });
    return { id: row.id, name: row.name, kind: row.kind, enabled: row.enabled };
  }

  async list() {
    const rows = await this.prisma.integration.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, enabled: row.enabled }));
  }

  async test(id: string): Promise<{ ok: boolean; detail: string }> {
    const row = await this.prisma.integration.findUnique({ where: { id } });
    if (!row) return { ok: false, detail: 'missing' };
    const open = this.failures.get(id) ?? 0;
    if (open >= 5) return { ok: false, detail: 'circuit open' };
    const adapter = this.adapter(row.kind);
    adapter.init(JSON.parse(decryptString(row.configCipher, this.key())) as Record<string, string>);
    try {
      const result = await adapter.send({ to: 'demo', body: 'CATV test' });
      this.failures.set(id, 0);
      return result;
    } catch (error) {
      this.failures.set(id, open + 1);
      return { ok: false, detail: error instanceof Error ? error.message : 'failed' };
    }
  }
}
