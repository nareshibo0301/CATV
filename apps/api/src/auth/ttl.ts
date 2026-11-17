const UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) {
    throw new Error(`Invalid TTL: ${ttl}`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const factor = unit ? UNITS[unit] : undefined;
  if (!Number.isFinite(amount) || factor === undefined) {
    throw new Error(`Invalid TTL: ${ttl}`);
  }
  return amount * factor;
}
