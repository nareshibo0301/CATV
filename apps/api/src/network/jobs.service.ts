import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue, Worker } from 'bullmq';
import { BillingService } from './billing.service';
import { CommissionLedgerService } from './commission-ledger.service';
import { ExportsService } from './exports.service';
import { bullConnection, COMMISSION_QUEUE, MAINTENANCE_QUEUE, WEBHOOK_QUEUE } from './queues';
import { WebhooksService } from './webhooks.service';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  readonly board = new ExpressAdapter();
  private workers: Worker[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    private readonly ledger: CommissionLedgerService,
    private readonly webhooks: WebhooksService,
    private readonly exports: ExportsService,
    @Inject(MAINTENANCE_QUEUE) private readonly maintenance: Queue,
    @Inject(COMMISSION_QUEUE) private readonly commission: Queue,
    @Inject(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {
    this.board.setBasePath('/api/v1/admin/queues');
    createBullBoard({
      queues: [new BullMQAdapter(maintenance), new BullMQAdapter(commission), new BullMQAdapter(webhookQueue)],
      serverAdapter: this.board,
    });
  }

  async onModuleInit(): Promise<void> {
    const connection = bullConnection(this.config.getOrThrow<string>('REDIS_URL'));
    this.workers.push(
      new Worker(
        'catv-maintenance',
        async () => {
          await this.billing.convertExpiredFree();
          await this.billing.generateRecurring();
          await this.billing.markOverdue();
          this.exports.sweep();
        },
        { connection },
      ),
      new Worker(
        'catv-commission',
        async (job) => {
          const paymentId = String(job.data.paymentId ?? '');
          if (job.name === 'reversal') await this.ledger.reverseForPayment(paymentId);
          else await this.ledger.recordForPayment(paymentId);
        },
        { connection },
      ),
      new Worker(
        'catv-webhooks',
        async (job) => {
          if (job.name === 'event') {
            const ids = await this.webhooks.fanout(String(job.data.type), String(job.data.eventId), job.data.payload as Record<string, unknown>);
            for (const deliveryId of ids) {
              await this.webhookQueue.add('send', { deliveryId }, { attempts: 5, backoff: { type: 'exponential', delay: 10_000 } });
            }
            return;
          }
          if (job.name === 'inbound') {
            await this.webhooks.processInbound(String(job.data.id));
            return;
          }
          await this.webhooks.deliver(String(job.data.deliveryId));
        },
        { connection },
      ),
    );
    await this.maintenance.add('daily', {}, { repeat: { pattern: '15 2 * * *' }, jobId: 'daily-maintenance' });
    await this.maintenance.add('catchup', {}, { jobId: `startup-${Date.now()}` });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
