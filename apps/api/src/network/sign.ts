import { createHmac, timingSafeEqual } from 'node:crypto';

export function signBody(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function timestampFresh(timestamp: string, now = Date.now(), toleranceMs = 5 * 60 * 1000): boolean {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) {
    return false;
  }
  return Math.abs(now - value) <= toleranceMs;
}
