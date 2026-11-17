import { z } from 'zod';

export const BILLING_CYCLES = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export const CONNECTION_STATUSES = [
  'PENDING_ACTIVATION',
  'ACTIVE_PAID',
  'ACTIVE_FREE',
  'SUSPENDED',
  'DISCONNECTED',
] as const;
export const ACTIVATION_TYPES = ['PAID', 'FREE'] as const;
export const FREE_REASONS = ['INITIAL_OFFER', 'LOYALTY_OFFER', 'OTHER'] as const;
export const FREE_DURATIONS = ['1_MONTH', '2_MONTHS', 'CUSTOM'] as const;
export const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'] as const;
export const API_SCOPES = [
  'users:read',
  'users:write',
  'connections:read',
  'connections:write',
  'invoices:read',
  'payments:write',
  'commissions:read',
] as const;
export const WEBHOOK_EVENTS = [
  'user.created',
  'user.updated',
  'connection.published',
  'connection.activated',
  'connection.free_started',
  'connection.free_expired',
  'connection.converted_to_paid',
  'invoice.created',
  'payment.received',
  'commission.created',
  'commission.paid',
] as const;

export const planSchema = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.number().nonnegative(),
  billingCycle: z.enum(BILLING_CYCLES),
  taxPercent: z.number().min(0).max(100).default(0),
  active: z.boolean().default(true),
});

export const publishConnectionSchema = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid(),
});

export const paidActivationSchema = z.object({
  mode: z.literal('PAID'),
});

export const freeActivationSchema = z.object({
  mode: z.literal('FREE'),
  startDate: z.string().datetime(),
  duration: z.enum(FREE_DURATIONS),
  customDays: z.number().int().min(1).max(365).optional(),
  reason: z.enum(FREE_REASONS),
});

export const activationSchema = z.discriminatedUnion('mode', [paidActivationSchema, freeActivationSchema]).superRefine((value, ctx) => {
  if (value.mode === 'FREE' && value.duration === 'CUSTOM' && !value.customDays) {
    ctx.addIssue({ code: 'custom', message: 'Custom duration needs a number of days.', path: ['customDays'] });
  }
});

export const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(80).optional(),
});

export const payoutSchema = z.object({
  distributorId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  method: z.string().trim().min(1).max(40),
  reference: z.string().trim().max(80).optional(),
});

export const apiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  ipAllowlist: z.array(z.string().trim().min(1)).default([]),
  rateLimitPerMinute: z.number().int().min(1).max(600).default(60),
  expiresAt: z.string().datetime().nullable().optional(),
  scopeUserId: z.string().uuid(),
});

export const webhookEndpointSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16).max(200),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

export const integrationSchema = z.object({
  kind: z.enum(['STUB', 'SMS_HTTP']),
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  config: z.record(z.string()).default({}),
});

export const reportQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.string().optional(),
  distributorId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
  activationType: z.enum(ACTIVATION_TYPES).optional(),
  q: z.string().trim().max(100).optional(),
});

export type PlanInput = z.infer<typeof planSchema>;
export type PublishConnectionInput = z.infer<typeof publishConnectionSchema>;
export type ActivationInput = z.infer<typeof activationSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type PayoutInput = z.infer<typeof payoutSchema>;
export type ApiKeyInput = z.infer<typeof apiKeySchema>;
export type WebhookEndpointInput = z.infer<typeof webhookEndpointSchema>;
export type IntegrationInput = z.infer<typeof integrationSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
