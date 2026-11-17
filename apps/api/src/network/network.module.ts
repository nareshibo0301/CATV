import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeysService } from './api-keys.service';
import { BillingService } from './billing.service';
import { CommissionLedgerService } from './commission-ledger.service';
import { ConnectionsService } from './connections.service';
import { ExportsService } from './exports.service';
import { IntegrationsService } from './integrations.service';
import { JobsService } from './jobs.service';
import {
  ApiKeysController,
  BillingController,
  ConnectionsController,
  IntegrationsController,
  LedgerController,
  MetricsController,
  PlansController,
  ReportsController,
  WebhooksController,
} from './network.controller';
import { ReportsService } from './reports.service';
import { COMMISSION_QUEUE, MAINTENANCE_QUEUE, WEBHOOK_QUEUE, createQueues } from './queues';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [PrismaModule, AccessModule, AuditModule],
  controllers: [
    PlansController,
    ConnectionsController,
    BillingController,
    LedgerController,
    ReportsController,
    ApiKeysController,
    WebhooksController,
    IntegrationsController,
    MetricsController,
  ],
  providers: [
    {
      provide: 'CATV_QUEUES',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createQueues(config.getOrThrow<string>('REDIS_URL')),
    },
    { provide: MAINTENANCE_QUEUE, inject: ['CATV_QUEUES'], useFactory: (queues: ReturnType<typeof createQueues>) => queues.maintenance },
    { provide: COMMISSION_QUEUE, inject: ['CATV_QUEUES'], useFactory: (queues: ReturnType<typeof createQueues>) => queues.commission },
    { provide: WEBHOOK_QUEUE, inject: ['CATV_QUEUES'], useFactory: (queues: ReturnType<typeof createQueues>) => queues.webhooks },
    BillingService,
    ConnectionsService,
    CommissionLedgerService,
    ReportsService,
    ExportsService,
    ApiKeysService,
    WebhooksService,
    IntegrationsService,
    JobsService,
  ],
  exports: [WEBHOOK_QUEUE],
})
export class NetworkModule {}
