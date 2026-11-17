export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function asNumber(value: { toString(): string } | number | string): number {
  return round2(Number(value));
}

export function invoiceTotals(price: number, taxPercent: number): { subtotal: number; tax: number; total: number } {
  const subtotal = round2(price);
  const tax = round2((subtotal * taxPercent) / 100);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

export function outstanding(total: number, paid: number): number {
  return round2(Math.max(0, total - paid));
}

/** Percentage applies to the amount paid. Fixed is scaled by the paid fraction of the invoice. */
export function commissionAmount(
  type: 'PERCENTAGE' | 'FIXED',
  ruleValue: number,
  paid: number,
  invoiceTotal: number,
): number {
  if (paid <= 0 || invoiceTotal <= 0) {
    return 0;
  }
  if (type === 'PERCENTAGE') {
    return round2((paid * ruleValue) / 100);
  }
  return round2(ruleValue * (paid / invoiceTotal));
}

export function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function cycleEnd(start: Date, cycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'): Date {
  const months = cycle === 'MONTHLY' ? 1 : cycle === 'QUARTERLY' ? 3 : 12;
  return addUtcMonths(start, months);
}

export function freePeriodEnd(start: Date, duration: '1_MONTH' | '2_MONTHS' | 'CUSTOM', customDays?: number): Date {
  if (duration === '1_MONTH') return addUtcMonths(start, 1);
  if (duration === '2_MONTHS') return addUtcMonths(start, 2);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + (customDays ?? 0));
  return end;
}
