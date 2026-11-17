import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser, WebhookEndpointInput } from '@catv/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { decryptString, encryptString } from './crypto-box';
import { safeEqual, signBody } from './sign';

const MAX_ATTEMPTS = 5;

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  private secret(): string {
    return this.config.get<string>('INTEGRATION_ENCRYPTION_KEY') || this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  async create(actor: AuthUser, input: WebhookEndpointInput, ip: string | null) {
    const row = await this.prisma.webhookEndpoint.create({
      data: {
        url: input.url,
        secretCipher: encryptString(input.secret, this.secret()),
        events: input.events,
        createdById: actor.id,
      },
    });
    await this.audit.record({ actorId: actor.id, action: 'WEBHOOK_ENDPOINT_CREATED', entity: 'WebhookEndpoint', entityId: row.id, after: { url: input.url, events: input.events }, ip });
    return { id: row.id, url: row.url, events: row.events, enabled: row.enabled };
  }

  list() {
    return this.prisma.webhookEndpoint.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, url: true, events: true, enabled: true, failureCount: true, createdAt: true } });
  }

  deliveries() {
    return this.prisma.webhookDelivery.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { endpoint: { select: { url: true } } } });
  }

  async fanout(type: string, eventId: string, payload: Record<string, unknown>): Promise<string[]> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({ where: { enabled: true, events: { has: type } } });
    const ids: string[] = [];
    for (const endpoint of endpoints) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: { endpointId: endpoint.id, eventId, eventType: type, payload: payload as object },
      });
      ids.push(delivery.id);
    }
    return ids;
  }

  async deliver(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
    if (!delivery || !delivery.endpoint.enabled || delivery.status === 'SUCCESS' || delivery.status === 'DEAD') return;
    const secret = decryptString(delivery.endpoint.secretCipher, this.secret());
    const body = JSON.stringify({ id: delivery.eventId, type: delivery.eventType, data: delivery.payload });
    const timestamp = String(Date.now());
    const signature = signBody(secret, timestamp, body);
    const started = Date.now();
    let statusCode = 0;
    let responseBody = '';
    try {
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CATV-Signature': signature,
          'X-CATV-Timestamp': timestamp,
          'X-CATV-Event-Id': delivery.eventId,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      statusCode = response.status;
      responseBody = (await response.text()).slice(0, 500);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'SUCCESS', attempts: { increment: 1 }, lastStatusCode: statusCode, responseBody, latencyMs: Date.now() - started },
      });
      await this.prisma.webhookEndpoint.update({ where: { id: delivery.endpointId }, data: { failureCount: 0 } });
    } catch (error) {
      const attempts = delivery.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: dead ? 'DEAD' : 'FAILED',
          attempts,
          lastStatusCode: statusCode || null,
          lastError: error instanceof Error ? error.message : 'delivery failed',
          responseBody,
          latencyMs: Date.now() - started,
          nextAttemptAt: dead ? null : new Date(Date.now() + 10_000 * 2 ** attempts),
        },
      });
      if (dead) {
        const endpoint = await this.prisma.webhookEndpoint.update({
          where: { id: delivery.endpointId },
          data: { failureCount: { increment: 1 } },
        });
        if (endpoint.failureCount >= 10 && endpoint.enabled) {
          await this.prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { enabled: false, disabledAt: new Date() } });
          await this.audit.record({ action: 'WEBHOOK_ENDPOINT_DISABLED', entity: 'WebhookEndpoint', entityId: endpoint.id, after: { url: endpoint.url } });
        }
      }
      if (!dead) throw error;
    }
  }

  async resend(id: string): Promise<void> {
    await this.prisma.webhookDelivery.update({ where: { id }, data: { status: 'PENDING', attempts: 0 } });
  }

  verifyInbound(timestamp: string, rawBody: string, signature: string): boolean {
    const secret = this.config.get<string>('INBOUND_WEBHOOK_SECRET') || this.secret();
    return safeEqual(signature, signBody(secret, timestamp, rawBody));
  }

  async acceptInbound(provider: string, eventId: string, payload: unknown): Promise<{ duplicate: boolean; id: string }> {
    const existing = await this.prisma.inboundWebhookEvent.findUnique({ where: { provider_eventId: { provider, eventId } } });
    if (existing) return { duplicate: true, id: existing.id };
    const created = await this.prisma.inboundWebhookEvent.create({ data: { provider, eventId, payload: payload as object } });
    return { duplicate: false, id: created.id };
  }

  async processInbound(id: string): Promise<void> {
    const event = await this.prisma.inboundWebhookEvent.findUnique({ where: { id } });
    if (!event || event.processedAt) return;
    const payload = event.payload as { type?: string; invoiceId?: string; amount?: number; method?: string; reference?: string };
    if (payload.type === 'payment.received' && payload.invoiceId && payload.amount) {
      const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE' } });
      if (admin) {
        await this.billing.recordPayment(
          { id: admin.id, role: 'ADMIN', adminType: admin.adminType, email: admin.email, name: admin.name },
          { invoiceId: payload.invoiceId, amount: payload.amount, method: (payload.method as 'CASH') || 'OTHER', reference: payload.reference },
          null,
        );
      }
    }
    await this.prisma.inboundWebhookEvent.update({ where: { id }, data: { status: 'PROCESSED', processedAt: new Date() } });
  }
}
