import { Queue } from 'bullmq';

export const MAINTENANCE_QUEUE = Symbol('MAINTENANCE_QUEUE');
export const COMMISSION_QUEUE = Symbol('COMMISSION_QUEUE');
export const WEBHOOK_QUEUE = Symbol('WEBHOOK_QUEUE');

export function bullConnection(url: string): { url: string; maxRetriesPerRequest: null } {
  return { url, maxRetriesPerRequest: null };
}

export function createQueues(url: string): {
  maintenance: Queue;
  commission: Queue;
  webhooks: Queue;
} {
  const connection = bullConnection(url);
  return {
    maintenance: new Queue('catv-maintenance', { connection }),
    commission: new Queue('catv-commission', { connection }),
    webhooks: new Queue('catv-webhooks', { connection }),
  };
}
