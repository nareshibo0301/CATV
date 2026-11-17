import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Header, Inject, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import type { Request, Response } from 'express';
import {
  activationSchema,
  apiKeySchema,
  integrationSchema,
  paymentSchema,
  payoutSchema,
  planSchema,
  publishConnectionSchema,
  reportQuerySchema,
  webhookEndpointSchema,
  type AuthUser,
} from '@catv/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { RequireScopes } from '../rbac/scopes.decorator';
import { ApiKeysService } from './api-keys.service';
import { BillingService } from './billing.service';
import { CommissionLedgerService } from './commission-ledger.service';
import { ConnectionsService } from './connections.service';
import { ExportsService } from './exports.service';
import { IntegrationsService } from './integrations.service';
import { ReportsService } from './reports.service';
import { timestampFresh } from './sign';
import { WEBHOOK_QUEUE } from './queues';
import { WebhooksService } from './webhooks.service';

@ApiTags('Plans')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('plans')
export class PlansController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  list() {
    return this.prisma.plan.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  @Post()
  create(@Body(new ZodPipe(planSchema)) body: ReturnType<typeof planSchema.parse>) {
    return this.prisma.plan.create({ data: body });
  }
}

@ApiTags('Connections')
@ApiCookieAuth()
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR', 'CUSTOMER')
  @RequireScopes('connections:read')
  list(@CurrentUser() actor: AuthUser, @Query(new ZodPipe(reportQuerySchema)) query: ReturnType<typeof reportQuerySchema.parse>) {
    return this.connections.list(actor, query);
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR', 'CUSTOMER')
  @RequireScopes('connections:read')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.get(actor, id);
  }

  @Post()
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  @RequireScopes('connections:write')
  publish(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodPipe(publishConnectionSchema)) body: ReturnType<typeof publishConnectionSchema.parse>,
    @Req() req: Request,
  ) {
    return this.connections.publish(actor, body, req.ip ?? null);
  }

  @Post(':id/activate')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  @RequireScopes('connections:write')
  activate(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(activationSchema)) body: ReturnType<typeof activationSchema.parse>,
    @Req() req: Request,
  ) {
    return this.connections.activate(actor, id, body, req.ip ?? null);
  }

  @Post(':id/suspend')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  suspend(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.connections.setStatus(actor, id, 'SUSPENDED', 'suspended', req.ip ?? null);
  }

  @Post(':id/disconnect')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  disconnect(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.connections.setStatus(actor, id, 'DISCONNECTED', 'disconnected', req.ip ?? null);
  }
}

@ApiTags('Billing')
@ApiCookieAuth()
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('invoices')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR', 'CUSTOMER')
  @RequireScopes('invoices:read')
  invoices(@CurrentUser() actor: AuthUser, @Query('page') page = '1') {
    return this.billing.listInvoices(actor, Number(page) || 1);
  }

  @Get('invoices/:id')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR', 'CUSTOMER')
  @RequireScopes('invoices:read')
  invoice(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.getInvoice(actor, id);
  }

  @Post('payments')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  @RequireScopes('payments:write')
  pay(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodPipe(paymentSchema)) body: ReturnType<typeof paymentSchema.parse>,
    @Req() req: Request,
  ) {
    return this.billing.recordPayment(actor, body, req.ip ?? null);
  }

  @Post('payments/:id/void')
  @Roles('ADMIN')
  voidPayment(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.billing.voidPayment(actor, id, req.ip ?? null);
  }
}

@ApiTags('Commission ledger')
@ApiCookieAuth()
@Controller('commission-ledger')
export class LedgerController {
  constructor(private readonly ledger: CommissionLedgerService) {}

  @Get()
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  @RequireScopes('commissions:read')
  list(@CurrentUser() actor: AuthUser, @Query('page') page = '1') {
    return this.ledger.list(actor, Number(page) || 1);
  }

  @Get('free-exclusions')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  free(@CurrentUser() actor: AuthUser) {
    return this.ledger.freeExclusion(actor);
  }

  @Post('approve')
  @Roles('ADMIN')
  approve(@CurrentUser() actor: AuthUser, @Body() body: { ids?: string[] }, @Req() req: Request) {
    return this.ledger.approve(actor, body.ids ?? [], req.ip ?? null);
  }

  @Post('payouts')
  @Roles('ADMIN')
  payout(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodPipe(payoutSchema)) body: ReturnType<typeof payoutSchema.parse>,
    @Req() req: Request,
  ) {
    return this.ledger.payout(actor, body, req.ip ?? null);
  }
}

@ApiTags('Reports')
@ApiCookieAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exports: ExportsService,
  ) {}

  @Get('dashboard')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR', 'CUSTOMER')
  dashboard(@CurrentUser() actor: AuthUser) {
    return this.reports.dashboard(actor);
  }

  @Get(':report')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  table(
    @CurrentUser() actor: AuthUser,
    @Param('report') report: string,
    @Query(new ZodPipe(reportQuerySchema)) query: ReturnType<typeof reportQuerySchema.parse>,
  ) {
    return this.reports.table(actor, report, query);
  }

  @Get(':report/export')
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  async exportFile(
    @CurrentUser() actor: AuthUser,
    @Param('report') report: string,
    @Query('format') format: 'csv' | 'xlsx' | 'pdf' = 'csv',
    @Query(new ZodPipe(reportQuerySchema)) query: ReturnType<typeof reportQuerySchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.exports.build(actor, report, format, query, req.ip ?? null);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return new StreamableFile(file.body, { type: file.type });
  }
}

@ApiTags('API keys')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  list() {
    return this.keys.list();
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(apiKeySchema)) body: ReturnType<typeof apiKeySchema.parse>, @Req() req: Request) {
    return this.keys.create(actor, body, req.ip ?? null);
  }

  @Post(':id/revoke')
  revoke(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.keys.revoke(actor, id, req.ip ?? null);
  }

  @Post(':id/rotate')
  rotate(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.keys.rotate(actor, id, req.ip ?? null);
  }

  @Get(':id/usage')
  usage(@Param('id', ParseUUIDPipe) id: string) {
    return this.keys.usage(id);
  }
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    @Inject(WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  @Public()
  @Post('inbound/:provider')
  async inbound(@Param('provider') provider: string, @Req() req: Request, @Body() body: { eventId?: string; type?: string }) {
    const timestamp = req.header('x-catv-timestamp') ?? '';
    const signature = req.header('x-catv-signature') ?? '';
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body);
    if (!timestampFresh(timestamp) || !this.webhooks.verifyInbound(timestamp, raw, signature)) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }
    const eventId = body.eventId ?? '';
    if (!eventId) return { ok: false, error: 'event id required' };
    const stored = await this.webhooks.acceptInbound(provider, eventId, body);
    if (!stored.duplicate) await this.queue.add('inbound', { id: stored.id });
    return { ok: true, duplicate: stored.duplicate };
  }

  @Get('endpoints')
  @ApiCookieAuth()
  @Roles('ADMIN')
  endpoints() {
    return this.webhooks.list();
  }

  @Post('endpoints')
  @ApiCookieAuth()
  @Roles('ADMIN')
  create(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(webhookEndpointSchema)) body: ReturnType<typeof webhookEndpointSchema.parse>, @Req() req: Request) {
    return this.webhooks.create(actor, body, req.ip ?? null);
  }

  @Get('deliveries')
  @ApiCookieAuth()
  @Roles('ADMIN')
  deliveries() {
    return this.webhooks.deliveries();
  }

  @Post('deliveries/:id/resend')
  @ApiCookieAuth()
  @Roles('ADMIN')
  async resend(@Param('id', ParseUUIDPipe) id: string) {
    await this.webhooks.resend(id);
    await this.queue.add('send', { deliveryId: id }, { attempts: 5, backoff: { type: 'exponential', delay: 10_000 } });
    return { ok: true };
  }

  @Post('test')
  @ApiCookieAuth()
  @Roles('ADMIN')
  async test() {
    const eventId = randomUUID();
    await this.queue.add('event', { type: 'connection.published', eventId, payload: { test: true } });
    return { ok: true, eventId };
  }
}

@ApiTags('Integrations')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list() {
    return this.integrations.list();
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(integrationSchema)) body: ReturnType<typeof integrationSchema.parse>) {
    return this.integrations.create(actor, body);
  }

  @Post(':id/test')
  test(@Param('id', ParseUUIDPipe) id: string) {
    return this.integrations.test(id);
  }
}

@ApiTags('Metrics')
@Controller()
export class MetricsController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async metrics(): Promise<string> {
    const [users, connections, invoices] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.connection.count(),
      this.prisma.invoice.count(),
    ]);
    return [`catv_users ${users}`, `catv_connections ${connections}`, `catv_invoices ${invoices}`, `catv_uptime_seconds ${Math.round(process.uptime())}`].join('\n');
  }
}
